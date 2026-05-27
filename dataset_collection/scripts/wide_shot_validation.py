"""
Purpose:
    Build a wide-shot validation set and measure any model directory against
    it. This is the honest before/after yardstick for the model-robustness
    work: every change (augmentation, LP-FT, synthetic data) is judged on how
    well it classifies *wide* photos — the distribution real users actually
    provide — rather than the tight training crops the models already ace.

    The validation set has two parts:
      1. Real demo examples in public/images/examples (7 labelled photos)
      2. Held-out synthetic wide-shots: a deterministic slice of training
         crops (indices 0-VAL_PER_CLASS-1 per class) composited onto
         Fitzpatrick skin backgrounds at small scale/random position. These
         crops are recorded in val_heldout_manifest.json so the training
         pipeline can EXCLUDE them — keeping the validation honest.

Dependencies:
    - torch, transformers (ViT inference), PIL, numpy
    - dataset_collection/data/balanced/{class}/*.png  (source crops)
    - dataset_collection/data/not_tattoo_fitzpatrick/fst_*/  (skin backgrounds)
    - public/images/examples/*  (real demo photos)

Usage:
    python wide_shot_validation.py --build         # build the val set once
    python wide_shot_validation.py --eval MODEL_DIR [MODEL_DIR ...]

Changes:
    2026-05-26: Initial — wide-shot val set builder + multi-model evaluator.
"""

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from transformers import ViTForImageClassification, ViTImageProcessor

BASE = Path(__file__).resolve().parent.parent          # dataset_collection/
REPO = BASE.parent                                       # MDR_AiAct/
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
EXAMPLES = REPO / "public" / "images" / "examples"
VAL_DIR = DATA / "_wide_val"                            # generated val images
VAL_DIR_ROBUST = DATA / "_wide_val_robust"              # angle/lighting variants
MANIFEST = BASE / "val_heldout_manifest.json"

LABELS = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
LABEL2ID = {n: i for i, n in enumerate(LABELS)}

VAL_PER_CLASS = 12          # held-out crops per class → synthetic wide-shots
SEED = 1234

# Known labels for the real demo example photos.
DEMO_LABELS = {
    "real_tattoo_1.png": "real_tattoo",
    "real_tattoo_2.png": "real_tattoo",
    "tattoo_example.png": "real_tattoo",
    "sticker_tattoo.png": "sticker_tattoo",
    "sticker_tattoo_2.png": "sticker_tattoo",
    "fake_tattoo_example.png": "sticker_tattoo",   # a fake/temporary tattoo
    "sharpie_tattoo_example.png": "pen_drawn",
}


def composite_wide(crop: Image.Image, skin: Image.Image, rng: random.Random) -> Image.Image:
    """Paste a tight crop onto a skin background at small scale/random place —
    simulating a tattoo photographed from a distance on real skin."""
    canvas = skin.convert("RGB").resize((224, 224), Image.LANCZOS)
    # Tattoo occupies 30-55% of the frame (a "wide" shot, not a tight crop).
    scale = rng.uniform(0.30, 0.55)
    side = int(224 * scale)
    c = crop.convert("RGB").resize((side, side), Image.LANCZOS)
    if rng.random() < 0.5:
        c = c.rotate(rng.uniform(-18, 18), expand=False, fillcolor=None)
    max_off = 224 - side
    x = rng.randint(0, max_off)
    y = rng.randint(0, max_off)
    canvas.paste(c, (x, y))
    return canvas


def build():
    """Build the wide-shot validation set + record held-out crop manifest."""
    rng = random.Random(SEED)
    VAL_DIR.mkdir(parents=True, exist_ok=True)
    for name in LABELS:
        (VAL_DIR / name).mkdir(exist_ok=True)

    skin_files = sorted(p for d in SKIN.glob("fst_*") for p in d.glob("*.png"))
    if not skin_files:
        raise SystemExit("No skin backgrounds found — check not_tattoo_fitzpatrick/")

    heldout: dict[str, list[str]] = {}
    counts: dict[str, int] = {}

    # 1. Synthetic wide-shots from held-out crops (real_tattoo/sticker/pen only;
    #    not_tattoo is already "wide" by nature, handle separately below).
    for cls in ["real_tattoo", "sticker_tattoo", "pen_drawn"]:
        crops = sorted((DATA / "balanced" / cls).glob("*.png"))
        held = crops[:VAL_PER_CLASS]
        heldout[cls] = [p.name for p in held]
        for i, crop_path in enumerate(held):
            skin = Image.open(rng.choice(skin_files))
            img = composite_wide(Image.open(crop_path), skin, rng)
            img.save(VAL_DIR / cls / f"wide_{i:02d}.png")
        counts[cls] = len(held)

    # 2. not_tattoo: plain skin backgrounds are the wide-shot negative.
    held_skin = skin_files[:VAL_PER_CLASS]
    heldout["not_tattoo"] = [p.name for p in held_skin]
    for i, sp in enumerate(held_skin):
        img = Image.open(sp).convert("RGB").resize((224, 224), Image.LANCZOS)
        img.save(VAL_DIR / "not_tattoo" / f"wide_{i:02d}.png")
    counts["not_tattoo"] = len(held_skin)

    # 3. Copy the real demo example photos in with their known labels.
    demo_count = 0
    for fname, cls in DEMO_LABELS.items():
        src = EXAMPLES / fname
        if src.exists():
            Image.open(src).convert("RGB").save(VAL_DIR / cls / f"demo_{fname}")
            demo_count += 1

    MANIFEST.write_text(json.dumps({
        "val_per_class": VAL_PER_CLASS,
        "seed": SEED,
        "heldout_crops": heldout,
        "note": "Training must EXCLUDE these crop filenames to keep validation honest.",
    }, indent=2))

    total = sum(counts.values()) + demo_count
    print(f"Built wide-shot validation set in {VAL_DIR}")
    for cls in LABELS:
        n = len(list((VAL_DIR / cls).glob("*.png")))
        print(f"  {cls}: {n}")
    print(f"  (incl. {demo_count} real demo photos)")
    print(f"Total: {total} images")
    print(f"Held-out manifest: {MANIFEST}")


def build_robust():
    """Create deterministic angle + lighting variants of every wide-shot val
    image, so we can measure robustness to real camera variation. Each source
    image yields 5 fixed variants: rotate +20, rotate -20, dim, bright, and a
    perspective warp. Deterministic = reproducible before/after comparison."""
    from PIL import ImageEnhance
    if not VAL_DIR.exists():
        raise SystemExit("Build the base wide-shot val set first (--build).")
    if VAL_DIR_ROBUST.exists():
        import shutil
        shutil.rmtree(VAL_DIR_ROBUST)
    for cls in LABELS:
        (VAL_DIR_ROBUST / cls).mkdir(parents=True, exist_ok=True)

    def perspective(img: Image.Image) -> Image.Image:
        # Mild keystone warp via QUAD transform (simulates an off-axis shot).
        w, h = img.size
        dx = int(w * 0.18)
        return img.transform((w, h), Image.QUAD,
                             (dx, 0, 0, h, w, h, w - dx, 0), Image.BICUBIC)

    n = 0
    for cls in LABELS:
        for src in sorted((VAL_DIR / cls).glob("*.png")):
            base = Image.open(src).convert("RGB")
            variants = {
                "rotpos": base.rotate(20, expand=False),
                "rotneg": base.rotate(-20, expand=False),
                "dim": ImageEnhance.Brightness(base).enhance(0.55),
                "bright": ImageEnhance.Brightness(base).enhance(1.55),
                "persp": perspective(base),
            }
            for tag, im in variants.items():
                im.save(VAL_DIR_ROBUST / cls / f"{src.stem}_{tag}.png")
                n += 1
    print(f"Built robustness val set in {VAL_DIR_ROBUST}: {n} images "
          f"(5 angle/lighting variants per wide-shot image)")


def evaluate(model_dir: str, robust: bool = False):
    """Run a model over the (wide or robust) val set, report accuracy + conf."""
    val_root = VAL_DIR_ROBUST if robust else VAL_DIR
    path = Path(model_dir)
    if not path.exists():
        print(f"  SKIP {model_dir} (not found)")
        return

    processor = ViTImageProcessor.from_pretrained(str(path))
    model = ViTForImageClassification.from_pretrained(str(path))
    model.eval()

    per_class_correct: dict[str, int] = {c: 0 for c in LABELS}
    per_class_total: dict[str, int] = {c: 0 for c in LABELS}
    confidences: list[float] = []
    correct = 0
    total = 0

    for cls in LABELS:
        for img_path in sorted((val_root / cls).glob("*.png")):
            img = Image.open(img_path).convert("RGB")
            inputs = processor(images=img, return_tensors="pt")
            with torch.no_grad():
                logits = model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=0)
            pred = int(probs.argmax())
            conf = float(probs[pred])
            confidences.append(conf)
            per_class_total[cls] += 1
            total += 1
            if pred == LABEL2ID[cls]:
                correct += 1
                per_class_correct[cls] += 1

    acc = correct / total if total else 0.0
    mean_conf = float(np.mean(confidences)) if confidences else 0.0
    print(f"\n=== {model_dir} {'[ROBUST: angle/lighting]' if robust else '[wide-shot]'} ===")
    print(f"  Wide-shot accuracy: {acc:.1%}  ({correct}/{total})")
    print(f"  Mean confidence:    {mean_conf:.2f}")
    for cls in LABELS:
        t = per_class_total[cls]
        if t:
            print(f"    {cls:<16} {per_class_correct[cls]}/{t}  ({per_class_correct[cls]/t:.0%})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", action="store_true", help="Build the wide-shot validation set")
    ap.add_argument("--build-robust", action="store_true", help="Build angle/lighting variants")
    ap.add_argument("--eval", nargs="*", default=[], help="Model dirs to evaluate (wide-shot)")
    ap.add_argument("--eval-robust", nargs="*", default=[], help="Model dirs to evaluate (robust)")
    args = ap.parse_args()

    if args.build:
        build()
    if args.build_robust:
        build_robust()
    for md in args.eval:
        evaluate(md, robust=False)
    for md in args.eval_robust:
        evaluate(md, robust=True)
    if not any([args.build, args.build_robust, args.eval, args.eval_robust]):
        ap.print_help()


if __name__ == "__main__":
    main()
