#!/usr/bin/env python3
"""
Train TWO models to demonstrate AI Act bias testing impact:

1. UNBALANCED model: raw data, no class weights, no skin tone balancing
   → Represents what happens WITHOUT AI Act bias testing
   → Will perform worse on underrepresented skin tones

2. BALANCED model: balanced data, class weights, skin tone aware sampling
   → Represents what happens WITH AI Act bias testing
   → Should perform more evenly across skin tones

The accuracy gap between the two models IS the demo:
  - Toggle bias-testing ON  → use balanced model (fair across skin tones)
  - Toggle bias-testing OFF → use unbalanced model (biased, worse on dark skin)

Usage:
  python train_both_models.py
  python train_both_models.py --epochs 10
  python train_both_models.py --epochs 10 --push-to-hub --hub-org yourname

Requirements:
  uv pip install transformers[torch] datasets Pillow scikit-learn accelerate
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from collections import Counter

import numpy as np
from PIL import Image

DATA_DIR = Path(__file__).parent / "data"
BALANCED_DIR = Path(__file__).parent / "data_balanced"
OUTPUT_DIR = Path(__file__).parent / "model_output"
METRICS_FILE = Path(__file__).parent / "model_comparison.json"

CATEGORIES = ["real_tattoo", "sticker_tattoo", "pen_drawn"]


def estimate_skin_tone(img: Image.Image) -> str:
    arr = np.array(img)
    h, w = arr.shape[:2]
    bw = max(h // 6, 10)
    borders = np.concatenate([
        arr[:bw, :, :].reshape(-1, 3),
        arr[-bw:, :, :].reshape(-1, 3),
        arr[:, :bw, :].reshape(-1, 3),
        arr[:, -bw:, :].reshape(-1, 3),
    ], axis=0)
    brightness = borders.mean(axis=1)
    mask = (brightness > 40) & (brightness < 240)
    if mask.sum() < 50:
        return "unknown"
    avg = borders[mask].mean()
    if avg > 190: return "I-II"
    elif avg > 155: return "III"
    elif avg > 120: return "IV"
    elif avg > 85: return "V"
    else: return "VI"


def analyze_data_distribution(data_dir: Path) -> dict:
    """Analyze class and skin tone distribution of a dataset."""
    stats = {}
    for cat in CATEGORIES:
        cat_dir = data_dir / cat
        if not cat_dir.exists():
            stats[cat] = {"count": 0, "skin_tones": {}}
            continue

        tones = Counter()
        files = list(cat_dir.glob("*.png"))
        # Sample up to 200 for speed
        sample = files[:200] if len(files) > 200 else files
        for f in sample:
            try:
                img = Image.open(f).convert("RGB")
                tone = estimate_skin_tone(img)
                tones[tone] += 1
            except:
                pass

        total = sum(tones.values())
        stats[cat] = {
            "count": len(files),
            "skin_tones": {
                t: {"count": tones.get(t, 0),
                    "pct": round(tones.get(t, 0) / max(total, 1) * 100, 1)}
                for t in ["I-II", "III", "IV", "V", "VI"]
            }
        }
    return stats


def run_training(data_dir: str, output_dir: str, epochs: int,
                 use_class_weights: bool, model_name: str,
                 push_to_hub: bool = False, hub_model_id: str = None) -> dict:
    """Run train_classifier.py and return metrics."""
    cmd = [
        sys.executable,
        str(Path(__file__).parent / "train_classifier.py"),
        "--data-dir", data_dir,
        "--epochs", str(epochs),
        "--model-name", model_name,
    ]

    if not use_class_weights:
        cmd.append("--no-class-weights")

    if push_to_hub and hub_model_id:
        cmd.extend(["--push-to-hub", "--hub-model-id", hub_model_id])

    # Override output dir via env
    import os
    env = os.environ.copy()
    env["OUTPUT_DIR"] = output_dir

    print(f"\n{'='*60}")
    print(f"Training: {output_dir}")
    print(f"  Data: {data_dir}")
    print(f"  Class weights: {use_class_weights}")
    print(f"  Epochs: {epochs}")
    print(f"{'='*60}\n")

    result = subprocess.run(cmd, capture_output=False, text=True, env=env)

    # Read training metadata if it exists
    meta_path = Path(output_dir) / "training_metadata.json"
    if meta_path.exists():
        with open(meta_path) as f:
            return json.load(f)
    return {}


def main():
    parser = argparse.ArgumentParser(description="Train balanced + unbalanced models for demo")
    parser.add_argument("--model-name", default="google/vit-base-patch16-224-in21k")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--target", type=int, default=300,
                        help="Target images per class for balanced dataset")
    parser.add_argument("--push-to-hub", action="store_true")
    parser.add_argument("--hub-org", default=None,
                        help="HF Hub org (creates org/tattoo-classifier-balanced and org/tattoo-classifier-unbalanced)")
    parser.add_argument("--skip-balance", action="store_true",
                        help="Skip balance step (use existing data_balanced)")
    args = parser.parse_args()

    unbalanced_output = str(OUTPUT_DIR / "unbalanced")
    balanced_output = str(OUTPUT_DIR / "balanced")

    # Step 1: Create balanced dataset
    if not args.skip_balance:
        print("\n" + "="*60)
        print("STEP 1: Creating balanced dataset")
        print("="*60)
        subprocess.run([
            sys.executable,
            str(Path(__file__).parent / "balance_dataset.py"),
            "--create", "--target", str(args.target),
        ])

    # Step 2: Analyze both datasets
    print("\n" + "="*60)
    print("STEP 2: Dataset analysis")
    print("="*60)

    raw_stats = analyze_data_distribution(DATA_DIR)
    balanced_stats = analyze_data_distribution(BALANCED_DIR)

    print("\nRAW dataset (unbalanced):")
    for cat, info in raw_stats.items():
        print(f"  {cat}: {info['count']} images")
        for tone, data in info.get("skin_tones", {}).items():
            print(f"    {tone}: {data['count']} ({data['pct']}%)")

    print("\nBALANCED dataset:")
    for cat, info in balanced_stats.items():
        print(f"  {cat}: {info['count']} images")
        for tone, data in info.get("skin_tones", {}).items():
            print(f"    {tone}: {data['count']} ({data['pct']}%)")

    # Step 3: Train unbalanced model
    print("\n" + "="*60)
    print("STEP 3: Training UNBALANCED model (no bias mitigation)")
    print("="*60)

    hub_id_unbalanced = f"{args.hub_org}/tattoo-classifier-unbalanced" if args.hub_org else None
    unbalanced_metrics = run_training(
        data_dir=str(DATA_DIR),
        output_dir=unbalanced_output,
        epochs=args.epochs,
        use_class_weights=False,
        model_name=args.model_name,
        push_to_hub=args.push_to_hub,
        hub_model_id=hub_id_unbalanced,
    )

    # Step 4: Train balanced model
    print("\n" + "="*60)
    print("STEP 4: Training BALANCED model (with bias mitigation)")
    print("="*60)

    hub_id_balanced = f"{args.hub_org}/tattoo-classifier-balanced" if args.hub_org else None
    balanced_metrics = run_training(
        data_dir=str(BALANCED_DIR),
        output_dir=balanced_output,
        epochs=args.epochs,
        use_class_weights=True,
        model_name=args.model_name,
        push_to_hub=args.push_to_hub,
        hub_model_id=hub_id_balanced,
    )

    # Step 5: Compare
    comparison = {
        "description": "Two models trained to demonstrate AI Act bias testing impact",
        "unbalanced": {
            "model_dir": unbalanced_output,
            "hub_model_id": hub_id_unbalanced,
            "data": "Raw unbalanced data, no class weights",
            "data_stats": raw_stats,
            "metrics": unbalanced_metrics.get("metrics", {}),
            "represents": "Model WITHOUT AI Act bias testing — biased toward overrepresented groups",
        },
        "balanced": {
            "model_dir": balanced_output,
            "hub_model_id": hub_id_balanced,
            "data": "Balanced data with class weights and skin-tone-aware sampling",
            "data_stats": balanced_stats,
            "metrics": balanced_metrics.get("metrics", {}),
            "represents": "Model WITH AI Act bias testing — fair performance across groups",
        },
        "expected_demo_effect": {
            "bias_testing_ON": "Uses balanced model. Similar accuracy across skin tones.",
            "bias_testing_OFF": "Uses unbalanced model. Accuracy drops on Type V-VI skin tones.",
            "visible_difference": "User sees real accuracy gap when toggling bias protection off.",
        },
        "app_integration": {
            "config_file": "src/config/huggingface.ts",
            "toggle_key": "bias-testing",
            "balanced_model_id": hub_id_balanced or "local:model_output/balanced",
            "unbalanced_model_id": hub_id_unbalanced or "local:model_output/unbalanced",
        },
    }

    with open(METRICS_FILE, "w") as f:
        json.dump(comparison, f, indent=2, default=str)

    print(f"\n{'='*60}")
    print("MODEL COMPARISON")
    print(f"{'='*60}")
    print(f"\n  Comparison saved to: {METRICS_FILE}")

    ub_acc = unbalanced_metrics.get("metrics", {}).get("eval_accuracy", "N/A")
    b_acc = balanced_metrics.get("metrics", {}).get("eval_accuracy", "N/A")
    print(f"\n  Unbalanced model accuracy: {ub_acc}")
    print(f"  Balanced model accuracy:   {b_acc}")

    ub_dark = unbalanced_metrics.get("metrics", {}).get("eval_acc_dark", "N/A")
    b_dark = balanced_metrics.get("metrics", {}).get("eval_acc_dark", "N/A")
    if ub_dark != "N/A" and b_dark != "N/A":
        print(f"\n  On dark skin tones (V-VI):")
        print(f"    Unbalanced: {ub_dark}")
        print(f"    Balanced:   {b_dark}")
        print(f"    Gap: {abs(float(b_dark) - float(ub_dark))*100:.1f}pp improvement with bias testing")

    print(f"\n  To use in the app, update src/config/huggingface.ts:")
    print(f"    BALANCED_MODEL_ID: '{hub_id_balanced or 'model_output/balanced'}'")
    print(f"    UNBALANCED_MODEL_ID: '{hub_id_unbalanced or 'model_output/unbalanced'}'")


if __name__ == "__main__":
    main()
