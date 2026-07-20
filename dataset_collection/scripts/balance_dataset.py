#!/usr/bin/env python3
"""
Create a balanced training dataset from collected images.

Handles two imbalances:
  1. Class imbalance: real_tattoo >> sticker_tattoo > pen_drawn
  2. Skin tone imbalance: Type IV dominates, Type I-II and VI are rare

Strategy:
  - Subsample real_tattoo to target size, preserving skin tone diversity
  - Augment sticker_tattoo and pen_drawn if below target
  - Prioritize keeping rare skin tones (I-II, VI) in all categories
  - Output a balanced training folder ready for train_classifier.py

Usage:
  python balance_dataset.py                    # report only
  python balance_dataset.py --create           # create balanced dataset
  python balance_dataset.py --create --target 200  # target per class
"""

import argparse
import random
import shutil
from pathlib import Path
from collections import Counter, defaultdict

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

DATA_DIR = Path(__file__).parent / "data"
BALANCED_DIR = Path(__file__).parent / "data_balanced"

CATEGORIES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]


def estimate_skin_tone(img: Image.Image) -> str:
    """Estimate Fitzpatrick type from border pixel brightness."""
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


def augment_image(img: Image.Image, aug_type: int) -> Image.Image:
    """Apply augmentation to create a new training variant."""
    if aug_type == 0:
        return img.transpose(Image.FLIP_LEFT_RIGHT)
    elif aug_type == 1:
        return img.rotate(random.choice([90, 180, 270]))
    elif aug_type == 2:
        enhancer = ImageEnhance.Brightness(img)
        return enhancer.enhance(random.uniform(0.7, 1.3))
    elif aug_type == 3:
        enhancer = ImageEnhance.Contrast(img)
        return enhancer.enhance(random.uniform(0.7, 1.3))
    elif aug_type == 4:
        enhancer = ImageEnhance.Color(img)
        return enhancer.enhance(random.uniform(0.7, 1.3))
    elif aug_type == 5:
        return img.filter(ImageFilter.GaussianBlur(radius=1))
    elif aug_type == 6:
        # Small random crop and resize back
        w, h = img.size
        margin = int(min(w, h) * 0.1)
        left = random.randint(0, margin)
        top = random.randint(0, margin)
        right = w - random.randint(0, margin)
        bottom = h - random.randint(0, margin)
        return img.crop((left, top, right, bottom)).resize((w, h), Image.LANCZOS)
    else:
        return img.transpose(Image.FLIP_LEFT_RIGHT)


def analyze_category(cat_dir: Path) -> dict:
    """Analyze images in a category, return {filename: skin_tone}."""
    result = {}
    for f in sorted(cat_dir.glob("*.png")):
        try:
            img = Image.open(f).convert("RGB")
            tone = estimate_skin_tone(img)
            result[f.name] = tone
        except Exception:
            pass
    return result


def skin_tone_aware_subsample(
    files_with_tones: dict,
    target: int,
    tone_targets: dict | None = None,
) -> list[str]:
    """
    Subsample files while preserving skin tone diversity.
    Keeps ALL rare skin tone images, then fills from overrepresented tones.
    """
    # Group by tone
    by_tone = defaultdict(list)
    for fname, tone in files_with_tones.items():
        by_tone[tone].append(fname)

    total = len(files_with_tones)
    if total <= target:
        return list(files_with_tones.keys())

    # Default tone targets (% of target)
    if tone_targets is None:
        tone_targets = {
            "I-II": 0.15,   # boost rare light
            "III": 0.20,
            "IV": 0.30,    # reduce dominant
            "V": 0.20,
            "VI": 0.10,    # boost rare dark
            "unknown": 0.05,
        }

    selected = []

    # First pass: for each tone, select min(available, target_count)
    for tone, target_pct in tone_targets.items():
        tone_target = max(1, int(target * target_pct))
        available = by_tone.get(tone, [])

        if len(available) <= tone_target:
            # Keep all of this tone (it's rare)
            selected.extend(available)
        else:
            # Random subsample
            selected.extend(random.sample(available, tone_target))

    # Fill remaining slots from most available tone
    remaining = target - len(selected)
    if remaining > 0:
        selected_set = set(selected)
        all_remaining = [f for f in files_with_tones if f not in selected_set]
        random.shuffle(all_remaining)
        selected.extend(all_remaining[:remaining])

    # Trim if over target
    if len(selected) > target:
        # Keep all rare tones, trim from overrepresented
        rare_tones = {"I-II", "VI", "unknown"}
        rare = [f for f in selected if files_with_tones[f] in rare_tones]
        common = [f for f in selected if files_with_tones[f] not in rare_tones]
        random.shuffle(common)
        selected = rare + common[:target - len(rare)]

    return selected[:target]


def main():
    parser = argparse.ArgumentParser(description="Balance the training dataset")
    parser.add_argument("--create", action="store_true",
                        help="Create the balanced dataset (otherwise report only)")
    parser.add_argument("--target", type=int, default=0,
                        help="Target images per class (0 = auto-detect from smallest class)")
    parser.add_argument("--augment-to", type=int, default=0,
                        help="Augment small classes up to this count (0 = same as target)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    # Analyze all categories
    print("Analyzing dataset...\n")
    cat_data = {}
    for cat in CATEGORIES:
        cat_dir = DATA_DIR / cat
        if not cat_dir.exists():
            print(f"  {cat}: directory not found")
            cat_data[cat] = {}
            continue

        tones = analyze_category(cat_dir)
        cat_data[cat] = tones
        print(f"  {cat}: {len(tones)} images")

        tone_counts = Counter(tones.values())
        for tone in ["I-II", "III", "IV", "V", "VI", "unknown"]:
            count = tone_counts.get(tone, 0)
            pct = (count / max(len(tones), 1)) * 100
            print(f"    {tone}: {count} ({pct:.1f}%)")

    # Determine target
    sizes = [len(d) for d in cat_data.values() if len(d) > 0]
    if not sizes:
        print("\nNo data found!")
        return

    min_size = min(sizes)
    max_size = max(sizes)

    if args.target > 0:
        target = args.target
    else:
        # Auto: use the median class size, at least 100
        target = max(100, min_size)

    augment_to = args.augment_to if args.augment_to > 0 else target

    print(f"\n{'='*60}")
    print(f"BALANCING PLAN")
    print(f"{'='*60}")
    print(f"  Target per class: {target}")
    print(f"  Augment small classes to: {augment_to}")
    print(f"\n  Actions:")

    for cat in CATEGORIES:
        count = len(cat_data[cat])
        if count > target:
            print(f"    {cat}: SUBSAMPLE {count} → {target} (skin-tone-aware)")
        elif count < augment_to:
            aug_needed = augment_to - count
            print(f"    {cat}: AUGMENT {count} + {aug_needed} augmented → {augment_to}")
        else:
            print(f"    {cat}: KEEP ALL {count}")

    # Show projected skin tone distribution
    print(f"\n  Projected skin tone distribution after balancing:")
    for cat in CATEGORIES:
        if len(cat_data[cat]) > target:
            selected = skin_tone_aware_subsample(cat_data[cat], target)
            tone_counts = Counter(cat_data[cat][f] for f in selected)
        else:
            tone_counts = Counter(cat_data[cat].values())

        total = sum(tone_counts.values())
        print(f"\n    {cat} ({total} images):")
        for tone in ["I-II", "III", "IV", "V", "VI", "unknown"]:
            count = tone_counts.get(tone, 0)
            pct = (count / max(total, 1)) * 100
            bar = "█" * int(pct / 2)
            print(f"      {tone:>5}: {count:4d} ({pct:5.1f}%) {bar}")

    if not args.create:
        print(f"\n  Run with --create to build the balanced dataset.")
        return

    # Create balanced dataset
    print(f"\n{'='*60}")
    print(f"CREATING BALANCED DATASET")
    print(f"{'='*60}")

    if BALANCED_DIR.exists():
        shutil.rmtree(BALANCED_DIR)

    for cat in CATEGORIES:
        out_dir = BALANCED_DIR / cat
        out_dir.mkdir(parents=True, exist_ok=True)

        cat_dir = DATA_DIR / cat
        count = len(cat_data[cat])

        if count == 0:
            print(f"\n  {cat}: SKIPPED (no images)")
            continue

        # Select images
        if count > target:
            selected = skin_tone_aware_subsample(cat_data[cat], target)
        else:
            selected = list(cat_data[cat].keys())

        # Copy selected originals
        copied = 0
        for fname in selected:
            src = cat_dir / fname
            if src.exists():
                shutil.copy2(str(src), str(out_dir / fname))
                copied += 1

        print(f"\n  {cat}: copied {copied} originals")

        # Augment if needed
        if copied < augment_to:
            aug_needed = augment_to - copied
            aug_count = 0
            source_files = list(selected)

            while aug_count < aug_needed:
                # Pick a random source image
                src_fname = random.choice(source_files)
                src_path = cat_dir / src_fname

                try:
                    img = Image.open(src_path).convert("RGB")
                    aug_type = aug_count % 7  # cycle through augmentation types
                    aug_img = augment_image(img, aug_type)

                    aug_fname = f"{cat}_aug_{aug_count:04d}.png"
                    aug_img.save(out_dir / aug_fname, "PNG")
                    aug_count += 1
                except Exception:
                    continue

            print(f"  {cat}: added {aug_count} augmented images")

        final_count = len(list(out_dir.glob("*.png")))
        print(f"  {cat}: TOTAL = {final_count}")

    # Final summary
    print(f"\n{'='*60}")
    print(f"BALANCED DATASET CREATED")
    print(f"{'='*60}")
    print(f"  Location: {BALANCED_DIR}")
    for cat in CATEGORIES:
        out_dir = BALANCED_DIR / cat
        count = len(list(out_dir.glob("*.png"))) if out_dir.exists() else 0
        print(f"  {cat}: {count} images")

    print(f"\n  To train:")
    print(f"    python train_classifier.py --data-dir {BALANCED_DIR}")


if __name__ == "__main__":
    main()
