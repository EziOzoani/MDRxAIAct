#!/usr/bin/env python3
"""
Fine-tune a ViT model for tattoo classification (real / sticker / pen-drawn).

Handles class imbalance via:
  1. Inverse-frequency class weights in the loss function
  2. Optional balanced dataset (from balance_dataset.py)
  3. Per-class metrics reporting

Usage:
  python train_classifier.py
  python train_classifier.py --epochs 10 --push-to-hub --hub-model-id yourname/tattoo-classifier
  python train_classifier.py --data-dir data_balanced --epochs 5

Requirements:
  uv pip install transformers[torch] datasets Pillow scikit-learn accelerate
"""

import argparse
import json
import os
from pathlib import Path
from collections import Counter

import torch
import torch.nn as nn
import numpy as np
from datasets import load_dataset, DatasetDict
from transformers import (
    ViTForImageClassification,
    ViTImageProcessor,
    TrainingArguments,
    Trainer,
)
from sklearn.metrics import accuracy_score, f1_score, classification_report


DATA_DIR = Path(__file__).parent / "data"
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", str(Path(__file__).parent / "model_output")))

LABEL2ID = {"real_tattoo": 0, "sticker_tattoo": 1, "pen_drawn": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}


class WeightedTrainer(Trainer):
    """Trainer with inverse-frequency class weights for imbalanced data."""

    def __init__(self, class_weights=None, **kwargs):
        super().__init__(**kwargs)
        if class_weights is not None:
            self.class_weights = torch.tensor(class_weights, dtype=torch.float32)
        else:
            self.class_weights = None

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits

        if self.class_weights is not None:
            weight = self.class_weights.to(logits.device)
            loss = nn.CrossEntropyLoss(weight=weight)(logits, labels)
        else:
            loss = nn.CrossEntropyLoss()(logits, labels)

        return (loss, outputs) if return_outputs else loss


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=-1)
    acc = accuracy_score(labels, preds)
    f1 = f1_score(labels, preds, average="weighted")

    # Per-class accuracy
    per_class = {}
    for label_name, label_id in LABEL2ID.items():
        mask = labels == label_id
        if mask.sum() > 0:
            class_acc = (preds[mask] == labels[mask]).mean()
            per_class[f"acc_{label_name}"] = float(class_acc)

    return {"accuracy": acc, "f1": f1, **per_class}


def compute_class_weights(dataset) -> list[float]:
    """Compute inverse-frequency class weights from training data."""
    labels = dataset["label"]
    if isinstance(labels, torch.Tensor):
        labels = labels.numpy()
    else:
        labels = np.array(labels)

    counts = Counter(labels.tolist())
    total = len(labels)
    n_classes = len(LABEL2ID)

    # Inverse frequency: weight = total / (n_classes * count)
    weights = []
    for i in range(n_classes):
        count = counts.get(i, 1)
        w = total / (n_classes * count)
        weights.append(w)

    # Normalize so max weight = 3.0 (prevent extreme values)
    max_w = max(weights)
    if max_w > 3.0:
        scale = 3.0 / max_w
        weights = [w * scale for w in weights]

    return weights


def main():
    parser = argparse.ArgumentParser(description="Fine-tune ViT for tattoo classification")
    parser.add_argument("--model-name", default="google/vit-base-patch16-224-in21k",
                        help="Base model to fine-tune")
    parser.add_argument("--data-dir", default=None,
                        help="Data directory (default: data_balanced/ if exists, else data/)")
    parser.add_argument("--epochs", type=int, default=5, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate")
    parser.add_argument("--no-class-weights", action="store_true",
                        help="Disable class weights (use uniform loss)")
    parser.add_argument("--push-to-hub", action="store_true", help="Push to HuggingFace Hub")
    parser.add_argument("--hub-model-id", default=None, help="HF Hub model ID")
    args = parser.parse_args()

    # Determine data directory
    if args.data_dir:
        data_dir = Path(args.data_dir)
    elif (Path(__file__).parent / "data_balanced").exists():
        data_dir = Path(__file__).parent / "data_balanced"
        print(f"Using balanced dataset: {data_dir}")
    else:
        data_dir = DATA_DIR

    # Check data exists and show distribution
    print("\nDataset contents:")
    total_images = 0
    class_counts = {}
    for cat in LABEL2ID:
        cat_dir = data_dir / cat
        count = len(list(cat_dir.glob("*.png"))) if cat_dir.exists() else 0
        class_counts[cat] = count
        total_images += count
        print(f"  {cat}: {count} images")
        if count < 10:
            print(f"  WARNING: Very few images for {cat}. Collect more for better results.")

    if total_images == 0:
        print("\nERROR: No images found! Check your data directory.")
        return

    # Show imbalance ratio
    max_count = max(class_counts.values())
    min_count = max(min(class_counts.values()), 1)
    ratio = max_count / min_count
    print(f"\n  Class imbalance ratio: {ratio:.1f}x ({max_count} / {min_count})")
    if ratio > 5:
        print(f"  RECOMMENDATION: Run balance_dataset.py first, or class weights will be heavy")

    # Load dataset from folder structure
    print(f"\nLoading dataset from {data_dir}...")
    dataset = load_dataset("imagefolder", data_dir=str(data_dir))

    # Split into train/val (80/20)
    dataset = dataset["train"].train_test_split(test_size=0.2, seed=42, stratify_by_column="label")
    dataset = DatasetDict({
        "train": dataset["train"],
        "validation": dataset["test"],
    })

    print(f"  Train: {len(dataset['train'])} images")
    print(f"  Val:   {len(dataset['validation'])} images")

    # Compute class weights
    class_weights = None
    if not args.no_class_weights:
        class_weights = compute_class_weights(dataset["train"])
        print(f"\n  Class weights (inverse frequency):")
        for cat, w in zip(LABEL2ID.keys(), class_weights):
            print(f"    {cat}: {w:.3f}")

    # Load processor and model
    print(f"\nLoading model: {args.model_name}")
    processor = ViTImageProcessor.from_pretrained(args.model_name)

    model = ViTForImageClassification.from_pretrained(
        args.model_name,
        num_labels=len(LABEL2ID),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    # Preprocess
    def preprocess(examples):
        images = [img.convert("RGB") for img in examples["image"]]
        inputs = processor(images=images, return_tensors="pt")
        inputs["labels"] = examples["label"]
        return inputs

    print("Preprocessing...")
    dataset = dataset.map(preprocess, batched=True, remove_columns=["image"])
    dataset.set_format("torch")

    # Training
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=args.lr,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        logging_steps=10,
        remove_unused_columns=False,
        push_to_hub=args.push_to_hub,
        hub_model_id=args.hub_model_id,
    )

    trainer = WeightedTrainer(
        class_weights=class_weights,
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["validation"],
        processing_class=processor,
        compute_metrics=compute_metrics,
    )

    print(f"\nStarting training ({args.epochs} epochs)...")
    trainer.train()

    # Evaluate
    print("\nEvaluating...")
    metrics = trainer.evaluate()
    print(json.dumps(metrics, indent=2))

    # Detailed per-class report
    print("\nPer-class evaluation:")
    val_preds = trainer.predict(dataset["validation"])
    preds = np.argmax(val_preds.predictions, axis=-1)
    labels = val_preds.label_ids
    print(classification_report(labels, preds, target_names=list(LABEL2ID.keys())))

    # Save
    print(f"\nSaving model to {OUTPUT_DIR}")
    trainer.save_model(str(OUTPUT_DIR))
    processor.save_pretrained(str(OUTPUT_DIR))

    # Save training metadata
    meta = {
        "data_dir": str(data_dir),
        "class_counts": class_counts,
        "class_weights": class_weights,
        "imbalance_ratio": ratio,
        "metrics": {k: float(v) if isinstance(v, (np.floating, float)) else v
                    for k, v in metrics.items()},
        "args": vars(args),
    }
    with open(OUTPUT_DIR / "training_metadata.json", "w") as f:
        json.dump(meta, f, indent=2, default=str)
    print(f"Training metadata saved to {OUTPUT_DIR / 'training_metadata.json'}")

    if args.push_to_hub:
        print(f"\nPushing to Hub: {args.hub_model_id}")
        trainer.push_to_hub()
        print("Done! Model is live on HuggingFace Hub.")
        print(f"Update HUGGING_FACE_CONFIG.MODEL_ID to '{args.hub_model_id}' in src/config/huggingface.ts")

    print("\nTraining complete!")
    print(f"Model saved to: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
