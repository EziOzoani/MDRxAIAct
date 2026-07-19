"""
Purpose:
    Decide what to actually deploy for out-of-scope rejection, because the
    shipped mechanism does not survive the model we want to ship.

    The problem, measured. A CLIP-L/14 + MLP head reaches ~88% cross-validated
    (vs 81.2% for the served ViT) but is wildly overconfident on input belonging
    to no class: random noise -> pen_drawn 0.999, handwriting on paper ->
    pen_drawn 0.999, desk edges -> pen_drawn 0.987. The 0.50 confidence
    threshold currently deployed catches 3 of 5 such inputs on the served ViT
    and 0 of 5 on CLIP. Confidence thresholding is therefore not a viable guard
    for the better model, and this is the expected direction: label noise
    degrades calibration roughly 3.6x faster than it degrades accuracy.

    Candidate detectors scored here, all post-hoc on frozen features so nothing
    needs retraining:
      msp          — max softmax probability (what is deployed today)
      energy       — logsumexp over logits; not squashed by softmax, so it can
                     separate "confidently one class" from "far from all data"
      maxlogit     — max raw logit
      mahalanobis  — distance to the nearest class-conditional Gaussian fitted
                     on training features
      knn          — cosine distance to the k-th nearest training embedding,
                     which makes no distributional assumption at all
      entropy      — predictive entropy over the 4 classes

    Scored on a real detection task rather than anecdotes: IN = the training
    distribution (held-out fold), OUT = synthetic scenes (wall, desk, noise,
    paper) PLUS a genuinely disjoint natural-image set drawn from the tiers'
    own object negatives (food/flower/animal), which are real photographs of
    things that are not tattoos and not skin.

    Reported per detector: AUROC (threshold-free ranking quality), FPR@95TPR
    (the operational number — how much junk gets through while keeping 95% of
    genuine inputs), and the accuracy retained on in-distribution data.

Dependencies:
    - torch, transformers (CLIP ViT-L/14), PIL, numpy
    - data/balanced_lpft/, data/balanced/not_tattoo (object negatives)

Usage:
    python ood_test.py

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw
from transformers import AutoImageProcessor, AutoModel

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
BACKBONE = "openai/clip-vit-large-patch14"


def strip(n: str) -> str:
    for p in ("orig_", "aug_"):
        if n.startswith(p):
            return n[len(p):]
    return n


@torch.no_grad()
def embed(model, proc, items, bs=32):
    out = []
    for i in range(0, len(items), bs):
        chunk = items[i:i + bs]
        imgs = [x if isinstance(x, Image.Image) else Image.open(x).convert("RGB")
                for x in chunk]
        h = model(**proc(images=imgs, return_tensors="pt").to(DEVICE)).last_hidden_state
        f = h[:, 0] if h.dim() == 3 else h.mean((-2, -1))
        out.append(torch.nn.functional.normalize(f, dim=-1).cpu())
    return torch.cat(out)


def mlp(X, y, seed=0, epochs=600):
    torch.manual_seed(seed)
    net = torch.nn.Sequential(torch.nn.Linear(X.shape[1], 256), torch.nn.GELU(),
                              torch.nn.Dropout(0.2), torch.nn.Linear(256, len(CLASSES)))
    opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-4)
    lf = torch.nn.CrossEntropyLoss()
    for _ in range(epochs):
        opt.zero_grad()
        lf(net(X), y).backward()
        opt.step()
    net.eval()
    return net


def synthetic_ood():
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


def auroc(pos: np.ndarray, neg: np.ndarray) -> float:
    """P(score(in) > score(out)); higher score must mean 'more in-distribution'."""
    lab = np.r_[np.ones(len(pos)), np.zeros(len(neg))]
    sc = np.r_[pos, neg]
    order = sc.argsort()
    ranks = np.empty_like(order, dtype=float)
    ranks[order] = np.arange(1, len(sc) + 1)
    n1, n0 = lab.sum(), len(lab) - lab.sum()
    return float((ranks[lab == 1].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def fpr_at_tpr(pos: np.ndarray, neg: np.ndarray, tpr=0.95) -> float:
    """Fraction of OOD accepted while retaining `tpr` of in-distribution."""
    thr = np.quantile(pos, 1 - tpr)
    return float((neg >= thr).mean())


def main() -> None:
    proc = AutoImageProcessor.from_pretrained(BACKBONE)
    m = AutoModel.from_pretrained(BACKBONE).to(DEVICE).eval()
    model = m.vision_model if hasattr(m, "vision_model") else m

    tr_paths, tr_y = [], []
    for i, c in enumerate(CLASSES):
        for p in sorted((DATA / "balanced_lpft" / c).glob("*.png")):
            tr_paths.append(p)
            tr_y.append(i)
    tr_y = torch.tensor(tr_y)

    # Natural OOD: real photographs of objects that are neither tattoo nor skin.
    nat = [p for p in sorted((DATA / "balanced" / "not_tattoo").glob("*.png"))
           if re.match(r"^(food|flower|animal)", p.name)]
    print(f"corpus {len(tr_paths)} | natural OOD {len(nat)} | synthetic OOD {len(synthetic_ood())}")

    X = embed(model, proc, tr_paths)
    Xn = embed(model, proc, nat) if nat else torch.empty(0, X.shape[1])
    Xs = embed(model, proc, synthetic_ood())

    # Held-out split, grouped by source so composites do not leak.
    groups = [f"{p.parent.name}/{strip(p.name)}" for p in tr_paths]
    uniq = sorted(set(groups))
    gid = torch.tensor([uniq.index(g) for g in groups])
    g = torch.Generator().manual_seed(0)
    gperm = torch.randperm(len(uniq), generator=g)
    vg = set(gperm[:len(uniq) // 5].tolist())
    vm = torch.tensor([int(x) in vg for x in gid])
    Xtr, ytr, Xva, yva = X[~vm], tr_y[~vm], X[vm], tr_y[vm]

    net = mlp(Xtr, ytr)
    with torch.no_grad():
        acc = float((net(Xva).argmax(-1) == yva).float().mean())
    print(f"in-distribution accuracy (held-out fold, n={len(yva)}): {acc:.1%}\n")

    # Class-conditional Gaussians for Mahalanobis, fitted on training features.
    mus, prec = [], None
    Xc = Xtr.numpy()
    cov = np.cov((Xc - np.vstack([Xc[ytr.numpy() == c].mean(0) for c in ytr.numpy()])).T)
    prec = np.linalg.pinv(cov + 1e-3 * np.eye(cov.shape[0]))
    for c in range(len(CLASSES)):
        mus.append(Xc[ytr.numpy() == c].mean(0))

    def scores(Z: torch.Tensor) -> dict[str, np.ndarray]:
        with torch.no_grad():
            logits = net(Z)
            p = logits.softmax(-1)
        Zn = Z.numpy()
        maha = -np.min(np.stack([
            np.einsum("ij,jk,ik->i", Zn - mu, prec, Zn - mu) for mu in mus]), 0)
        knn = (Z @ Xtr.T).topk(min(10, Xtr.shape[0]), dim=-1).values[:, -1].numpy()
        return {
            "msp": p.max(-1).values.numpy(),
            "energy": torch.logsumexp(logits, -1).numpy(),
            "maxlogit": logits.max(-1).values.numpy(),
            "entropy": (-(p * p.clamp_min(1e-9).log()).sum(-1)).neg().numpy(),
            "mahalanobis": maha,
            "knn": knn,
        }

    s_in, s_nat, s_syn = scores(Xva), (scores(Xn) if len(Xn) else None), scores(Xs)

    print(f"{'detector':14s} {'AUROC nat':>10s} {'FPR@95 nat':>11s} "
          f"{'AUROC syn':>10s} {'FPR@95 syn':>11s}")
    print("-" * 60)
    rows = []
    for k in s_in:
        a_n = auroc(s_in[k], s_nat[k]) if s_nat else float("nan")
        f_n = fpr_at_tpr(s_in[k], s_nat[k]) if s_nat else float("nan")
        a_s = auroc(s_in[k], s_syn[k])
        f_s = fpr_at_tpr(s_in[k], s_syn[k])
        rows.append((k, a_n, f_n, a_s, f_s))
        print(f"{k:14s} {a_n:10.3f} {f_n:11.1%} {a_s:10.3f} {f_s:11.1%}")

    best = max(rows, key=lambda r: (0 if np.isnan(r[1]) else r[1]) + r[3])
    print(f"\nBest overall: {best[0]}")
    print("AUROC 0.5 = useless, 1.0 = perfect. FPR@95TPR is the operational number:")
    print("the share of out-of-scope input accepted while keeping 95% of real input.")


if __name__ == "__main__":
    main()
