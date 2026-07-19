"""
Purpose:
    Enact the decisions recorded by curate.py, producing a cleaned copy of the
    training set. Reviewing and applying are separate steps on purpose: the
    reviewer can misclick, change their mind, or stop halfway without ever
    putting the source data at risk.

    The source tree is NEVER modified. A new variant directory is written, so
    the before/after models can be compared on the same held-out set and the
    accuracy claim for curation is evidenced rather than asserted.

    Decisions:
      keep              — copy as-is
      real_tattoo/...   — copy into the corrected class
      delete            — drop (not a member of any class, e.g. the porcelain
                          vase and the bare torso found in pen_drawn/)
      (no decision)     — copy as-is, so a partial review is still usable

Dependencies:
    - stdlib only
    - curation_decisions.json (from curate.py)

Usage:
    python curate_apply.py [--variant balanced] [--out data/balanced_clean] [--dry-run]

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
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variant", default="balanced")
    ap.add_argument("--decisions", default=str(BASE / "curation_decisions.json"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = BASE / "data" / args.variant
    out = Path(args.out) if args.out else BASE / "data" / f"{args.variant}_clean"
    dpath = Path(args.decisions)
    decisions = json.loads(dpath.read_text()) if dpath.exists() else {}
    if not decisions:
        raise SystemExit(f"No decisions in {dpath} — run curate.py first.")

    stats = Counter()
    moves: list[tuple[Path, Path]] = []

    for cls in CLASSES:
        d = src / cls
        if not d.exists():
            continue
        for p in sorted(d.glob("*.png")):
            rel = f"{cls}/{p.name}"
            dec = decisions.get(rel, "keep")
            if dec == "delete":
                stats["deleted"] += 1
                continue
            target_cls = dec if dec in CLASSES else cls
            if target_cls != cls:
                stats[f"relabelled {cls}->{target_cls}"] += 1
            else:
                stats["kept"] += 1
            moves.append((p, out / target_cls / p.name))

    print(f"source : {src}")
    print(f"output : {out}{'  (DRY RUN — nothing written)' if args.dry_run else ''}")
    print(f"decisions recorded: {len(decisions)}\n")
    for k, v in sorted(stats.items(), key=lambda kv: -kv[1]):
        print(f"  {k:34s} {v:5d}")

    final = Counter(t.parent.name for _, t in moves)
    print("\nresulting class counts:")
    for c in CLASSES:
        print(f"  {c:16s} {final.get(c, 0):5d}")

    if args.dry_run:
        return

    if out.exists():
        shutil.rmtree(out)
    for c in CLASSES:
        (out / c).mkdir(parents=True, exist_ok=True)
    for s, t in moves:
        shutil.copy2(s, t)
    print(f"\nWrote {len(moves)} images to {out}")
    print("Source tree untouched. Retrain against the new variant to measure the gain.")


if __name__ == "__main__":
    main()
