"""
Purpose:
    Rebuild the broken pen_drawn class as `drawn_on_skin`, using images already
    on disk, and evaluate whether the 4-class problem becomes learnable.

    Rationale. The four classes should partition by PHYSICAL MECHANISM:
        real_tattoo    ink injected into the dermis          (permanent)
        sticker_tattoo printed film transferred onto skin    (peels off)
        drawn_on_skin  pigment drawn freehand onto skin      (washes/fades)
        not_tattoo     nothing on the skin
    Henna belongs in the third: it is applied freehand with a cone and stains
    the outer skin, which is the same mechanism as pen or marker and NOT the
    same as a printed transfer. It is currently misfiled — 31.2% of
    sticker_tattoo is henna, which is a large part of why that class is only
    ~20% correct.

    What this does NOT do, and why. A CLIP scan also proposed 306 "marker"
    candidates, but 273 came from real_tattoo and inspection showed they are
    fine-line black TATTOOS that merely resemble pen work. Moving them would
    manufacture fresh mislabelling — the exact failure that produced the
    original class. Only genuine pen/marker images already outside real_tattoo
    are taken, which is a small number.

    KNOWN LIMITATION, stated rather than hidden: the resulting class is roughly
    90% henna. A model trained on it will partly learn "orange-brown intricate
    pattern" rather than "drawn onto skin", and will likely still fail on blue
    biro. Balancing needs photographs that do not exist in any public dataset
    (~30 queries across HuggingFace, Kaggle and the open web found none).

Dependencies:
    - torch, transformers (CLIP), PIL
    - pen_rebuild_proposal.json (from rebuild_pen.py)

Usage:
    python build_drawn_class.py [--apply]      # omit --apply for a dry run

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
PROPOSAL = BASE / "pen_rebuild_proposal.json"

NEW_CLASSES = ["real_tattoo", "sticker_tattoo", "drawn_on_skin", "not_tattoo"]
# Display strings the frontend should use, kept beside the data that defines them.
UI_LABELS = {
    "real_tattoo": "Real Tattoo Detected",
    "sticker_tattoo": "Sticker/Temporary Tattoo Detected",
    "drawn_on_skin": "Drawn on Skin — henna, pen or marker",
    "not_tattoo": "No Tattoo Detected",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(DATA / "balanced"))
    ap.add_argument("--out", default=str(DATA / "balanced_drawn"))
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    src, out = Path(args.src), Path(args.out)
    prop = json.loads(PROPOSAL.read_text())

    # Henna: trust it. Distinctive colour and pattern, CLIP scores at ~1.000,
    # and the count independently matches the visual audit's 31.2% estimate.
    henna = {Path(r["path"]).name for r in prop["henna"]
             if r["from_class"] in ("sticker_tattoo", "pen_drawn")}

    # Marker: take ONLY those not currently filed as real_tattoo, since the
    # real_tattoo hits were verified to be fine-line tattoos, not pen.
    marker = {Path(r["path"]).name for r in prop["marker"]
              if r["from_class"] in ("pen_drawn", "sticker_tattoo", "not_tattoo")}

    moves: dict[str, list[Path]] = {c: [] for c in NEW_CLASSES}
    stats = Counter()

    for cls in ("real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"):
        d = src / cls
        if not d.exists():
            continue
        for p in sorted(d.glob("*.png")):
            if p.name in henna or p.name in marker:
                # real_tattoo is never reassigned — see the docstring.
                if cls == "real_tattoo":
                    moves["real_tattoo"].append(p)
                    stats["real_tattoo kept (fine-line, not moved)"] += 1
                else:
                    moves["drawn_on_skin"].append(p)
                    stats[f"{cls} -> drawn_on_skin"] += 1
            elif cls == "pen_drawn":
                # The residue of pen_drawn is the keyword-scrape junk:
                # stationery, notebooks, cafe tables. Dropped, not relabelled.
                stats["pen_drawn dropped (scrape junk)"] += 1
            else:
                moves[cls].append(p)
                stats[f"{cls} kept"] += 1

    print("REBUILD PLAN" + ("" if args.apply else "   (dry run — nothing written)"))
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"  {k:44s} {v:5d}")
    print("\nresulting class counts:")
    for c in NEW_CLASSES:
        print(f"  {c:16s} {len(moves[c]):5d}   UI: \"{UI_LABELS[c]}\"")

    n_h = sum(1 for p in moves["drawn_on_skin"] if p.name in henna)
    n_m = len(moves["drawn_on_skin"]) - n_h
    if moves["drawn_on_skin"]:
        print(f"\n  drawn_on_skin composition: {n_h} henna + {n_m} marker/pen "
              f"= {n_h / len(moves['drawn_on_skin']):.0%} henna")
        print("  LIMITATION: henna-dominated; expect weak transfer to blue biro.")

    if not args.apply:
        print("\nRe-run with --apply to write the new tree.")
        return

    if out.exists():
        shutil.rmtree(out)
    for c in NEW_CLASSES:
        (out / c).mkdir(parents=True, exist_ok=True)
    for c, paths in moves.items():
        for p in paths:
            shutil.copy2(p, out / c / p.name)
    (out / "classes.json").write_text(json.dumps(
        {"classes": NEW_CLASSES, "ui_labels": UI_LABELS,
         "drawn_on_skin_composition": {"henna": n_h, "marker_pen": n_m},
         "note": "Source tree untouched. pen_drawn scrape junk dropped, not relabelled."},
        indent=1))
    print(f"\nWrote {sum(len(v) for v in moves.values())} images to {out}")
    print("Source tree untouched.")


if __name__ == "__main__":
    main()
