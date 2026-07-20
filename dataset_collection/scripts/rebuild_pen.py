"""
Purpose:
    Rebuild pen_drawn from images already on disk, so the demo can keep four
    classes without collecting new photographs.

    pen_drawn is ~2% correct: it was scraped on the word "pen" and returned
    stationery, notebooks and cafe tables. But genuine ink-on-skin images do
    exist in the corpus — they are simply filed under the wrong class, because
    the same Pexels pool fed sticker_tattoo and pen_drawn and nothing verified
    what came back. This searches EVERY class in EVERY tier for them.

    Two candidate populations are counted separately, because they are not the
    same thing and the demo may want them treated differently:

      marker/pen — biro, sharpie or marker drawn on skin. The intended class.
      henna      — mehndi. Also freehand pigment applied onto skin, so it is
                   physically closer to pen than to a printed transfer, but a
                   prior test found it lands 78% on sticker when a probe is
                   trained without it. That test was confounded (the pen
                   reference centroid is built from stationery photos, so it
                   was really asking "is henna more like a sticker than like a
                   notebook?"), so henna is reported separately here and the
                   decision is left open rather than assumed.

    Every candidate must ALSO pass a skin gate, so the failure that produced the
    original class — accepting images with no skin in them — cannot recur. The
    gate scored 100% acceptance across all six Fitzpatrick tones (spread 0.0%),
    so it is not expected to skew the rebuilt class by tone.

    Nothing is moved. This writes a proposal listing candidates with scores, for
    review before any file is touched.

Dependencies:
    - torch, transformers (CLIP), PIL

Usage:
    python rebuild_pen.py [--min-skin 0.5] [--min-concept 0.5]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
HUB = "openai/clip-vit-large-patch14"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
TIERS = ["balanced", "unbalanced", "uncleaned"]

# Concept prototypes. Several prompts each: a single phrasing is brittle, and
# the whole point is not to repeat a keyword-matching mistake.
CONCEPTS = {
    "marker": ["a drawing on skin made with a marker pen",
               "ballpoint pen doodles drawn on an arm",
               "biro ink drawn on human skin",
               "a sharpie drawing on a person's arm",
               "handwriting written on someone's skin"],
    "henna": ["a photo of henna mehndi on a hand",
              "intricate brown henna body art on skin",
              "a mehndi design drawn on skin"],
    "sticker": ["a temporary transfer tattoo sticker on skin",
                "a printed press-on tattoo applied to skin"],
    "real": ["a permanent tattoo on skin",
             "tattooed skin with ink under the skin"],
    "other": ["a photo of stationery on a desk",
              "writing on a sheet of paper",
              "an object that is not a person",
              "a photo of food or a plant"],
}
SKIN = ["a close-up photo of human skin", "a photo of a person's arm",
        "bare human skin", "a part of a human body"]
NOT_SKIN = ["a photo of an object", "an empty room or wall",
            "a piece of paper or a document", "a photo of food"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-skin", type=float, default=0.5)
    ap.add_argument("--min-concept", type=float, default=0.5)
    ap.add_argument("--out", default=str(BASE / "pen_rebuild_proposal.json"))
    args = ap.parse_args()

    model = CLIPModel.from_pretrained(HUB).to(DEVICE).eval()
    proc = CLIPProcessor.from_pretrained(HUB)

    @torch.no_grad()
    def text_proto(prompts):
        t = proc(text=prompts, return_tensors="pt", padding=True).to(DEVICE)
        f = torch.nn.functional.normalize(model.get_text_features(**t), dim=-1)
        return torch.nn.functional.normalize(f.mean(0), dim=0).cpu()

    keys = list(CONCEPTS)
    P = torch.stack([text_proto(CONCEPTS[k]) for k in keys])
    G = torch.stack([text_proto(SKIN), text_proto(NOT_SKIN)])

    @torch.no_grad()
    def embed(paths, bs=32):
        out = []
        for i in range(0, len(paths), bs):
            imgs = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
            inp = proc(images=imgs, return_tensors="pt").to(DEVICE)
            f = model.get_image_features(**inp)
            out.append(torch.nn.functional.normalize(f, dim=-1).cpu())
        return torch.cat(out)

    # De-duplicate across tiers: the same image appears in several of them.
    seen: set[str] = set()
    found = {"marker": [], "henna": []}
    scanned = 0

    for tier in TIERS:
        for cls in CLASSES:
            d = DATA / tier / cls
            if not d.exists():
                continue
            paths = [p for p in sorted(d.glob("*.png")) if p.name not in seen]
            if not paths:
                continue
            seen.update(p.name for p in paths)
            E = embed(paths)
            scanned += len(paths)

            concept = (100.0 * E @ P.T).softmax(-1)
            skin = (100.0 * E @ G.T).softmax(-1)[:, 0]

            for k in ("marker", "henna"):
                ki = keys.index(k)
                hit = ((concept.argmax(-1) == ki)
                       & (concept[:, ki] >= args.min_concept)
                       & (skin >= args.min_skin))
                for j in hit.nonzero().squeeze(-1).tolist():
                    found[k].append({
                        "path": f"{tier}/{cls}/{paths[j].name}",
                        "from_class": cls, "tier": tier,
                        "concept_score": round(float(concept[j, ki]), 3),
                        "skin_score": round(float(skin[j]), 3),
                    })

    print(f"scanned {scanned} unique images across {len(TIERS)} tiers\n")
    for k in ("marker", "henna"):
        items = sorted(found[k], key=lambda x: -x["concept_score"])
        print(f"{k.upper()}: {len(items)} candidates (concept>={args.min_concept}, "
              f"skin>={args.min_skin})")
        by_class: dict[str, int] = {}
        for it in items:
            by_class[it["from_class"]] = by_class.get(it["from_class"], 0) + 1
        print(f"   currently filed under: {by_class}")
        for it in items[:8]:
            print(f"     {it['concept_score']:.3f} skin={it['skin_score']:.2f}  "
                  f"{it['path'][:64]}")
        print()

    Path(args.out).write_text(json.dumps(
        {"min_skin": args.min_skin, "min_concept": args.min_concept,
         "scanned": scanned,
         "note": "Proposal only — no files moved. Review before applying.",
         "marker": sorted(found["marker"], key=lambda x: -x["concept_score"]),
         "henna": sorted(found["henna"], key=lambda x: -x["concept_score"])},
        indent=1))
    print(f"-> {args.out}")
    n_m, n_h = len(found["marker"]), len(found["henna"])
    print(f"\nA 4-class rebuild needs a usable pen_drawn. Marker candidates: {n_m}.")
    print(f"Adding henna would give {n_m + n_h} — but henna is a distinct art form,")
    print("so folding it in changes what the class MEANS and should be a stated choice.")


if __name__ == "__main__":
    main()
