"""
Purpose:
    Precompute a curation manifest for the training set: for every image, the
    stored label plus two INDEPENDENT opinions — the fine-tuned tier model and
    CLIP zero-shot, which never saw this dataset or its labels.

    Why: the data is keyword-scraped stock photography, and inspection found
    real garbage carrying confident labels — a porcelain vase labelled
    pen_drawn, a bare torso (no ink at all) labelled pen_drawn, plus 16
    byte-identical images labelled as BOTH sticker_tattoo and pen_drawn. The
    model learned "dark ink lines on a pale surface" partly because that is
    literally what it was shown, which is why handwriting on paper scores
    pen_drawn at 0.759 with no skin present.

    Manual curation is the highest-certainty accuracy gain available (~+2-5pp
    expected; label noise alone cannot explain the 81.2% ceiling, so this is a
    real but bounded win). This manifest exists to make that afternoon of human
    attention as fast as possible: images where BOTH models disagree with the
    stored label sort to the top, so the worst offenders are seen first.

    A 'suspicion' score drives the ordering:
      2.0 + confidence  — both models agree the label is wrong, and agree with
                          each other (strongest signal)
      1.0 + confidence  — both disagree with the label but not with each other
      0.0 + (1 - conf)  — models agree with the label; least suspicious

Dependencies:
    - torch, transformers (ViT + CLIP), PIL
    - dataset_collection/models_lpft/{variant}/
    - dataset_collection/data/{variant}/{class}/*.png

Used by:
    - scripts/curate.py (serves the review UI over this manifest)

Usage:
    python curate_scan.py [--variant balanced] [--out curation_manifest.json]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from transformers import (AutoImageProcessor, AutoModelForImageClassification,
                          CLIPModel, CLIPProcessor)

BASE = Path(__file__).resolve().parent.parent
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BATCH = 32

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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="balanced")
    ap.add_argument("--out", default=str(BASE / "curation_manifest.json"))
    args = ap.parse_args()

    vit_dir = BASE / "models_lpft" / args.variant
    vit_proc = AutoImageProcessor.from_pretrained(vit_dir)
    vit = AutoModelForImageClassification.from_pretrained(vit_dir).to(DEVICE).eval()

    clip = CLIPModel.from_pretrained("openai/clip-vit-large-patch14").to(DEVICE).eval()
    clip_proc = CLIPProcessor.from_pretrained("openai/clip-vit-large-patch14")
    with torch.no_grad():
        protos = []
        for c in CLASSES:
            inp = clip_proc(text=PROMPTS[c], return_tensors="pt", padding=True).to(DEVICE)
            t = torch.nn.functional.normalize(clip.get_text_features(**inp), dim=-1)
            protos.append(torch.nn.functional.normalize(t.mean(0), dim=0))
        P = torch.stack(protos)

    records = []
    for cls in CLASSES:
        d = BASE / "data" / args.variant / cls
        if not d.exists():
            continue
        files = sorted(d.glob("*.png"))
        print(f"{cls}: {len(files)} images")
        for i in range(0, len(files), BATCH):
            batch = files[i:i + BATCH]
            imgs = [Image.open(p).convert("RGB") for p in batch]
            with torch.no_grad():
                a = vit(**vit_proc(images=imgs, return_tensors="pt").to(DEVICE)).logits.softmax(-1).cpu()
                f = torch.nn.functional.normalize(
                    clip.get_image_features(**clip_proc(images=imgs, return_tensors="pt").to(DEVICE)), dim=-1)
                b = (100.0 * f @ P.T).softmax(-1).cpu()
            for j, p in enumerate(batch):
                ai, bi = int(a[j].argmax()), int(b[j].argmax())
                truth = CLASSES.index(cls)
                aconf, bconf = float(a[j][ai]), float(b[j][bi])
                if ai != truth and bi != truth:
                    suspicion = (2.0 if ai == bi else 1.0) + min(aconf, bconf)
                else:
                    suspicion = 1.0 - max(aconf, bconf) if (ai != truth or bi != truth) else -max(aconf, bconf)
                records.append({
                    "path": f"{cls}/{p.name}",
                    "label": cls,
                    "vit": CLASSES[ai], "vit_conf": round(aconf, 3),
                    "clip": CLASSES[bi], "clip_conf": round(bconf, 3),
                    "suspicion": round(suspicion, 4),
                })

    records.sort(key=lambda r: -r["suspicion"])
    both_wrong = sum(1 for r in records if r["label"] not in (r["vit"], r["clip"])
                     and r["vit"] == r["clip"])
    Path(args.out).write_text(json.dumps({
        "variant": args.variant,
        "classes": CLASSES,
        "total": len(records),
        "both_models_disagree": both_wrong,
        "records": records,
    }, indent=1))
    print(f"\n{len(records)} images -> {args.out}")
    print(f"  {both_wrong} where both models agree the label is wrong ({both_wrong/max(len(records),1):.1%})")
    print("  sorted most-suspicious first")


if __name__ == "__main__":
    main()
