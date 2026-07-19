#!/usr/bin/env python3
"""
Collect 'not_tattoo' images from FREE APIs (no API key needed).

Sources:
  1. Openverse API (aggregates Flickr, Wikimedia Commons CC images)
  2. Wikimedia Commons API

Two sets are created:
  - data/not_tattoo/           — Clean, curated negative examples
  - data/not_tattoo_noisy/     — Includes borderline/ambiguous images (for uncleaned model)

Usage:
  python collect_not_tattoo.py
  python collect_not_tattoo.py --per-query 30
  python collect_not_tattoo.py --noisy-only
"""

import argparse
import hashlib
import json
import time
from pathlib import Path
from io import BytesIO

import requests
from PIL import Image
import numpy as np

DATA_DIR = Path(__file__).parent / "data"
TARGET_SIZE = 224

# ── Search queries for clean not_tattoo images ──
# Diverse set: bare skin, random objects, faces, text, everyday scenes
CLEAN_QUERIES = [
    # Bare skin without tattoos
    "bare arm no tattoo",
    "hand close up skin",
    "clean skin arm",
    "bare leg skin",
    "forearm no tattoo",
    "skin texture close up",
    "wrist no tattoo",
    "shoulder bare skin",
    # Faces
    "portrait face close up",
    "face headshot",
    "selfie portrait",
    # Random objects/scenes
    "table top objects",
    "desk workspace",
    "food on plate close up",
    "flower close up",
    "cat close up",
    "dog close up",
    "landscape nature",
    "book pages",
    "text on paper",
    # Things users might mistakenly upload
    "screenshot phone",
    "fabric texture",
    "wall texture",
    "wood grain",
]

# ── Additional queries for noisy/borderline images (uncleaned model) ──
# These are ambiguous: henna, body paint, bruises, birthmarks, scars
NOISY_QUERIES = [
    "henna design hand",
    "body paint art",
    "face paint design",
    "bruise on skin",
    "birthmark skin",
    "scar on arm",
    "body art paint",
    "mehendi fading",
    "skin rash close up",
    "freckles close up",
    "sunburn skin",
    "paint splatter on hand",
]

WIKIMEDIA_CATEGORIES = [
    "Human_skin",
    "Hands",
    "Close-up_photographs_of_human_faces",
]


def download_image(url: str, timeout: int = 15) -> Image.Image | None:
    """Download and return a PIL Image, or None on failure."""
    try:
        headers = {"User-Agent": "TattooClassifierDatasetCollector/1.0 (research)"}
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content)).convert("RGB")
        return img
    except Exception:
        return None


def process_and_save(img: Image.Image, save_path: Path) -> bool:
    """Center-crop to square and resize to TARGET_SIZE, save as PNG."""
    try:
        w, h = img.size
        if w < 100 or h < 100:
            return False

        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
        img.save(save_path, "PNG")
        return True
    except Exception:
        return False


def url_hash(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()[:12]


def search_openverse(query: str, per_query: int = 20) -> list[dict]:
    """Search Openverse API for CC-licensed images."""
    results = []
    try:
        params = {
            "q": query,
            "license_type": "commercial",
            "page_size": min(per_query, 50),
            "mature": "false",
        }
        resp = requests.get(
            "https://api.openverse.org/v1/images/",
            params=params,
            headers={"User-Agent": "TattooClassifierDatasetCollector/1.0"},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            for item in data.get("results", []):
                results.append({
                    "url": item.get("url", ""),
                    "title": item.get("title", ""),
                    "license": item.get("license", ""),
                    "source": "openverse",
                })
        elif resp.status_code == 429:
            print(f"    Rate limited on Openverse, waiting 10s...")
            time.sleep(10)
    except Exception as e:
        print(f"    Openverse error: {e}")
    return results


def search_wikimedia_category(category: str, limit: int = 50) -> list[dict]:
    """Get image files from a Wikimedia Commons category."""
    results = []
    try:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{category}",
            "cmtype": "file",
            "cmlimit": limit,
            "format": "json",
        }
        resp = requests.get(
            "https://commons.wikimedia.org/w/api.php",
            params=params,
            headers={"User-Agent": "TattooClassifierDatasetCollector/1.0"},
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            members = data.get("query", {}).get("categorymembers", [])
            titles = [m["title"] for m in members if m["title"].lower().endswith(
                (".jpg", ".jpeg", ".png", ".gif", ".webp")
            )]
            if titles:
                for i in range(0, len(titles), 10):
                    batch = titles[i:i+10]
                    info_params = {
                        "action": "query",
                        "titles": "|".join(batch),
                        "prop": "imageinfo",
                        "iiprop": "url|size",
                        "format": "json",
                    }
                    info_resp = requests.get(
                        "https://commons.wikimedia.org/w/api.php",
                        params=info_params,
                        headers={"User-Agent": "TattooClassifierDatasetCollector/1.0"},
                        timeout=30,
                    )
                    if info_resp.status_code == 200:
                        pages = info_resp.json().get("query", {}).get("pages", {})
                        for page in pages.values():
                            ii = page.get("imageinfo", [{}])
                            if ii and ii[0].get("url"):
                                results.append({
                                    "url": ii[0]["url"],
                                    "title": page.get("title", ""),
                                    "license": "wikimedia-cc",
                                    "source": "wikimedia",
                                })
                    time.sleep(0.5)
    except Exception as e:
        print(f"    Wikimedia error for {category}: {e}")
    return results


def collect_images(queries, cat_dir, label_prefix, per_query, wiki_categories=None):
    """Collect images from Openverse + Wikimedia for a given set of queries."""
    cat_dir.mkdir(parents=True, exist_ok=True)
    existing = set(f.name for f in cat_dir.glob("*.png"))
    seen_urls = set()
    downloaded = 0
    errors = 0

    print(f"\n  Searching Openverse ({len(queries)} queries)...")
    for qi, query in enumerate(queries):
        print(f"  [{qi+1}/{len(queries)}] '{query}'...")
        results = search_openverse(query, per_query=per_query)

        for item in results:
            url = item["url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)

            fname = f"{label_prefix}_{url_hash(url)}.png"
            if fname in existing:
                continue

            img = download_image(url)
            if img is None:
                errors += 1
                continue

            if process_and_save(img, cat_dir / fname):
                downloaded += 1
                if downloaded % 10 == 0:
                    print(f"    Downloaded {downloaded} so far...")
            else:
                errors += 1

        time.sleep(1)

    if wiki_categories:
        print(f"\n  Searching Wikimedia Commons ({len(wiki_categories)} categories)...")
        for wcat in wiki_categories:
            print(f"  Category:{wcat}...")
            results = search_wikimedia_category(wcat, limit=50)

            for item in results:
                url = item["url"]
                if url in seen_urls:
                    continue
                seen_urls.add(url)

                if url.lower().endswith(".svg"):
                    continue

                fname = f"{label_prefix}_wiki_{url_hash(url)}.png"
                if fname in existing:
                    continue

                img = download_image(url)
                if img is None:
                    errors += 1
                    continue

                if process_and_save(img, cat_dir / fname):
                    downloaded += 1
                else:
                    errors += 1

            time.sleep(1)

    return downloaded, errors


def main():
    parser = argparse.ArgumentParser(description="Collect not_tattoo images from free CC sources")
    parser.add_argument("--per-query", type=int, default=20, help="Max images per search query")
    parser.add_argument("--noisy-only", action="store_true", help="Only collect noisy/borderline images")
    parser.add_argument("--clean-only", action="store_true", help="Only collect clean images")
    args = parser.parse_args()

    print("=" * 60)
    print("NOT_TATTOO IMAGE COLLECTOR")
    print("=" * 60)

    # Collect clean not_tattoo images
    if not args.noisy_only:
        print(f"\n{'='*60}")
        print("Collecting CLEAN not_tattoo images")
        print(f"{'='*60}")
        clean_dir = DATA_DIR / "not_tattoo"
        downloaded, errors = collect_images(
            CLEAN_QUERIES, clean_dir, "not_tattoo",
            args.per_query, wiki_categories=WIKIMEDIA_CATEGORIES,
        )
        total = len(list(clean_dir.glob("*.png")))
        print(f"\n  Clean not_tattoo: {downloaded} new, {errors} errors, {total} total")

    # Collect noisy/borderline images (for uncleaned model)
    if not args.clean_only:
        print(f"\n{'='*60}")
        print("Collecting NOISY/BORDERLINE images (for uncleaned model)")
        print(f"{'='*60}")
        noisy_dir = DATA_DIR / "not_tattoo_noisy"
        downloaded, errors = collect_images(
            NOISY_QUERIES, noisy_dir, "not_tattoo_noisy",
            args.per_query,
        )
        total = len(list(noisy_dir.glob("*.png")))
        print(f"\n  Noisy not_tattoo: {downloaded} new, {errors} errors, {total} total")

    # Summary
    print(f"\n{'='*60}")
    print("COLLECTION SUMMARY")
    print(f"{'='*60}")
    clean_dir = DATA_DIR / "not_tattoo"
    noisy_dir = DATA_DIR / "not_tattoo_noisy"
    clean_count = len(list(clean_dir.glob("*.png"))) if clean_dir.exists() else 0
    noisy_count = len(list(noisy_dir.glob("*.png"))) if noisy_dir.exists() else 0
    print(f"  not_tattoo (clean): {clean_count} images")
    print(f"  not_tattoo_noisy:   {noisy_count} images")
    print(f"  Total negative:     {clean_count + noisy_count} images")

    print(f"\nUsage in training:")
    print(f"  Balanced model:   data/not_tattoo/        (clean, curated)")
    print(f"  Unbalanced model: data/not_tattoo/        (clean, same source)")
    print(f"  Uncleaned model:  data/not_tattoo/ + data/not_tattoo_noisy/ (includes ambiguous)")
    print(f"\nNOTE: Manual review recommended! Remove any images that actually contain tattoos.")


if __name__ == "__main__":
    main()
