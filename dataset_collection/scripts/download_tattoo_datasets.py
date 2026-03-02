#!/usr/bin/env python3
"""
Download and analyze tattoo datasets from HuggingFace.
Resizes all images to 224x224 PNG. Saves useful ones to data/real_tattoo/.
"""

import os
import sys
import traceback
from pathlib import Path
from PIL import Image
import io

OUTPUT_DIR = Path("/home/e_ozoani_appliedai_institute_de/MDR_AiAct/dataset_collection/data/real_tattoo")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
TARGET_SIZE = (224, 224)

saved_counter = 0

def resize_and_save(img, path):
    img = img.convert("RGB")
    img = img.resize(TARGET_SIZE, Image.LANCZOS)
    img.save(path, format="PNG")

def to_pil(val):
    if isinstance(val, Image.Image):
        return val
    if isinstance(val, bytes):
        return Image.open(io.BytesIO(val))
    return None

def check_corners(img_rgb):
    """Return True if image looks like a photo (not flat art)."""
    w, h = img_rgb.size
    if w < 6 or h < 6:
        return False
    pixels = [
        img_rgb.getpixel((2, 2)),
        img_rgb.getpixel((w - 3, 2)),
        img_rgb.getpixel((2, h - 3)),
        img_rgb.getpixel((w - 3, h - 3)),
    ]
    near_white = sum(1 for p in pixels if all(c > 240 for c in p))
    near_black = sum(1 for p in pixels if all(c < 15 for c in p))
    return not (near_white >= 3 or near_black >= 3)

from datasets import load_dataset

# =============================================================
# Dataset 1: Drozdik/tattoo_v0
# =============================================================
print("=" * 70)
print("DATASET 1: Drozdik/tattoo_v0")
print("=" * 70)

try:
    ds1 = load_dataset("Drozdik/tattoo_v0", trust_remote_code=True)
    split_name = list(ds1.keys())[0]
    data1 = ds1[split_name]
    print(f"Split: '{split_name}', total rows: {len(data1)}")
    print(f"Columns: {data1.column_names}")

    # Show sample info
    for i in range(min(5, len(data1))):
        img = to_pil(data1[i]["image"])
        if img:
            print(f"  row {i}: size={img.size}, mode={img.mode}")
    
    # Show text samples
    if "text" in data1.column_names:
        for i in range(min(5, len(data1))):
            print(f"  text[{i}]: {data1[i]['text']}")

    # Heuristic check
    photo_count = art_count = 0
    for i in range(min(100, len(data1))):
        img = to_pil(data1[i]["image"])
        if img:
            if check_corners(img.convert("RGB")):
                photo_count += 1
            else:
                art_count += 1

    print(f"\n  Heuristic (first {min(100, len(data1))} images):")
    print(f"    Photos on skin: {photo_count}")
    print(f"    Flat artwork:   {art_count}")

    if photo_count > art_count:
        print("\n  >> PHOTOS ON SKIN - saving all images...")
        for i in range(len(data1)):
            img = to_pil(data1[i]["image"])
            if img:
                resize_and_save(img, OUTPUT_DIR / f"drozdik_{i:05d}.png")
                saved_counter += 1
            if (i + 1) % 500 == 0:
                print(f"    saved {i+1}/{len(data1)}")
        print(f"  >> Saved {saved_counter} images.")
    else:
        print("\n  >> FLAT ARTWORK / STENCILS - not useful for skin-based classification.")
        print("  >> Saving 5 samples for reference only.")
        for i in range(min(5, len(data1))):
            img = to_pil(data1[i]["image"])
            if img:
                resize_and_save(img, OUTPUT_DIR / f"drozdik_sample_{i:03d}.png")

except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()


# =============================================================
# Dataset 2: rlaope/tatvton-tattoo-raw  (streaming to avoid stalls)
# =============================================================
print("\n" + "=" * 70)
print("DATASET 2: rlaope/tatvton-tattoo-raw")
print("=" * 70)

saved_ds2 = 0
try:
    # Use streaming to avoid downloading the entire dataset at once
    ds2 = load_dataset("rlaope/tatvton-tattoo-raw", trust_remote_code=True, streaming=True)
    split_name2 = list(ds2.keys())[0]
    stream2 = ds2[split_name2]
    
    print(f"Split: '{split_name2}' (streaming mode)")
    
    # Analyze first 50 images, then save if useful
    photo_count2 = art_count2 = 0
    sample_imgs = []
    sample_info = []
    
    import signal
    class TimeoutError(Exception):
        pass
    def timeout_handler(signum, frame):
        raise TimeoutError("Streaming timed out")
    
    # Set 5-minute timeout for the streaming
    old_handler = signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(300)
    
    try:
        for i, row in enumerate(stream2):
            if i == 0:
                print(f"  Columns: {list(row.keys())}")
            
            # Find image column
            img = None
            img_col_name = None
            for col in row:
                val = row[col]
                if isinstance(val, Image.Image):
                    img = val
                    img_col_name = col
                    break
                elif isinstance(val, bytes):
                    try:
                        img = Image.open(io.BytesIO(val))
                        img_col_name = col
                        break
                    except:
                        pass
            
            if img is None:
                # Try dict-based image
                for col in row:
                    val = row[col]
                    if isinstance(val, dict) and "bytes" in val:
                        try:
                            img = Image.open(io.BytesIO(val["bytes"]))
                            img_col_name = col
                            break
                        except:
                            pass
            
            if i < 10 and img:
                print(f"  row {i}, col '{img_col_name}': size={img.size}, mode={img.mode}")
                # Print non-image columns
                for col in row:
                    if col != img_col_name:
                        val = row[col]
                        if not isinstance(val, (Image.Image, bytes, dict)):
                            print(f"    {col}: {val}")
            
            if img and i < 50:
                img_rgb = img.convert("RGB")
                if check_corners(img_rgb):
                    photo_count2 += 1
                else:
                    art_count2 += 1
                sample_imgs.append((i, img))
            
            if img and i >= 50:
                # Save if determined useful
                break
            
            if i >= 5000:
                break
                
    except TimeoutError:
        print("  (streaming timed out after 5 minutes)")
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)
    
    total_sampled = photo_count2 + art_count2
    print(f"\n  Heuristic (first {total_sampled} images):")
    print(f"    Photos on skin: {photo_count2}")
    print(f"    Flat artwork:   {art_count2}")
    
    if photo_count2 > art_count2 and total_sampled > 0:
        print("\n  >> PHOTOS ON SKIN - saving streamed images...")
        # Save what we collected, then continue streaming
        for idx, img in sample_imgs:
            resize_and_save(img, OUTPUT_DIR / f"tatvton_{idx:05d}.png")
            saved_ds2 += 1
            saved_counter += 1
        
        # Continue streaming the rest
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(300)
        try:
            for i, row in enumerate(ds2[split_name2]):
                if i <= 49:
                    continue  # skip already saved
                img = None
                for col in row:
                    val = row[col]
                    if isinstance(val, Image.Image):
                        img = val
                        break
                    elif isinstance(val, bytes):
                        try:
                            img = Image.open(io.BytesIO(val))
                            break
                        except:
                            pass
                if img is None:
                    for col in row:
                        val = row[col]
                        if isinstance(val, dict) and "bytes" in val:
                            try:
                                img = Image.open(io.BytesIO(val["bytes"]))
                                break
                            except:
                                pass
                if img:
                    resize_and_save(img, OUTPUT_DIR / f"tatvton_{i:05d}.png")
                    saved_ds2 += 1
                    saved_counter += 1
                if (i + 1) % 500 == 0:
                    print(f"    saved {i+1} ...")
        except TimeoutError:
            print("  (streaming timed out, saving what we have)")
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, old_handler)
        
        print(f"  >> Saved {saved_ds2} images from rlaope/tatvton-tattoo-raw.")
    else:
        print("\n  >> FLAT ARTWORK / STENCILS or insufficient data.")
        for idx, img in sample_imgs[:5]:
            resize_and_save(img, OUTPUT_DIR / f"tatvton_sample_{idx:03d}.png")
        print("  >> Saved up to 5 samples for reference.")

except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()


# =============================================================
# Dataset 3: Busey/tattoodatasmallerset
# =============================================================
print("\n" + "=" * 70)
print("DATASET 3: Busey/tattoodatasmallerset")
print("=" * 70)

saved_ds3 = 0
try:
    ds3 = load_dataset("Busey/tattoodatasmallerset", trust_remote_code=True)
    split_name3 = list(ds3.keys())[0]
    data3 = ds3[split_name3]
    print(f"Split: '{split_name3}', total rows: {len(data3)}")
    print(f"Columns: {data3.column_names}")

    # Find image column
    img_col3 = None
    for col in data3.column_names:
        val = data3[0][col]
        if isinstance(val, Image.Image):
            img_col3 = col
            break
        elif isinstance(val, bytes):
            img_col3 = col
            break

    if img_col3:
        for i in range(min(10, len(data3))):
            img = to_pil(data3[i][img_col3])
            if img:
                print(f"  row {i}, col '{img_col3}': size={img.size}, mode={img.mode}")
        
        # Print non-image columns
        for col in data3.column_names:
            if col != img_col3:
                vals = [data3[i][col] for i in range(min(5, len(data3)))]
                print(f"  Column '{col}' samples: {vals}")

        photo_count3 = art_count3 = 0
        for i in range(min(100, len(data3))):
            img = to_pil(data3[i][img_col3])
            if img:
                if check_corners(img.convert("RGB")):
                    photo_count3 += 1
                else:
                    art_count3 += 1

        print(f"\n  Heuristic (first {min(100, len(data3))} images):")
        print(f"    Photos on skin: {photo_count3}")
        print(f"    Flat artwork:   {art_count3}")

        if photo_count3 > art_count3:
            print("\n  >> PHOTOS ON SKIN - saving all images...")
            for i in range(len(data3)):
                img = to_pil(data3[i][img_col3])
                if img:
                    resize_and_save(img, OUTPUT_DIR / f"busey_{i:05d}.png")
                    saved_ds3 += 1
                    saved_counter += 1
                if (i + 1) % 500 == 0:
                    print(f"    saved {i+1}/{len(data3)}")
            print(f"  >> Saved {saved_ds3} images.")
        else:
            print("\n  >> FLAT ARTWORK / STENCILS - not useful for skin classification.")
            for i in range(min(5, len(data3))):
                img = to_pil(data3[i][img_col3])
                if img:
                    resize_and_save(img, OUTPUT_DIR / f"busey_sample_{i:03d}.png")
            print("  >> Saved 5 samples for reference.")
    else:
        print("  No image columns detected.")

except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()


# =============================================================
# Final Summary
# =============================================================
print("\n" + "=" * 70)
print("FINAL SUMMARY")
print("=" * 70)
all_files = sorted(OUTPUT_DIR.glob("*.png"))
total_files = len(all_files)
print(f"Total PNG files saved to {OUTPUT_DIR}: {total_files}")
print(f"All images resized to: {TARGET_SIZE[0]}x{TARGET_SIZE[1]} PNG")

# Group by prefix
from collections import Counter
prefixes = Counter()
for f in all_files:
    prefix = f.name.split("_")[0]
    prefixes[prefix] += 1
print(f"\nBreakdown by source:")
for prefix, count in sorted(prefixes.items()):
    print(f"  {prefix}: {count} images")

print(f"\nFirst 10 files:")
for f in all_files[:10]:
    print(f"  {f.name}")
if total_files > 10:
    print(f"  ... and {total_files - 10} more")
