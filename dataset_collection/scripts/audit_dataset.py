#!/usr/bin/env python3
"""Audit the real_tattoo dataset for quality and skin tone coverage."""

from pathlib import Path
from collections import Counter
import numpy as np
from PIL import Image

DATA_DIR = Path(__file__).parent / "data" / "real_tattoo"


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


def detect_bad_image(img: Image.Image, filename: str) -> str | None:
    """Detect images that aren't real tattoo photos."""
    arr = np.array(img).astype(float)

    # Check for 3D renders / game screenshots: often have very uniform color gradients
    # and high saturation in unnatural ways
    r, g, b = arr[:,:,0], arr[:,:,1], arr[:,:,2]

    # Check for very high color variance (digital art / renders tend to have broader color range)
    color_std = np.std([r.std(), g.std(), b.std()])

    # Check if image has large uniform regions (typical of mockups, renders)
    # Use a simple edge detection approach
    gray = arr.mean(axis=2)
    dx = np.abs(np.diff(gray, axis=1))
    dy = np.abs(np.diff(gray, axis=0))
    edge_density = (dx.mean() + dy.mean()) / 2

    # Very low edge density = probably a flat graphic or solid background
    if edge_density < 5:
        return "flat_graphic"

    # Check for split images (mockups showing before/after side by side)
    left_half = gray[:, :gray.shape[1]//2]
    right_half = gray[:, gray.shape[1]//2:]
    halves_diff = abs(left_half.mean() - right_half.mean())
    if halves_diff > 50:
        return "split_comparison"

    # Check for very high blue/green saturation (common in game renders)
    if b.mean() > 140 and b.mean() > r.mean() * 1.3:
        return "possible_render"

    return None


def main():
    files = sorted(DATA_DIR.glob("tatvton_*.png"))
    print(f"Analyzing {len(files)} images...\n")

    skin_tones = Counter()
    bad_images = []
    brightness_values = []

    for f in files:
        img = Image.open(f).convert("RGB")
        tone = estimate_skin_tone(img)
        skin_tones[tone] += 1

        issue = detect_bad_image(img, f.name)
        if issue:
            bad_images.append((f.name, issue))

        arr = np.array(img)
        brightness_values.append(arr.mean())

    total = len(files)

    # Skin tone report
    print("=" * 60)
    print("SKIN TONE DISTRIBUTION (Fitzpatrick estimate)")
    print("=" * 60)
    labels = {
        "I-II": "Very light / Light     ",
        "III":  "Medium light           ",
        "IV":   "Medium (olive/tan)     ",
        "V":    "Medium dark / Brown    ",
        "VI":   "Dark / Very dark       ",
        "unknown": "Unknown / Ambiguous ",
    }
    for tone in ["I-II", "III", "IV", "V", "VI", "unknown"]:
        count = skin_tones.get(tone, 0)
        pct = (count / total * 100) if total > 0 else 0
        bar = "█" * int(pct / 2)
        print(f"  {labels[tone]}: {count:4d} ({pct:5.1f}%) {bar}")

    light = skin_tones.get("I-II", 0) + skin_tones.get("III", 0)
    medium = skin_tones.get("IV", 0)
    dark = skin_tones.get("V", 0) + skin_tones.get("VI", 0)
    unknown = skin_tones.get("unknown", 0)

    print(f"\n  Light (I-III):  {light:4d} ({light/total*100:.1f}%)")
    print(f"  Medium (IV):    {medium:4d} ({medium/total*100:.1f}%)")
    print(f"  Dark (V-VI):    {dark:4d} ({dark/total*100:.1f}%)")
    print(f"  Unknown:        {unknown:4d} ({unknown/total*100:.1f}%)")

    # Quality issues
    print(f"\n{'='*60}")
    print(f"QUALITY ISSUES ({len(bad_images)} flagged)")
    print("=" * 60)
    if bad_images:
        issue_counts = Counter(issue for _, issue in bad_images)
        for issue, count in issue_counts.most_common():
            print(f"  {issue}: {count} images")
        print(f"\n  Flagged files:")
        for fname, issue in bad_images[:20]:
            print(f"    {fname} -> {issue}")
        if len(bad_images) > 20:
            print(f"    ... and {len(bad_images) - 20} more")
    else:
        print("  No obvious issues detected (manual review still recommended)")

    # Overall assessment
    print(f"\n{'='*60}")
    print("COVERAGE ASSESSMENT FOR USE CASE")
    print("=" * 60)

    print(f"\n  Category: real_tattoo")
    print(f"  Total images: {total}")
    print(f"  Quality: {'GOOD' if len(bad_images) < total * 0.1 else 'NEEDS CLEANING'} ({len(bad_images)} flagged for review)")

    issues = []
    if dark / max(total, 1) < 0.15:
        issues.append(f"UNDERREPRESENTED: Dark skin tones only {dark/total*100:.1f}% (target >=20%)")
    if medium / max(total, 1) < 0.15:
        issues.append(f"UNDERREPRESENTED: Medium skin tones only {medium/total*100:.1f}% (target >=20%)")
    if light / max(total, 1) > 0.6:
        issues.append(f"OVERREPRESENTED: Light skin tones at {light/total*100:.1f}% (target <=40%)")

    if issues:
        print(f"\n  BIAS WARNINGS:")
        for issue in issues:
            print(f"    ⚠ {issue}")
    else:
        print(f"\n  ✓ Skin tone distribution looks balanced")

    sticker_dir = DATA_DIR.parent / "sticker_tattoo"
    pen_dir = DATA_DIR.parent / "pen_drawn"
    sticker_count = len(list(sticker_dir.glob("*.png"))) if sticker_dir.exists() else 0
    pen_count = len(list(pen_dir.glob("*.png"))) if pen_dir.exists() else 0

    print(f"\n  MISSING DATA:")
    print(f"    sticker_tattoo: {sticker_count} images {'(EMPTY - MUST COLLECT)' if sticker_count == 0 else ''}")
    print(f"    pen_drawn:      {pen_count} images {'(EMPTY - MUST COLLECT)' if pen_count == 0 else ''}")

    print(f"\n  RECOMMENDATIONS:")
    print(f"    1. Remove {len(bad_images)} flagged images (renders, mockups)")
    if dark / max(total, 1) < 0.15:
        print(f"    2. Add ~{max(100, int(total*0.2) - dark)} more dark skin tone tattoo images")
    print(f"    3. Collect sticker/temporary tattoo images (Pexels API or manual photos)")
    print(f"    4. Collect pen/marker drawn images (Pexels API or manual photos)")
    print(f"    5. Use Lambda GPU (key saved) for training when dataset is complete")


if __name__ == "__main__":
    main()
