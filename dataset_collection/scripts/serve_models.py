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
    - dataset_collection/embeddings_checkpoint/{variant}/step-{n}.npz
                                                            — per-checkpoint [CLS]
                                                              features (see
                                                              precompute_checkpoint_embeddings.py)
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
    2026-07-19: Added /models/{name}/checkpoints/{step}/similar — KNN inside
                each checkpoint's own embedding space, replacing Tile 3's
                static reference image. See CHECKPOINT_KNN_CONTRACT.md.
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
from starlette.concurrency import run_in_threadpool
import anyio
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
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
# Embeddings for the k-NN tile. When TIER_EMBEDDINGS is on, each tier's
# vectors were produced by that tier's OWN fine-tuned trunk
# (precompute_embeddings_tier.py), so the neighbours reflect what that model
# learned and the bias shield visibly changes them. When off, the legacy
# shared-backbone vectors from precompute_embeddings.py are used, where all
# three tiers share one space and the shield cannot change anything.
TIER_EMBEDDINGS = os.environ.get("TIER_EMBEDDINGS", "0") == "1"
EMBEDDINGS_DIR = BASE_DIR / ("embeddings_tier" if TIER_EMBEDDINGS else "embeddings")
# Per-checkpoint embeddings for Tile 3: one .npz per (variant, step), written by
# precompute_checkpoint_embeddings.py. Separate tree from the tier-level files
# because these are indexed by step as well as variant.
CHECKPOINT_EMBEDDINGS_DIR = BASE_DIR / "embeddings_checkpoint"
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

# Per-checkpoint k-NN caches, both bounded. There are 27 (variant, step) pairs
# and each embedding matrix is 4.4-18 MB, so holding them all would cost
# ~340 MB of the box's RAM on top of the models already resident. Six entries
# caps the embedding cache at roughly 110 MB worst case (six unbalanced tiers)
# and ~80 MB typical, while still covering a user stepping back and forth over
# a handful of adjacent epochs in one tier. Ordinary dicts preserve insertion
# order, which is all an LRU needs.
CHECKPOINT_KNN_CACHE_SIZE = 6
# Concurrency bound for the checkpoint k-NN. See the note at the endpoint: the
# work is CPU-bound and torch already threads internally, so more than a couple
# of simultaneous forwards makes the whole burst slower on this 4-core box.
_CHECKPOINT_KNN_SEMAPHORE = anyio.Semaphore(2)
_loaded_checkpoint_embeddings: dict[str, dict] = {}
_checkpoint_trunk_cache: dict[str, tuple] = {}


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


def load_backbone(variant: str | None = None) -> tuple:
    """Load the encoder used to embed query images.

    The query MUST be embedded by whatever produced the corpus vectors, or the
    dot product compares points in two different spaces and the neighbours are
    meaningless.

    When TIER_EMBEDDINGS is on, that means each tier's OWN fine-tuned trunk —
    which is the whole point: a tier's embedding space is shaped by its
    training data, so a skewed tier genuinely retrieves different (and less
    similar) neighbours. The previous behaviour embedded every tier with the
    generic in21k backbone, giving all three tiers one shared space that never
    saw the training data, so the bias shield could not change the neighbours.

    Falls back to the generic backbone when TIER_EMBEDDINGS is off, matching
    the legacy .npz files.
    """
    key = variant if (TIER_EMBEDDINGS and variant) else "default"
    if key in _backbone_cache:
        return _backbone_cache[key]

    t0 = time.time()
    if key == "default":
        print(f"Loading ViT backbone for query embedding ({VIT_BACKBONE_NAME})...")
        processor = ViTImageProcessor.from_pretrained(VIT_BACKBONE_NAME)
        backbone = ViTModel.from_pretrained(VIT_BACKBONE_NAME)
    else:
        path = MODEL_DIR / variant
        print(f"Loading {variant} tier model for query embedding ({path})...")
        processor = AutoImageProcessor.from_pretrained(str(path))
        # .vit is the fine-tuned trunk; the classifier head is not wanted here.
        backbone = AutoModelForImageClassification.from_pretrained(str(path)).vit
    backbone.eval()
    print(f"  Loaded {key} encoder in {time.time() - t0:.1f}s")

    _backbone_cache[key] = (processor, backbone)
    return processor, backbone


def embed_query(image: Image.Image, variant: str | None = None) -> np.ndarray:
    """Embed a single image to a normalised 768-dim vector, in the same space
    as the corpus vectors for `variant`."""
    processor, backbone = load_backbone(variant)
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        out = backbone(**inputs)
    cls = out.last_hidden_state[0, 0, :].numpy().astype(np.float32)
    norm = float(np.linalg.norm(cls))
    # Match the same normalisation applied during precompute so dot product
    # equals cosine similarity in [-1, 1].
    return cls / max(norm, 1e-8)


# ────────────────────────────────────────────────────────────────────────────
# Per-checkpoint KNN helpers (Tile 3 — "what did the model think looked like
# your photo at epoch N?")
# ────────────────────────────────────────────────────────────────────────────

def _lru_touch(cache: dict, key):
    """Move an existing key to the most-recently-used end of an ordered dict."""
    cache[key] = cache.pop(key)
    return cache[key]


def _lru_evict(cache: dict, limit: int, label: str) -> None:
    """Drop least-recently-used entries until the cache is within `limit`."""
    while len(cache) > limit:
        oldest = next(iter(cache))
        del cache[oldest]
        print(f"  Evicted {label} {oldest} (cache limit {limit})")


def load_checkpoint_embeddings(variant: str, step: int) -> dict:
    """Load the corpus vectors a single checkpoint produced, LRU-cached.

    Raises FileNotFoundError naming the missing file — until the precompute job
    has run this is the normal case, and the endpoint turns it into a 503 whose
    body says exactly which file to generate.
    """
    key = f"{variant}:{step}"
    if key in _loaded_checkpoint_embeddings:
        return _lru_touch(_loaded_checkpoint_embeddings, key)

    path = CHECKPOINT_EMBEDDINGS_DIR / variant / f"step-{step}.npz"
    if not path.exists():
        raise FileNotFoundError(str(path))

    print(f"Loading checkpoint embeddings {key} from {path}...")
    t0 = time.time()
    data = np.load(path, allow_pickle=False)
    _loaded_checkpoint_embeddings[key] = {
        "embeddings": data["embeddings"],
        "paths": data["paths"],
    }
    print(f"  Loaded {key}: {data['embeddings'].shape} in {time.time() - t0:.1f}s")
    _lru_evict(_loaded_checkpoint_embeddings, CHECKPOINT_KNN_CACHE_SIZE, "checkpoint embeddings")
    return _loaded_checkpoint_embeddings[key]


def load_checkpoint_trunk(model_name: str, step: int) -> tuple:
    """Load the encoder half (model.vit) of one checkpoint, LRU-cached.

    Deliberately NOT reusing _loaded_checkpoints: that cache holds full
    classification models for the inference endpoint and is unbounded, whereas
    this one must stay bounded alongside the embedding matrices.
    """
    key = f"{model_name}:{step}"
    if key in _checkpoint_trunk_cache:
        return _lru_touch(_checkpoint_trunk_cache, key)

    variant = VARIANT_FOR_MODEL[model_name]
    path = CHECKPOINT_DIR / variant / f"checkpoint-{step}"
    if not path.exists():
        raise FileNotFoundError(f"Checkpoint not found: {path}")

    print(f"Loading checkpoint trunk {key} from {path}...")
    t0 = time.time()
    processor = AutoImageProcessor.from_pretrained(str(path))
    # .vit is the fine-tuned trunk; the classifier head would collapse the
    # image to 4 logits and destroy the detail k-NN needs.
    trunk = AutoModelForImageClassification.from_pretrained(str(path)).vit
    trunk.eval()
    print(f"  Loaded trunk {key} in {time.time() - t0:.1f}s")

    _checkpoint_trunk_cache[key] = (processor, trunk)
    _lru_evict(_checkpoint_trunk_cache, CHECKPOINT_KNN_CACHE_SIZE, "checkpoint trunk")
    return _checkpoint_trunk_cache[key]


def embed_query_at_checkpoint(image: Image.Image, model_name: str, step: int) -> np.ndarray:
    """Embed the query with checkpoint {step}'s OWN trunk.

    This must be the same checkpoint that produced the corpus vectors being
    searched. Embed with any other checkpoint and the dot product compares
    points in two unrelated spaces: the call still succeeds, the similarities
    still look like plausible numbers in [-1, 1], and every neighbour returned
    is meaningless. There is no runtime check that can catch this, so the
    pairing is enforced by the caller passing the same (model_name, step) to
    this function and to load_checkpoint_embeddings.
    """
    processor, trunk = load_checkpoint_trunk(model_name, step)
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        out = trunk(**inputs)
    cls = out.last_hidden_state[0, 0, :].numpy().astype(np.float32)
    norm = float(np.linalg.norm(cls))
    # Match the precompute normalisation so the dot product is cosine.
    return cls / max(norm, 1e-8)


def epoch_for_step(model_name: str, step: int) -> float | None:
    """Look up the training epoch a checkpoint corresponds to, if recorded."""
    for entry in list_checkpoints(model_name):
        if entry["step"] == step:
            return entry.get("epoch")
    return None


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
      class — OPTIONAL, one of the 4 class names. When given, restricts the
              search to that class's neighbours so the result reads as
              "examples of {predicted_class} the model learned from".

              When OMITTED, the search runs over the WHOLE corpus of the tier.
              This is what makes the bias story visible: the tiers differ in
              class COUNTS, not in the images themselves, so a class-restricted
              search returns byte-identical neighbours for balanced,
              unbalanced and uncleaned — toggling the bias-testing shield
              changes nothing on screen. Searching globally lets an
              over-represented majority class crowd the results in a skewed
              tier, which is the actual effect of the imbalance.
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

    # Absent 'class' means a global (all-class) search — see the docstring.
    # A present-but-invalid value is still an error rather than a silent
    # fallback to global, which would mask frontend typos.
    target_class = request.query_params.get("class")
    if target_class is not None and target_class not in CLASS_NAMES:
        return Response(
            content=f"'class' must be one of: {CLASS_NAMES} (or omitted for a global search)",
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
    query = embed_query(image, variant)
    sims = emb_data["embeddings"] @ query

    paths = emb_data["paths"]

    if target_class is None:
        # Global search: every training image in the tier competes, so a
        # majority class in a skewed tier crowds the neighbours on merit.
        masked = sims
        candidates = len(paths)
    else:
        # Restrict to the target class. Path entries start with "<class>/...".
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
        candidates = int(class_mask.sum())

    effective_k = min(k, candidates)
    top_idx = np.argpartition(masked, -effective_k)[-effective_k:]
    top_idx = top_idx[np.argsort(-masked[top_idx])]

    neighbours = []
    for idx in top_idx:
        relative_path = str(paths[idx])
        full_path = DATA_DIR / variant / relative_path
        thumb = thumbnail_b64(full_path) if full_path.exists() else None
        neighbours.append({
            "path": relative_path,
            # Which class this neighbour actually belongs to. In a global
            # search this is the point: it lets the frontend show that a
            # skewed tier answers "what does your image look like?" with
            # images from the over-represented class.
            "class": relative_path.split("/")[0] if "/" in relative_path else None,
            "similarity": round(float(sims[idx]), 4),
            "thumbnail": thumb,
        })

    # Class breakdown of the returned neighbours — the headline signal for the
    # bias tile, and cheap to compute here rather than in the client.
    breakdown: dict[str, int] = {}
    for n in neighbours:
        if n["class"]:
            breakdown[n["class"]] = breakdown.get(n["class"], 0) + 1

    return {
        "variant": variant,
        "class": target_class,
        "scope": "class" if target_class else "global",
        "k": effective_k,
        "mean_similarity": round(float(np.mean([n["similarity"] for n in neighbours])), 4),
        "class_breakdown": breakdown,
        "neighbours": neighbours,
    }


# ────────────────────────────────────────────────────────────────────────────
# Per-checkpoint KNN endpoint (Tile 3 — neighbours in each epoch's own space)
# ────────────────────────────────────────────────────────────────────────────

@app.post("/models/{model_name}/checkpoints/{step}/similar")
async def find_similar_at_checkpoint(model_name: str, step: int, request: Request):
    """Return the k training images nearest the query in checkpoint {step}'s space.

    Query parameters:
      k — optional (default 4), clamped to [1, 32].

    There is deliberately NO class filter, unlike /models/{name}/similar. The
    tile's question is "what did the model consider similar at this epoch?",
    and restricting to the predicted class would pre-answer it: the interesting
    signal is precisely that an early checkpoint retrieves a jumble of classes
    and a late one retrieves the right one.

    Similarity is cosine in [-1, 1], both sides pre-normalised, sorted
    descending. 'mean_similarity' lets the frontend chart how the model's
    confidence in its own geometry firms up across epochs.

    Returns 503 naming the missing .npz when the checkpoint has not been
    precomputed — the expected state until the cluster job has run.
    """
    if model_name not in MODELS:
        return Response(content=f"Unknown model: {model_name}", status_code=404)

    try:
        k = max(1, min(int(request.query_params.get("k", "4")), 32))
    except ValueError:
        return Response(content="'k' must be an integer", status_code=400)

    image, err = await read_image_body(request)
    if err is not None:
        return err

    variant = VARIANT_FOR_MODEL[model_name]

    # Existence of the checkpoint is checked before the embeddings so a step
    # that was never trained reports 404 (wrong request) rather than 503
    # (right request, data not generated yet) — the two mean different things
    # to the frontend, which retries only the latter.
    if not (CHECKPOINT_DIR / variant / f"checkpoint-{step}").exists():
        return Response(
            content=f"Checkpoint {step} not found for {model_name}",
            status_code=404,
        )

    # Everything below — embedding load, torch forward, numpy matmul, JPEG
    # thumbnailing — is synchronous CPU work. Running it directly in an
    # `async def` pins the event loop for the whole call, and the tile fires all
    # nine steps at once: measured, that burst drove /health from 0.005s idle to
    # 5.069s, i.e. one visitor opening a tile stalled classification for
    # everyone. Parallelism was also net negative (9 parallel 3.83s vs 9
    # sequential 3.61s) because the requests simply queued behind each other on
    # the loop. Offloading to the threadpool lets them genuinely overlap and
    # keeps the loop free to serve other endpoints.
    def _compute():
        return _checkpoint_similar_sync(model_name, variant, step, image, k)

    # Bounded, not unbounded. Torch already parallelises a forward pass across
    # cores, so letting all nine of the tile's requests run at once on a 4-core
    # box oversubscribes it: measured, unbounded threadpool took 7.10s for the
    # nine steps against 3.84s run one after another. Two at a time keeps the
    # cores busy without thrashing, while the event loop stays free either way.
    async with _CHECKPOINT_KNN_SEMAPHORE:
        try:
            return await run_in_threadpool(_compute)
        except FileNotFoundError as missing:
            if "embeddings" in str(missing).lower() or "npz" in str(missing).lower():
                return Response(
                    content=(
                        f"Checkpoint embeddings not precomputed: {missing}. "
                        "Run precompute_checkpoint_embeddings.py on the cluster and copy "
                        "the result into dataset_collection/embeddings_checkpoint/."
                    ),
                    status_code=503,
                )
            return Response(content=str(missing), status_code=404)


def _checkpoint_similar_sync(model_name: str, variant: str, step: int, image, k: int):
    """The blocking half of the checkpoint k-NN, run off the event loop.

    Kept as a plain function so the async endpoint above stays a thin wrapper
    and the CPU work is unambiguously threadpool-bound.
    """
    try:
        emb_data = load_checkpoint_embeddings(variant, step)
    except FileNotFoundError as missing:
        raise FileNotFoundError(f"embeddings {missing}") from missing

    # The query is embedded with the SAME checkpoint trunk that produced the
    # corpus vectors above. Mismatching them compares two unrelated spaces and
    # yields plausible-looking but meaningless neighbours — see
    # embed_query_at_checkpoint.
    query = embed_query_at_checkpoint(image, model_name, step)

    # Cosine similarity as one vectorised matmul over the whole corpus.
    sims = emb_data["embeddings"] @ query
    paths = emb_data["paths"]

    # argpartition is O(n) and avoids fully sorting thousands of candidates we
    # never rank.
    effective_k = min(k, len(paths))
    top_idx = np.argpartition(sims, -effective_k)[-effective_k:]
    top_idx = top_idx[np.argsort(-sims[top_idx])]

    neighbours = []
    for idx in top_idx:
        relative_path = str(paths[idx])
        full_path = DATA_DIR / variant / relative_path
        neighbours.append({
            "path": relative_path,
            "class": relative_path.split("/")[0] if "/" in relative_path else None,
            "similarity": round(float(sims[idx]), 4),
            "thumbnail": thumbnail_b64(full_path) if full_path.exists() else None,
        })

    return {
        "variant": variant,
        "step": step,
        "epoch": epoch_for_step(model_name, step),
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
    print(f"Ckpt kNN:    POST http://{args.host}:{args.port}/models/{{model_name}}/checkpoints/{{step}}/similar?k=4")

    uvicorn.run(app, host=args.host, port=args.port)
