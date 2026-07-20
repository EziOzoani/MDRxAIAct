#!/usr/bin/env python3
"""
Train THREE models to demonstrate AI Act bias testing impact:

1. UNCLEANED model: raw + noisy data (includes not_tattoo_noisy), no class weights
   → Represents what happens WITHOUT transparency (worst quality data)
   → Worst bias, worst not_tattoo boundary

2. UNBALANCED model: cleaned data, no class weights, no skin tone balancing
   → Represents what happens WITHOUT AI Act bias testing
   → Will perform worse on underrepresented skin tones

3. BALANCED model: balanced data, class weights, skin tone aware sampling
   → Represents what happens WITH AI Act bias testing
   → Should perform more evenly across skin tones

The accuracy gap between the models IS the demo:
  - Toggle bias-testing ON  + transparency ON  → balanced model (fair)
  - Toggle bias-testing OFF + transparency ON  → unbalanced model (biased)
  - Toggle transparency OFF                   → uncleaned model (worst)

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
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
from PIL import Image

BASE_DIR = Path(__file__).resolve().parent.parent  # dataset_collection/
DATA_DIR = BASE_DIR / "data" / "unbalanced"         # cleaned but unbalanced data
BALANCED_DIR = BASE_DIR / "data" / "balanced"        # balanced data
UNCLEANED_DIR_EXISTING = BASE_DIR / "data" / "uncleaned"  # pre-existing uncleaned data
OUTPUT_DIR = BASE_DIR / "models"
METRICS_FILE = BASE_DIR / "model_comparison.json"

CATEGORIES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]


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


def prepare_uncleaned_data(data_dir: Path) -> Path:
    """
    Create an uncleaned dataset directory that merges raw data with noisy not_tattoo images.
    For the 3 tattoo classes, uses existing raw data as-is.
    For not_tattoo, merges clean + noisy images into one folder.
    """
    uncleaned_dir = data_dir.parent / "data_uncleaned"
    import shutil

    if uncleaned_dir.exists():
        shutil.rmtree(uncleaned_dir)

    for cat in CATEGORIES:
        out_dir = uncleaned_dir / cat
        out_dir.mkdir(parents=True, exist_ok=True)

        # Copy original data
        src_dir = data_dir / cat
        if src_dir.exists():
            for f in src_dir.glob("*.png"):
                shutil.copy2(str(f), str(out_dir / f.name))

        # For not_tattoo, also include the noisy/borderline images
        if cat == "not_tattoo":
            noisy_dir = data_dir / "not_tattoo_noisy"
            if noisy_dir.exists():
                for f in noisy_dir.glob("*.png"):
                    shutil.copy2(str(f), str(out_dir / f.name))

    # Also copy any _rejected images back in for all classes (they were cleaned out)
    for cat in CATEGORIES:
        rejected_dir = data_dir / cat / "_rejected"
        if rejected_dir.exists():
            out_dir = uncleaned_dir / cat
            for f in rejected_dir.glob("*.png"):
                shutil.copy2(str(f), str(out_dir / f.name))

    return uncleaned_dir


def main():
    parser = argparse.ArgumentParser(description="Train balanced + unbalanced + uncleaned models for demo")
    parser.add_argument("--model-name", default="google/vit-base-patch16-224-in21k")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--target", type=int, default=300,
                        help="Target images per class for balanced dataset")
    parser.add_argument("--push-to-hub", action="store_true")
    parser.add_argument("--hub-org", default=None,
                        help="HF Hub org (creates org/tattoo-classifier-{balanced,unbalanced,uncleaned})")
    parser.add_argument("--skip-balance", action="store_true",
                        help="Skip balance step (use existing data_balanced)")
    args = parser.parse_args()

    unbalanced_output = str(OUTPUT_DIR / "unbalanced")
    balanced_output = str(OUTPUT_DIR / "balanced")
    uncleaned_output = str(OUTPUT_DIR / "uncleaned")

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

    # Step 2: Use existing uncleaned dataset
    uncleaned_dir = UNCLEANED_DIR_EXISTING
    print("\n" + "="*60)
    print("STEP 2: Using uncleaned dataset")
    print("="*60)
    print(f"  Uncleaned dataset at: {uncleaned_dir}")
    for cat in CATEGORIES:
        cat_dir = uncleaned_dir / cat
        count = len(list(cat_dir.glob("*.png"))) if cat_dir.exists() else 0
        print(f"    {cat}: {count} images")

    # Step 3: Analyze all datasets
    print("\n" + "="*60)
    print("STEP 3: Dataset analysis")
    print("="*60)

    raw_stats = analyze_data_distribution(DATA_DIR)
    balanced_stats = analyze_data_distribution(BALANCED_DIR)
    uncleaned_stats = analyze_data_distribution(uncleaned_dir)

    print("\nRAW dataset (unbalanced):")
    for cat, info in raw_stats.items():
        print(f"  {cat}: {info['count']} images")

    print("\nBALANCED dataset:")
    for cat, info in balanced_stats.items():
        print(f"  {cat}: {info['count']} images")

    print("\nUNCLEANED dataset:")
    for cat, info in uncleaned_stats.items():
        print(f"  {cat}: {info['count']} images")

    # Step 4: Train all 3 models IN PARALLEL
    print("\n" + "="*60)
    print("STEP 4: Training ALL 3 models in PARALLEL")
    print("="*60)

    hub_id_uncleaned = f"{args.hub_org}/tattoo-classifier-uncleaned" if args.hub_org else None
    hub_id_unbalanced = f"{args.hub_org}/tattoo-classifier-unbalanced" if args.hub_org else None
    hub_id_balanced = f"{args.hub_org}/tattoo-classifier-balanced" if args.hub_org else None

    training_jobs = [
        ("uncleaned", str(uncleaned_dir), uncleaned_output, False, hub_id_uncleaned),
        ("unbalanced", str(DATA_DIR), unbalanced_output, False, hub_id_unbalanced),
        ("balanced", str(BALANCED_DIR), balanced_output, True, hub_id_balanced),
    ]

    results = {}
    with ProcessPoolExecutor(max_workers=3) as executor:
        futures = {}
        for name, data_dir_str, output_dir_str, use_weights, hub_id in training_jobs:
            future = executor.submit(
                run_training,
                data_dir=data_dir_str,
                output_dir=output_dir_str,
                epochs=args.epochs,
                use_class_weights=use_weights,
                model_name=args.model_name,
                push_to_hub=args.push_to_hub,
                hub_model_id=hub_id,
            )
            futures[future] = name
            print(f"  Launched: {name} model training")

        for future in as_completed(futures):
            name = futures[future]
            try:
                results[name] = future.result()
                print(f"  Completed: {name} model")
            except Exception as e:
                print(f"  FAILED: {name} model — {e}")
                results[name] = {}

    uncleaned_metrics = results.get("uncleaned", {})
    unbalanced_metrics = results.get("unbalanced", {})
    balanced_metrics = results.get("balanced", {})

    # Step 7: Compare
    comparison = {
        "description": "Three models trained to demonstrate AI Act impact (4-class: real_tattoo, sticker_tattoo, pen_drawn, not_tattoo)",
        "uncleaned": {
            "model_dir": uncleaned_output,
            "hub_model_id": hub_id_uncleaned,
            "data": "Raw + noisy + rejected data, includes ambiguous not_tattoo, no class weights",
            "data_stats": uncleaned_stats,
            "metrics": uncleaned_metrics.get("metrics", {}),
            "represents": "Model WITHOUT transparency — trained on noisy data with no documentation",
        },
        "unbalanced": {
            "model_dir": unbalanced_output,
            "hub_model_id": hub_id_unbalanced,
            "data": "Cleaned data, no class weights, no skin tone balancing",
            "data_stats": raw_stats,
            "metrics": unbalanced_metrics.get("metrics", {}),
            "represents": "Model WITHOUT bias testing — biased toward overrepresented groups",
        },
        "balanced": {
            "model_dir": balanced_output,
            "hub_model_id": hub_id_balanced,
            "data": "Balanced data with class weights and skin-tone-aware sampling",
            "data_stats": balanced_stats,
            "metrics": balanced_metrics.get("metrics", {}),
            "represents": "Model WITH all AI Act protections — fair performance across groups",
        },
        "expected_demo_effect": {
            "all_protections_ON": "Uses balanced model. Similar accuracy across skin tones.",
            "bias_testing_OFF": "Uses unbalanced model. Accuracy drops on Type V-VI skin tones.",
            "transparency_OFF": "Uses uncleaned model. Worst bias + poor not_tattoo boundary.",
            "visible_difference": "User sees real accuracy gap when toggling protections off.",
        },
        "app_integration": {
            "config_file": "src/config/huggingface.ts",
            "balanced_model_id": hub_id_balanced or "local:model_output/balanced",
            "unbalanced_model_id": hub_id_unbalanced or "local:model_output/unbalanced",
            "uncleaned_model_id": hub_id_uncleaned or "local:model_output/uncleaned",
        },
    }

    with open(METRICS_FILE, "w") as f:
        json.dump(comparison, f, indent=2, default=str)

    print(f"\n{'='*60}")
    print("MODEL COMPARISON (3 TIERS)")
    print(f"{'='*60}")
    print(f"\n  Comparison saved to: {METRICS_FILE}")

    for tier_name, tier_metrics in [("Uncleaned", uncleaned_metrics), ("Unbalanced", unbalanced_metrics), ("Balanced", balanced_metrics)]:
        acc = tier_metrics.get("metrics", {}).get("eval_accuracy", "N/A")
        print(f"\n  {tier_name} model accuracy: {acc}")

    print(f"\n  Models saved directly to: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
