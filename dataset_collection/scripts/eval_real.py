"""
Purpose:
    Evaluate on REAL photographs only — no synthetic compositing anywhere.

    Why this exists: the wide-shot validation sets (_wide_val, _wide_val_soft)
    are built by pasting tight crops onto skin backgrounds. Measured across four
    arms, scores on those sets ANTI-CORRELATE with scores on real photos: CLIP
    zero-shot is best on real photos (7/7) and worst on the composites (40%),
    while a probe trained on composites is best on composites (80.8%) and worst
    on real photos (5/7). Optimising against the synthetic benchmark therefore
    degrades real-world behaviour, so it must not be used to choose a model.

    The training crops are themselves real photographs (Pexels stock), merely
    cropped tightly. The 12 held-out crops per class named in
    val_heldout_manifest.json are absent from balanced_lpft/ (verified), so for
    the served model and for CLIP they are genuine unseen real images — 48 of
    them, against 7 demo photos.

    Contamination note: models/ (feature_extraction_logistic_regression) trained
    on data/balanced, which CONTAINS these held-out crops, so it is excluded —
    scoring it here would be measuring memorisation.

    Two arms:
      1. plain      — the whole image, as the backend does today
      2. multi-crop — detection-by-classification: score a grid of crops at
                      several scales and keep the most confident tattoo-class
                      window. Tests whether locating the region recovers the
                      tight-crop accuracy on wide inputs, which a blind
                      centre-crop (+4.4pp) largely failed to do.

Dependencies:
    - torch, transformers (ViT + CLIP), PIL
    - dataset_collection/val_heldout_manifest.json

Usage:
    python eval_real.py

Changes:
    2026-07-16: Initial, after the synthetic benchmark was found to be
                anti-correlated with real-photo performance.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import torch
from PIL import Image
from transformers import (AutoImageProcessor, AutoModelForImageClassification,
                          CLIPModel, CLIPProcessor)

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
MANIFEST = BASE / "val_heldout_manifest.json"
EXAMPLES = Path(os.environ.get("EXAMPLES_DIR", BASE.parent / "public/images/examples"))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
TATTOO_IDX = [0, 1, 2]

DEMO_LABELS = {
    "real_tattoo_1.png": "real_tattoo",
    "real_tattoo_2.png": "real_tattoo",
    "tattoo_example.png": "real_tattoo",
    "sticker_tattoo.png": "sticker_tattoo",
    "sticker_tattoo_2.png": "sticker_tattoo",
    "sticker_tattoo_example.png": "sticker_tattoo",
    "sharpie_tattoo_example.png": "pen_drawn",
}

PROMPTS = {
    "real_tattoo": ["a photo of a real permanent tattoo on skin",
                    "a close-up of tattooed skin with ink under the skin",
                    "a person with a permanent tattoo"],
    "sticker_tattoo": ["a photo of a temporary sticker tattoo on skin",
                       "a close-up of a temporary transfer tattoo applied to skin",
                       "a fake press-on tattoo sticker on a person's arm"],
    "pen_drawn": ["a photo of a drawing on skin made with a marker pen",
                  "a close-up of ink pen doodles drawn on skin",
                  "a person with biro drawn on their arm"],
    "not_tattoo": ["a photo of bare skin with no tattoo",
                   "a close-up of plain untattooed skin",
                   "an ordinary object that is not a tattoo"],
}


def held_out_real() -> list[tuple[Path, str]]:
    """The 12 held-out crops per class — real photos, unseen by the served model."""
    held = json.loads(MANIFEST.read_text())["heldout_crops"]
    out = []
    for cls in ["real_tattoo", "sticker_tattoo", "pen_drawn"]:
        for name in held[cls]:
            p = DATA / "balanced" / cls / name
            if p.exists():
                out.append((p, cls))
    # not_tattoo held-out entries are skin backgrounds, which are real photos too.
    for name in held.get("not_tattoo", []):
        for d in sorted((DATA / "not_tattoo_fitzpatrick").glob("fst_*")):
            p = d / name
            if p.exists():
                out.append((p, "not_tattoo"))
                break
    return out


def crops_multi(img: Image.Image) -> list[Image.Image]:
    """A small multi-scale grid — detection-by-classification windows."""
    out = [img]
    w, h = img.size
    for frac in (0.7, 0.45):
        s = int(min(w, h) * frac)
        for fx in (0.0, 0.5, 1.0):
            for fy in (0.0, 0.5, 1.0):
                x = int((w - s) * fx)
                y = int((h - s) * fy)
                out.append(img.crop((x, y, x + s, y + s)))
    return out


class ViTArm:
    def __init__(self, path: str):
        self.proc = AutoImageProcessor.from_pretrained(path)
        self.model = AutoModelForImageClassification.from_pretrained(path).to(DEVICE).eval()

    @torch.no_grad()
    def probs(self, imgs: list[Image.Image]) -> torch.Tensor:
        inp = self.proc(images=imgs, return_tensors="pt").to(DEVICE)
        return self.model(**inp).logits.softmax(-1).cpu()


class ClipArm:
    def __init__(self, name: str):
        self.model = CLIPModel.from_pretrained(name).to(DEVICE).eval()
        self.proc = CLIPProcessor.from_pretrained(name)
        protos = []
        with torch.no_grad():
            for c in CLASSES:
                inp = self.proc(text=PROMPTS[c], return_tensors="pt", padding=True).to(DEVICE)
                t = torch.nn.functional.normalize(self.model.get_text_features(**inp), dim=-1)
                protos.append(torch.nn.functional.normalize(t.mean(0), dim=0))
        self.P = torch.stack(protos).cpu()

    @torch.no_grad()
    def probs(self, imgs: list[Image.Image]) -> torch.Tensor:
        inp = self.proc(images=imgs, return_tensors="pt").to(DEVICE)
        f = torch.nn.functional.normalize(self.model.get_image_features(**inp), dim=-1).cpu()
        return (100.0 * f @ self.P.T).softmax(-1)


def run(arm, pairs, multi: bool, title: str) -> None:
    correct = 0
    conf_sum = 0.0
    per_class = {c: [0, 0] for c in CLASSES}
    for path, truth in pairs:
        img = Image.open(path).convert("RGB")
        if multi:
            p = arm.probs(crops_multi(img))
            # Pick the window most confident about any tattoo class; fall back to
            # the whole image when no window commits, so 'none' stays reachable.
            best = p[:, TATTOO_IDX].max(-1).values.argmax()
            probs = p[best] if float(p[best, TATTOO_IDX].max()) > 0.5 else p[0]
        else:
            probs = arm.probs([img])[0]
        pred = CLASSES[int(probs.argmax())]
        correct += pred == truth
        conf_sum += float(probs.max())
        per_class[truth][0] += pred == truth
        per_class[truth][1] += 1
    n = len(pairs)
    detail = "  ".join(f"{c.split('_')[0]}:{v[0]}/{v[1]}" for c, v in per_class.items() if v[1])
    print(f"    {title:34s} {correct:3d}/{n} = {correct/n:6.1%}   conf {conf_sum/n:.3f}   {detail}")


def main() -> None:
    real = held_out_real()
    demo = [(EXAMPLES / f, c) for f, c in DEMO_LABELS.items() if (EXAMPLES / f).exists()]
    print(f"REAL held-out crops: {len(real)}   |   real demo photos: {len(demo)}")
    print("No compositing anywhere. models/ excluded — it trained on these crops.\n")

    arms = [
        ("models_lpft/balanced (served, fine-tuned ViT)",
         lambda: ViTArm(str(BASE / "models_lpft" / "balanced"))),
        ("CLIP zero-shot (openai/clip-vit-large-patch14)",
         lambda: ClipArm("openai/clip-vit-large-patch14")),
    ]
    for name, make in arms:
        print("=" * 78)
        print(name)
        print("=" * 78)
        arm = make()
        print("  HELD-OUT REAL CROPS (48, unseen real photographs)")
        run(arm, real, False, "plain")
        run(arm, real, True, "multi-crop (ROI search)")
        print("  REAL DEMO PHOTOS (7, full wide photographs)")
        run(arm, demo, False, "plain")
        run(arm, demo, True, "multi-crop (ROI search)")
        print()


if __name__ == "__main__":
    main()
