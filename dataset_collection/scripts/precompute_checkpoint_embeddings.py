"""
Purpose:
    Embed every training image of each tier through each of that tier's
    per-epoch CHECKPOINT trunks, producing one .npz per (variant, step) for the
    per-checkpoint nearest-neighbour tile.

    Why per-checkpoint rather than per-tier. precompute_embeddings_tier.py gives
    one embedding space per tier, taken from the FINAL model — enough to show
    that a skewed training set degrades retrieval, but static across the nine
    epochs Tile 3 walks through. The tile needs to show the space itself moving:
    at epoch 1 the checkpoint's notion of "similar to your photo" is close to
    the in21k prior, and by epoch 9 it has reorganised around the four classes.
    Retrieval in the checkpoint's own space is faithful by construction — it is
    not an interpretation of the model, it is the model's geometry — unlike the
    per-epoch saliency methods rejected in CHECKPOINT_KNN_CONTRACT.md, which
    Adebayo et al. (2018) show cannot even distinguish trained from randomised
    weights.

    Features are the [CLS] token of the checkpoint's trunk (model.vit), NOT the
    classifier logits: 768-dim, L2-normalised, so a dot product is cosine
    similarity. Identical contract to the tier-level .npz files, one directory
    level deeper.

Dependencies:
    - transformers (AutoModelForImageClassification), torch, numpy, Pillow
    - {models-dir}/{variant}/checkpoint-{n}/  — the per-epoch snapshots
    - {data-dir}/{variant}/{class}/*.png      — the tier's corpus

Used by:
    - serve_models.py, POST /models/{name}/checkpoints/{step}/similar
      (reads {out-dir}/{variant}/step-{n}.npz)

Usage:
    python precompute_checkpoint_embeddings.py \
        --models-dir /shared/ezi/mdr_aiact/output_lpft \
        --data-dir   /shared/ezi/mdr_aiact/data \
        --out-dir    /shared/ezi/mdr_aiact/embeddings_checkpoint

    Optionally narrow the job with --variant balanced --steps 1 3 9.

    Roughly 27 (3 tiers x 9 epochs) full corpus passes, so run it on a GPU
    node. Output is ~4.4 MB (balanced) to ~18 MB (unbalanced) per file,
    ~340 MB in total.

Changes:
    2026-07-19: Initial. Backs the per-checkpoint k-NN endpoint that replaces
                the static reference image on Tile 3.
"""

from __future__ import annotations

import argparse
import re
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

VARIANTS = ["balanced", "unbalanced", "uncleaned"]
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
BATCH = 64


def discover_steps(variant_dir: Path) -> list[int]:
    """Return the checkpoint step numbers present under a variant, ascending."""
    steps: list[int] = []
    for child in variant_dir.iterdir():
        if not child.is_dir():
            continue
        match = re.match(r"checkpoint-(\d+)$", child.name)
        if match:
            steps.append(int(match.group(1)))
    return sorted(steps)


def collect_files(data_dir: Path, variant: str) -> list[tuple[str, Path]]:
    """List the tier's corpus once, as (relative_path, absolute_path) pairs.

    Hoisted out of the per-checkpoint loop so every step of a variant embeds
    exactly the same images in exactly the same order — the frontend compares
    neighbour sets across epochs, and a corpus that drifted between files would
    turn a directory-ordering artefact into an apparent change in the model.
    """
    files: list[tuple[str, Path]] = []
    for cls in CLASSES:
        cls_dir = data_dir / variant / cls
        if not cls_dir.exists():
            print(f"  skipping {variant}/{cls} (no such dir)")
            continue
        for p in sorted(cls_dir.glob("*.png")):
            files.append((f"{cls}/{p.name}", p))
    return files


def embed_corpus(model, processor, files: list[tuple[str, Path]], device: str) -> np.ndarray:
    """Embed a corpus through a checkpoint trunk, returning L2-normalised rows."""
    chunks: list[np.ndarray] = []
    for i in range(0, len(files), BATCH):
        batch = files[i:i + BATCH]
        imgs = [Image.open(p).convert("RGB") for _, p in batch]
        inputs = processor(images=imgs, return_tensors="pt").to(device)
        with torch.no_grad():
            # The checkpoint's TRUNK, not the classifier head — the head would
            # collapse each image to 4 logits and destroy the visual detail
            # k-NN needs.
            out = model.vit(**inputs)
        chunks.append(out.last_hidden_state[:, 0, :].cpu().numpy().astype(np.float32))

    E = np.concatenate(chunks)
    norms = np.linalg.norm(E, axis=1, keepdims=True)
    # Normalise here so the server's query-time dot product is cosine
    # similarity with no further work.
    return E / np.maximum(norms, 1e-8)


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Embed each tier's corpus through each of its per-epoch checkpoint trunks."
    )
    ap.add_argument("--models-dir", required=True, help="dir holding {variant}/checkpoint-{n}/")
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument(
        "--variant", action="append", choices=VARIANTS,
        help="restrict to one variant; repeatable. Default: all three.",
    )
    ap.add_argument(
        "--steps", type=int, nargs="+",
        help="restrict to these checkpoint steps. Default: all discovered.",
    )
    ap.add_argument(
        "--overwrite", action="store_true",
        help="re-embed steps whose .npz already exists (default: skip them, so "
             "an interrupted run can be resumed cheaply).",
    )
    args = ap.parse_args()

    models_dir, data_dir = Path(args.models_dir), Path(args.data_dir)
    out_root = Path(args.out_dir)
    variants = args.variant or VARIANTS

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Device: {device}")

    for variant in variants:
        variant_dir = models_dir / variant
        if not variant_dir.exists():
            print(f"\n=== {variant}: SKIP — no model dir at {variant_dir}")
            continue

        steps = discover_steps(variant_dir)
        if args.steps:
            requested = set(args.steps)
            missing = sorted(requested - set(steps))
            if missing:
                print(f"  {variant}: requested steps not present, ignoring: {missing}")
            steps = [s for s in steps if s in requested]
        if not steps:
            print(f"\n=== {variant}: SKIP — no checkpoints to process")
            continue

        files = collect_files(data_dir, variant)
        if not files:
            print(f"\n=== {variant}: SKIP — no images under {data_dir / variant}")
            continue

        out_dir = out_root / variant
        out_dir.mkdir(parents=True, exist_ok=True)
        paths = np.array([rel for rel, _ in files])
        print(f"\n=== {variant} — {len(files)} images x {len(steps)} checkpoints ===")

        for step in steps:
            out_file = out_dir / f"step-{step}.npz"
            if out_file.exists() and not args.overwrite:
                print(f"  step-{step}: exists, skipping (--overwrite to redo)")
                continue

            ckpt = variant_dir / f"checkpoint-{step}"
            t0 = time.time()
            processor = AutoImageProcessor.from_pretrained(ckpt)
            model = AutoModelForImageClassification.from_pretrained(ckpt).to(device).eval()

            E = embed_corpus(model, processor, files, device)
            np.savez_compressed(out_file, embeddings=E, paths=paths)
            print(f"  -> {out_file}  shape={E.shape}  ({time.time() - t0:.1f}s)")

            # Drop the checkpoint before loading the next one; 9 ViT-base
            # snapshots resident at once would exhaust a modest GPU.
            del model
            if device == "cuda":
                torch.cuda.empty_cache()


if __name__ == "__main__":
    main()
