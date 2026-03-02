#!/usr/bin/env python3
"""
Aggressive cleaning of sticker_tattoo and pen_drawn folders.

Uses multiple heuristics to detect images that are NOT tattoos/drawings on skin:
  1. Skin pixel ratio (must have significant skin area)
  2. Color distribution (skin has warm tones, not cold blues/greens)
  3. Texture analysis (photos of skin have specific texture patterns)
  4. Object detection heuristics (flat products, text-heavy, white backgrounds)

Usage:
  python deep_clean.py                    # dry run (report)
  python deep_clean.py --move             # move bad images to _rejected/
  python deep_clean.py --move --aggressive  # stricter filtering
"""

import argparse
import shutil
from pathlib import Path
from collections import Counter

import numpy as np
from PIL import Image

DATA_DIR = Path(__file__).parent / "data"


def analyze_image(img: Image.Image) -> dict:
    """Extract multiple features for classification."""
    arr = np.array(img).astype(float)
    h, w = arr.shape[:2]
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]

    # Overall stats
    brightness = arr.mean(axis=2)
    overall_mean = brightness.mean()
    overall_std = arr.std()

    # Skin detection: R > G > B with warmth
    warm = (r > g) & (r > b) & (r > 50) & (brightness > 40) & (brightness < 230)
    warm_ratio = warm.mean()

    # Medium tones (darker skin): lower spread, mid brightness
    mid = (brightness > 30) & (brightness < 180)
    channel_spread = np.max(arr, axis=2) - np.min(arr, axis=2)
    dark_skin = mid & (channel_spread < 80) & (r > 30)
    dark_skin_ratio = dark_skin.mean()

    skin_ratio = max(warm_ratio, dark_skin_ratio)

    # Color temperature: warm (red-dominant) vs cool (blue-dominant)
    warmth = r.mean() - b.mean()

    # Edge density (photos vs graphics)
    dx = np.abs(np.diff(brightness, axis=1))
    dy = np.abs(np.diff(brightness, axis=0))
    edge_density = (dx.mean() + dy.mean()) / 2

    # White ratio (product shots often have white backgrounds)
    white = (brightness > 230).mean()

    # Very dark ratio (not useful images)
    dark = (brightness < 20).mean()

    # Color saturation (skin has moderate saturation)
    max_ch = np.max(arr, axis=2)
    min_ch = np.min(arr, axis=2)
    saturation = np.where(max_ch > 0, (max_ch - min_ch) / max_ch, 0)
    mean_sat = saturation.mean()

    # Center vs border brightness difference (object on background)
    center = brightness[h//4:3*h//4, w//4:3*w//4]
    border_top = brightness[:h//6, :]
    border_bot = brightness[-h//6:, :]
    center_vs_border = abs(center.mean() - (border_top.mean() + border_bot.mean()) / 2)

    # Unique color count in a small sample (low = graphic, high = photo)
    small = np.array(img.resize((32, 32)))
    unique_colors = len(set(map(tuple, small.reshape(-1, 3).tolist())))

    return {
        "skin_ratio": skin_ratio,
        "warmth": warmth,
        "edge_density": edge_density,
        "white_ratio": white,
        "dark_ratio": dark,
        "overall_mean": overall_mean,
        "overall_std": overall_std,
        "mean_saturation": mean_sat,
        "center_vs_border": center_vs_border,
        "unique_colors": unique_colors,
    }


def is_likely_not_tattoo(features: dict, aggressive: bool = False) -> str | None:
    """Return reason if image is likely NOT a tattoo on skin."""
    f = features

    # Very low skin content
    skin_threshold = 0.15 if aggressive else 0.08
    if f["skin_ratio"] < skin_threshold:
        return f"no_skin({f['skin_ratio']:.2f})"

    # Product shots: bright white backgrounds
    if f["white_ratio"] > 0.4:
        return f"white_bg({f['white_ratio']:.2f})"

    # Very dark images (unusable)
    if f["overall_mean"] < 35:
        return "too_dark"

    # Very bright/washed out
    if f["overall_mean"] > 225:
        return "overexposed"

    # Flat graphics (low color diversity + low edges)
    if f["unique_colors"] < 100 and f["edge_density"] < 10:
        return f"flat_graphic(colors={f['unique_colors']})"

    # Cold images (blue/green dominant — not skin)
    if f["warmth"] < -15:
        return f"cold_tones({f['warmth']:.0f})"

    # Very low texture (solid colors, screenshots)
    if f["overall_std"] < 20:
        return f"low_texture(std={f['overall_std']:.0f})"

    if aggressive:
        # Stricter: require more skin
        if f["skin_ratio"] < 0.20:
            return f"low_skin({f['skin_ratio']:.2f})"

        # Stricter: require warm tones
        if f["warmth"] < 0:
            return f"not_warm({f['warmth']:.0f})"

        # Strong center-vs-border = likely object on plain background (product)
        if f["center_vs_border"] > 60 and f["white_ratio"] > 0.2:
            return f"product_shot"

    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--move", action="store_true", help="Move bad images to _rejected/")
    parser.add_argument("--aggressive", action="store_true", help="Stricter filtering")
    parser.add_argument("--categories", nargs="+", default=["sticker_tattoo", "pen_drawn"])
    args = parser.parse_args()

    total_flagged = 0
    total_kept = 0

    for category in args.categories:
        cat_dir = DATA_DIR / category
        if not cat_dir.exists():
            print(f"  {category}: not found")
            continue

        reject_dir = cat_dir / "_rejected"
        files = sorted(f for f in cat_dir.glob("*.png") if f.is_file())

        print(f"\n{'='*60}")
        print(f"Deep cleaning: {category} ({len(files)} images)")
        print(f"  Mode: {'AGGRESSIVE' if args.aggressive else 'STANDARD'}")
        print(f"{'='*60}")

        flagged = []
        kept = []
        reasons = Counter()

        for f in files:
            try:
                img = Image.open(f).convert("RGB")
                features = analyze_image(img)
                reason = is_likely_not_tattoo(features, aggressive=args.aggressive)
                if reason:
                    flagged.append((f, reason))
                    reasons[reason.split("(")[0]] += 1
                else:
                    kept.append(f)
            except Exception as e:
                flagged.append((f, f"error"))
                reasons["error"] += 1

        print(f"\n  Kept: {len(kept)}")
        print(f"  Flagged: {len(flagged)}")

        if reasons:
            print(f"\n  Rejection reasons:")
            for reason, count in reasons.most_common():
                print(f"    {reason}: {count}")

        if flagged and args.move:
            reject_dir.mkdir(exist_ok=True)
            for f, reason in flagged:
                shutil.move(str(f), str(reject_dir / f.name))
            print(f"\n  Moved {len(flagged)} images to {reject_dir}/")

        total_flagged += len(flagged)
        total_kept += len(kept)

    print(f"\n{'='*60}")
    print(f"SUMMARY: Kept {total_kept}, removed {total_flagged}")
    print(f"{'='*60}")
    for category in args.categories:
        cat_dir = DATA_DIR / category
        count = len(list(f for f in cat_dir.glob("*.png") if f.is_file())) if cat_dir.exists() else 0
        print(f"  {category}: {count} images remaining")


if __name__ == "__main__":
    main()
