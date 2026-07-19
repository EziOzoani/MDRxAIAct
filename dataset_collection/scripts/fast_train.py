#!/usr/bin/env python3
"""
Fast 4-class model training on CPU using feature extraction + logistic regression.

Instead of fine-tuning the full ViT model (slow on CPU), this script:
1. Loads pretrained ViT backbone ONCE
2. Extracts [CLS] features for all images (forward pass only, no gradients)
3. Trains sklearn LogisticRegression on features (seconds, not hours)
4. Injects the LR weights into the ViT classifier head
5. Saves complete ViT model with 4-class classifier

This produces proper ViT models compatible with HuggingFace inference pipeline.

Usage:
  python fast_train.py --variant balanced
  python fast_train.py --variant all
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.model_selection import train_test_split
from transformers import (
    AutoModelForImageClassification,
    AutoImageProcessor,
    ViTModel,
    ViTImageProcessor,
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

LABEL2ID = {"real_tattoo": 0, "sticker_tattoo": 1, "pen_drawn": 2, "not_tattoo": 3}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}

MODEL_NAME = "google/vit-base-patch16-224-in21k"


def load_images(data_dir: Path, max_per_class: int = 0):
    """Load images and labels from folder structure."""
    images = []
    labels = []
    for cat, label_id in LABEL2ID.items():
        cat_dir = data_dir / cat
        if not cat_dir.exists():
            print(f"  WARNING: {cat_dir} not found")
            continue
        files = sorted(cat_dir.glob("*.png"))
        if max_per_class > 0:
            files = files[:max_per_class]
        for f in files:
            try:
                img = Image.open(f).convert("RGB")
                images.append(img)
                labels.append(label_id)
            except Exception:
                pass
    return images, labels


def extract_features(model, processor, images, batch_size=32):
    """Extract [CLS] features from ViT backbone."""
    features = []
    model.eval()
    with torch.no_grad():
        for i in range(0, len(images), batch_size):
            batch = images[i:i + batch_size]
            inputs = processor(images=batch, return_tensors="pt")
            outputs = model(**inputs)
            # Get [CLS] token output (first token)
            cls_features = outputs.last_hidden_state[:, 0, :].numpy()
            features.append(cls_features)
            if (i // batch_size) % 10 == 0:
                print(f"    Batch {i // batch_size + 1}/{(len(images) + batch_size - 1) // batch_size}")
    return np.concatenate(features, axis=0)


def train_variant(variant: str, backbone_model, processor):
    """Train one model variant."""
    data_dir = DATA_DIR / variant
    output_dir = MODELS_DIR / variant

    print(f"\n{'='*60}")
    print(f"Training: {variant}")
    print(f"{'='*60}")

    # Load images
    print(f"  Loading images from {data_dir}...")
    images, labels = load_images(data_dir)
    labels = np.array(labels)

    class_counts = {}
    for cat, lid in LABEL2ID.items():
        count = (labels == lid).sum()
        class_counts[cat] = int(count)
        print(f"    {cat}: {count}")
    print(f"    Total: {len(images)}")

    if len(images) == 0:
        print("  ERROR: No images found!")
        return {}

    # Split
    X_train_imgs, X_val_imgs, y_train, y_val = train_test_split(
        images, labels, test_size=0.2, random_state=42, stratify=labels
    )
    print(f"  Train: {len(X_train_imgs)}, Val: {len(X_val_imgs)}")

    # Extract features
    print(f"  Extracting features...")
    t0 = time.time()
    X_train = extract_features(backbone_model, processor, X_train_imgs, batch_size=32)
    X_val = extract_features(backbone_model, processor, X_val_imgs, batch_size=32)
    feat_time = time.time() - t0
    print(f"  Features extracted in {feat_time:.1f}s (shape: {X_train.shape})")

    # Train logistic regression
    print(f"  Training classifier...")
    use_weights = (variant == "balanced")
    class_weight = "balanced" if use_weights else None

    clf = LogisticRegression(
        max_iter=1000,
        C=1.0,
        class_weight=class_weight,
        random_state=42,
        multi_class="multinomial",
    )
    clf.fit(X_train, y_train)

    # Evaluate
    y_pred = clf.predict(X_val)
    acc = accuracy_score(y_val, y_pred)
    f1 = f1_score(y_val, y_pred, average="weighted")

    print(f"\n  Accuracy: {acc:.4f}")
    print(f"  F1: {f1:.4f}")
    print(f"\n  Classification Report:")
    print(classification_report(y_val, y_pred, target_names=list(LABEL2ID.keys())))

    # Per-class accuracy
    per_class_acc = {}
    for cat, lid in LABEL2ID.items():
        mask = y_val == lid
        if mask.sum() > 0:
            per_class_acc[cat] = float(accuracy_score(y_val[mask], y_pred[mask]))

    # Create full ViT model with 4-class classifier
    print(f"  Creating 4-class ViT model...")
    full_model = AutoModelForImageClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(LABEL2ID),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
        ignore_mismatched_sizes=True,
    )

    # Inject logistic regression weights into the classifier head
    with torch.no_grad():
        full_model.classifier.weight.copy_(torch.tensor(clf.coef_, dtype=torch.float32))
        full_model.classifier.bias.copy_(torch.tensor(clf.intercept_, dtype=torch.float32))

    # Save
    output_dir.mkdir(parents=True, exist_ok=True)
    full_model.save_pretrained(str(output_dir))
    processor.save_pretrained(str(output_dir))

    # Save metadata
    metrics = {
        "eval_accuracy": float(acc),
        "eval_f1": float(f1),
    }
    for cat, pacc in per_class_acc.items():
        metrics[f"eval_acc_{cat}"] = pacc

    meta = {
        "data_dir": str(data_dir),
        "class_counts": class_counts,
        "class_weights": list(clf.coef_.shape) if use_weights else None,
        "imbalance_ratio": float(max(class_counts.values()) / max(min(class_counts.values()), 1)),
        "metrics": metrics,
        "training_method": "feature_extraction_logistic_regression",
        "feature_extraction_time_s": round(feat_time, 1),
        "args": {
            "model_name": MODEL_NAME,
            "data_dir": str(data_dir),
            "variant": variant,
            "class_weight": class_weight,
        },
    }
    with open(output_dir / "training_metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    print(f"  Model saved to {output_dir}")
    return meta


def main():
    parser = argparse.ArgumentParser(description="Fast 4-class model training")
    parser.add_argument("--variant", default="all",
                        choices=["balanced", "unbalanced", "uncleaned", "all"])
    args = parser.parse_args()

    # Load backbone ONCE (shared across all variants)
    print("Loading ViT backbone (this is the slow part, done once)...")
    t0 = time.time()
    processor = ViTImageProcessor.from_pretrained(MODEL_NAME)
    backbone = ViTModel.from_pretrained(MODEL_NAME)
    backbone.eval()
    load_time = time.time() - t0
    print(f"  Backbone loaded in {load_time:.1f}s")

    variants = ["balanced", "unbalanced", "uncleaned"] if args.variant == "all" else [args.variant]

    all_results = {}
    for variant in variants:
        result = train_variant(variant, backbone, processor)
        all_results[variant] = result

    # Save comparison
    comparison = {
        "description": "4-class models (real_tattoo, sticker_tattoo, pen_drawn, not_tattoo)",
        "training_method": "ViT feature extraction + LogisticRegression",
    }
    for variant, meta in all_results.items():
        comparison[variant] = {
            "metrics": meta.get("metrics", {}),
            "class_counts": meta.get("class_counts", {}),
        }

    comp_file = BASE_DIR / "model_comparison.json"
    with open(comp_file, "w") as f:
        json.dump(comparison, f, indent=2)

    print(f"\n{'='*60}")
    print("ALL MODELS TRAINED")
    print(f"{'='*60}")
    for variant, meta in all_results.items():
        acc = meta.get("metrics", {}).get("eval_accuracy", "N/A")
        print(f"  {variant}: accuracy={acc}")
    print(f"\n  Comparison saved to {comp_file}")


if __name__ == "__main__":
    main()
