"""
Purpose:
    One-off job to precompute ViT [CLS] embeddings for every training image
    across the three model tiers. The resulting per-tier .npz files feed the
    KNN similarity search behind Tile 1 in the Under-the-Hood section —
    given a user's photo, the API finds the 8 most visually similar training
    images for the current tier.

Dependencies:
    - transformers (ViTModel for feature extraction)
    - torch, numpy, Pillow
    - /shared/ezi/mdr_aiact/data/{balanced,unbalanced,uncleaned}/{class}/*.png

Used by:
    - /shared/ezi/mdr_aiact/code/serve_models.py (loads the .npz files and
      runs cosine-similarity KNN against the precomputed vectors)

Changes:
    2026-05-18: Initial. Run once on the cluster GPU, copy .npz files down
                to the local repo at dataset_collection/embeddings/.
"""

import json
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import ViTImageProcessor, ViTModel

BASE = Path("/shared/ezi/mdr_aiact")
DATA_DIR = BASE / "data"
OUT_DIR = BASE / "embeddings"
OUT_DIR.mkdir(parents=True, exist_ok=True)

VARIANTS = ["balanced", "unbalanced", "uncleaned"]
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
MODEL_NAME = "google/vit-base-patch16-224-in21k"

device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Device: {device}")

# Load the pretrained backbone once — we want the [CLS] features, not
# the fine-tuned classifier head, so any tier's processor works.
print(f"Loading {MODEL_NAME}...")
processor = ViTImageProcessor.from_pretrained(MODEL_NAME)
model = ViTModel.from_pretrained(MODEL_NAME).to(device)
model.eval()


def embed_batch(images: list[Image.Image]) -> np.ndarray:
    """Run the ViT backbone on a batch, return the [CLS] feature vectors."""
    inputs = processor(images=images, return_tensors="pt").to(device)
    with torch.no_grad():
        out = model(**inputs)
    # [CLS] token is the first position of the last hidden state.
    cls = out.last_hidden_state[:, 0, :].cpu().numpy()
    return cls


BATCH = 64
for variant in VARIANTS:
    print(f"\n=== {variant} ===")
    paths: list[str] = []
    embeddings: list[np.ndarray] = []
    t0 = time.time()

    for cls in CLASSES:
        cls_dir = DATA_DIR / variant / cls
        if not cls_dir.exists():
            print(f"  skipping {variant}/{cls} (no such dir)")
            continue

        # Collect every PNG under this class folder
        files = sorted(p for p in cls_dir.glob("*.png"))
        print(f"  {cls}: {len(files)} images")

        # Stream through in batches to keep GPU memory bounded
        for i in range(0, len(files), BATCH):
            batch_files = files[i:i + BATCH]
            try:
                imgs = [Image.open(f).convert("RGB") for f in batch_files]
            except Exception as e:
                print(f"    skip batch starting at {batch_files[0]}: {e}")
                continue
            feats = embed_batch(imgs)
            embeddings.append(feats)
            # Store path RELATIVE to data/{variant}/ so the frontend can
            # resolve URLs via a known mount.
            for f in batch_files:
                paths.append(f"{cls}/{f.name}")

    if not embeddings:
        print(f"  ⚠ {variant}: no images found, skipping output")
        continue

    all_feats = np.concatenate(embeddings, axis=0).astype(np.float32)
    # Pre-normalise so cosine similarity becomes a simple dot product at
    # query time — saves work on every KNN call.
    norms = np.linalg.norm(all_feats, axis=1, keepdims=True)
    all_feats = all_feats / np.clip(norms, 1e-8, None)

    out_file = OUT_DIR / f"{variant}.npz"
    np.savez_compressed(out_file, embeddings=all_feats, paths=np.array(paths))
    elapsed = time.time() - t0
    print(f"  saved {out_file} — {len(paths)} images, shape {all_feats.shape}, {elapsed:.1f}s")

# Summary
summary = {}
for variant in VARIANTS:
    f = OUT_DIR / f"{variant}.npz"
    if f.exists():
        d = np.load(f)
        summary[variant] = {
            "count": int(d["embeddings"].shape[0]),
            "dim": int(d["embeddings"].shape[1]),
            "size_mb": round(f.stat().st_size / 1024 / 1024, 2),
        }
with open(OUT_DIR / "summary.json", "w") as f:
    json.dump(summary, f, indent=2)
print(f"\nDone. Summary written to {OUT_DIR / 'summary.json'}:")
print(json.dumps(summary, indent=2))
