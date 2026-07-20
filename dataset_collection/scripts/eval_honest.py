"""
Purpose:
    Honest before/after yardstick for the wide-shot robustness work. Scores a
    model directory on three sets, weakest-assumption first:

      1. real demo photos   — genuine photographs (public/images/examples).
                              Few, but the only truly real-world evidence.
      2. soft wide-shot val — held-out crops feathered onto held-out skin
                              backgrounds. No hard rectangle to key on.
      3. hard wide-shot val — the pre-existing _wide_val_robust set, kept only
                              for comparability with earlier numbers. Its
                              hard-edged paste is a Clever Hans shortcut, so a
                              gain here that does NOT appear in (1)/(2) means
                              the model learnt the artefact, not the tattoo.

    Reports accuracy, mean confidence and a confusion matrix per set. Accuracy
    and confidence are reported separately on purpose: a more confident model
    was previously found to be LESS correct, so confidence is not the target.

Dependencies:
    - torch, transformers, PIL
    - dataset_collection/scripts/build_wide_train.py (composite_wide, feathered)
    - dataset_collection/val_heldout_manifest.json

Usage:
    python eval_honest.py MODEL_DIR [MODEL_DIR ...]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import json
import os
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_wide_train import composite_wide  # noqa: E402  (feathered compositing)

BASE = Path(__file__).resolve().parent.parent
REPO = BASE.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
# Overridable so the script runs on the cluster, where the training tree does
# not carry the frontend's public/ directory.
EXAMPLES = Path(os.environ.get("EXAMPLES_DIR", REPO / "public" / "images" / "examples"))
MANIFEST = BASE / "val_heldout_manifest.json"
SOFT_VAL = DATA / "_wide_val_soft"

CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
SEED = 1234
HELD_SKIN = 12

DEMO_LABELS = {
    "real_tattoo_1.png": "real_tattoo",
    "real_tattoo_2.png": "real_tattoo",
    "tattoo_example.png": "real_tattoo",
    "sticker_tattoo.png": "sticker_tattoo",
    "sticker_tattoo_2.png": "sticker_tattoo",
    # wide_shot_validation.py names this fake_tattoo_example.png, which does not
    # exist on disk — the file shipped as sticker_tattoo_example.png, so that
    # photo was silently dropped from every evaluation.
    "sticker_tattoo_example.png": "sticker_tattoo",
    "sharpie_tattoo_example.png": "pen_drawn",
}


def build_soft_val(reps: int = 5) -> None:
    """Feathered wide-shot val from held-out crops onto held-out skins."""
    if SOFT_VAL.exists():
        import shutil
        shutil.rmtree(SOFT_VAL)
    rng = random.Random(SEED)
    for c in CLASSES:
        (SOFT_VAL / c).mkdir(parents=True, exist_ok=True)

    held = json.loads(MANIFEST.read_text())["heldout_crops"]
    skins = sorted(p for d in sorted(SKIN.glob("fst_*")) for p in d.glob("*.png"))
    held_skins = skins[:HELD_SKIN]

    for cls in ["real_tattoo", "sticker_tattoo", "pen_drawn"]:
        n = 0
        for name in held[cls]:
            src = DATA / "balanced" / cls / name
            if not src.exists():
                continue
            crop = Image.open(src)
            for _ in range(reps):
                bg = Image.open(rng.choice(held_skins))
                composite_wide(crop, bg, rng).save(SOFT_VAL / cls / f"soft_{n:03d}.png")
                n += 1
    n = 0
    for sp in held_skins:
        img = Image.open(sp).convert("RGB")
        w, h = img.size
        for _ in range(reps):
            f = rng.uniform(0.45, 1.0)
            s = int(min(w, h) * f)
            x, y = rng.randint(0, w - s), rng.randint(0, h - s)
            img.crop((x, y, x + s, y + s)).resize((224, 224), Image.LANCZOS).save(
                SOFT_VAL / "not_tattoo" / f"soft_{n:03d}.png")
            n += 1


def load(model_dir: str):
    proc = AutoImageProcessor.from_pretrained(model_dir)
    model = AutoModelForImageClassification.from_pretrained(model_dir)
    model.eval()
    return proc, model


def score(proc, model, pairs, title: str) -> float:
    matrix = defaultdict(Counter)
    correct = conf_sum = 0
    for path, truth in pairs:
        img = Image.open(path).convert("RGB")
        inputs = proc(images=img, return_tensors="pt")
        with torch.no_grad():
            probs = model(**inputs).logits.softmax(-1)[0]
        i = int(probs.argmax())
        pred = CLASSES[i]
        matrix[truth][pred] += 1
        correct += pred == truth
        conf_sum += float(probs[i])
    n = len(pairs)
    print(f"\n  {title}")
    print(f"    accuracy        : {correct}/{n} = {correct/n:.1%}")
    print(f"    mean confidence : {conf_sum/n:.3f}")
    header = "truth/pred"
    print(f"    {header:16s}" + "".join(f"{c[:10]:>12s}" for c in CLASSES))
    for t in CLASSES:
        if sum(matrix[t].values()):
            print(f"    {t:16s}" + "".join(f"{matrix[t][p]:>12d}" for p in CLASSES))
    return correct / n


def collect(root: Path):
    return [(p, c) for c in CLASSES for p in sorted((root / c).glob("*.png"))]


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("usage: eval_honest.py MODEL_DIR [MODEL_DIR ...]")

    if not SOFT_VAL.exists():
        print("Building feathered (soft) wide-shot validation set ...")
        build_soft_val()

    demo = [(EXAMPLES / f, c) for f, c in DEMO_LABELS.items() if (EXAMPLES / f).exists()]
    soft = collect(SOFT_VAL)
    hard_dir = DATA / "_wide_val_robust"
    hard = collect(hard_dir) if hard_dir.exists() else []

    for md in sys.argv[1:]:
        print("=" * 72)
        print(f"MODEL: {md}")
        print("=" * 72)
        proc, model = load(md)
        score(proc, model, demo, f"1. REAL demo photos ({len(demo)}) — the only real evidence")
        score(proc, model, soft, f"2. SOFT wide-shot val ({len(soft)}) — feathered, no shortcut")
        if hard:
            score(proc, model, hard, f"3. HARD wide-shot val ({len(hard)}) — legacy, has artefact")


if __name__ == "__main__":
    main()
