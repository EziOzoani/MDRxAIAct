"""
Purpose:
    LP-FT (Linear-Probe then Fine-Tune) trainer for the tattoo classifier.
    Marries the old approach's robustness with the new approach's checkpoints:

      Phase 1 — Linear probe: freeze the ImageNet-21k backbone, train only the
                classifier head. Keeps the backbone's general, distribution-
                robust features intact (the reason the old frozen-backbone
                model handled wide photos better).
      Phase 2 — Fine-tune: unfreeze the whole model at a very low learning
                rate for a few epochs. The head is already aligned, so the
                backbone only nudges instead of being rewritten — preserving
                robustness while squeezing out accuracy.

    Both phases save a checkpoint per epoch, consolidated into a single
    sequential checkpoint-1..N series with metrics, so Tile 3 can show the
    full learning progression.

    Trains on the {variant}_lpft set (original tight crops + synthetic skin
    composites), so the model sees the real serving distribution.

Dependencies:
    - transformers, torch, datasets, sklearn, PIL
    - data/{variant}_lpft/{class}/  (from make_lpft_data.py)

Usage:
    python lpft_train.py --variant balanced
    OUTPUT_DIR controls where the model + checkpoints land.

Changes:
    2026-05-26: Initial — two-phase LP-FT with per-epoch checkpoint
                consolidation and synthetic-composite training data.
"""

import argparse
import json
import os
import shutil
from pathlib import Path
from collections import Counter

import numpy as np
import torch
import torch.nn as nn
from datasets import load_dataset
from transformers import (
    AutoModelForImageClassification,
    AutoImageProcessor,
    TrainingArguments,
    Trainer,
)
from sklearn.metrics import accuracy_score, f1_score

LABEL2ID = {"real_tattoo": 0, "sticker_tattoo": 1, "pen_drawn": 2, "not_tattoo": 3}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}
MODEL_NAME = "google/vit-base-patch16-224-in21k"


class WeightedTrainer(Trainer):
    def __init__(self, class_weights=None, **kwargs):
        super().__init__(**kwargs)
        self.class_weights = (torch.tensor(class_weights, dtype=torch.float32)
                              if class_weights is not None else None)

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        if self.class_weights is not None:
            loss = nn.CrossEntropyLoss(weight=self.class_weights.to(logits.device))(logits, labels)
        else:
            loss = nn.CrossEntropyLoss()(logits, labels)
        return (loss, outputs) if return_outputs else loss


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    f1 = f1_score(labels, preds, average="weighted")
    per_class = {}
    for name, lid in LABEL2ID.items():
        mask = labels == lid
        if mask.sum() > 0:
            per_class[f"eval_acc_{name}"] = float((preds[mask] == labels[mask]).mean())
    return {"accuracy": acc, "f1": f1, **per_class}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="balanced")
    ap.add_argument("--data-root", default=None, help="defaults to data/{variant}_lpft")
    ap.add_argument("--phase1-epochs", type=int, default=6)
    ap.add_argument("--phase2-epochs", type=int, default=3)
    ap.add_argument("--phase1-lr", type=float, default=1e-3)   # head only — can be high
    ap.add_argument("--phase2-lr", type=float, default=1e-5)   # whole model — gentle
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--no-class-weights", action="store_true")
    args = ap.parse_args()

    base = Path(__file__).resolve().parent.parent
    data_root = Path(args.data_root) if args.data_root else base / "data" / f"{args.variant}_lpft"
    output_dir = Path(os.environ.get("OUTPUT_DIR", str(base / "output_lpft" / args.variant)))
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Variant: {args.variant}")
    print(f"Data:    {data_root}")
    print(f"Output:  {output_dir}")

    # ── Load + remap labels (HF imagefolder is alphabetical) ──
    ds = load_dataset("imagefolder", data_dir=str(data_root))
    feats = ds["train"].features["label"]
    remap = {i: LABEL2ID[feats.int2str(i)] for i in range(feats.num_classes)
             if feats.int2str(i) in LABEL2ID}
    ds = ds.map(lambda ex: {"label": remap[ex["label"]]})
    split = ds["train"].train_test_split(test_size=0.2, seed=42, stratify_by_column="label")
    train_ds, val_ds = split["train"], split["test"]
    print(f"Train: {len(train_ds)}  Val: {len(val_ds)}")

    # Class weights from the training split
    class_weights = None
    if not args.no_class_weights:
        labels = np.array(train_ds["label"])
        counts = Counter(labels.tolist())
        total = len(labels)
        weights = [total / (len(LABEL2ID) * counts.get(i, 1)) for i in range(len(LABEL2ID))]
        m = max(weights)
        class_weights = [w * (3.0 / m) if m > 3.0 else w for w in weights]

    processor = AutoImageProcessor.from_pretrained(MODEL_NAME)
    model = AutoModelForImageClassification.from_pretrained(
        MODEL_NAME, num_labels=len(LABEL2ID), id2label=ID2LABEL, label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    # On-the-fly augmentation simulating real camera variation so the model is
    # robust to how visitors actually shoot: different ANGLES (rotation,
    # perspective, shear), different LIGHTING (brightness/contrast/saturation/
    # hue), and softer focus. Applied to the TRAIN split only, fresh each epoch
    # (set_transform), so the model sees a new variant every time. Validation
    # stays clean so eval metrics reflect true accuracy.
    from torchvision import transforms as T

    train_aug = T.Compose([
        T.RandomHorizontalFlip(0.5),
        T.RandomApply([T.RandomRotation(25)], p=0.6),                 # camera tilt
        T.RandomApply([T.RandomAffine(degrees=0, translate=(0.08, 0.08),
                                      scale=(0.85, 1.15), shear=10)], p=0.5),  # angle/shift
        T.RandomPerspective(distortion_scale=0.3, p=0.4),            # viewpoint
        T.ColorJitter(brightness=0.35, contrast=0.35,
                      saturation=0.3, hue=0.05),                      # lighting
        T.RandomApply([T.GaussianBlur(3, sigma=(0.1, 1.5))], p=0.3),  # focus
    ])

    def make_transform(augment: bool):
        def _t(examples):
            imgs = []
            for im in examples["image"]:
                im = im.convert("RGB")
                if augment:
                    im = train_aug(im)
                imgs.append(im)
            out = processor(images=imgs, return_tensors="pt")
            out["labels"] = examples["label"]
            return out
        return _t

    # Lazy transforms: train gets fresh augmentation each epoch, val is clean.
    train_ds.set_transform(make_transform(augment=True))
    val_ds.set_transform(make_transform(augment=False))

    consolidated: list[tuple[Path, dict]] = []   # (checkpoint dir, eval metrics)

    def run_phase(phase: str, epochs: int, lr: float, freeze_backbone: bool):
        if freeze_backbone:
            for name, p in model.named_parameters():
                p.requires_grad = "classifier" in name
        else:
            for p in model.parameters():
                p.requires_grad = True
        trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
        print(f"\n── {phase}: {epochs} epochs, lr={lr}, "
              f"{'frozen backbone' if freeze_backbone else 'full model'} "
              f"({trainable:,} trainable) ──")

        phase_dir = output_dir / f"_{phase}"
        targs = TrainingArguments(
            output_dir=str(phase_dir),
            num_train_epochs=epochs,
            per_device_train_batch_size=args.batch_size,
            per_device_eval_batch_size=args.batch_size,
            learning_rate=lr,
            weight_decay=0.01,
            eval_strategy="epoch",
            save_strategy="epoch",
            save_total_limit=None,
            logging_steps=20,
            remove_unused_columns=False,
            report_to=[],
        )
        trainer = WeightedTrainer(
            class_weights=class_weights, model=model, args=targs,
            train_dataset=train_ds, eval_dataset=val_ds,
            tokenizer=processor, compute_metrics=compute_metrics,
        )
        trainer.train()
        # Record per-epoch eval metrics from this phase's history.
        evals = [e for e in trainer.state.log_history if "eval_accuracy" in e]
        ckpts = sorted(phase_dir.glob("checkpoint-*"),
                       key=lambda p: int(p.name.split("-")[1]))
        for ck, ev in zip(ckpts, evals):
            consolidated.append((ck, ev))
        return trainer

    run_phase("phase1", args.phase1_epochs, args.phase1_lr, freeze_backbone=True)
    trainer = run_phase("phase2", args.phase2_epochs, args.phase2_lr, freeze_backbone=False)

    # ── Consolidate checkpoints into sequential checkpoint-1..N with metrics ──
    print(f"\nConsolidating {len(consolidated)} epoch checkpoints...")
    for seq, (ck_dir, ev) in enumerate(consolidated, start=1):
        dest = output_dir / f"checkpoint-{seq}"
        if dest.exists():
            shutil.rmtree(dest)
        dest.mkdir(parents=True)
        # Copy weights + configs needed for inference
        for fname in ["model.safetensors", "config.json", "preprocessor_config.json"]:
            src = ck_dir / fname
            if src.exists():
                shutil.copy(src, dest / fname)
        processor.save_pretrained(str(dest))
        # Write a trainer_state.json whose log_history step matches the dir name,
        # so serve_models.py attaches these metrics to this checkpoint.
        metrics = {k: v for k, v in ev.items() if k.startswith("eval_")}
        (dest / "trainer_state.json").write_text(json.dumps({
            "log_history": [{"step": seq, "epoch": seq, **metrics}],
        }, indent=2))

    # ── Save the final model at the output root ──
    trainer.save_model(str(output_dir))
    processor.save_pretrained(str(output_dir))
    final_eval = trainer.evaluate()
    meta = {
        "training_method": "lpft",
        "phase1_epochs": args.phase1_epochs,
        "phase2_epochs": args.phase2_epochs,
        "data_root": str(data_root),
        "metrics": {k: float(v) for k, v in final_eval.items() if isinstance(v, (int, float))},
    }
    (output_dir / "training_metadata.json").write_text(json.dumps(meta, indent=2))

    # Clean the per-phase scratch dirs to save space.
    for p in ("_phase1", "_phase2"):
        shutil.rmtree(output_dir / p, ignore_errors=True)

    print(f"\nLP-FT complete. Final eval: acc={final_eval.get('eval_accuracy'):.4f}, "
          f"f1={final_eval.get('eval_f1'):.4f}")
    print(f"Checkpoints: {len(consolidated)} (checkpoint-1..{len(consolidated)})")
    print(f"Model saved to {output_dir}")


if __name__ == "__main__":
    main()
