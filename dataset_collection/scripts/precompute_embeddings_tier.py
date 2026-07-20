"""
Purpose:
    Recompute the k-NN embeddings using each tier's OWN fine-tuned model,
    replacing precompute_embeddings.py which embeds every tier with the generic
    google/vit-base-patch16-224-in21k backbone.

    Why this is needed. The original job reasons: "we want the [CLS] features,
    not the fine-tuned classifier head, so any tier's processor works". The
    consequence is that all three tiers share ONE embedding space produced by a
    backbone that never saw the training data, so the tiers differ only in which
    images sit in the corpus. Toggling the bias-testing shield therefore cannot
    change the neighbours, and empirically does not: balanced, unbalanced and
    uncleaned return byte-identical neighbours for the same query, including
    under a global all-class search.

    Embedding with each tier's own model was tested before this script was
    written (120 images/class subsample, sticker query, equal per-class
    sampling so corpus composition could not confound it):

        balanced   (own model)  top-6: 5 sticker, 1 pen   top sim 0.681
        unbalanced (own model)  top-6: 4 sticker, 2 pen   top sim 0.385
        uncleaned  (own model)  top-6: 5 sticker, 1 pen   top sim 0.525

    Different neighbours, different ordering, and the biased tier's similarity
    collapses — the model's own sense of "what resembles your image" is
    measurably degraded by skewed training. That is the effect the tile is
    supposed to show.

    Features are the [CLS] token of the fine-tuned trunk (model.vit), NOT the
    classifier logits: 768-dim, L2-normalised, so a dot product is cosine
    similarity — identical contract to the original .npz files, and
    serve_models.load_embeddings needs no change beyond embedding the query
    with the matching tier model.

Dependencies:
    - transformers (AutoModelForImageClassification), torch, numpy, Pillow
    - {models-dir}/{variant}/            — the tier's fine-tuned model
    - {data-dir}/{variant}/{class}/*.png — the tier's corpus

Used by:
    - serve_models.py (loads {out-dir}/{variant}.npz for k-NN)

Usage:
    python precompute_embeddings_tier.py \
        --models-dir /shared/ezi/mdr_aiact/output_lpft \
        --data-dir   /shared/ezi/mdr_aiact/data \
        --out-dir    /shared/claude_drift/wide/embeddings_tier

Changes:
    2026-07-16: Initial. Fixes the tier-blind embedding space behind Tile 1.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

VARIANTS = ["balanced", "unbalanced", "uncleaned"]
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
BATCH = 64


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models-dir", required=True, help="dir holding {variant}/ model dirs")
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    args = ap.parse_args()

    models_dir, data_dir = Path(args.models_dir), Path(args.data_dir)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    for variant in VARIANTS:
        mdir = models_dir / variant
        if not mdir.exists():
            print(f"\n=== {variant}: SKIP — no model at {mdir}")
            continue

        print(f"\n=== {variant} — embedding with its OWN model ({mdir}) ===")
        processor = AutoImageProcessor.from_pretrained(mdir)
        model = AutoModelForImageClassification.from_pretrained(mdir).to(device).eval()

        paths: list[str] = []
        chunks: list[np.ndarray] = []
        t0 = time.time()

        for cls in CLASSES:
            cls_dir = data_dir / variant / cls
            if not cls_dir.exists():
                print(f"  skipping {variant}/{cls} (no such dir)")
                continue
            files = sorted(cls_dir.glob("*.png"))
            for i in range(0, len(files), BATCH):
                batch = files[i:i + BATCH]
                imgs = [Image.open(p).convert("RGB") for p in batch]
                inputs = processor(images=imgs, return_tensors="pt").to(device)
                with torch.no_grad():
                    # The fine-tuned TRUNK, not the classifier head — the head
                    # would collapse each image to 4 logits and destroy the
                    # visual detail k-NN needs.
                    out = model.vit(**inputs)
                feats = out.last_hidden_state[:, 0, :].cpu().numpy().astype(np.float32)
                chunks.append(feats)
                # Store paths RELATIVE to data/{variant}/ so the API can resolve
                # thumbnails — identical contract to the original job.
                paths.extend(f"{cls}/{p.name}" for p in batch)
            print(f"  {cls:16s} {len(files):5d} images")

        if not chunks:
            print(f"  {variant}: no images found, skipping output")
            continue

        E = np.concatenate(chunks)
        norms = np.linalg.norm(E, axis=1, keepdims=True)
        E = E / np.maximum(norms, 1e-8)

        out_file = out_dir / f"{variant}.npz"
        np.savez_compressed(out_file, embeddings=E, paths=np.array(paths))
        print(f"  -> {out_file}  shape={E.shape}  ({time.time() - t0:.1f}s)")


if __name__ == "__main__":
    main()
