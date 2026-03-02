#!/usr/bin/env python3
"""
Filter obviously irrelevant images from sticker_tattoo and pen_drawn folders.

Heuristic approach:
  - Check for skin-tone pixels in the image (should have significant skin area)
  - Flag images with very low skin-pixel ratio
  - Flag very dark or very bright images (likely not photos of skin)

This does NOT replace manual review — it just removes the worst offenders.

Usage:
  python filter_noisy_images.py              # dry run (report only)
  python filter_noisy_images.py --delete     # move bad images to a _rejected subfolder
"""

import argparse
import shutil
from pathlib import Path
from collections import Counter

import numpy as np
from PIL import Image

DATA_DIR = Path(__file__).parent / "data"


def estimate_skin_ratio(img: Image.Image) -> float:
    """Estimate what fraction of pixels look like skin (any tone)."""
    arr = np.array(img).astype(float)
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]

    # Skin detection using RGB rules (works across skin tones)
    # Based on: Peer et al. (2003) and Kolkur et al. (2017)
    brightness = arr.mean(axis=2)

    # Rule 1: R > G > B for lighter skin
    rule1 = (r > g) & (g > b) & (r > 60) & (brightness > 50) & (brightness < 230)

    # Rule 2: Uniform mid-range for darker skin
    channel_spread = np.max(arr, axis=2) - np.min(arr, axis=2)
    rule2 = (brightness > 30) & (brightness < 180) & (channel_spread < 80) & (r > 30)

    # Rule 3: Warm tones (R dominant, not too saturated)
    rule3 = (r > g) & (r > b) & (r > 40) & (brightness > 40) & (brightness < 220)

    skin_mask = rule1 | rule2 | rule3
    return skin_mask.mean()


def has_strong_edges(img: Image.Image) -> float:
    """Check if image has edge density typical of photos (not flat graphics)."""
    arr = np.array(img).astype(float)
    gray = arr.mean(axis=2)
    dx = np.abs(np.diff(gray, axis=1))
    dy = np.abs(np.diff(gray, axis=0))
    return (dx.mean() + dy.mean()) / 2


def is_likely_irrelevant(img: Image.Image, fname: str) -> str | None:
    """Return reason string if image looks irrelevant, None if it might be OK."""
    arr = np.array(img).astype(float)

    # Very small images
    if arr.shape[0] < 50 or arr.shape[1] < 50:
        return "too_small"

    # Check skin ratio
    skin_ratio = estimate_skin_ratio(img)
    if skin_ratio < 0.08:
        return f"no_skin({skin_ratio:.2f})"

    # Check if image is mostly one solid color (graphic, not photo)
    overall_std = arr.std()
    if overall_std < 15:
        return f"flat_image(std={overall_std:.0f})"

    # Check if image is extremely bright (white background product shot)
    if arr.mean() > 230:
        return "overexposed"

    # Check if image is extremely dark
    if arr.mean() < 30:
        return "too_dark"

    return None


def main():
    parser = argparse.ArgumentParser(description="Filter noisy images")
    parser.add_argument("--delete", action="store_true",
                        help="Move flagged images to _rejected folder")
    parser.add_argument("--categories", nargs="+",
                        default=["sticker_tattoo", "pen_drawn"])
    args = parser.parse_args()

    for category in args.categories:
        cat_dir = DATA_DIR / category
        if not cat_dir.exists():
            print(f"  {category}: directory not found, skipping")
            continue

        reject_dir = cat_dir / "_rejected"
        files = sorted(cat_dir.glob("*.png"))

        print(f"\n{'='*60}")
        print(f"Filtering: {category} ({len(files)} images)")
        print(f"{'='*60}")

        flagged = []
        reasons = Counter()

        for f in files:
            try:
                img = Image.open(f).convert("RGB")
                reason = is_likely_irrelevant(img, f.name)
                if reason:
                    flagged.append((f, reason))
                    reasons[reason.split("(")[0]] += 1
            except Exception as e:
                flagged.append((f, f"error: {e}"))
                reasons["error"] += 1

        print(f"\n  Total images: {len(files)}")
        print(f"  Flagged for removal: {len(flagged)}")
        print(f"  Likely good: {len(files) - len(flagged)}")

        if reasons:
            print(f"\n  Reasons:")
            for reason, count in reasons.most_common():
                print(f"    {reason}: {count}")

        if flagged and args.delete:
            reject_dir.mkdir(exist_ok=True)
            for f, reason in flagged:
                shutil.move(str(f), str(reject_dir / f.name))
            print(f"\n  Moved {len(flagged)} images to {reject_dir}")
        elif flagged:
            print(f"\n  First 10 flagged:")
            for f, reason in flagged[:10]:
                print(f"    {f.name} -> {reason}")
            print(f"\n  Run with --delete to move these to _rejected/")

    # Final counts
    print(f"\n{'='*60}")
    print("FINAL COUNTS")
    print(f"{'='*60}")
    for category in args.categories:
        cat_dir = DATA_DIR / category
        count = len(list(cat_dir.glob("*.png"))) if cat_dir.exists() else 0
        print(f"  {category}: {count} images")


if __name__ == "__main__":
    main()
