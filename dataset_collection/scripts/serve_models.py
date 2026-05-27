#!/usr/bin/env python3
"""
Purpose:
    FastAPI inference server for the tattoo classifier — exposes the three
    final ViT-base models (balanced / unbalanced / uncleaned), their
    per-epoch checkpoints, and a KNN similarity search over the precomputed
    training-image embeddings. Three feature areas:
      1. Final-model inference (existing)
      2. Per-checkpoint inference (powers Tile 3 — model learning visual)
      3. Per-tier KNN similarity (powers Tile 1 — "your nearest neighbours")

Dependencies:
    - transformers (ViTForImageClassification, ViTModel, ViTImageProcessor)
    - fastapi, uvicorn
    - PIL (image decoding + thumbnail generation)
    - torch (softmax + no_grad + tensor ops)
    - numpy (cosine similarity via dot product on cached embeddings)
    - dataset_collection/models/{variant}/                  — final trained models
    - dataset_collection/checkpoints/{variant}/checkpoint-* — per-epoch snapshots
    - dataset_collection/embeddings/{variant}.npz           — precomputed ViT [CLS]
                                                              features for each
                                                              training image
    - dataset_collection/data/{variant}/{class}/*.png       — source training images
                                                              used to return
                                                              neighbour thumbnails

Used by:
    - GCP VM (Cloudflare-tunnelled) serving production inference for the demo
    - Frontend src/config/huggingface.ts (calls /models/{name})
    - Frontend UnderTheHoodSection (calls /models/{name}/checkpoints and
      /models/{name}/similar)

Changes:
    2026-05-18: Added /models/{name}/checkpoints (list) and
                /models/{name}/checkpoints/{step} (inference) for the
                Tile 3 checkpoint progression visual.
    2026-05-18: Added /models/{name}/similar (KNN over precomputed
                embeddings) for the Tile 1 nearest-neighbour grid.
"""

import argparse
import base64
import io
import json
import os
import re
import time
from pathlib import Path

import numpy as np
import torch
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import (
    ViTForImageClassification,
    ViTImageProcessor,
    ViTModel,
)

# All directories sit alongside scripts/ inside dataset_collection/.
# Choose the active model lineage via env var so we can switch between
# original/augmented/LP-FT *without* moving any files — every model dir is
# preserved side-by-side. Default is the LP-FT v1 lineage (best wide-shot
# accuracy: 71% on balanced, with not_tattoo at 100% — see the wide-shot
# validation matrix in val_heldout_manifest.json).
BASE_DIR = Path(__file__).parent.parent
ACTIVE_MODEL_LINEAGE = os.environ.get("ACTIVE_MODEL_LINEAGE", "models_lpft")
MODEL_DIR = BASE_DIR / ACTIVE_MODEL_LINEAGE
# LP-FT keeps checkpoints INSIDE each tier dir (models_lpft/balanced/checkpoint-1/...)
# whereas the original split used a sibling "checkpoints/" tree. So checkpoint
# discovery follows the model dir for the LP-FT layout, falling back to the
# legacy sibling tree if it exists.
CHECKPOINT_DIR = MODEL_DIR if (MODEL_DIR / "balanced" / "checkpoint-1").exists() else BASE_DIR / "checkpoints"
EMBEDDINGS_DIR = BASE_DIR / "embeddings"
DATA_DIR = BASE_DIR / "data"

# Public name of the ViT backbone used both as the model starting point and
# for embedding user images at query time. Kept in sync with
# precompute_embeddings.py so query embeddings live in the same feature space.
VIT_BACKBONE_NAME = "google/vit-base-patch16-224-in21k"

# Default size for neighbour thumbnails returned as base64 JPEG. 112×112 keeps
# each thumbnail around 8-12 KB so an 8-result response is well under 100 KB
# even before HTTP compression — fits comfortably in the frontend's existing
# JSON-handling path without separate static file serving.
THUMBNAIL_SIZE = 112
THUMBNAIL_QUALITY = 75

# Public model IDs returned to the frontend. These match what the HF Inference
# API would return — the frontend already uses them, so we keep them stable.
MODELS = {
    "tattoo-balanced": MODEL_DIR / "balanced",
    "tattoo-unbalanced": MODEL_DIR / "unbalanced",
    "tattoo-uncleaned": MODEL_DIR / "uncleaned",
}

# Map public model ID -> filesystem variant slug used inside checkpoints/.
# Defined explicitly rather than parsed so the mapping is clear at the top.
VARIANT_FOR_MODEL = {
    "tattoo-balanced": "balanced",
    "tattoo-unbalanced": "unbalanced",
    "tattoo-uncleaned": "uncleaned",
}

CLASS_NAMES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]

app = FastAPI(title="Tattoo Classification API", version="1.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Two separate caches because checkpoint inference is rarer than final-model
# inference — the frontend hits the final model on every photo, but the
# checkpoint trail only when a user expands Tile 3. Keeping them apart means
# the final-model cache is never evicted by exploratory checkpoint browsing.
_loaded_models: dict[str, tuple] = {}
_loaded_checkpoints: dict[str, tuple] = {}

# Caches for the KNN-similarity path: the .npz files per tier (eager-load on
# first /similar call, ~17 MB each) and a single shared ViT backbone used to
# embed query images. The backbone is intentionally separate from the
# fine-tuned classification models above because we want raw [CLS] features
# matching what precompute_embeddings.py wrote — not the classifier head.
_loaded_embeddings: dict[str, dict] = {}
_backbone_cache: dict[str, tuple] = {}


# ────────────────────────────────────────────────────────────────────────────
# Model loading helpers
# ────────────────────────────────────────────────────────────────────────────

def load_model(name: str):
    """Load a final model + processor, cached after first load."""
    if name in _loaded_models:
        return _loaded_models[name]

    path = MODELS[name]
    if not path.exists():
        raise FileNotFoundError(f"Model not found: {path}")

    print(f"Loading {name} from {path}...")
    t0 = time.time()
    processor = ViTImageProcessor.from_pretrained(str(path))
    model = ViTForImageClassification.from_pretrained(str(path))
    model.eval()
    print(f"  Loaded {name} in {time.time() - t0:.1f}s")

    _loaded_models[name] = (processor, model)
    return processor, model


def load_checkpoint(model_name: str, step: int):
    """Load a specific checkpoint, cached separately from final models."""
    cache_key = f"{model_name}:{step}"
    if cache_key in _loaded_checkpoints:
        return _loaded_checkpoints[cache_key]

    variant = VARIANT_FOR_MODEL[model_name]
    path = CHECKPOINT_DIR / variant / f"checkpoint-{step}"
    if not path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {path}")

    print(f"Loading checkpoint {cache_key} from {path}...")
    t0 = time.time()
    # Reuse the final model's processor when present — checkpoints share the
    # same preprocessing config, so we avoid a redundant load.
    if model_name in _loaded_models:
        processor, _ = _loaded_models[model_name]
    else:
        processor = ViTImageProcessor.from_pretrained(str(path))
    model = ViTForImageClassification.from_pretrained(str(path))
    model.eval()
    print(f"  Loaded checkpoint {cache_key} in {time.time() - t0:.1f}s")

    _loaded_checkpoints[cache_key] = (processor, model)
    return processor, model


def list_checkpoints(model_name: str) -> list[dict]:
    """Discover checkpoint directories for a variant and pull their metrics.

    Each entry contains the step, the inferred epoch, and the eval metrics
    pulled from trainer_state.json. Sorted ascending by step so the frontend
    can display the trajectory chronologically.
    """
    variant = VARIANT_FOR_MODEL[model_name]
    variant_dir = CHECKPOINT_DIR / variant
    if not variant_dir.exists():
        return []

    entries: list[dict] = []
    for child in variant_dir.iterdir():
        if not child.is_dir():
            continue
        match = re.match(r"checkpoint-(\d+)$", child.name)
        if not match:
            continue
        step = int(match.group(1))

        # The trainer_state.json log_history holds per-epoch eval entries.
        # We grab the eval row whose step matches this checkpoint so the
        # frontend can chart the model's accuracy trajectory.
        metrics: dict = {}
        epoch: float | None = None
        state_file = child / "trainer_state.json"
        if state_file.exists():
            try:
                state = json.loads(state_file.read_text())
                for entry in state.get("log_history", []):
                    if entry.get("step") == step and "eval_loss" in entry:
                        epoch = entry.get("epoch")
                        # Only forward eval_ keys so we do not leak raw step
                        # bookkeeping the frontend has no use for.
                        metrics = {k: v for k, v in entry.items() if k.startswith("eval_")}
                        break
            except Exception as e:
                # A malformed state file should not break the listing — the
                # checkpoint is still usable, just without trajectory metrics.
                print(f"  Could not parse {state_file}: {e}")

        entries.append({"step": step, "epoch": epoch, "metrics": metrics})

    entries.sort(key=lambda e: e["step"])
    return entries


# ────────────────────────────────────────────────────────────────────────────
# KNN similarity helpers (Tile 1 — nearest neighbours grid)
# ────────────────────────────────────────────────────────────────────────────

def load_embeddings(variant: str) -> dict:
    """Load the precomputed embedding matrix + image paths for a variant.

    The .npz file was produced by precompute_embeddings.py with cosine-
    normalised vectors, so similarity at query time is a single dot product.
    Cached on first call — each tier is ~5-18 MB resident.
    """
    if variant in _loaded_embeddings:
        return _loaded_embeddings[variant]

    path = EMBEDDINGS_DIR / f"{variant}.npz"
    if not path.exists():
        raise FileNotFoundError(
            f"Embeddings not found for {variant}: {path}. "
            "Run precompute_embeddings.py on the cluster and copy the .npz files into embeddings/."
        )

    print(f"Loading embeddings for {variant} from {path}...")
    t0 = time.time()
    data = np.load(path, allow_pickle=False)
    _loaded_embeddings[variant] = {
        "embeddings": data["embeddings"],
        "paths": data["paths"],
    }
    print(f"  Loaded {variant}: {data['embeddings'].shape} in {time.time() - t0:.1f}s")
    return _loaded_embeddings[variant]


def load_backbone() -> tuple:
    """Load the bare ViT backbone for embedding query images.

    Reuses the same architecture as the precompute job so the user's query
    vector lives in the same feature space as the precomputed neighbours.
    """
    if "default" in _backbone_cache:
        return _backbone_cache["default"]

    print(f"Loading ViT backbone for query embedding ({VIT_BACKBONE_NAME})...")
    t0 = time.time()
    processor = ViTImageProcessor.from_pretrained(VIT_BACKBONE_NAME)
    backbone = ViTModel.from_pretrained(VIT_BACKBONE_NAME)
    backbone.eval()
    print(f"  Loaded backbone in {time.time() - t0:.1f}s")

    _backbone_cache["default"] = (processor, backbone)
    return processor, backbone


def embed_query(image: Image.Image) -> np.ndarray:
    """Embed a single image to a normalised 768-dim vector."""
    processor, backbone = load_backbone()
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        out = backbone(**inputs)
    cls = out.last_hidden_state[0, 0, :].numpy().astype(np.float32)
    norm = float(np.linalg.norm(cls))
    # Match the same normalisation applied during precompute so dot product
    # equals cosine similarity in [-1, 1].
    return cls / max(norm, 1e-8)


def thumbnail_b64(image_path: Path) -> str | None:
    """Read an image, resize to a tile-sized thumbnail, return base64 JPEG."""
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMBNAIL_SIZE, THUMBNAIL_SIZE), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=THUMBNAIL_QUALITY)
            return base64.b64encode(buf.getvalue()).decode("ascii")
    except Exception as e:
        # We log but continue — one bad neighbour shouldn't break the whole
        # response. The frontend filters out null thumbnails.
        print(f"  Could not thumbnail {image_path}: {e}")
        return None


# ────────────────────────────────────────────────────────────────────────────
# Image → prediction (shared by final model and checkpoint endpoints)
# ────────────────────────────────────────────────────────────────────────────

def run_inference(processor, model, image: Image.Image) -> list[dict]:
    """Run a forward pass and format the result in HF Inference API style."""
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    probs = torch.softmax(outputs.logits[0], dim=0)

    results = [
        {"label": f"LABEL_{i}", "score": round(score, 6)}
        for i, score in enumerate(probs.tolist())
    ]
    # HF convention is descending by score — the frontend depends on this.
    results.sort(key=lambda x: x["score"], reverse=True)
    return results


async def read_image_body(request: Request) -> tuple[Image.Image | None, Response | None]:
    """Decode the request body into a PIL image, or return an error response."""
    body = await request.body()
    if not body:
        return None, Response(content="No image data in request body", status_code=400)
    try:
        return Image.open(io.BytesIO(body)).convert("RGB"), None
    except Exception as e:
        return None, Response(content=f"Invalid image: {e}", status_code=400)


# ────────────────────────────────────────────────────────────────────────────
# Final-model endpoints (unchanged behaviour — frontend already calls these)
# ────────────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_available": list(MODELS.keys()),
        "models_loaded": list(_loaded_models.keys()),
        "checkpoints_loaded": list(_loaded_checkpoints.keys()),
    }


@app.post("/models/{model_name}")
async def classify(model_name: str, request: Request):
    """Classify an image using the final trained model."""
    if model_name not in MODELS:
        return Response(
            content=f"Unknown model: {model_name}. Available: {list(MODELS.keys())}",
            status_code=404,
        )

    image, err = await read_image_body(request)
    if err is not None:
        return err

    processor, model = load_model(model_name)
    return run_inference(processor, model, image)


@app.get("/models/{model_name}")
def model_info(model_name: str):
    """Return final-model metadata plus the count of available checkpoints."""
    if model_name not in MODELS:
        return Response(content=f"Unknown model: {model_name}", status_code=404)

    path = MODELS[model_name]
    metadata_file = path / "training_metadata.json"
    metadata: dict = {}
    if metadata_file.exists():
        metadata = json.loads(metadata_file.read_text())

    return {
        "model_name": model_name,
        "path": str(path),
        "class_names": CLASS_NAMES,
        "loaded": model_name in _loaded_models,
        "training_metadata": metadata,
        # Light hint so the frontend can decide whether to render Tile 3 at all.
        "checkpoint_count": len(list_checkpoints(model_name)),
    }


# ────────────────────────────────────────────────────────────────────────────
# Checkpoint endpoints (new — for Tile 3 "How the model learned your image")
# ────────────────────────────────────────────────────────────────────────────

@app.get("/models/{model_name}/checkpoints")
def checkpoints_index(model_name: str):
    """List available checkpoints for a variant with their eval metrics.

    Frontend uses this to render the confidence-over-time chart and to know
    which step numbers can be passed to the per-checkpoint inference endpoint.
    """
    if model_name not in MODELS:
        return Response(content=f"Unknown model: {model_name}", status_code=404)

    entries = list_checkpoints(model_name)
    return {
        "model_name": model_name,
        "variant": VARIANT_FOR_MODEL[model_name],
        "class_names": CLASS_NAMES,
        "checkpoints": entries,
        # The final-model step is conventionally the last checkpoint — useful
        # for the frontend to know which one corresponds to the deployed model.
        "final_step": entries[-1]["step"] if entries else None,
    }


@app.post("/models/{model_name}/checkpoints/{step}")
async def classify_at_checkpoint(model_name: str, step: int, request: Request):
    """Run inference at a specific training checkpoint.

    Same response shape as /models/{model_name} so the frontend can reuse
    its existing parser — only the underlying weights differ.
    """
    if model_name not in MODELS:
        return Response(content=f"Unknown model: {model_name}", status_code=404)

    image, err = await read_image_body(request)
    if err is not None:
        return err

    try:
        processor, model = load_checkpoint(model_name, step)
    except FileNotFoundError as e:
        return Response(content=str(e), status_code=404)

    return run_inference(processor, model, image)


# ────────────────────────────────────────────────────────────────────────────
# KNN similarity endpoint (Tile 1 — "your nearest neighbours")
# ────────────────────────────────────────────────────────────────────────────

@app.post("/models/{model_name}/similar")
async def find_similar(model_name: str, request: Request):
    """Return the k training images most visually similar to the query image.

    Query parameters:
      class — required, one of the 4 class names. Restricts the search to
              that class's neighbours so the result reads as "examples of
              {predicted_class} the model learned from".
      k     — optional (default 8). Number of neighbours to return.

    Response:
      {
        "variant": "balanced",
        "class": "real_tattoo",
        "k": 8,
        "mean_similarity": 0.82,
        "neighbours": [
          { "path": "real_tattoo/tatvton_00123.png",
            "similarity": 0.94,
            "thumbnail": "<base64 jpeg>" },
          ...
        ]
      }

    Similarity is cosine in [-1, 1] (both query and corpus embeddings are
    pre-normalised). Higher = more alike. The 'mean_similarity' lets the
    frontend show "how confident the model is that your image fits this
    class" without recomputing it client-side.
    """
    if model_name not in MODELS:
        return Response(content=f"Unknown model: {model_name}", status_code=404)

    target_class = request.query_params.get("class")
    if not target_class or target_class not in CLASS_NAMES:
        return Response(
            content=f"'class' query param required, one of: {CLASS_NAMES}",
            status_code=400,
        )

    try:
        k = max(1, min(int(request.query_params.get("k", "8")), 32))
    except ValueError:
        return Response(content="'k' must be an integer", status_code=400)

    image, err = await read_image_body(request)
    if err is not None:
        return err

    variant = VARIANT_FOR_MODEL[model_name]
    try:
        emb_data = load_embeddings(variant)
    except FileNotFoundError as e:
        return Response(content=str(e), status_code=500)

    # Cosine similarity = dot product on pre-normalised vectors. NumPy's
    # vectorised matmul is several orders of magnitude faster than any
    # Python-side loop, even on the unbalanced tier (6,465 candidates).
    query = embed_query(image)
    sims = emb_data["embeddings"] @ query

    # Restrict to the target class. Path entries start with "<class>/...".
    paths = emb_data["paths"]
    class_prefix = f"{target_class}/"
    class_mask = np.array([str(p).startswith(class_prefix) for p in paths])
    if not class_mask.any():
        # Class has no examples in this tier (e.g. not_tattoo in unbalanced
        # is starved). Return an empty list with a clear marker — the
        # frontend can render an "insufficient data" state.
        return {
            "variant": variant,
            "class": target_class,
            "k": k,
            "mean_similarity": None,
            "neighbours": [],
            "warning": f"No '{target_class}' training images in the {variant} tier.",
        }

    # Mask out the other classes by setting their scores to -inf, then take
    # the top-k. argpartition is O(n) and avoids a full sort over thousands
    # of candidates we don't need ranked.
    masked = sims.copy()
    masked[~class_mask] = -np.inf
    effective_k = min(k, int(class_mask.sum()))
    top_idx = np.argpartition(masked, -effective_k)[-effective_k:]
    top_idx = top_idx[np.argsort(-masked[top_idx])]

    neighbours = []
    for idx in top_idx:
        relative_path = str(paths[idx])
        full_path = DATA_DIR / variant / relative_path
        thumb = thumbnail_b64(full_path) if full_path.exists() else None
        neighbours.append({
            "path": relative_path,
            "similarity": round(float(sims[idx]), 4),
            "thumbnail": thumb,
        })

    return {
        "variant": variant,
        "class": target_class,
        "k": effective_k,
        "mean_similarity": round(float(np.mean([n["similarity"] for n in neighbours])), 4),
        "neighbours": neighbours,
    }


# ────────────────────────────────────────────────────────────────────────────
# Entry point
# ────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Serve tattoo classification models")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--preload", action="store_true", help="Load all final models at startup")
    args = parser.parse_args()

    if args.preload:
        print("Preloading final models...")
        for name in MODELS:
            load_model(name)
        print("All final models loaded.")

    print(f"\nStarting server on {args.host}:{args.port}")
    print(f"Models:      {list(MODELS.keys())}")
    print(f"Health:      http://{args.host}:{args.port}/health")
    print(f"Classify:    POST http://{args.host}:{args.port}/models/{{model_name}}")
    print(f"Checkpoints: GET  http://{args.host}:{args.port}/models/{{model_name}}/checkpoints")
    print(f"Checkpoint:  POST http://{args.host}:{args.port}/models/{{model_name}}/checkpoints/{{step}}")
    print(f"Similar:     POST http://{args.host}:{args.port}/models/{{model_name}}/similar?class=<cls>&k=8")

    uvicorn.run(app, host=args.host, port=args.port)
