"""
Purpose:
    Per-skin-type fairness audit for any model directory. For each Fitzpatrick
    type (FST I-VI), test how well the model classifies BOTH:
      - bare skin of that type (expect not_tattoo)
      - tattoo/sticker/pen composited onto that skin type (expect the class)
    Reports per-FST accuracy + per-class accuracy within each FST so we can
    see whether the model treats every skin tone equally.

    This is the audit the MDR + AI Act demo's bias story is about — without
    parity across FST I-VI, the "balanced" tier isn't actually balanced.

Dependencies:
    - data/not_tattoo_fitzpatrick/fst_1..6/  (skin backgrounds per type)
    - data/balanced/{tattoo class}/*.png     (source crops to composite)
    - val_heldout_manifest.json              (crops/backgrounds to exclude)

Usage:
    python fitzpatrick_audit.py --model models_lpft/balanced
    python fitzpatrick_audit.py --model models_lpft/balanced --model models/balanced

Changes:
    2026-05-26: Initial — per-FST evaluation across all 4 classes.
"""

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import ViTForImageClassification, ViTImageProcessor

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
MANIFEST = BASE / "val_heldout_manifest.json"

LABELS = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
LABEL2ID = {n: i for i, n in enumerate(LABELS)}
TATTOO_CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn"]
PER_CELL = 8          # samples per (FST, class) cell
SEED = 9090


def composite(crop: Image.Image, skin: Image.Image, rng: random.Random) -> Image.Image:
    """Paste a tight crop onto a skin background at small scale/random place."""
    canvas = skin.convert("RGB").resize((224, 224), Image.LANCZOS)
    scale = rng.uniform(0.30, 0.55)
    side = int(224 * scale)
    c = crop.convert("RGB").resize((side, side), Image.LANCZOS)
    if rng.random() < 0.5:
        c = c.rotate(rng.uniform(-18, 18), expand=False)
    max_off = 224 - side
    canvas.paste(c, (rng.randint(0, max_off), rng.randint(0, max_off)))
    return canvas


def build_audit_set() -> dict:
    """For each FST × class, build PER_CELL deterministic images.
       Returns {(fst, class): [PIL.Image, ...]} — fully in memory."""
    rng = random.Random(SEED)
    held = json.loads(MANIFEST.read_text()).get("heldout_crops", {}) if MANIFEST.exists() else {}
    held_sets = {cls: set(names) for cls, names in held.items()}

    crops = {}
    for cls in TATTOO_CLASSES:
        files = [p for p in sorted((DATA / "balanced" / cls).glob("*.png"))
                 if p.name not in held_sets.get(cls, set())]
        crops[cls] = files

    audit = {}
    for fst in range(1, 7):
        skin_dir = SKIN / f"fst_{fst}"
        if not skin_dir.exists():
            continue
        skin_files = [p for p in sorted(skin_dir.glob("*.png"))
                      if p.name not in held_sets.get("not_tattoo", set())]
        if not skin_files:
            continue

        # not_tattoo: PER_CELL plain skin images of this FST type
        bare = []
        for i in range(PER_CELL):
            img = Image.open(skin_files[i % len(skin_files)]).convert("RGB")
            bare.append(img.resize((224, 224), Image.LANCZOS))
        audit[(fst, "not_tattoo")] = bare

        # tattoo classes: PER_CELL composites of crop + this FST's skin
        for cls in TATTOO_CLASSES:
            imgs = []
            for i in range(PER_CELL):
                crop = Image.open(rng.choice(crops[cls]))
                skin = Image.open(rng.choice(skin_files))
                imgs.append(composite(crop, skin, rng))
            audit[(fst, cls)] = imgs
    return audit


def evaluate(model_dir: Path, audit: dict):
    processor = ViTImageProcessor.from_pretrained(str(model_dir))
    model = ViTForImageClassification.from_pretrained(str(model_dir))
    model.eval()

    correct_by_fst = defaultdict(int)
    total_by_fst = defaultdict(int)
    correct_by_cell = {}

    for (fst, cls), imgs in audit.items():
        c = 0
        for im in imgs:
            inputs = processor(images=im, return_tensors="pt")
            with torch.no_grad():
                logits = model(**inputs).logits[0]
            pred = int(logits.argmax())
            if pred == LABEL2ID[cls]:
                c += 1
        correct_by_cell[(fst, cls)] = c
        correct_by_fst[fst] += c
        total_by_fst[fst] += len(imgs)

    return correct_by_cell, correct_by_fst, total_by_fst


def report(model_dir: str, cell, by_fst, total):
    print(f"\n=== {model_dir} — Fitzpatrick audit ===")
    header = f"{'FST':<6}" + "".join(f"{c[:8]:>10}" for c in LABELS) + f"{'OVERALL':>10}"
    print(header)
    print("-" * len(header))
    for fst in sorted(by_fst.keys()):
        row = f"FST {fst} "
        for cls in LABELS:
            n = cell.get((fst, cls), 0)
            row += f"{n}/{PER_CELL}".rjust(10)
        row += f"{by_fst[fst]}/{total[fst]}".rjust(10)
        pct = by_fst[fst] / max(1, total[fst]) * 100
        row += f"  ({pct:.0f}%)"
        print(row)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", action="append", required=True,
                    help="Model dir; repeat to compare multiple")
    args = ap.parse_args()

    print("Building Fitzpatrick audit set (this is deterministic — seed=9090)...")
    audit = build_audit_set()
    print(f"  cells: {len(audit)}  total images: {sum(len(v) for v in audit.values())}")

    for md in args.model:
        cell, by_fst, total = evaluate(Path(md), audit)
        report(md, cell, by_fst, total)


if __name__ == "__main__":
    main()
