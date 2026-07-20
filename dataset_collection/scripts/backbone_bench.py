"""
Purpose:
    Benchmark modern self-supervised backbones as FROZEN feature extractors for
    this 4-class task, and — critically — separate the two competing
    explanations for the 81.2% ceiling:

      (a) features are too weak  -> a better backbone lifts accuracy
      (b) labels are wrong       -> nothing lifts accuracy, because the target
                                    itself is noise

    Design. Every arm is trained on the SAME (noisy) training labels and scored
    on the SAME two evaluation sets:
      1. 48 held-out REAL photographs (12/class, absent from balanced_lpft —
         verified). Still carries the labels' own noise.
      2. A hand-verified clean subset: images where the stored label, the
         fine-tuned ViT and CLIP zero-shot ALL agree. Agreement of two
         independent judges with the label makes these near-certainly correct,
         so this set approximates accuracy against TRUE labels.

    The gap between (1) and (2) is the diagnostic. If a backbone scores far
    higher on the clean subset than on the noisy held-out set, the ceiling is
    label noise, not features — and no amount of backbone shopping will fix it.

    Prior arms already refuted on this task (do not repeat): fine-tuned ViT
    baseline 81.2%; CLIP ViT-L/14 zero-shot 47.9% on crops; CLIP linear probe
    77.1%; wide-shot-distribution retrain +1 image/240; ROI multi-crop
    85.7%->57.1%.

Dependencies:
    - torch, transformers, PIL
    - dataset_collection/data/balanced_lpft/{class}/*.png  (train)
    - dataset_collection/val_heldout_manifest.json         (held-out real)
    - dataset_collection/curation_manifest.json            (agreement labels)

Usage:
    python backbone_bench.py [--per-class 300]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

BACKBONES = [
    ("DINOv2 ViT-B/14", "facebook/dinov2-base"),
    ("DINOv2 ViT-L/14", "facebook/dinov2-large"),
    ("SigLIP ViT-B/16", "google/siglip-base-patch16-224"),
]

# The held-out set is only 48 images, so one image moves the number by 2.1pp.
# Repeat each probe over several seeds and report mean +/- spread, so a
# backbone ranking is not read off run-to-run noise.
SEEDS = [0, 1, 2]


@torch.no_grad()
def embed(model, proc, paths, bs=32):
    out = []
    for i in range(0, len(paths), bs):
        imgs = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
        inp = proc(images=imgs, return_tensors="pt").to(DEVICE)
        feats = model(**inp).last_hidden_state[:, 0]      # CLS token
        out.append(torch.nn.functional.normalize(feats, dim=-1).cpu())
    return torch.cat(out)


def probe(X, y, epochs=600, seed=0):
    torch.manual_seed(seed)
    head = torch.nn.Linear(X.shape[1], len(CLASSES))
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-4)
    lf = torch.nn.CrossEntropyLoss()
    for _ in range(epochs):
        opt.zero_grad()
        lf(head(X), y).backward()
        opt.step()
    return head.eval()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=300)
    args = ap.parse_args()

    # ── Train split: the tier's own (noisy) training images ──
    tr_paths, tr_y = [], []
    for i, c in enumerate(CLASSES):
        ps = sorted((DATA / "balanced_lpft" / c).glob("*.png"))
        step = max(1, len(ps) // args.per_class)
        keep = ps[::step][:args.per_class]
        tr_paths += keep
        tr_y += [i] * len(keep)
    tr_y = torch.tensor(tr_y)

    # ── Eval 1: 48 held-out REAL photographs (labels still noisy) ──
    held = json.loads((BASE / "val_heldout_manifest.json").read_text())["heldout_crops"]
    ev_paths, ev_y = [], []
    for c in ["real_tattoo", "sticker_tattoo", "pen_drawn"]:
        for n in held[c]:
            p = DATA / "balanced" / c / n
            if p.exists():
                ev_paths.append(p)
                ev_y.append(CLASSES.index(c))
    for n in held.get("not_tattoo", []):
        for d in sorted((DATA / "not_tattoo_fitzpatrick").glob("fst_*")):
            if (d / n).exists():
                ev_paths.append(d / n)
                ev_y.append(CLASSES.index("not_tattoo"))
                break
    ev_y = torch.tensor(ev_y)

    # ── Eval 2: consensus-clean subset (label == ViT == CLIP) ──
    man = json.loads((BASE / "curation_manifest.json").read_text())
    cl_paths, cl_y = [], []
    for r in man["records"]:
        if r["label"] == r["vit"] == r["clip"]:
            p = DATA / "balanced" / r["path"]
            if p.exists():
                cl_paths.append(p)
                cl_y.append(CLASSES.index(r["label"]))
    # Cap per class so one class cannot dominate the score.
    keep_p, keep_y, seen = [], [], {c: 0 for c in range(len(CLASSES))}
    for p, y in zip(cl_paths, cl_y):
        if seen[y] < 60:
            keep_p.append(p)
            keep_y.append(y)
            seen[y] += 1
    cl_paths, cl_y = keep_p, torch.tensor(keep_y)

    print(f"train {len(tr_paths)} | held-out real {len(ev_paths)} | consensus-clean {len(cl_paths)}")
    print(f"consensus-clean per class: {[int((cl_y == i).sum()) for i in range(len(CLASSES))]}\n")

    for name, hub in BACKBONES:
        try:
            proc = AutoImageProcessor.from_pretrained(hub)
            model = AutoModel.from_pretrained(hub).to(DEVICE).eval()
            if hasattr(model, "vision_model"):          # SigLIP wraps its tower
                model = model.vision_model
        except Exception as e:
            print(f"{name}: SKIP ({type(e).__name__}: {str(e)[:80]})")
            continue

        Xtr = embed(model, proc, tr_paths)
        sets = [("held-out real", ev_paths, ev_y),
                ("consensus-clean", cl_paths, cl_y)]
        cache = {tag: embed(model, proc, paths) for tag, paths, _ in sets}

        print(f"{name}")
        for tag, _, y in sets:
            accs = []
            for sd in SEEDS:
                head = probe(Xtr, tr_y, seed=sd)
                with torch.no_grad():
                    pred = head(cache[tag]).argmax(-1)
                accs.append((pred == y).float().mean().item())
            m = sum(accs) / len(accs)
            spread = max(accs) - min(accs)
            per = []
            for i, c in enumerate(CLASSES):
                msk = y == i
                if msk.sum():
                    per.append(f"{c.split('_')[0]}:{int((pred[msk] == i).sum())}/{int(msk.sum())}")
            print(f"   {tag:16s} {m:6.1%}  (spread {spread:.1%}, n={len(y)})  {'  '.join(per)}")

    print("\nBaselines on held-out real: fine-tuned ViT 81.2% | CLIP zero-shot 47.9%")
    print("A large clean-vs-noisy gap means the ceiling is LABELS, not features.")


if __name__ == "__main__":
    main()
