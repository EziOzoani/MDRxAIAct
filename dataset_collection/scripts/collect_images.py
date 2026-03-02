#!/usr/bin/env python3
"""
Tattoo Dataset Collector

Downloads images from the Pexels API (free, CC0-licensed) across three categories:
  - real_tattoo: actual ink tattoos on various skin tones
  - sticker_tattoo: temporary/sticker/transfer tattoos
  - pen_drawn: pen/marker/sharpie drawn tattoos on skin

Usage:
  python collect_images.py --api-key YOUR_PEXELS_API_KEY
  python collect_images.py --api-key YOUR_PEXELS_API_KEY --per-query 30

Get a free Pexels API key at: https://www.pexels.com/api/new/
"""

import argparse
import hashlib
import json
import os
import time
from pathlib import Path
from io import BytesIO

import requests
from PIL import Image

BASE_DIR = Path(__file__).parent / "data"

# Search queries grouped by category and skin tone descriptors
SEARCH_QUERIES = {
    "real_tattoo": [
        "tattoo on arm",
        "tattoo on skin",
        "tattoo close up",
        "tattoo sleeve",
        "small tattoo",
        "tattoo dark skin",
        "tattoo black skin arm",
        "tattoo brown skin",
        "tattoo light skin",
        "tattoo person of color",
        "colorful tattoo skin",
        "black ink tattoo arm",
        "tattoo wrist",
        "tattoo shoulder",
        "tattoo leg",
        "woman tattoo arm",
        "man tattoo arm",
        "tribal tattoo",
        "floral tattoo skin",
        "geometric tattoo",
    ],
    "sticker_tattoo": [
        "temporary tattoo",
        "fake tattoo",
        "sticker tattoo",
        "transfer tattoo",
        "temporary tattoo child",
        "temporary tattoo arm",
        "henna tattoo hand",
        "henna tattoo dark skin",
        "henna tattoo",
        "mehndi hand",
        "mehndi dark skin",
        "washable tattoo",
        "kids temporary tattoo",
        "metallic temporary tattoo",
        "glitter tattoo skin",
        "airbrush tattoo",
    ],
    "pen_drawn": [
        "drawing on skin marker",
        "sharpie on skin",
        "pen drawing on hand",
        "marker drawing arm",
        "drawing on skin pen",
        "kids drawing on arm",
        "body writing marker",
        "doodle on skin",
        "pen art on hand",
        "ink drawing on skin",
        "ballpoint pen skin art",
        "marker tattoo fake",
    ],
}

PEXELS_API_URL = "https://api.pexels.com/v1/search"


def download_image(url: str, save_path: Path, target_size: int = 224) -> bool:
    """Download image, resize to target_size x target_size, save as PNG."""
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        img = Image.open(BytesIO(resp.content)).convert("RGB")

        # Center-crop to square, then resize
        w, h = img.size
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        img = img.crop((left, top, left + side, top + side))
        img = img.resize((target_size, target_size), Image.LANCZOS)

        img.save(save_path, "PNG")
        return True
    except Exception as e:
        print(f"  [SKIP] {url}: {e}")
        return False


def search_pexels(api_key: str, query: str, per_page: int = 40, page: int = 1) -> list:
    """Search Pexels for images matching query."""
    headers = {"Authorization": api_key}
    params = {
        "query": query,
        "per_page": min(per_page, 80),
        "page": page,
        "orientation": "landscape",
    }
    try:
        resp = requests.get(PEXELS_API_URL, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("photos", [])
    except Exception as e:
        print(f"  [ERROR] Pexels search failed for '{query}': {e}")
        return []


def collect_category(api_key: str, category: str, queries: list, per_query: int = 20):
    """Collect images for one category."""
    save_dir = BASE_DIR / category
    save_dir.mkdir(parents=True, exist_ok=True)

    # Track hashes to avoid duplicates
    existing_hashes = set()
    for f in save_dir.glob("*.png"):
        existing_hashes.add(f.stem.split("_")[0])

    total_downloaded = len(list(save_dir.glob("*.png")))
    print(f"\n{'='*60}")
    print(f"Category: {category} ({total_downloaded} existing images)")
    print(f"{'='*60}")

    for query in queries:
        print(f"\n  Searching: '{query}'...")
        photos = search_pexels(api_key, query, per_page=per_query)
        print(f"  Found {len(photos)} results")

        downloaded = 0
        for photo in photos:
            # Use medium size for good quality without being huge
            img_url = photo.get("src", {}).get("medium", "")
            if not img_url:
                continue

            # Deterministic filename from URL to avoid re-downloads
            url_hash = hashlib.md5(img_url.encode()).hexdigest()[:12]
            if url_hash in existing_hashes:
                continue

            photo_id = photo.get("id", "unknown")
            photographer = photo.get("photographer", "unknown").replace(" ", "_")[:20]
            filename = f"{url_hash}_{photo_id}_{photographer}.png"
            save_path = save_dir / filename

            if save_path.exists():
                continue

            if download_image(img_url, save_path):
                existing_hashes.add(url_hash)
                downloaded += 1
                total_downloaded += 1

        print(f"  Downloaded: {downloaded} new images (total: {total_downloaded})")

        # Be respectful to the API
        time.sleep(0.5)

    print(f"\n  Final count for {category}: {total_downloaded} images")
    return total_downloaded


def write_metadata(counts: dict):
    """Write a metadata JSON file with collection info."""
    metadata = {
        "dataset_name": "tattoo-classification",
        "description": "Images for training a real vs fake tattoo classifier",
        "categories": {
            "real_tattoo": {
                "count": counts.get("real_tattoo", 0),
                "description": "Real ink tattoos on skin across various skin tones",
            },
            "sticker_tattoo": {
                "count": counts.get("sticker_tattoo", 0),
                "description": "Temporary, sticker, transfer, henna, and airbrush tattoos",
            },
            "pen_drawn": {
                "count": counts.get("pen_drawn", 0),
                "description": "Pen, marker, sharpie drawings on skin",
            },
        },
        "image_size": "224x224 PNG",
        "source": "Pexels API (CC0 license — free for commercial use)",
        "license": "CC0 (Pexels license — no attribution required)",
        "collection_date": time.strftime("%Y-%m-%d"),
        "skin_tone_notes": "Queries include skin tone diversity terms. Manual review recommended to verify Fitzpatrick I-VI coverage.",
    }
    meta_path = BASE_DIR / "metadata.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nMetadata written to {meta_path}")


def print_summary(counts: dict):
    """Print collection summary."""
    total = sum(counts.values())
    print(f"\n{'='*60}")
    print(f"COLLECTION SUMMARY")
    print(f"{'='*60}")
    for cat, count in counts.items():
        pct = (count / total * 100) if total > 0 else 0
        print(f"  {cat:20s}: {count:4d} images ({pct:.1f}%)")
    print(f"  {'TOTAL':20s}: {total:4d} images")
    print(f"\nImages saved to: {BASE_DIR.resolve()}")
    print(f"\nNext steps:")
    print(f"  1. Review images manually — remove any mis-categorized ones")
    print(f"  2. Check skin tone diversity across categories")
    print(f"  3. Run: python train_classifier.py  (to fine-tune ViT)")
    print(f"  4. Push model to HuggingFace Hub")


def main():
    parser = argparse.ArgumentParser(description="Collect tattoo classification dataset from Pexels")
    parser.add_argument("--api-key", required=True, help="Pexels API key (get free at pexels.com/api/new/)")
    parser.add_argument("--per-query", type=int, default=20, help="Images per search query (default: 20)")
    parser.add_argument("--categories", nargs="*", default=None, help="Categories to collect (default: all)")
    args = parser.parse_args()

    categories = args.categories or list(SEARCH_QUERIES.keys())
    counts = {}

    for category in categories:
        if category not in SEARCH_QUERIES:
            print(f"Unknown category: {category}. Skipping.")
            continue
        counts[category] = collect_category(
            args.api_key, category, SEARCH_QUERIES[category], args.per_query
        )

    write_metadata(counts)
    print_summary(counts)


if __name__ == "__main__":
    main()
