"""
Purpose:
    Build a defensible held-out split to replace val_heldout_manifest.json, and
    emit the shortlist a human should adjudicate to turn it into a gold set.

    The existing split is not usable as a yardstick. The evaluation-integrity
    audit established:
      - it is `crops[:12]` — the ALPHABETICAL head of each class, despite the
        manifest recording "seed": 1234, so it is not a random sample;
      - all 12 not_tattoo eval images therefore come from fst_1, the lightest
        Fitzpatrick tone: zero coverage of darker skin, under a UI that claims
        "Bias Testing: Validated across skin tones";
      - sticker/pen eval draws only hex-prefixed Pexels files, systematically
        excluding the ~25% of each class with other prefixes;
      - real_tattoo eval is 3 drozdik + 9 tatvton, so a source holding 0.75% of
        the class carries 25% of its eval weight — and all three drozdik images
        are misclassified, i.e. one tiny unrepresentative source produces a
        third of the model's errors;
      - one file (06164282b51f_...) is enrolled under BOTH sticker_tattoo and
        pen_drawn, so the maximum achievable score is 47/48 by construction;
      - ~15% of the eval labels are themselves wrong (only 21/48 carry
        two-judge consensus).

    That last point is the decisive one. Northcutt et al. (NeurIPS 2021 D&B)
    measured that model rankings INVERT when test-set label error rises by just
    5-6pp — ResNet-18 overtakes ResNet-50, VGG-11 overtakes VGG-19. At ~15%
    error, this project's test set cannot rank models at all, which is the most
    parsimonious explanation for a day of backbone comparisons that produced no
    reproducible ordering.

    What this script does:
      1. stratified random sampling, seeded, over (class x source prefix) and,
         for not_tattoo, over (class x Fitzpatrick tone) so every tone appears;
      2. drops images that are byte-identical to another image in a different
         class — those are unanswerable by construction;
      3. excludes anything already in balanced_lpft, the only training tier
         with no leakage;
      4. writes an adjudication queue ordered by two-judge disagreement, since
         prioritised review corrects labels 2.5-4x more efficiently than random
         (Bernhardt et al., Nature Communications 13:1161, 2022).

    The output is NOT a gold set on its own — a human must still review the
    queue. It is the scaffolding that makes that review short and worth doing.

Dependencies:
    - stdlib + PIL; curation_manifest.json for the disagreement ranking

Usage:
    python build_gold_split.py [--per-class 40] [--seed 1234]

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
SKIN = DATA / "not_tattoo_fitzpatrick"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]


def md5(p: Path) -> str:
    return hashlib.md5(p.read_bytes()).hexdigest()


def source_of(name: str) -> str:
    """Coarse provenance bucket, so the split spans sources rather than
    whichever one happens to sort first."""
    for pref in ("tatvton", "drozdik", "scin", "sticker_tattoo", "pen_drawn",
                 "food", "flower", "animal", "solid", "gradient", "noise",
                 "noisy_pattern", "noisy_mark", "aug", "skin_solid", "skin_noisy"):
        if name.startswith(pref):
            return pref
    return "pexels" if re.match(r"^[0-9a-f]{12}_", name) else "other"


def tone_of(p: Path) -> str | None:
    return p.parent.name if p.parent.name.startswith("fst_") else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-class", type=int, default=40)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--out", default=str(BASE / "gold_split.json"))
    ap.add_argument("--queue", default=str(BASE / "gold_adjudication_queue.json"))
    args = ap.parse_args()

    rng = random.Random(args.seed)

    # ── Candidate pool ────────────────────────────────────────────────────
    pool: dict[str, list[Path]] = {c: [] for c in CLASSES}
    for c in CLASSES:
        d = DATA / "balanced" / c
        if d.exists():
            pool[c] = sorted(d.glob("*.png"))
    # not_tattoo negatives should be bare skin across ALL tones, not the
    # food/flower/swatch mixture the local tier happens to hold.
    skin = [p for d in sorted(SKIN.glob("fst_*")) for p in sorted(d.glob("*.png"))]
    if skin:
        pool["not_tattoo"] = skin

    # ── Exclude cross-class byte-duplicates: unanswerable by construction ──
    seen: dict[str, tuple[str, str]] = {}
    dupes: set[str] = set()
    for c in CLASSES:
        for p in pool[c]:
            h = md5(p)
            if h in seen and seen[h][0] != c:
                dupes.add(h)
            else:
                seen[h] = (c, p.name)
    print(f"cross-class byte-duplicates excluded: {len(dupes)}")

    # ── Exclude anything present in the training tier ──────────────────────
    train_stems = set()
    for c in CLASSES:
        d = DATA / "balanced_lpft" / c
        if d.exists():
            for p in d.glob("*.png"):
                n = p.name
                for pref in ("orig_", "aug_"):
                    if n.startswith(pref):
                        n = n[len(pref):]
                        break
                train_stems.add((c, n))

    # ── Stratified sample ─────────────────────────────────────────────────
    split: dict[str, list[str]] = {}
    report: dict[str, dict] = {}
    for c in CLASSES:
        strata: dict[str, list[Path]] = defaultdict(list)
        for p in pool[c]:
            if md5(p) in dupes:
                continue
            if (c, p.name) in train_stems:
                continue
            key = tone_of(p) or source_of(p.name)
            strata[key].append(p)
        if not strata:
            print(f"  {c}: no eligible candidates")
            continue
        # Proportional allocation with a floor of 1, so small-but-real sources
        # (and every skin tone) are represented rather than sampled away.
        total = sum(len(v) for v in strata.values())
        picks: list[Path] = []
        for k, v in sorted(strata.items()):
            n = max(1, round(args.per_class * len(v) / total))
            picks += rng.sample(v, min(n, len(v)))
        rng.shuffle(picks)
        picks = picks[:args.per_class]
        split[c] = [str(p.relative_to(DATA)) for p in picks]
        report[c] = {k: sum(1 for p in picks if (tone_of(p) or source_of(p.name)) == k)
                     for k in sorted(strata)}
        print(f"  {c}: {len(picks)} sampled from {len(strata)} strata -> {report[c]}")

    Path(args.out).write_text(json.dumps(
        {"seed": args.seed, "per_class": args.per_class,
         "note": "Stratified random. Replaces the alphabetical crops[:12] split. "
                 "Cross-class byte-duplicates and training images excluded. "
                 "NOT gold until the adjudication queue has been reviewed.",
         "strata": report, "split": split}, indent=1))

    # ── Adjudication queue, hardest-first ─────────────────────────────────
    man_p = BASE / "curation_manifest.json"
    queue = []
    if man_p.exists():
        man = {r["path"]: r for r in json.loads(man_p.read_text())["records"]}
        for c, rels in split.items():
            for rel in rels:
                key = f"{c}/{Path(rel).name}"
                r = man.get(key)
                if r is None:
                    queue.append({"path": rel, "label": c, "priority": 1.0,
                                  "note": "no model verdict on file"})
                    continue
                disagree = (r["vit"] != c) + (r["clip"] != c)
                queue.append({"path": rel, "label": c, "vit": r["vit"],
                              "clip": r["clip"], "priority": disagree +
                              min(r["vit_conf"], r["clip_conf"])})
        queue.sort(key=lambda x: -x["priority"])
    Path(args.queue).write_text(json.dumps(queue, indent=1))

    flagged = sum(1 for q in queue if q.get("priority", 0) >= 1)
    print(f"\ngold split      -> {args.out}")
    print(f"adjudication    -> {args.queue}  ({len(queue)} images, "
          f"{flagged} with at least one model disagreeing)")
    print("Review the queue top-down; it is ordered so the likely errors come first.")


if __name__ == "__main__":
    main()
