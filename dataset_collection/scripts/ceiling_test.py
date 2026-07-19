"""
Purpose:
    Answer "what accuracy is reachable once the DATA is fixed?" without first
    collecting new data, by measuring the sub-problems whose labels are already
    trustworthy and treating those as the ceiling.

    Audit findings this is built on (two independent agents + manual inspection):
      real_tattoo    ~95%+ correct, but 99.8% from ONE source (tatvton)
      not_tattoo     ~100% correct, but degenerate — noise, gradients, solid fills
      sticker_tattoo ~20% correct, plus ~25-30% henna (no class exists for it)
      pen_drawn      ~2%  correct — a keyword scrape of "pen": stationery,
                     notebooks, people writing on PAPER. Verified: images of a
                     hand writing in a cafe are labelled pen_drawn and BOTH
                     models agree at 0.97+.

    Arms, in increasing order of how much repair is assumed:
      A 4-class, as-is                  — today's number, the honest baseline
      B 3-class, pen_drawn dropped      — what removing the broken class buys
      C 2-class, real vs not_tattoo     — the only pair with sound labels both sides
      D 2-class, real vs sticker        — the distinction the demo actually claims
      E 4-class on consensus subset     — optimistic; NOTE this filter is known
                                          broken for pen_drawn (both models agree
                                          with wrong labels), so E is an UPPER
                                          bound, not an estimate

    Guards against the mistakes already made on this project:
      - the eval crops come from data/balanced while training uses balanced_lpft,
        which the leakage audit confirmed is the only clean pairing (all other
        tiers leak 12/12 held-out crops per class);
      - every arm is 5-fold cross-validated over the full corpus AND scored on
        the held-out crops and the real demo photos, because a 48-image set
        moves 2.1pp per image and produced a false "breakthrough" earlier;
      - 3 seeds per arm with the spread reported, so a ranking is never read off
        run-to-run noise;
      - Wilson 95% intervals printed, so differences that are not statistically
        distinguishable are not presented as wins.

Dependencies:
    - torch, transformers (CLIP), PIL
    - data/balanced_lpft/, val_heldout_manifest.json, curation_manifest.json

Usage:
    python ceiling_test.py [--backbone openai/clip-vit-large-patch14]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
EXAMPLES = Path(os.environ.get("EXAMPLES_DIR", BASE.parent / "public/images/examples"))
ALL = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
SEEDS = [0, 1, 2]

DEMO = {"real_tattoo_1.png": "real_tattoo", "real_tattoo_2.png": "real_tattoo",
        "tattoo_example.png": "real_tattoo", "sticker_tattoo.png": "sticker_tattoo",
        "sticker_tattoo_2.png": "sticker_tattoo",
        "sticker_tattoo_example.png": "sticker_tattoo",
        "sharpie_tattoo_example.png": "pen_drawn"}

ARMS = [
    ("A  4-class as-is",            ALL,                              False),
    ("B  3-class (no pen_drawn)",   ["real_tattoo", "sticker_tattoo", "not_tattoo"], False),
    ("C  2-class real vs none",     ["real_tattoo", "not_tattoo"],     False),
    ("D  2-class real vs sticker",  ["real_tattoo", "sticker_tattoo"], False),
    ("E  4-class consensus-only",   ALL,                              True),
]


def wilson(k: int, n: int) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    z, p = 1.96, k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def load(hub):
    proc = AutoImageProcessor.from_pretrained(hub)
    m = AutoModel.from_pretrained(hub).to(DEVICE).eval()
    return proc, (m.vision_model if hasattr(m, "vision_model") else m)


@torch.no_grad()
def embed(model, proc, paths, bs=32):
    out = []
    for i in range(0, len(paths), bs):
        imgs = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
        h = model(**proc(images=imgs, return_tensors="pt").to(DEVICE)).last_hidden_state
        f = h[:, 0] if h.dim() == 3 else h.mean((-2, -1))
        out.append(torch.nn.functional.normalize(f, dim=-1).cpu())
    return torch.cat(out)


def mlp(X, y, ncls, seed=0, epochs=600):
    torch.manual_seed(seed)
    net = torch.nn.Sequential(torch.nn.Linear(X.shape[1], 256), torch.nn.GELU(),
                              torch.nn.Dropout(0.2), torch.nn.Linear(256, ncls))
    opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-4)
    lf = torch.nn.CrossEntropyLoss()
    for _ in range(epochs):
        opt.zero_grad()
        lf(net(X), y).backward()
        opt.step()
    net.eval()
    return net


def consensus_ok():
    man = BASE / "curation_manifest.json"
    if not man.exists():
        return None
    d = {}
    for r in json.loads(man.read_text())["records"]:
        cls, fn = r["path"].split("/", 1)
        d[(cls, fn)] = (r["label"] == r["vit"] == r["clip"])
    return d


def strip(name: str) -> str:
    """Recover the source filename from a balanced_lpft entry.

    balanced_lpft holds orig_<name>.png crops AND wide_<NNNNN>.png composites
    derived from them. Only orig_/aug_ carry a recoverable source name; wide_
    composites were renamed sequentially by make_lpft_data.py, destroying
    provenance, so they cannot be resolved against the curation manifest.
    """
    for p in ("orig_", "aug_"):
        if name.startswith(p):
            return name[len(p):]
    return name


def resolvable(name: str) -> bool:
    """wide_ composites have no recoverable source name; treating them as
    'clean by default' is what silently neutralised the earlier experiment."""
    return not name.startswith("wide_")


def group_key(p: Path) -> str:
    """Fold-grouping key. A crop and any composite derived from it must never
    straddle a fold boundary, or cross-validation grades itself."""
    return f"{p.parent.name}/{strip(p.name)}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backbone", default="openai/clip-vit-large-patch14")
    ap.add_argument("--arms", default="all", help="comma list of arm prefixes, e.g. A,C")
    args = ap.parse_args()

    proc, model = load(args.backbone)
    cons = consensus_ok()

    # Corpus (training) — balanced_lpft is the ONLY tier free of held-out leakage.
    tr_paths, tr_cls = [], []
    for c in ALL:
        for p in sorted((DATA / "balanced_lpft" / c).glob("*.png")):
            tr_paths.append(p)
            tr_cls.append(c)

    held = json.loads((BASE / "val_heldout_manifest.json").read_text())["heldout_crops"]
    ho_paths, ho_cls = [], []
    for c in ["real_tattoo", "sticker_tattoo", "pen_drawn"]:
        for n in held[c]:
            p = DATA / "balanced" / c / n
            if p.exists():
                ho_paths.append(p)
                ho_cls.append(c)
    for n in held.get("not_tattoo", []):
        for d in sorted((DATA / "not_tattoo_fitzpatrick").glob("fst_*")):
            if (d / n).exists():
                ho_paths.append(d / n)
                ho_cls.append("not_tattoo")
                break

    dm_paths = [EXAMPLES / f for f in DEMO if (EXAMPLES / f).exists()]
    dm_cls = [DEMO[p.name] for p in dm_paths]

    print(f"corpus {len(tr_paths)} | held-out {len(ho_paths)} | demo {len(dm_paths)}")
    print(f"backbone {args.backbone}\n")
    Xtr, Xho, Xdm = (embed(model, proc, tr_paths), embed(model, proc, ho_paths),
                     embed(model, proc, dm_paths))

    wanted = None if args.arms == "all" else {a.strip() for a in args.arms.split(",")}
    for title, classes, use_cons in ARMS:
        if wanted is not None and title.split()[0] not in wanted:
            continue
        idx = [i for i, c in enumerate(tr_cls) if c in classes]
        if use_cons and cons is not None:
            # Unresolvable (wide_) images are DROPPED, not assumed clean.
            idx = [i for i in idx
                   if resolvable(tr_paths[i].name)
                   and cons.get((tr_paths[i].parent.name, strip(tr_paths[i].name)), False)]
        cmap = {c: j for j, c in enumerate(classes)}
        X, y = Xtr[idx], torch.tensor([cmap[tr_cls[i]] for i in idx])

        hidx = [i for i, c in enumerate(ho_cls) if c in classes]
        didx = [i for i, c in enumerate(dm_cls) if c in classes]
        Xh, yh = Xho[hidx], torch.tensor([cmap[ho_cls[i]] for i in hidx])
        Xd, yd = Xdm[didx], torch.tensor([cmap[dm_cls[i]] for i in didx])

        groups = [group_key(tr_paths[i]) for i in idx]
        uniq = sorted(set(groups))
        gidx = torch.tensor([uniq.index(g) for g in groups])

        cvs, hos, dms = [], [], []
        for sd in SEEDS:
            g = torch.Generator().manual_seed(sd)
            gperm = torch.randperm(len(uniq), generator=g)
            ok = tot = 0
            for f in range(5):
                # Assign whole GROUPS to the validation fold, so a crop and the
                # composites derived from it stay on the same side of the split.
                vg = set(gperm[f::5].tolist())
                m = torch.tensor([int(gi) in vg for gi in gidx])
                va, tr = m.nonzero().squeeze(-1), (~m).nonzero().squeeze(-1)
                if len(va) == 0 or len(tr) == 0:
                    continue
                net = mlp(X[tr], y[tr], len(classes), seed=sd)
                with torch.no_grad():
                    ok += int((net(X[va]).argmax(-1) == y[va]).sum())
                tot += len(va)
            cvs.append(ok / tot)
            net = mlp(X, y, len(classes), seed=sd)
            with torch.no_grad():
                hos.append(float((net(Xh).argmax(-1) == yh).float().mean()) if len(yh) else float("nan"))
                dms.append(float((net(Xd).argmax(-1) == yd).float().mean()) if len(yd) else float("nan"))

        cv = sum(cvs) / len(cvs)
        lo, hi = wilson(int(round(cv * tot)), tot)
        chance = 1.0 / len(classes)
        print(f"{title}")
        print(f"    n={len(y):5d}  {len(classes)}-class (chance {chance:.0%})")
        print(f"    CV        {cv:6.1%}  [95% CI {lo:.1%}-{hi:.1%}]  spread {max(cvs)-min(cvs):.1%}")
        print(f"    held-out  {sum(hos)/len(hos):6.1%}  (n={len(yh)})")
        print(f"    demo      {sum(dms)/len(dms):6.1%}  (n={len(yd)})\n")

    print("Baseline: served fine-tuned ViT = 81.2% held-out (4-class).")
    print("Arm C is the cleanest-labelled pair; treat it as the practical ceiling.")
    print("Arm E is an UPPER bound only — its filter is known broken for pen_drawn.")


if __name__ == "__main__":
    main()
