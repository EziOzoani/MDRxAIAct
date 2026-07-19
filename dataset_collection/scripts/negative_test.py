"""
Purpose:
    Test the NEGATIVE cases the demo actually faces — no tattoo, no sticker, no
    pen — and do it stratified by Fitzpatrick skin tone, which the current
    evaluation cannot do at all.

    Why this exists. The evaluation-integrity audit found the held-out split is
    `crops[:12]` (alphabetical, despite the manifest claiming seed 1234), so the
    12 not_tattoo eval images are ALL drawn from fst_1 — the lightest tone. The
    reported not_tattoo accuracy therefore has zero coverage of darker skin, in
    a project whose UI claims "Bias Testing: Validated across skin tones". That
    claim is currently unevidenced, and this script is what would evidence or
    refute it.

    Four questions, none of which the existing evaluation answers:
      1. REJECTION BY TONE — accuracy on bare skin (no tattoo) for each of
         fst_1..fst_6 separately. A gap here is a fairness finding, and it is
         invisible in any aggregate number.
      2. OUT-OF-SCOPE — synthetic scenes belonging to no class (wall, dark room,
         desk, noise). A 4-way softmax cannot abstain, so these must be caught
         by a confidence threshold or they surface as confident nonsense; the
         served model already returns pen_drawn 0.29-0.49 on such inputs.
      3. ABSTENTION — the risk-coverage trade-off: how much accuracy is bought
         by declining the least-confident x% of inputs, and where the knee sits.
      4. CLASS WEIGHTING — whether weighting the loss by inverse class frequency
         changes negative-class behaviour, since not_tattoo is the minority
         class in balanced_lpft (388 vs 776).

    Protocol guards, following the audit's recommendations: train only on
    balanced_lpft (the sole tier with no held-out leakage), group folds by
    source image so a crop and its derived composites never straddle a split,
    and report Wilson 95% intervals so small-n differences are not read as real.

Dependencies:
    - torch, transformers (CLIP ViT-L/14), PIL, numpy
    - data/balanced_lpft/, data/not_tattoo_fitzpatrick/fst_1..6/

Usage:
    python negative_test.py

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import AutoImageProcessor, AutoModel

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
NOT_IDX = CLASSES.index("not_tattoo")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BACKBONE = "openai/clip-vit-large-patch14"


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    z, p = 1.96, k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def strip(name: str) -> str:
    for p in ("orig_", "aug_"):
        if name.startswith(p):
            return name[len(p):]
    return name


@torch.no_grad()
def embed(model, proc, imgs_or_paths, bs=32):
    out = []
    for i in range(0, len(imgs_or_paths), bs):
        chunk = imgs_or_paths[i:i + bs]
        imgs = [x if isinstance(x, Image.Image) else Image.open(x).convert("RGB")
                for x in chunk]
        h = model(**proc(images=imgs, return_tensors="pt").to(DEVICE)).last_hidden_state
        f = h[:, 0] if h.dim() == 3 else h.mean((-2, -1))
        out.append(torch.nn.functional.normalize(f, dim=-1).cpu())
    return torch.cat(out)


def mlp(X, y, seed=0, epochs=600, weights=None):
    torch.manual_seed(seed)
    net = torch.nn.Sequential(torch.nn.Linear(X.shape[1], 256), torch.nn.GELU(),
                              torch.nn.Dropout(0.2), torch.nn.Linear(256, len(CLASSES)))
    opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-4)
    lf = torch.nn.CrossEntropyLoss(weight=weights)
    for _ in range(epochs):
        opt.zero_grad()
        lf(net(X), y).backward()
        opt.step()
    net.eval()
    return net


def out_of_scope() -> list[tuple[str, Image.Image]]:
    """Scenes belonging to no class — what a webcam sees pointed at a room."""
    rng = np.random.default_rng(0)
    items = [("grey wall", Image.fromarray(np.full((400, 400, 3), 128, np.uint8))),
             ("dark room", Image.fromarray(np.full((400, 400, 3), 25, np.uint8))),
             ("random noise", Image.fromarray(rng.integers(0, 255, (400, 400, 3), dtype=np.uint8)))]
    desk = Image.new("RGB", (400, 400), (190, 185, 175))
    d = ImageDraw.Draw(desk)
    for x in (60, 150, 300):
        d.line([(x, 0), (x + 30, 400)], fill=(40, 40, 45), width=7)
    d.rectangle([200, 250, 380, 380], outline=(30, 30, 30), width=6)
    items.append(("desk edges", desk))
    paper = Image.new("RGB", (400, 400), (245, 243, 238))
    dp = ImageDraw.Draw(paper)
    for y in range(60, 360, 42):
        dp.line([(40, y), (360, y + int(rng.integers(-6, 6)))], fill=(20, 20, 60), width=4)
    items.append(("handwriting on paper", paper))
    return items


def main() -> None:
    proc = AutoImageProcessor.from_pretrained(BACKBONE)
    m = AutoModel.from_pretrained(BACKBONE).to(DEVICE).eval()
    model = m.vision_model if hasattr(m, "vision_model") else m

    # ── Training corpus: balanced_lpft only (no held-out leakage) ──
    tr_paths, tr_y = [], []
    for i, c in enumerate(CLASSES):
        for p in sorted((DATA / "balanced_lpft" / c).glob("*.png")):
            tr_paths.append(p)
            tr_y.append(i)
    tr_y = torch.tensor(tr_y)
    print(f"corpus {len(tr_paths)}  per class {[int((tr_y == i).sum()) for i in range(4)]}")

    # Bare-skin negatives per Fitzpatrick tone. Exclude the 12 held out for
    # validation, which are the alphabetical head of fst_1.
    skins = {}
    all_skin = sorted(p for d in sorted(SKIN.glob("fst_*")) for p in d.glob("*.png"))
    heldout_skin = set(p.name for p in all_skin[:12])
    for d in sorted(SKIN.glob("fst_*")):
        skins[d.name] = [p for p in sorted(d.glob("*.png")) if p.name not in heldout_skin]
    print(f"bare-skin negatives per tone: "
          f"{ {k: len(v) for k, v in skins.items()} }\n")

    Xtr = embed(model, proc, tr_paths)

    # Every Fitzpatrick skin image already sits inside balanced_lpft/not_tattoo,
    # so there is no pre-existing unseen split to score — a finding in itself.
    # Instead, hold out each tone's images by TRAINING A HEAD WITHOUT THEM, so
    # the per-tone number is an honest generalisation estimate rather than
    # recall of memorised training images.
    tr_stem = [strip(p.name) for p in tr_paths]

    counts = torch.tensor([float((tr_y == i).sum()) for i in range(len(CLASSES))])
    w = (counts.sum() / (len(CLASSES) * counts)).to(torch.float32)

    for tag, weights in [("unweighted", None), ("class-weighted", w)]:
        print("=" * 74)
        print(f"{tag.upper()}" + (f"   weights={[round(float(x), 2) for x in w]}" if weights is not None else ""))
        print("=" * 74)
        net = mlp(Xtr, tr_y, weights=weights)

        # ── 1. Bare skin, per Fitzpatrick tone ──
        print("\n1. BARE SKIN (no tattoo) — must predict not_tattoo, by skin tone")
        print("   (leave-one-tone-out: the tone under test is removed from training)")
        rates = []
        for tone, paths in skins.items():
            if not paths:
                print(f"   {tone}: no images")
                continue
            # Drop this tone's images from training, then score them.
            names = {p.name for p in paths}
            keep = torch.tensor([nm not in names for nm in tr_stem])
            held_net = mlp(Xtr[keep], tr_y[keep], weights=weights)
            X = embed(model, proc, paths)
            with torch.no_grad():
                p = held_net(X).softmax(-1)
            pred = p.argmax(-1)
            ok = int((pred == NOT_IDX).sum())
            lo, hi = wilson(ok, len(paths))
            rates.append(ok / len(paths))
            wrong = {CLASSES[c]: int((pred == c).sum()) for c in range(4)
                     if c != NOT_IDX and int((pred == c).sum())}
            print(f"   {tone}: {ok:3d}/{len(paths):3d} = {ok/len(paths):6.1%} "
                  f"[{lo:.0%}-{hi:.0%}]  mean conf {float(p.max(-1).values.mean()):.2f}"
                  + (f"   misread as {wrong}" if wrong else ""))
        if len(rates) > 1:
            print(f"   -> spread across tones: {max(rates)-min(rates):.1%} "
                  f"(best {max(rates):.1%}, worst {min(rates):.1%})")

        # ── 2. Out-of-scope scenes ──
        print("\n2. OUT-OF-SCOPE (belongs to no class) — 4-way softmax cannot abstain")
        names, imgs = zip(*out_of_scope())
        X = embed(model, proc, list(imgs))
        with torch.no_grad():
            p = net(X).softmax(-1)
        for nm, row in zip(names, p):
            i = int(row.argmax())
            flag = "caught by 0.50 threshold" if float(row[i]) < 0.5 else "REPORTED AS A FINDING"
            print(f"   {nm:22s} -> {CLASSES[i]:15s} {float(row[i]):.3f}   {flag}")

        # ── 3. Abstention / risk-coverage on held-out-style data ──
        print("\n3. ABSTENTION — accuracy vs coverage (grouped 5-fold, whole corpus)")
        groups = [f"{p.parent.name}/{strip(p.name)}" for p in tr_paths]
        uniq = sorted(set(groups))
        gidx = torch.tensor([uniq.index(g) for g in groups])
        g = torch.Generator().manual_seed(0)
        gperm = torch.randperm(len(uniq), generator=g)
        confs, corrects = [], []
        for f in range(5):
            vg = set(gperm[f::5].tolist())
            mask = torch.tensor([int(x) in vg for x in gidx])
            va, tr = mask.nonzero().squeeze(-1), (~mask).nonzero().squeeze(-1)
            n2 = mlp(Xtr[tr], tr_y[tr], weights=weights)
            with torch.no_grad():
                pp = n2(Xtr[va]).softmax(-1)
            confs.append(pp.max(-1).values)
            corrects.append((pp.argmax(-1) == tr_y[va]).float())
        conf = torch.cat(confs)
        corr = torch.cat(corrects)
        order = conf.argsort(descending=True)
        for cov in (1.0, 0.9, 0.8, 0.7, 0.5):
            k = max(1, int(len(order) * cov))
            acc = float(corr[order[:k]].mean())
            thr = float(conf[order[k - 1]])
            print(f"   coverage {cov:4.0%}  accuracy {acc:6.1%}  (threshold >= {thr:.2f}, n={k})")
        print()


if __name__ == "__main__":
    main()
