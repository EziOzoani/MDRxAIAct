"""
Purpose:
    Render numbered contact sheets from the curation manifest so a reviewer can
    judge ~20 images per glance instead of opening them one at a time.

    Built for a first-pass sweep over the most-suspicious images: the data is
    keyword-scraped stock photography and already known to contain items that
    are not in any class (a porcelain vase and a bare torso both sit in
    pen_drawn/), so the fastest win is spotting obvious garbage in bulk.

    Each cell carries an index and a colour-coded border:
      red    — both models disagree with the stored label (prime suspect)
      amber  — one model disagrees
      grey   — both models agree with the label
    A legend is printed to stdout so the reviewer can map index -> file, stored
    label, and both models' opinions while looking at the sheet.

Dependencies:
    - PIL
    - curation_manifest.json (from curate_scan.py)

Usage:
    python curate_sheet.py --start 0 --count 20 --out /tmp/sheet_00.png

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BASE = Path(__file__).resolve().parent.parent
CELL = 220
PAD = 34
COLS = 5

SHORT = {"real_tattoo": "real", "sticker_tattoo": "stick",
         "pen_drawn": "pen", "not_tattoo": "none"}


def font(size: int):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=str(BASE / "curation_manifest.json"))
    ap.add_argument("--variant", default=None)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--count", type=int, default=20)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    man = json.loads(Path(args.manifest).read_text())
    variant = args.variant or man.get("variant", "balanced")
    recs = man["records"][args.start:args.start + args.count]
    if not recs:
        raise SystemExit("no records in that range")

    rows = (len(recs) + COLS - 1) // COLS
    W = COLS * (CELL + PAD) + PAD
    H = rows * (CELL + PAD + 18) + PAD
    sheet = Image.new("RGB", (W, H), (18, 20, 26))
    d = ImageDraw.Draw(sheet)
    f_idx, f_cap = font(17), font(13)

    print(f"{'idx':>4}  {'stored':>6}  {'vit':>6} {'conf':>5}  {'clip':>6} {'conf':>5}  file")
    for i, r in enumerate(recs):
        gx, gy = i % COLS, i // COLS
        x = PAD + gx * (CELL + PAD)
        y = PAD + gy * (CELL + PAD + 18)

        p = BASE / "data" / variant / r["path"]
        try:
            im = Image.open(p).convert("RGB").resize((CELL, CELL), Image.LANCZOS)
        except Exception:
            im = Image.new("RGB", (CELL, CELL), (60, 20, 20))
        sheet.paste(im, (x, y))

        wrong = (r["vit"] != r["label"]) + (r["clip"] != r["label"])
        colour = (185, 28, 28) if wrong == 2 else (180, 83, 9) if wrong == 1 else (60, 66, 80)
        d.rectangle([x - 2, y - 2, x + CELL + 1, y + CELL + 1], outline=colour, width=3)

        n = str(args.start + i)
        d.rectangle([x, y, x + 15 + 9 * len(n), y + 22], fill=colour)
        d.text((x + 5, y + 3), n, fill=(255, 255, 255), font=f_idx)
        cap = f"{SHORT.get(r['label'], r['label'])} | v:{SHORT.get(r['vit'], '?')} c:{SHORT.get(r['clip'], '?')}"
        d.text((x, y + CELL + 3), cap, fill=(154, 160, 166), font=f_cap)

        print(f"{args.start+i:>4}  {SHORT.get(r['label'],'?'):>6}  {SHORT.get(r['vit'],'?'):>6} "
              f"{r['vit_conf']:>5}  {SHORT.get(r['clip'],'?'):>6} {r['clip_conf']:>5}  {r['path'][:52]}")

    sheet.save(args.out)
    print(f"\n-> {args.out}  ({len(recs)} images, {rows}x{COLS})")


if __name__ == "__main__":
    main()
