"""
Purpose:
    Build a combined training set for the LP-FT retrain: the original tight
    tattoo crops PLUS synthetic "wide-shot" composites (a tattoo/sticker/pen
    crop pasted onto a Fitzpatrick skin background at small scale, random
    position and rotation). This teaches the model the real serving
    distribution — a small tattoo on real skin photographed at a distance —
    instead of only tight crops.

    Held-out validation crops/backgrounds (from val_heldout_manifest.json)
    are EXCLUDED so the wide-shot validation set stays honest.

Dependencies:
    - PIL, numpy
    - data/{variant}/{class}/*.png          (source crops)
    - data/not_tattoo_fitzpatrick/fst_*/    (skin backgrounds)
    - val_heldout_manifest.json             (crops/backgrounds to exclude)

Usage:
    python make_lpft_data.py --variant balanced
    python make_lpft_data.py --variant all

Output:
    data/{variant}_lpft/{class}/  — originals (minus held-out) + composites

Changes:
    2026-05-26: Initial — synthetic skin compositor for LP-FT training data.
"""

import argparse
import json
import random
import shutil
from pathlib import Path

from PIL import Image

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
MANIFEST = BASE / "val_heldout_manifest.json"

TATTOO_CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn"]
ALL_CLASSES = TATTOO_CLASSES + ["not_tattoo"]
SEED = 4321

# How many synthetic wide-shots to make per class, as a fraction of the
# originals. 1.0 → a 50/50 mix of tight crops and wide composites.
SYNTH_RATIO = 1.0


def load_heldout() -> dict:
    if MANIFEST.exists():
        return json.loads(MANIFEST.read_text()).get("heldout_crops", {})
    return {}


def composite_wide(crop: Image.Image, skin: Image.Image, rng: random.Random) -> Image.Image:
    """Paste a tight crop onto a skin background at small scale/random place."""
    canvas = skin.convert("RGB").resize((224, 224), Image.LANCZOS)
    scale = rng.uniform(0.30, 0.60)
    side = int(224 * scale)
    c = crop.convert("RGB").resize((side, side), Image.LANCZOS)
    if rng.random() < 0.5:
        c = c.rotate(rng.uniform(-20, 20), expand=False)
    max_off = 224 - side
    x = rng.randint(0, max_off)
    y = rng.randint(0, max_off)
    canvas.paste(c, (x, y))
    return canvas


def build_variant(variant: str):
    rng = random.Random(SEED)
    heldout = load_heldout()
    skin_files = sorted(p for d in SKIN.glob("fst_*") for p in d.glob("*.png"))
    heldout_skin = set(heldout.get("not_tattoo", []))
    train_skin = [p for p in skin_files if p.name not in heldout_skin]

    out_root = DATA / f"{variant}_lpft"
    if out_root.exists():
        shutil.rmtree(out_root)
    for cls in ALL_CLASSES:
        (out_root / cls).mkdir(parents=True, exist_ok=True)

    print(f"\n=== {variant}_lpft ===")
    for cls in ALL_CLASSES:
        src_dir = DATA / variant / cls
        if not src_dir.exists():
            print(f"  {cls}: source missing, skipping")
            continue
        held = set(heldout.get(cls, []))
        crops = [p for p in sorted(src_dir.glob("*.png")) if p.name not in held]

        # 1. Copy the originals (tight crops), minus held-out.
        for p in crops:
            shutil.copy(p, out_root / cls / f"orig_{p.name}")

        # 2. Synthetic wide-shots for the three tattoo classes only.
        synth_n = 0
        if cls in TATTOO_CLASSES and train_skin:
            target = int(len(crops) * SYNTH_RATIO)
            for i in range(target):
                crop = Image.open(rng.choice(crops))
                skin = Image.open(rng.choice(train_skin))
                composite_wide(crop, skin, rng).save(out_root / cls / f"wide_{i:05d}.png")
            synth_n = target

        total = len(list((out_root / cls).glob("*.png")))
        print(f"  {cls}: {len(crops)} originals + {synth_n} composites = {total}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="balanced",
                    choices=["balanced", "unbalanced", "uncleaned", "all"])
    args = ap.parse_args()
    variants = ["balanced", "unbalanced", "uncleaned"] if args.variant == "all" else [args.variant]
    for v in variants:
        build_variant(v)
    print("\nDone.")


if __name__ == "__main__":
    main()
