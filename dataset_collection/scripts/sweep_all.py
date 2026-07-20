"""
Purpose:
    Full-dataset sweep over every approach still live for this 4-class task,
    run as one job so the arms are directly comparable — same data, same folds,
    same eval sets.

    Motivation. A frozen DINOv2 ViT-B/14 + linear probe scored 89.6% on the 48
    held-out real photographs against 81.2% for the fine-tuned ViT baseline
    (3 seeds, 0.0% spread). That was measured on a 300/class subsample and on
    only 48 eval images, where one image is worth 2.1pp. This sweep re-runs the
    comparison on the FULL corpus with k-fold cross-validation, so the ranking
    rests on thousands of predictions rather than dozens.

    Arms:
      backbones — DINOv2 B/14, DINOv2 L/14, SigLIP B/16, CLIP L/14,
                  ConvNeXt-V2, EVA-02, plus the in21k ViT the backend serves
      heads     — linear probe, k-NN (k=5, cosine), MLP
      labels    — full noisy set vs consensus-filtered (label == ViT == CLIP),
                  which tests directly whether cleaning buys accuracy
      TTA       — horizontal flip averaging
      ensemble  — mean of the top backbones' probabilities

    Evaluation, weakest assumption first:
      1. 5-fold CV over the full corpus     — thousands of predictions
      2. 48 held-out real photographs       — small but genuinely unseen
      3. 7 real demo photos                 — the deployment distribution

    Embeddings are computed ONCE per backbone and reused across every head,
    label variant and fold; the expensive part runs 7 times, not 7x3x2 times.

Dependencies:
    - torch, transformers, PIL
    - data/balanced_lpft/{class}/*.png, val_heldout_manifest.json,
      curation_manifest.json, demo_examples/

Usage:
    python sweep_all.py [--folds 5] [--out sweep_results.json]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import torch
from PIL import Image
from transformers import AutoImageProcessor, AutoModel

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
# Overridden by --tier: the rebuilt taxonomy replaces the keyword-scraped
# pen_drawn with drawn_on_skin (henna + marker), so the class list differs.
TIER_CLASSES = {
    "balanced_lpft": ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"],
    "balanced_drawn": ["real_tattoo", "sticker_tattoo", "drawn_on_skin", "not_tattoo"],
}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
EXAMPLES = Path(os.environ.get("EXAMPLES_DIR", BASE.parent / "public/images/examples"))

BACKBONES = [
    ("DINOv2-B/14", "facebook/dinov2-base"),
    ("DINOv2-L/14", "facebook/dinov2-large"),
    ("SigLIP-B/16", "google/siglip-base-patch16-224"),
    ("CLIP-L/14", "openai/clip-vit-large-patch14"),
    ("ConvNeXtV2-B", "facebook/convnextv2-base-22k-224"),
    ("EVA02-B", "timm/eva02_base_patch14_224.mim_in22k"),
    ("ViT-in21k (served)", "google/vit-base-patch16-224-in21k"),
]

DEMO_LABELS = {
    "real_tattoo_1.png": "real_tattoo", "real_tattoo_2.png": "real_tattoo",
    "tattoo_example.png": "real_tattoo", "sticker_tattoo.png": "sticker_tattoo",
    "sticker_tattoo_2.png": "sticker_tattoo",
    "sticker_tattoo_example.png": "sticker_tattoo",
    "sharpie_tattoo_example.png": "pen_drawn",
}


def load_backbone(hub: str):
    proc = AutoImageProcessor.from_pretrained(hub)
    model = AutoModel.from_pretrained(hub, trust_remote_code=True).to(DEVICE).eval()
    if hasattr(model, "vision_model"):
        model = model.vision_model
    return proc, model


@torch.no_grad()
def embed(model, proc, paths, bs=32, tta=False):
    out = []
    for i in range(0, len(paths), bs):
        imgs = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
        views = [imgs]
        if tta:
            views.append([im.transpose(Image.FLIP_LEFT_RIGHT) for im in imgs])
        acc = None
        for v in views:
            inp = proc(images=v, return_tensors="pt").to(DEVICE)
            o = model(**inp)
            h = o.last_hidden_state
            f = h[:, 0] if h.dim() == 3 else h.mean((-2, -1))
            f = torch.nn.functional.normalize(f, dim=-1)
            acc = f if acc is None else acc + f
        out.append(torch.nn.functional.normalize(acc, dim=-1).cpu())
    return torch.cat(out)


def linear_probe(X, y, seed=0, epochs=600):
    torch.manual_seed(seed)
    head = torch.nn.Linear(X.shape[1], len(CLASSES))
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-4)
    lf = torch.nn.CrossEntropyLoss()
    for _ in range(epochs):
        opt.zero_grad()
        lf(head(X), y).backward()
        opt.step()
    return lambda Z: head(Z).softmax(-1)


def mlp_probe(X, y, seed=0, epochs=600):
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
    return lambda Z: net(Z).softmax(-1)


def knn_probe(X, y, k=5):
    def f(Z):
        sims = Z @ X.T
        idx = sims.topk(min(k, X.shape[0]), dim=-1).indices
        votes = torch.zeros(Z.shape[0], len(CLASSES))
        for c in range(len(CLASSES)):
            votes[:, c] = (y[idx] == c).float().sum(-1)
        return votes / votes.sum(-1, keepdim=True).clamp(min=1)
    return f


HEADS = {"linear": linear_probe, "mlp": mlp_probe, "knn": lambda X, y, seed=0: knn_probe(X, y)}


def collect_train(tier="balanced_lpft"):
    paths, ys = [], []
    for i, c in enumerate(CLASSES):
        for p in sorted((DATA / tier / c).glob("*.png")):
            paths.append(p)
            ys.append(i)
    return paths, torch.tensor(ys)


def collect_heldout():
    held = json.loads((BASE / "val_heldout_manifest.json").read_text())["heldout_crops"]
    paths, ys = [], []
    for c in ["real_tattoo", "sticker_tattoo", "pen_drawn"]:
        if c not in CLASSES:
            # Class absent from the active taxonomy (pen_drawn under the
            # rebuild). Its held-out crops have no valid target, so exclude
            # them instead of forcing them into a class they do not belong to.
            continue
        for n in held[c]:
            p = DATA / "balanced" / c / n
            if p.exists():
                paths.append(p)
                ys.append(CLASSES.index(c))
    for n in held.get("not_tattoo", []):
        for d in sorted((DATA / "not_tattoo_fitzpatrick").glob("fst_*")):
            if (d / n).exists():
                paths.append(d / n)
                ys.append(CLASSES.index("not_tattoo"))
                break
    return paths, torch.tensor(ys)


def clean_mask(train_paths):
    """True where the stored label agrees with BOTH independent judges.

    balanced_lpft/ prefixes its filenames ("orig_foo.png") whereas the curation
    manifest indexes data/balanced ("foo.png"), so matching must be done on the
    stripped stem or every lookup misses and the clean arm silently trains on
    nothing.
    """
    man_p = BASE / "curation_manifest.json"
    if not man_p.exists():
        return None
    verdict = {}
    for r in json.loads(man_p.read_text())["records"]:
        cls, fname = r["path"].split("/", 1)
        verdict[(cls, fname)] = (r["label"] == r["vit"] == r["clip"])

    def is_clean(p: Path) -> bool:
        name = p.name
        for pref in ("orig_", "aug_"):
            if name.startswith(pref):
                name = name[len(pref):]
                break
        v = verdict.get((p.parent.name, name))
        # Unknown images (augmented variants with no manifest entry) are kept:
        # dropping them would confound "cleaner labels" with "less data".
        return True if v is None else v

    return torch.tensor([is_clean(p) for p in train_paths])


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--tier", default="balanced_lpft")
    ap.add_argument("--out", default=str(BASE / "sweep_results.json"))
    args = ap.parse_args()

    global CLASSES
    CLASSES = TIER_CLASSES.get(args.tier, CLASSES)
    tr_paths, tr_y = collect_train(args.tier)
    ho_paths, ho_y = collect_heldout()
    demo = [(EXAMPLES / f, CLASSES.index(c)) for f, c in DEMO_LABELS.items()
            if (EXAMPLES / f).exists() and c in CLASSES]
    dm_paths = [p for p, _ in demo]
    dm_y = torch.tensor([y for _, y in demo])
    cmask = clean_mask(tr_paths)

    print(f"train {len(tr_paths)} | held-out real {len(ho_paths)} | demo {len(dm_paths)}")
    print(f"consensus-clean training images: {int(cmask.sum()) if cmask is not None else 'n/a'}"
          f" of {len(tr_paths)}")
    print(f"per class: {[int((tr_y == i).sum()) for i in range(len(CLASSES))]}\n")

    results, prob_cache = [], {}

    for name, hub in BACKBONES:
        try:
            proc, model = load_backbone(hub)
        except Exception as e:
            print(f"{name:20s} SKIP ({type(e).__name__}: {str(e)[:70]})")
            continue

        Xtr = embed(model, proc, tr_paths)
        Xho = embed(model, proc, ho_paths, tta=True)
        Xdm = embed(model, proc, dm_paths, tta=True)

        for label_set in (["noisy", "clean"] if cmask is not None else ["noisy"]):
            sel = torch.ones(len(tr_paths), dtype=torch.bool) if label_set == "noisy" else cmask
            if int(sel.sum()) < 4 * args.folds:
                print(f"  {name:20s} {label_set:5s} SKIP — only {int(sel.sum())} images")
                continue
            Xs, ys = Xtr[sel], tr_y[sel]

            for hname, hfn in HEADS.items():
                # 1. k-fold CV over the full corpus
                n = Xs.shape[0]
                g = torch.Generator().manual_seed(0)
                perm = torch.randperm(n, generator=g)
                correct = total = 0
                for f in range(args.folds):
                    mask = torch.zeros(n, dtype=torch.bool)
                    mask[perm[f::args.folds]] = True
                    va, tr = perm.new_tensor(mask.nonzero().squeeze(-1)), (~mask).nonzero().squeeze(-1)
                    if len(tr) == 0 or len(va) == 0:
                        continue
                    pred = hfn(Xs[tr], ys[tr])(Xs[va]).argmax(-1)
                    correct += int((pred == ys[va]).sum())
                    total += len(va)
                if total == 0:
                    continue
                cv = correct / total

                # 2/3. held-out real + demo, trained on everything
                f_all = hfn(Xs, ys)
                pho, pdm = f_all(Xho), f_all(Xdm)
                a_ho = float((pho.argmax(-1) == ho_y).float().mean())
                a_dm = float((pdm.argmax(-1) == dm_y).float().mean())
                if hname == "linear":
                    prob_cache[f"{name}|{label_set}"] = (pho, pdm)

                results.append({"backbone": name, "labels": label_set, "head": hname,
                                "cv": round(cv, 4), "heldout": round(a_ho, 4),
                                "demo": round(a_dm, 4)})
                print(f"  {name:20s} {label_set:5s} {hname:6s}  "
                      f"CV {cv:6.1%} (n={total})   held-out {a_ho:6.1%}   demo {a_dm:6.1%}")

        del model
        if DEVICE == "cuda":
            torch.cuda.empty_cache()

    # Ensemble of the strongest linear arms
    best = sorted([r for r in results if r["head"] == "linear"],
                  key=lambda r: -r["cv"])[:3]
    keys = [f"{r['backbone']}|{r['labels']}" for r in best if f"{r['backbone']}|{r['labels']}" in prob_cache]
    if len(keys) >= 2:
        pho = sum(prob_cache[k][0] for k in keys) / len(keys)
        pdm = sum(prob_cache[k][1] for k in keys) / len(keys)
        a_ho = float((pho.argmax(-1) == ho_y).float().mean())
        a_dm = float((pdm.argmax(-1) == dm_y).float().mean())
        results.append({"backbone": "ENSEMBLE(" + ",".join(keys) + ")", "labels": "-",
                        "head": "linear", "cv": None,
                        "heldout": round(a_ho, 4), "demo": round(a_dm, 4)})
        print(f"\n  ENSEMBLE {keys}\n    held-out {a_ho:.1%}   demo {a_dm:.1%}")

    Path(args.out).write_text(json.dumps(results, indent=1))
    print("\n=== TOP 12 BY CROSS-VALIDATED ACCURACY ===")
    for r in sorted([x for x in results if x["cv"]], key=lambda x: -x["cv"])[:12]:
        print(f"  {r['cv']:6.1%} CV   {r['heldout']:6.1%} held-out   {r['demo']:6.1%} demo   "
              f"{r['backbone']:20s} {r['labels']:5s} {r['head']}")
    print(f"\nBaseline (served fine-tuned ViT): 81.2% held-out real")
    print(f"-> {args.out}")


if __name__ == "__main__":
    main()
