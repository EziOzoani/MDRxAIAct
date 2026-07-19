#!/usr/bin/env python3
"""
Collect bare skin images across all 6 Fitzpatrick skin types for the not_tattoo class.

Strategy:
1. Use SCIN dataset (google/scin) from HuggingFace — CC-BY 4.0, has dermatologist FST labels
2. Also copy 40 diverse non-skin images from existing balanced/not_tattoo/

Output: dataset_collection/data/not_tattoo_fitzpatrick/
  fst_1/ through fst_6/  — up to 60 skin images each
  diverse/               — 40 non-skin images (animals, food, flowers)
  collection_summary.json
"""

import json
import os
import random
import shutil
import sys
import time
from pathlib import Path

from PIL import Image

# ── Config ──
BASE_DIR = Path(__file__).resolve().parent.parent  # dataset_collection/
OUTPUT_DIR = BASE_DIR / "data" / "not_tattoo_fitzpatrick"
BALANCED_DIR = BASE_DIR / "data" / "balanced" / "not_tattoo"
TARGET_SIZE = 224
TARGET_PER_FST = 60


def process_and_save(img, save_path: Path) -> bool:
    """Center-crop to square and resize to TARGET_SIZE, save as PNG."""
    try:
        if not isinstance(img, Image.Image):
            return False
        img = img.convert("RGB")
        w, h = img.size
        if w < 50 or h < 50:
            return False
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
        img.save(save_path, "PNG")
        return True
    except Exception as e:
        return False


def parse_fst(label_str):
    """Parse FST label like 'FST2' or 'FST_II' to integer 1-6, or None."""
    if label_str is None:
        return None
    s = str(label_str).upper().strip()
    # Handle "FST1", "FST2", etc.
    for i in range(1, 7):
        if f"FST{i}" in s or f"FST_{i}" in s:
            return i
    # Handle roman numerals
    roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}
    for roman, num in sorted(roman_map.items(), key=lambda x: -len(x[0])):
        if roman in s:
            return num
    return None


def collect_from_scin(summary):
    """Collect skin images from SCIN dataset, grouped by Fitzpatrick type."""
    from datasets import load_dataset

    print("  Loading SCIN dataset in streaming mode...")
    ds = load_dataset("google/scin", split="train", streaming=True)

    counts = {i: 0 for i in range(1, 7)}
    errors = 0
    skipped_no_fst = 0
    total_seen = 0

    for sample in ds:
        total_seen += 1

        # Check if we have enough for all types
        if all(counts[k] >= TARGET_PER_FST for k in counts):
            print(f"  All FST types filled! Stopping after {total_seen} samples.")
            break

        if total_seen > 15000:  # Safety limit
            print(f"  Reached scan limit ({total_seen} samples)")
            break

        if total_seen % 500 == 0:
            print(f"    Scanned {total_seen} samples... counts: {counts}")

        # Get FST label — prefer dermatologist label, fall back to self-reported
        fst = None
        for col in ["dermatologist_fitzpatrick_skin_type_label_1",
                     "dermatologist_fitzpatrick_skin_type_label_2",
                     "dermatologist_fitzpatrick_skin_type_label_3",
                     "fitzpatrick_skin_type"]:
            val = sample.get(col)
            fst = parse_fst(val)
            if fst is not None:
                break

        if fst is None:
            skipped_no_fst += 1
            continue

        if counts[fst] >= TARGET_PER_FST:
            continue

        # Try each image slot
        for img_col in ["image_1_path", "image_2_path", "image_3_path"]:
            if counts[fst] >= TARGET_PER_FST:
                break

            img = sample.get(img_col)
            if img is None:
                continue

            fst_dir = OUTPUT_DIR / f"fst_{fst}"
            fst_dir.mkdir(parents=True, exist_ok=True)

            case_id = str(sample.get("case_id", total_seen))
            img_num = img_col.split("_")[1]  # "1", "2", or "3"
            fname = f"scin_{case_id}_{img_num}.png"
            # Sanitize filename
            fname = fname.replace("/", "_").replace(" ", "_")

            save_path = fst_dir / fname
            if save_path.exists():
                continue

            if process_and_save(img, save_path):
                counts[fst] += 1
            else:
                errors += 1

    print(f"\n  SCIN collection complete:")
    print(f"    Scanned: {total_seen} samples")
    print(f"    Skipped (no FST): {skipped_no_fst}")
    print(f"    Errors: {errors}")
    print(f"    Counts: {counts}")

    summary["scin_counts"] = counts
    summary["scin_errors"] = errors
    summary["scin_scanned"] = total_seen
    summary["scin_skipped_no_fst"] = skipped_no_fst
    summary["source"] = "scin"

    return counts


def copy_diverse_images(summary):
    """Copy 40 random non-skin images from balanced/not_tattoo/."""
    diverse_dir = OUTPUT_DIR / "diverse"
    diverse_dir.mkdir(parents=True, exist_ok=True)

    # Gather candidates: animal_, food_, flower_ prefixed files
    candidates = []
    for prefix in ["animal_", "food_", "flower_"]:
        candidates.extend(sorted(BALANCED_DIR.glob(f"{prefix}*.png")))

    if not candidates:
        print("  No diverse images found in balanced/not_tattoo/")
        summary["diverse_count"] = 0
        return

    random.seed(42)
    selected = random.sample(candidates, min(40, len(candidates)))

    copied = 0
    for src in selected:
        dst = diverse_dir / src.name
        try:
            shutil.copy2(src, dst)
            # Verify/enforce 224x224
            img = Image.open(dst)
            if img.size != (TARGET_SIZE, TARGET_SIZE):
                process_and_save(img, dst)
            copied += 1
        except Exception as e:
            print(f"    Error copying {src.name}: {e}")

    print(f"  Copied {copied} diverse images to {diverse_dir}")
    summary["diverse_count"] = copied
    summary["diverse_sources"] = {
        "animal": len([s for s in selected if s.name.startswith("animal_")]),
        "food": len([s for s in selected if s.name.startswith("food_")]),
        "flower": len([s for s in selected if s.name.startswith("flower_")]),
    }


def main():
    print("=" * 60)
    print("FITZPATRICK SKIN IMAGE COLLECTOR")
    print("=" * 60)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    summary = {
        "target_per_fst": TARGET_PER_FST,
        "target_total_skin": TARGET_PER_FST * 6,
        "target_diverse": 40,
        "issues": [],
    }

    # Step 1: Collect from SCIN
    print("\n--- Step 1: Collecting from SCIN dataset ---")
    try:
        counts = collect_from_scin(summary)
    except Exception as e:
        print(f"  SCIN failed: {e}")
        summary["issues"].append(f"SCIN failed: {e}")
        counts = {i: 0 for i in range(1, 7)}

    # Step 2: Copy diverse non-skin images
    print("\n--- Step 2: Copying diverse non-skin images ---")
    copy_diverse_images(summary)

    # Step 3: Final counts and summary
    print("\n--- Final Summary ---")
    final_counts = {}
    total_skin = 0
    for fst in range(1, 7):
        fst_dir = OUTPUT_DIR / f"fst_{fst}"
        count = len(list(fst_dir.glob("*.png"))) if fst_dir.exists() else 0
        final_counts[f"fst_{fst}"] = count
        total_skin += count
        status = "OK" if count >= TARGET_PER_FST else f"SHORT ({count}/{TARGET_PER_FST})"
        print(f"  FST {fst}: {count} images [{status}]")

    diverse_dir = OUTPUT_DIR / "diverse"
    diverse_count = len(list(diverse_dir.glob("*.png"))) if diverse_dir.exists() else 0
    print(f"  Diverse: {diverse_count} images")
    print(f"  Total: {total_skin + diverse_count} images")

    for fst in range(1, 7):
        if final_counts[f"fst_{fst}"] < TARGET_PER_FST:
            summary["issues"].append(
                f"FST {fst}: only {final_counts[f'fst_{fst}']}/{TARGET_PER_FST} images collected"
            )

    summary["final_counts"] = final_counts
    summary["total_skin_images"] = total_skin
    summary["total_diverse_images"] = diverse_count
    summary["total_images"] = total_skin + diverse_count

    # Write summary JSON
    summary_path = OUTPUT_DIR / "collection_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n  Summary written to {summary_path}")


if __name__ == "__main__":
    main()
