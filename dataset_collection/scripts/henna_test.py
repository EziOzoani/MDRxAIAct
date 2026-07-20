"""
Purpose:
    Test whether henna/mehndi belongs with pen_drawn rather than with
    sticker_tattoo, which would let a broken class be rebuilt from data already
    on disk instead of collected from scratch.

    The hypothesis is physical, not statistical. Henna and pen are both
    freehand pigment applied ONTO skin: no sheet edge, no printed film, colour
    following a hand-drawn stroke. A sticker tattoo is a printed transfer laid
    onto skin — flat ink, saturated print colours, and often a visible film
    boundary. If that distinction dominates, henna should sit nearer pen than
    sticker in feature space.

    This matters because the visual audit found sticker_tattoo is ~20% correct
    with a further 25-30% henna (roughly 100-120 images), while pen_drawn is
    ~2% correct — a keyword scrape of "pen" that returned stationery. No public
    dataset of pen-on-skin exists at any Fitzpatrick range, so the alternatives
    are to photograph it or to recover a related class already present.

    Method:
      1. identify henna via CLIP zero-shot over the sticker/pen classes, using
         several prompts per concept rather than one brittle phrasing;
      2. measure mean cosine similarity from henna to each class centroid;
      3. train a 3-way probe (real / sticker / pen) WITHOUT henna, then see
         which class it assigns held-out henna to — a behavioural test rather
         than a geometric one;
      4. report the risk directly: henna is orange-brown and intricate, biro is
         blue-black and sparse, so a model may learn the colour rather than the
         "drawn on" concept. Point 3 is what would expose that.

Dependencies:
    - torch, transformers (CLIP), PIL

Usage:
    python henna_test.py

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

from pathlib import Path

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data" / "balanced"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
HUB = "openai/clip-vit-large-patch14"

CONCEPTS = {
    "henna": ["a photo of henna mehndi on a hand",
              "intricate brown henna body art on skin",
              "a mehndi design drawn on skin"],
    "pen": ["a drawing on skin made with a marker pen",
            "ballpoint pen doodles drawn on an arm",
            "biro ink drawn on human skin"],
    "sticker": ["a temporary transfer tattoo sticker on skin",
                "a press-on tattoo applied to a child's arm",
                "a printed temporary tattoo on skin"],
    "real": ["a permanent tattoo on skin",
             "tattooed skin with ink under the skin"],
}


def main() -> None:
    model = CLIPModel.from_pretrained(HUB).to(DEVICE).eval()
    proc = CLIPProcessor.from_pretrained(HUB)

    with torch.no_grad():
        protos = {}
        for k, prompts in CONCEPTS.items():
            t = proc(text=prompts, return_tensors="pt", padding=True).to(DEVICE)
            f = torch.nn.functional.normalize(model.get_text_features(**t), dim=-1)
            protos[k] = torch.nn.functional.normalize(f.mean(0), dim=0).cpu()
        P = torch.stack([protos[k] for k in CONCEPTS])

    @torch.no_grad()
    def embed(paths, bs=32):
        out = []
        for i in range(0, len(paths), bs):
            imgs = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
            inp = proc(images=imgs, return_tensors="pt").to(DEVICE)
            f = model.get_image_features(**inp)
            out.append(torch.nn.functional.normalize(f, dim=-1).cpu())
        return torch.cat(out)

    paths = {c: sorted((DATA / c).glob("*.png"))
             for c in ("real_tattoo", "sticker_tattoo", "pen_drawn")}
    embs = {c: embed(v) for c, v in paths.items()}

    # ── 1. Find henna inside the sticker/pen classes ──
    keys = list(CONCEPTS)
    henna_paths, henna_emb = [], []
    for c in ("sticker_tattoo", "pen_drawn"):
        sim = embs[c] @ P.T
        pick = sim.argmax(-1) == keys.index("henna")
        n = int(pick.sum())
        print(f"{c}: {n}/{len(paths[c])} = {n/len(paths[c]):.1%} classified as henna")
        henna_paths += [p for p, m in zip(paths[c], pick.tolist()) if m]
        henna_emb.append(embs[c][pick])
    H = torch.cat(henna_emb)
    print(f"\nhenna images found: {len(H)}")
    if len(H) < 10:
        print("too few to test — stopping")
        return

    # ── 2. Geometric: which class centroid is henna nearest? ──
    print("\n1. GEOMETRY — mean cosine similarity from henna to each class centroid")
    cents = {}
    for c in paths:
        mask = torch.ones(len(embs[c]), dtype=torch.bool)
        if c in ("sticker_tattoo", "pen_drawn"):
            sim = embs[c] @ P.T
            mask = sim.argmax(-1) != keys.index("henna")   # exclude henna itself
        cents[c] = torch.nn.functional.normalize(embs[c][mask].mean(0), dim=0)
        print(f"   -> {c:16s} {float((H @ cents[c]).mean()):.4f}  "
              f"(centroid from {int(mask.sum())} non-henna images)")
    nearest = max(cents, key=lambda c: float((H @ cents[c]).mean()))
    print(f"   nearest centroid: {nearest}")

    # ── 3. Behavioural: train without henna, see where henna lands ──
    print("\n2. BEHAVIOUR — 3-way probe trained WITHOUT henna, then shown henna")
    Xs, ys = [], []
    names = ["real_tattoo", "sticker_tattoo", "pen_drawn"]
    for i, c in enumerate(names):
        mask = torch.ones(len(embs[c]), dtype=torch.bool)
        if c in ("sticker_tattoo", "pen_drawn"):
            mask = (embs[c] @ P.T).argmax(-1) != keys.index("henna")
        Xs.append(embs[c][mask])
        ys.append(torch.full((int(mask.sum()),), i))
    X, y = torch.cat(Xs), torch.cat(ys)

    torch.manual_seed(0)
    head = torch.nn.Linear(X.shape[1], 3)
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-4)
    lf = torch.nn.CrossEntropyLoss()
    for _ in range(600):
        opt.zero_grad()
        lf(head(X), y).backward()
        opt.step()
    head.eval()
    with torch.no_grad():
        p = head(H).softmax(-1)
    pred = p.argmax(-1)
    for i, c in enumerate(names):
        n = int((pred == i).sum())
        print(f"   henna assigned to {c:16s} {n:4d}/{len(H)} = {n/len(H):6.1%}  "
              f"(mean conf {float(p[pred == i].max(-1).values.mean()) if n else 0:.2f})")

    print("\nCAUTION: henna is orange-brown and intricate; biro is blue-black and")
    print("sparse. A probe may be keying on colour, not on 'drawn onto skin'.")
    print("Only real pen-on-skin photographs can settle that.")


if __name__ == "__main__":
    main()
