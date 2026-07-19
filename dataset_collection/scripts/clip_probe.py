"""
Purpose:
    Test whether the classifier's ceiling is set by the DATA or by the
    FEATURES. The served model fine-tunes ViT-base/in21k on ~400 source images
    per class and plateaus at ~77% on wide shots; retraining on a
    deployment-matched distribution moved it by one image out of 240, which
    suggests the backbone — not the framing — is the binding constraint.

    ViT-base/in21k is a supervised ImageNet-21k backbone with no notion of
    "temporary tattoo". CLIP has seen billions of image-text pairs and plausibly
    already separates sticker / pen / real ink. Frozen CLIP features + a linear
    head are also far more sample-efficient than fine-tuning 86M parameters on
    1.6k images, so this is the natural test of the features hypothesis.

    Three arms, all scored on the SAME honest sets used for every other number
    in this investigation (eval_honest.py):
      1. zero-shot     — CLIP text prompts, NO training data at all
      2. probe (tight) — linear head on frozen CLIP features of tight crops
      3. probe (wide)  — linear head on frozen CLIP features of wide composites

    Baseline to beat (models_lpft/balanced):
      real demo photos 6/7 = 85.7%   |   soft wide val 184/240 = 76.7%

    Accuracy and mean confidence are reported separately: a previous arm of this
    investigation produced a model that was more confident and less correct, so
    confidence is explicitly not the objective.

Dependencies:
    - torch, transformers (CLIP), PIL
    - dataset_collection/scripts/eval_honest.py (soft val + demo photo sets)

Usage:
    python clip_probe.py [--model openai/clip-vit-large-patch14]

Changes:
    2026-07-16: Initial. Tests the features hypothesis after the
                distribution-shift hypothesis was refuted.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eval_honest import CLASSES, DEMO_LABELS, SOFT_VAL, build_soft_val  # noqa: E402

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
EXAMPLES = Path(os.environ.get("EXAMPLES_DIR", BASE.parent / "public/images/examples"))

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Several templates per class, averaged — single prompts are brittle.
PROMPTS: dict[str, list[str]] = {
    "real_tattoo": [
        "a photo of a real permanent tattoo on skin",
        "a close-up of tattooed skin with ink under the skin",
        "a person with a permanent tattoo",
    ],
    "sticker_tattoo": [
        "a photo of a temporary sticker tattoo on skin",
        "a close-up of a temporary transfer tattoo applied to skin",
        "a fake press-on tattoo sticker on a person's arm",
    ],
    "pen_drawn": [
        "a photo of a drawing on skin made with a marker pen",
        "a close-up of ink pen doodles drawn on skin",
        "a person with biro drawn on their arm",
    ],
    "not_tattoo": [
        "a photo of bare skin with no tattoo",
        "a close-up of plain untattooed skin",
        "an ordinary object that is not a tattoo",
    ],
}


def load_clip(name: str):
    model = CLIPModel.from_pretrained(name).to(DEVICE).eval()
    proc = CLIPProcessor.from_pretrained(name)
    return model, proc


@torch.no_grad()
def embed(model, proc, paths: list[Path], bs: int = 32) -> torch.Tensor:
    out = []
    for i in range(0, len(paths), bs):
        imgs = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
        inp = proc(images=imgs, return_tensors="pt").to(DEVICE)
        f = model.get_image_features(**inp)
        out.append(torch.nn.functional.normalize(f, dim=-1).cpu())
    return torch.cat(out) if out else torch.empty(0)


@torch.no_grad()
def text_prototypes(model, proc) -> torch.Tensor:
    protos = []
    for c in CLASSES:
        inp = proc(text=PROMPTS[c], return_tensors="pt", padding=True).to(DEVICE)
        t = model.get_text_features(**inp)
        t = torch.nn.functional.normalize(t, dim=-1).mean(0)
        protos.append(torch.nn.functional.normalize(t, dim=0))
    return torch.stack(protos).cpu()


def collect(root: Path) -> tuple[list[Path], torch.Tensor]:
    paths, labels = [], []
    for i, c in enumerate(CLASSES):
        for p in sorted((root / c).glob("*.png")):
            paths.append(p)
            labels.append(i)
    return paths, torch.tensor(labels)


def report(name: str, logits: torch.Tensor, y: torch.Tensor) -> float:
    probs = logits.softmax(-1)
    pred = probs.argmax(-1)
    acc = (pred == y).float().mean().item()
    conf = probs.max(-1).values.mean().item()
    print(f"\n  {name}")
    print(f"    accuracy        : {int((pred == y).sum())}/{len(y)} = {acc:.1%}")
    print(f"    mean confidence : {conf:.3f}")
    header = "truth/pred"
    print(f"    {header:16s}" + "".join(f"{c[:10]:>12s}" for c in CLASSES))
    for i, c in enumerate(CLASSES):
        m = y == i
        if m.sum():
            row = "".join(f"{int(((pred == j) & m).sum()):>12d}" for j in range(len(CLASSES)))
            print(f"    {c:16s}{row}")
    return acc


def train_probe(X: torch.Tensor, y: torch.Tensor, epochs: int = 400) -> torch.nn.Module:
    head = torch.nn.Linear(X.shape[1], len(CLASSES))
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-4)
    lossf = torch.nn.CrossEntropyLoss()
    for _ in range(epochs):
        opt.zero_grad()
        loss = lossf(head(X), y)
        loss.backward()
        opt.step()
    return head.eval()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="openai/clip-vit-large-patch14")
    args = ap.parse_args()

    if not SOFT_VAL.exists():
        print("Building feathered (soft) wide-shot validation set ...")
        build_soft_val()

    print(f"CLIP: {args.model} on {DEVICE}")
    model, proc = load_clip(args.model)

    # ── Evaluation sets (identical to eval_honest.py) ──
    demo_paths = [EXAMPLES / f for f in DEMO_LABELS if (EXAMPLES / f).exists()]
    demo_y = torch.tensor([CLASSES.index(DEMO_LABELS[p.name]) for p in demo_paths])
    soft_paths, soft_y = collect(SOFT_VAL)
    print(f"Eval sets: {len(demo_paths)} real demo photos | {len(soft_paths)} soft wide val")

    print("\nEmbedding evaluation sets ...")
    Xd, Xs = embed(model, proc, demo_paths), embed(model, proc, soft_paths)

    # ── Arm 1: zero-shot, no training data ──
    print("\n" + "=" * 72)
    print("ARM 1: CLIP ZERO-SHOT (no training data whatsoever)")
    print("=" * 72)
    P = text_prototypes(model, proc)
    report("real demo photos", 100.0 * Xd @ P.T, demo_y)
    report("soft wide val", 100.0 * Xs @ P.T, soft_y)

    # ── Arms 2/3: linear probe on frozen features ──
    for tag, root in [("TIGHT crops", DATA / "balanced_lpft"),
                      ("WIDE composites", DATA / "balanced_wide")]:
        if not root.exists():
            print(f"\n(skipping probe on {tag} — {root} not present)")
            continue
        print("\n" + "=" * 72)
        print(f"ARM: LINEAR PROBE on frozen CLIP features — trained on {tag}")
        print("=" * 72)
        tr_paths, tr_y = collect(root)
        print(f"Embedding {len(tr_paths)} training images ...")
        Xt = embed(model, proc, tr_paths)
        head = train_probe(Xt, tr_y)
        with torch.no_grad():
            report("real demo photos", head(Xd), demo_y)
            report("soft wide val", head(Xs), soft_y)

    print("\n" + "=" * 72)
    print("BASELINE for comparison (models_lpft/balanced, fine-tuned ViT):")
    print("  real demo photos  6/7   = 85.7%   (mean conf 0.707)")
    print("  soft wide val   184/240 = 76.7%   (mean conf 0.687)")
    print("=" * 72)


if __name__ == "__main__":
    main()
