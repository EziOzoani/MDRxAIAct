#!/usr/bin/env python3
"""Local inference server for 3 tattoo classification models.

Serves balanced, unbalanced, and uncleaned ViT-base models via FastAPI.
Designed to run on GCP VM (CPU-only) as a drop-in replacement for HF Inference API.

Usage:
    python serve_models.py              # starts on port 8000
    python serve_models.py --port 8080  # custom port

API matches HuggingFace Inference API format:
    POST /models/{model_name}  (body: image binary)
    Returns: [{"label": "LABEL_0", "score": 0.95}, ...]
"""

import argparse
import io
import time
from pathlib import Path

import torch
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import ViTForImageClassification, ViTImageProcessor

MODEL_DIR = Path(__file__).parent / "model_output"

# Model name mapping — the app will use these as model IDs
MODELS = {
    "tattoo-balanced": MODEL_DIR / "balanced",
    "tattoo-unbalanced": MODEL_DIR / "unbalanced",
    "tattoo-uncleaned": MODEL_DIR / "uncleaned",
}

CLASS_NAMES = ["real_tattoo", "sticker_tattoo", "pen_drawn"]

app = FastAPI(title="Tattoo Classification API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Lazy-loaded models and processors
_loaded_models: dict[str, tuple] = {}


def load_model(name: str):
    """Load a model + processor, cached after first load."""
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
    elapsed = time.time() - t0
    print(f"  Loaded {name} in {elapsed:.1f}s")

    _loaded_models[name] = (processor, model)
    return processor, model


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_available": list(MODELS.keys()),
        "models_loaded": list(_loaded_models.keys()),
    }


@app.post("/models/{model_name}")
async def classify(model_name: str, request: Request):
    """Classify an image. Matches HuggingFace Inference API response format."""
    if model_name not in MODELS:
        return Response(
            content=f"Unknown model: {model_name}. Available: {list(MODELS.keys())}",
            status_code=404,
        )

    # Read image from request body
    body = await request.body()
    if not body:
        return Response(content="No image data in request body", status_code=400)

    try:
        image = Image.open(io.BytesIO(body)).convert("RGB")
    except Exception as e:
        return Response(content=f"Invalid image: {e}", status_code=400)

    # Load model (cached after first call)
    processor, model = load_model(model_name)

    # Run inference
    t0 = time.time()
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    logits = outputs.logits[0]
    probs = torch.softmax(logits, dim=0)
    inference_ms = (time.time() - t0) * 1000

    # Build response in HF Inference API format
    results = []
    for i, score in enumerate(probs.tolist()):
        results.append({
            "label": f"LABEL_{i}",
            "score": round(score, 6),
        })

    # Sort by score descending (HF convention)
    results.sort(key=lambda x: x["score"], reverse=True)

    # Add metadata header
    return results


@app.get("/models/{model_name}")
def model_info(model_name: str):
    """Return model metadata."""
    if model_name not in MODELS:
        return Response(content=f"Unknown model: {model_name}", status_code=404)

    path = MODELS[model_name]
    metadata_file = path / "training_metadata.json"
    metadata = {}
    if metadata_file.exists():
        import json
        metadata = json.loads(metadata_file.read_text())

    return {
        "model_name": model_name,
        "path": str(path),
        "class_names": CLASS_NAMES,
        "loaded": model_name in _loaded_models,
        "training_metadata": metadata,
    }


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Serve tattoo classification models")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--preload", action="store_true", help="Load all models at startup")
    args = parser.parse_args()

    if args.preload:
        print("Preloading all models...")
        for name in MODELS:
            load_model(name)
        print("All models loaded.")

    print(f"\nStarting server on {args.host}:{args.port}")
    print(f"Models: {list(MODELS.keys())}")
    print(f"Health: http://{args.host}:{args.port}/health")
    print(f"API:    POST http://{args.host}:{args.port}/models/{{model_name}}")

    uvicorn.run(app, host=args.host, port=args.port)
