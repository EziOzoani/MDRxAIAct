#!/usr/bin/env python3
"""Download the full tatvton-tattoo-raw dataset and analyze skin tone coverage."""

import os
import sys
from pathlib import Path
from io import BytesIO
from collections import Counter

from datasets import load_dataset
from PIL import Image
import numpy as np

DATA_DIR = Path(__file__).parent / "data"
REAL_DIR = DATA_DIR / "real_tattoo"
REAL_DIR.mkdir(parents=True, exist_ok=True)

TARGET_SIZE = 224


def get_skin_tone_category(img: Image.Image) -> str:
    """
    Rough skin tone estimation from image.
    Samples the border pixels (likely skin, not tattoo ink) and
    categorizes by average luminance into Fitzpatrick-like groups.
    """
    arr = np.array(img)
    h, w = arr.shape[:2]

    # Sample border regions (more likely to be skin than center which has tattoo)
    border_pixels = []
    border_width = max(h // 6, 10)
    # Top strip
    border_pixels.append(arr[:border_width, :, :].reshape(-1, 3))
    # Bottom strip
    border_pixels.append(arr[-border_width:, :, :].reshape(-1, 3))
    # Left strip
    border_pixels.append(arr[:, :border_width, :].reshape(-1, 3))
    # Right strip
    border_pixels.append(arr[:, -border_width:, :].reshape(-1, 3))

    all_border = np.concatenate(border_pixels, axis=0)

    # Filter out very dark (ink/black) and very bright (white/overexposed) pixels
    brightness = all_border.mean(axis=1)
    mask = (brightness > 40) & (brightness < 240)
    if mask.sum() < 50:
        return "unknown"

    skin_pixels = all_border[mask]
    avg_brightness = skin_pixels.mean()

    # Map to Fitzpatrick-like categories
    if avg_brightness > 190:
        return "type_I_II"     # Very light to light
    elif avg_brightness > 155:
        return "type_III"      # Medium light
    elif avg_brightness > 120:
        return "type_IV"       # Medium
    elif avg_brightness > 85:
        return "type_V"        # Medium dark
    else:
        return "type_VI"       # Dark


def main():
    # Count existing images
    existing = set(f.name for f in REAL_DIR.glob("tatvton_*.png"))
    print(f"Existing tatvton images: {len(existing)}")

    print("Loading dataset (streaming)...")
    ds = load_dataset("rlaope/tatvton-tattoo-raw", split="train", streaming=True)

    downloaded = 0
    skipped = 0
    skin_tones = Counter()
    errors = 0

    for i, example in enumerate(ds):
        fname = f"tatvton_{i:05d}.png"

        if fname in existing:
            # Still analyze skin tone of existing
            try:
                img = Image.open(REAL_DIR / fname).convert("RGB")
                tone = get_skin_tone_category(img)
                skin_tones[tone] += 1
            except:
                pass
            skipped += 1
            downloaded += 1  # count as part of total
            continue

        try:
            img = example["image"].convert("RGB")

            # Center crop and resize
            w, h = img.size
            side = min(w, h)
            left = (w - side) // 2
            top = (h - side) // 2
            img = img.crop((left, top, left + side, top + side))
            img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)

            # Analyze skin tone
            tone = get_skin_tone_category(img)
            skin_tones[tone] += 1

            # Save
            img.save(REAL_DIR / fname, "PNG")
            downloaded += 1

            if downloaded % 100 == 0:
                print(f"  Downloaded {downloaded} images... (skin tones so far: {dict(skin_tones)})")

        except Exception as e:
            errors += 1
            if errors < 5:
                print(f"  Error on image {i}: {e}")

    # Final stats
    total = downloaded
    print(f"\n{'='*60}")
    print(f"DOWNLOAD COMPLETE")
    print(f"{'='*60}")
    print(f"Total images: {total}")
    print(f"New downloads: {total - skipped}")
    print(f"Previously existing: {skipped}")
    print(f"Errors: {errors}")

    print(f"\n{'='*60}")
    print(f"SKIN TONE DISTRIBUTION (estimated from border pixels)")
    print(f"{'='*60}")
    for tone in ["type_I_II", "type_III", "type_IV", "type_V", "type_VI", "unknown"]:
        count = skin_tones.get(tone, 0)
        pct = (count / total * 100) if total > 0 else 0
        bar = "█" * int(pct / 2)
        label_map = {
            "type_I_II": "Fitzpatrick I-II  (very light/light)",
            "type_III":  "Fitzpatrick III   (medium light)    ",
            "type_IV":   "Fitzpatrick IV    (medium)          ",
            "type_V":    "Fitzpatrick V     (medium dark)     ",
            "type_VI":   "Fitzpatrick VI    (dark)            ",
            "unknown":   "Unknown/ambiguous                   ",
        }
        print(f"  {label_map[tone]}: {count:4d} ({pct:5.1f}%) {bar}")

    # Gap analysis
    print(f"\n{'='*60}")
    print(f"GAP ANALYSIS")
    print(f"{'='*60}")

    # Check sticker and pen-drawn dirs
    sticker_count = len(list((DATA_DIR / "sticker_tattoo").glob("*.png"))) if (DATA_DIR / "sticker_tattoo").exists() else 0
    pen_count = len(list((DATA_DIR / "pen_drawn").glob("*.png"))) if (DATA_DIR / "pen_drawn").exists() else 0

    print(f"  real_tattoo:    {total:4d} images {'✓ GOOD' if total >= 200 else '✗ NEED MORE'}")
    print(f"  sticker_tattoo: {sticker_count:4d} images {'✓ GOOD' if sticker_count >= 200 else '✗ NEED MORE — no public dataset exists'}")
    print(f"  pen_drawn:      {pen_count:4d} images {'✓ GOOD' if pen_count >= 200 else '✗ NEED MORE — no public dataset exists'}")

    dark_skin_pct = (skin_tones.get("type_V", 0) + skin_tones.get("type_VI", 0)) / max(total, 1) * 100
    print(f"\n  Dark skin coverage (type V+VI): {dark_skin_pct:.1f}%", "✓ GOOD" if dark_skin_pct >= 20 else "✗ NEED MORE dark skin images")

    print(f"\nRECOMMENDATIONS:")
    print(f"  1. Real tattoo images: {'Sufficient' if total >= 200 else 'Collect more'}")
    print(f"  2. Sticker/temporary tattoos: MUST collect manually (Pexels API or own photos)")
    print(f"  3. Pen/marker drawings: MUST collect manually (Pexels API or own photos)")
    if dark_skin_pct < 20:
        print(f"  4. Dark skin tones underrepresented — add targeted images")


if __name__ == "__main__":
    main()
