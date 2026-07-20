"""
Purpose:
    Build a training set whose distribution matches how the demo is actually
    used — a tattoo photographed at a distance on skin — rather than the tight
    224x224 crops the existing models train on.

    Measured motivation (models_lpft/balanced, held-out wide-shot set):
      - wide shots as served today ........ 68.0%
      - same shots centre-cropped ......... 72.4%
      - tight in-distribution crops ....... 85.0%
    The ~17pp gap is a train/serve distribution mismatch, not a capacity limit:
    lpft_train.py augments scale only over (0.85, 1.15), so the model is never
    shown a small tattoo inside a wide frame. Fixing that at inference recovered
    just 4.4pp; this fixes it at training time instead.

    Three corrections are applied:
      1. Wide-shot composites — each crop is also pasted onto a Fitzpatrick skin
         background at 20-75% scale, mirroring wide_shot_validation.composite_wide
         but over a WIDER scale range than the validation set (0.30-0.55), so the
         model generalises to the distribution instead of memorising it.
      2. Ambiguous-label removal — 16 byte-identical images are present in BOTH
         pen_drawn/ and sticker_tattoo/, teaching the model that identical pixels
         are two different classes. They sit exactly on the sticker-pen boundary,
         which carries the largest error mass in the wide-shot confusion matrix
         (46 of 275). Dropped from both classes.
      3. not_tattoo parity — the "balanced" set is not balanced (388 vs 776).
         Topped up with bare-skin zoom variants so "none" means "skin, no
         tattoo" and not merely "a photo of food or a flower".

    Validation integrity: the held-out crops named in val_heldout_manifest.json
    are already absent from balanced_lpft/ (verified), and the 12 held-out skin
    backgrounds are excluded here, so the wide-shot validation set stays honest.

Dependencies:
    - PIL, dataset_collection/data/balanced_lpft/{class}/*.png
    - dataset_collection/data/not_tattoo_fitzpatrick/fst_*/*.png
    - dataset_collection/val_heldout_manifest.json

Usage:
    python build_wide_train.py [--out data/balanced_wide] [--seed 1234]

Changes:
    2026-07-16: Initial. Addresses the wide-shot accuracy gap measured against
                _wide_val_robust.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import shutil
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
MANIFEST = BASE / "val_heldout_manifest.json"

TATTOO_CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn"]
ALL_CLASSES = TATTOO_CLASSES + ["not_tattoo"]

CANVAS = 224
# Deliberately wider than the validation range (0.30-0.55) so the model learns
# scale invariance rather than fitting the exact scale it is scored on.
WIDE_SCALE = (0.20, 0.75)
# Held-out skin backgrounds used to build the validation negatives.
HELD_SKIN = 12


def md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def find_ambiguous(src: Path) -> set[str]:
    """Byte-identical images labelled as both pen_drawn and sticker_tattoo."""
    by_hash: dict[str, dict[str, str]] = defaultdict(dict)
    for cls in ["pen_drawn", "sticker_tattoo"]:
        for p in (src / cls).glob("*"):
            by_hash[md5(p)][cls] = p.name
    return {h for h, owners in by_hash.items() if len(owners) > 1}


def composite_wide(crop: Image.Image, skin: Image.Image, rng: random.Random) -> Image.Image:
    """Paste a tight crop onto a skin background at small scale and random
    position — a tattoo photographed from a distance.

    Unlike wide_shot_validation.composite_wide, which pastes a hard-edged
    square, this feathers an elliptical alpha mask and colour-matches the crop
    to the background. A hard rectangle is a Clever Hans shortcut: the model
    would learn to find the pasted square rather than the tattoo, score highly
    on a validation set built the same way, and still fail on real photos where
    no rectangle exists. Feathering removes the shortcut, so accuracy gains have
    to come from actually recognising the tattoo.
    """
    canvas = skin.convert("RGB").resize((CANVAS, CANVAS), Image.LANCZOS)
    scale = rng.uniform(*WIDE_SCALE)
    side = max(8, int(CANVAS * scale))
    c = crop.convert("RGB").resize((side, side), Image.LANCZOS)
    if rng.random() < 0.5:
        c = c.rotate(rng.uniform(-18, 18), expand=False)

    # Colour-match the crop's skin tone towards the background so the seam is
    # not a colour step the model can key on.
    c = _match_tone(c, canvas, strength=rng.uniform(0.35, 0.7))

    # Feathered elliptical mask: opaque in the middle, fading out well before
    # the edge, so no straight boundary survives.
    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).ellipse(
        (side * 0.06, side * 0.06, side * 0.94, side * 0.94), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(1.5, side * 0.09)))

    off = CANVAS - side
    canvas.paste(c, (rng.randint(0, off), rng.randint(0, off)), mask)
    return canvas


def _match_tone(crop: Image.Image, bg: Image.Image, strength: float) -> Image.Image:
    """Shift the crop's per-channel mean towards the background's, so a pasted
    region does not betray itself by colour alone."""
    import numpy as np

    a = np.asarray(crop, dtype=np.float32)
    b = np.asarray(bg, dtype=np.float32)
    shift = (b.reshape(-1, 3).mean(0) - a.reshape(-1, 3).mean(0)) * strength
    return Image.fromarray(np.clip(a + shift, 0, 255).astype("uint8"))


def skin_zoom(skin: Image.Image, rng: random.Random) -> Image.Image:
    """A random zoomed region of bare skin — still 'no tattoo', but varied, so
    not_tattoo is not a handful of images repeated."""
    img = skin.convert("RGB")
    w, h = img.size
    frac = rng.uniform(0.45, 1.0)
    s = int(min(w, h) * frac)
    x = rng.randint(0, max(0, w - s))
    y = rng.randint(0, max(0, h - s))
    return img.crop((x, y, x + s, y + s)).resize((CANVAS, CANVAS), Image.LANCZOS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(DATA / "balanced_lpft"))
    ap.add_argument("--out", default=str(DATA / "balanced_wide"))
    ap.add_argument("--seed", type=int, default=1234)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    src, out = Path(args.src), Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    for c in ALL_CLASSES:
        (out / c).mkdir(parents=True, exist_ok=True)

    # ── Skin backgrounds, excluding the 12 held out for validation ──
    skins = sorted(p for d in sorted(SKIN.glob("fst_*")) for p in d.glob("*.png"))
    if not skins:
        raise SystemExit(f"No skin backgrounds under {SKIN}")
    train_skins = skins[HELD_SKIN:]
    print(f"Skin backgrounds: {len(skins)} total, {len(train_skins)} usable "
          f"({HELD_SKIN} held out for validation)")

    # ── Guard: the held-out crops must not be present in the source ──
    manifest = json.loads(MANIFEST.read_text())["heldout_crops"]
    leaked = 0
    for cls, names in manifest.items():
        present = {p.name for p in (src / cls).glob("*")} if (src / cls).exists() else set()
        leaked += sum(1 for n in names if n in present or f"orig_{n}" in present)
    if leaked:
        raise SystemExit(f"ABORT: {leaked} held-out validation crops present in {src}")
    print(f"Validation integrity: 0 held-out crops present in source — clean")

    ambiguous = find_ambiguous(src)
    print(f"Ambiguous sticker/pen images to drop: {len(ambiguous)}")

    # ── Tattoo classes: 1 tight crop + 1 wide composite per source image ──
    counts: dict[str, int] = {}
    dropped = 0
    for cls in TATTOO_CLASSES:
        n = 0
        for p in sorted((src / cls).glob("*")):
            if md5(p) in ambiguous:
                dropped += 1
                continue
            img = Image.open(p).convert("RGB")
            img.resize((CANVAS, CANVAS), Image.LANCZOS).save(out / cls / f"tight_{n:05d}.png")
            n += 1
            skin = Image.open(rng.choice(train_skins))
            composite_wide(img, skin, rng).save(out / cls / f"wide_{n:05d}.png")
            n += 1
        counts[cls] = n
        print(f"  {cls:16s} {n:5d}  (tight + wide)")

    # ── not_tattoo: keep the object/noise negatives, top up with bare skin ──
    n = 0
    for p in sorted((src / "not_tattoo").glob("*")):
        Image.open(p).convert("RGB").resize((CANVAS, CANVAS), Image.LANCZOS).save(
            out / "not_tattoo" / f"obj_{n:05d}.png")
        n += 1
    objects = n
    target = max(counts.values())
    while n < target:
        skin = Image.open(rng.choice(train_skins))
        skin_zoom(skin, rng).save(out / "not_tattoo" / f"skin_{n:05d}.png")
        n += 1
    counts["not_tattoo"] = n
    print(f"  {'not_tattoo':16s} {n:5d}  ({objects} objects + {n - objects} bare skin)")

    print(f"\nDropped {dropped} ambiguous images across sticker/pen.")
    print(f"Built wide training set at {out}")
    for c in ALL_CLASSES:
        print(f"  {c:16s} {len(list((out / c).glob('*.png'))):5d}")


if __name__ == "__main__":
    main()
