#!/usr/bin/env python3
"""
Collect sticker tattoo and pen-drawn images from FREE APIs (no API key needed).

Sources:
  1. Openverse API (aggregates Flickr, Wikimedia Commons CC images) — no key needed
  2. Wikimedia Commons API — no key needed

Usage:
  python collect_free_sources.py
  python collect_free_sources.py --categories sticker_tattoo
  python collect_free_sources.py --categories pen_drawn
  python collect_free_sources.py --per-query 30
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

# ── Search queries for each category ──

QUERIES = {
    "sticker_tattoo": [
        # Openverse queries
        "temporary tattoo on skin",
        "sticker tattoo on arm",
        "fake tattoo on skin",
        "temporary tattoo child",
        "metallic temporary tattoo",
        "transfer tattoo on hand",
        "henna tattoo on hand",
        "henna tattoo dark skin",
        "mehndi design on skin",
        "henna mehndi arm",
        "temporary tattoo back",
        "kids temporary tattoo arm",
        "wash off tattoo",
        "glitter tattoo on skin",
        "airbrush tattoo",
        "temporary tattoo wrist",
    ],
    "pen_drawn": [
        "pen drawing on skin",
        "pen drawing on hand",
        "sharpie drawing on arm",
        "marker drawing on skin",
        "ballpoint pen on hand",
        "drawing on arm pen",
        "doodle on skin",
        "marker art on hand",
        "body marker drawing",
        "pen tattoo on skin",
        "fake pen tattoo",
        "drawn tattoo marker",
    ],
}

# Wikimedia Commons categories to scrape
WIKIMEDIA_CATEGORIES = {
    "sticker_tattoo": [
        "Temporary_tattoos",
        "Tattoo_stickers",
        "Henna_tattoos",
        "Mehndi",
    ],
    "pen_drawn": [
        "Body_painting",  # some overlap, will filter manually
    ],
}


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
        # Skip too-small images
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
            "license_type": "commercial",  # CC0, CC-BY, etc.
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

            # Get image URLs
            titles = [m["title"] for m in members if m["title"].lower().endswith(
                (".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp")
            )]

            if titles:
                # Batch query for image info
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


def main():
    parser = argparse.ArgumentParser(description="Collect images from free CC sources")
    parser.add_argument("--categories", nargs="+",
                        default=["sticker_tattoo", "pen_drawn"],
                        choices=["sticker_tattoo", "pen_drawn"])
    parser.add_argument("--per-query", type=int, default=20,
                        help="Max images per search query")
    args = parser.parse_args()

    metadata = {}

    for category in args.categories:
        cat_dir = DATA_DIR / category
        cat_dir.mkdir(parents=True, exist_ok=True)

        existing = set(f.name for f in cat_dir.glob("*.png"))
        seen_urls = set()
        downloaded = 0
        skipped = 0
        errors = 0

        print(f"\n{'='*60}")
        print(f"Collecting: {category}")
        print(f"{'='*60}")
        print(f"  Existing images: {len(existing)}")

        # 1. Openverse searches
        queries = QUERIES.get(category, [])
        print(f"\n  Searching Openverse ({len(queries)} queries)...")

        for qi, query in enumerate(queries):
            print(f"  [{qi+1}/{len(queries)}] '{query}'...")
            results = search_openverse(query, per_query=args.per_query)

            for item in results:
                url = item["url"]
                if url in seen_urls:
                    continue
                seen_urls.add(url)

                fname = f"{category}_{url_hash(url)}.png"
                if fname in existing:
                    skipped += 1
                    continue

                img = download_image(url)
                if img is None:
                    errors += 1
                    continue

                if process_and_save(img, cat_dir / fname):
                    downloaded += 1
                    metadata[fname] = {
                        "source": item["source"],
                        "license": item["license"],
                        "query": query,
                        "url": url,
                        "category": category,
                    }
                    if downloaded % 10 == 0:
                        print(f"    Downloaded {downloaded} so far...")
                else:
                    errors += 1

            # Rate limit courtesy
            time.sleep(1)

        # 2. Wikimedia Commons categories
        wiki_cats = WIKIMEDIA_CATEGORIES.get(category, [])
        if wiki_cats:
            print(f"\n  Searching Wikimedia Commons ({len(wiki_cats)} categories)...")

            for wcat in wiki_cats:
                print(f"  Category:{wcat}...")
                results = search_wikimedia_category(wcat, limit=50)

                for item in results:
                    url = item["url"]
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)

                    # Skip SVG files
                    if url.lower().endswith(".svg"):
                        continue

                    fname = f"{category}_wiki_{url_hash(url)}.png"
                    if fname in existing:
                        skipped += 1
                        continue

                    img = download_image(url)
                    if img is None:
                        errors += 1
                        continue

                    if process_and_save(img, cat_dir / fname):
                        downloaded += 1
                        metadata[fname] = {
                            "source": "wikimedia",
                            "license": "wikimedia-cc",
                            "wiki_category": wcat,
                            "url": url,
                            "category": category,
                        }
                    else:
                        errors += 1

                time.sleep(1)

        print(f"\n  Results for {category}:")
        print(f"    New downloads: {downloaded}")
        print(f"    Skipped (existing): {skipped}")
        print(f"    Errors: {errors}")
        print(f"    Total in folder: {len(list(cat_dir.glob('*.png')))}")

    # Save metadata
    meta_path = DATA_DIR / "free_sources_metadata.json"
    existing_meta = {}
    if meta_path.exists():
        with open(meta_path) as f:
            existing_meta = json.load(f)
    existing_meta.update(metadata)
    with open(meta_path, "w") as f:
        json.dump(existing_meta, f, indent=2)
    print(f"\nMetadata saved to {meta_path}")

    # Summary
    print(f"\n{'='*60}")
    print("COLLECTION SUMMARY")
    print(f"{'='*60}")
    for category in args.categories:
        cat_dir = DATA_DIR / category
        count = len(list(cat_dir.glob("*.png"))) if cat_dir.exists() else 0
        print(f"  {category}: {count} images")

    real_count = len(list((DATA_DIR / "real_tattoo").glob("*.png"))) if (DATA_DIR / "real_tattoo").exists() else 0
    print(f"  real_tattoo: {real_count} images")

    print(f"\nNOTE: Manual review is essential! Some downloaded images may not be relevant.")
    print(f"  Review images in data/sticker_tattoo/ and data/pen_drawn/")
    print(f"  Remove any that don't show tattoos/drawings on skin")


if __name__ == "__main__":
    main()
