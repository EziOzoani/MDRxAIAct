"""
Purpose:
    Test a two-stage pipeline: FIRST ask "is there skin / a body part in this
    image at all?", and only then classify tattoo / sticker / pen / none.

    Why a gate rather than the ROI crop that was already rejected. Prior
    research killed detect-then-CROP on three grounds: MediaPipe's detector is
    face-anchored and fails on a bare forearm, Grounding DINO is ~5s/image on
    CPU, and no candidate publishes skin-tone-stratified evaluation. A GATE is a
    different mechanism — it rejects rather than localises, so it needs no
    bounding box and cannot mis-crop. It also targets the one failure k-NN
    rejection could not fix: on natural out-of-scope photographs (food, flowers,
    animals) k-NN still accepted 72.5% at 95% TPR, while catching 100% of
    synthetic scenes.

    The gate here is CLIP zero-shot, which costs nothing extra because CLIP is
    already loaded for the reference classifier. That sidesteps the fairness
    objection to bolting on an unaudited third-party skin detector — but only if
    CLIP itself is fair on this task, which is exactly what this measures.

    Three questions:
      1. DOES IT WORK — can prompt-only CLIP separate "skin present" from
         "no skin"? Reported as AUROC and FPR@95TPR against BOTH natural
         negatives (real photos of food/flowers/animals) and synthetic scenes.
      2. IS IT FAIR — gate acceptance rate for bare skin per Fitzpatrick tone
         fst_1..fst_6. Under-detection on darker skin is the silent failure
         mode that matters: those users would never reach the classifier at
         all, so they would never appear in classifier accuracy statistics.
      3. IS IT WORTH IT — does gating beat the k-NN feature-distance rejection
         already measured, on the same negatives?

Dependencies:
    - torch, transformers (CLIP), PIL, numpy
    - data/not_tattoo_fitzpatrick/fst_1..6, data/balanced/*

Usage:
    python gate_test.py

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import math
import re
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import CLIPModel, CLIPProcessor

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
HUB = "openai/clip-vit-large-patch14"

# Deliberately several templates per side, averaged: single prompts are brittle,
# and a gate that hinges on one phrasing is not a gate.
SKIN_PROMPTS = [
    "a close-up photo of human skin",
    "a photo of a person's arm",
    "a photo of a hand or leg",
    "bare human skin",
    "a part of a human body",
]
NOT_SKIN_PROMPTS = [
    "a photo of an object",
    "a photo of food",
    "a photo of a plant or flower",
    "an empty room or wall",
    "a piece of paper or a document",
    "an animal",
]


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    z, p = 1.96, k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def auroc(pos: np.ndarray, neg: np.ndarray) -> float:
    lab = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
    sc = np.r_[pos, neg]
    o = sc.argsort()
    r = np.empty_like(o, dtype=float)
    r[o] = np.arange(1, len(sc) + 1)
    n1, n0 = lab.sum(), len(lab) - lab.sum()
    return float((r[lab == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def fpr_at_tpr(pos: np.ndarray, neg: np.ndarray, tpr=0.95) -> float:
    thr = np.quantile(pos, 1 - tpr)
    return float((neg >= thr).mean())


def synthetic():
    rng = np.random.default_rng(0)
    out = [Image.fromarray(np.full((400, 400, 3), v, np.uint8)) for v in (128, 25, 200)]
    out.append(Image.fromarray(rng.integers(0, 255, (400, 400, 3), dtype=np.uint8)))
    for seed in range(6):
        r = np.random.default_rng(seed)
        desk = Image.new("RGB", (400, 400), (190, 185, 175))
        d = ImageDraw.Draw(desk)
        for x in r.integers(20, 380, 4):
            d.line([(int(x), 0), (int(x) + 30, 400)], fill=(40, 40, 45), width=7)
        out.append(desk)
        paper = Image.new("RGB", (400, 400), (245, 243, 238))
        dp = ImageDraw.Draw(paper)
        for y in range(60, 360, 42):
            dp.line([(40, y), (360, y + int(r.integers(-6, 6)))], fill=(20, 20, 60), width=4)
        out.append(paper)
    return out


def main() -> None:
    model = CLIPModel.from_pretrained(HUB).to(DEVICE).eval()
    proc = CLIPProcessor.from_pretrained(HUB)

    with torch.no_grad():
        def proto(prompts):
            t = proc(text=prompts, return_tensors="pt", padding=True).to(DEVICE)
            f = torch.nn.functional.normalize(model.get_text_features(**t), dim=-1)
            return torch.nn.functional.normalize(f.mean(0), dim=0)
        P = torch.stack([proto(SKIN_PROMPTS), proto(NOT_SKIN_PROMPTS)]).cpu()

    @torch.no_grad()
    def gate(items, bs=32) -> np.ndarray:
        """P(skin) from the two-prototype contrast. Higher = more likely skin."""
        out = []
        for i in range(0, len(items), bs):
            imgs = [x if isinstance(x, Image.Image) else Image.open(x).convert("RGB")
                    for x in items[i:i + bs]]
            inp = proc(images=imgs, return_tensors="pt").to(DEVICE)
            f = torch.nn.functional.normalize(model.get_image_features(**inp), dim=-1).cpu()
            out.append((100.0 * f @ P.T).softmax(-1)[:, 0].numpy())
        return np.concatenate(out)

    # ── Positives: bare skin per tone, and the three tattoo classes ──
    tones = {d.name: sorted(d.glob("*.png")) for d in sorted(SKIN.glob("fst_*"))}
    tattoo = []
    for c in ("real_tattoo", "sticker_tattoo", "pen_drawn"):
        tattoo += sorted((DATA / "balanced" / c).glob("*.png"))[:120]

    # ── Negatives: real object photos, and synthetic scenes ──
    nat = [p for p in sorted((DATA / "balanced" / "not_tattoo").glob("*.png"))
           if re.match(r"^(food|flower|animal)", p.name)]
    syn = synthetic()

    print(f"skin per tone {[len(v) for v in tones.values()]} | tattoo {len(tattoo)} "
          f"| natural neg {len(nat)} | synthetic neg {len(syn)}\n")

    s_tone = {k: gate(v) for k, v in tones.items()}
    s_skin = np.concatenate(list(s_tone.values()))
    s_tat, s_nat, s_syn = gate(tattoo), (gate(nat) if nat else np.array([])), gate(syn)
    s_pos = np.r_[s_skin, s_tat]

    print("1. DOES THE GATE WORK  (positives = skin + tattoo photos)")
    if len(s_nat):
        print(f"   vs natural objects : AUROC {auroc(s_pos, s_nat):.3f}   "
              f"FPR@95TPR {fpr_at_tpr(s_pos, s_nat):6.1%}")
    print(f"   vs synthetic scenes: AUROC {auroc(s_pos, s_syn):.3f}   "
          f"FPR@95TPR {fpr_at_tpr(s_pos, s_syn):6.1%}")
    print(f"   (k-NN rejection measured earlier: natural 72.5%, synthetic 0.0%)")

    # Operating point: keep 95% of genuine inputs.
    thr = float(np.quantile(s_pos, 0.05))
    print(f"\n2. FAIRNESS — gate acceptance of BARE SKIN by tone (threshold {thr:.3f})")
    rates = []
    for tone, sc in s_tone.items():
        ok = int((sc >= thr).sum())
        lo, hi = wilson(ok, len(sc))
        rates.append(ok / len(sc))
        print(f"   {tone}: {ok:3d}/{len(sc):3d} = {ok/len(sc):6.1%} [{lo:.0%}-{hi:.0%}]  "
              f"mean P(skin) {sc.mean():.3f}")
    if rates:
        print(f"   -> spread across tones: {max(rates)-min(rates):.1%} "
              f"(best {max(rates):.1%}, worst {min(rates):.1%})")
        print("   A gap here is the SILENT failure mode: those users never reach")
        print("   the classifier, so they never appear in its accuracy figures.")

    print(f"\n3. WHAT GETS REJECTED at that threshold")
    for name, sc in (("bare skin", s_skin), ("tattoo photos", s_tat),
                     ("natural objects", s_nat), ("synthetic scenes", s_syn)):
        if len(sc):
            print(f"   {name:18s} accepted {float((sc >= thr).mean()):6.1%}  "
                  f"mean P(skin) {sc.mean():.3f}")


if __name__ == "__main__":
    main()
