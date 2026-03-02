# Tattoo Classification Dataset & Model Training

## Problem

No public dataset exists for classifying **real vs fake tattoos**. All existing tattoo datasets focus on detection (bounding boxes) or design classification.

## What we're building

A 3-class image classifier:

| Class | Description | Examples |
|---|---|---|
| `real_tattoo` | Permanent ink tattoos | Sleeve, small wrist tattoo, tribal |
| `sticker_tattoo` | Temporary / transfer / sticker tattoos, henna | Kids stickers, metallic temp tattoos, mehndi |
| `pen_drawn` | Pen, marker, sharpie drawings on skin | Sharpie drawings, ballpoint doodles |

Across **diverse skin tones** (Fitzpatrick I-VI).

## Current Dataset Status (2026-03-02)

| Category | Raw | After Cleaning | Sources |
|---|---|---|---|
| `real_tattoo` | 4,288 | 4,288 (not cleaned yet) | HuggingFace `rlaope/tatvton-tattoo-raw` |
| `sticker_tattoo` | 480 | **438** | Openverse API (148) + Pexels API (333) |
| `pen_drawn` | 491 | **433** | Openverse API (121) + Pexels API (370) |

### Cleaning Applied
- `deep_clean.py` (STANDARD mode) removed 100 images total
- Rejection reasons: cold_tones (48), white_bg (30), no_skin (10), too_dark (10), low_texture (2)
- Rejected images preserved in `_rejected/` subdirectories

### Skin Tone Distribution (real_tattoo)
| Fitzpatrick | Percentage | Status |
|---|---|---|
| I-II (Very light/Light) | 1.7% | Underrepresented |
| III (Medium light) | 18.3% | OK |
| IV (Medium/Olive) | 48.7% | Overrepresented |
| V (Medium dark) | 27.2% | OK |
| VI (Dark/Very dark) | 4.1% | Underrepresented |

## Pipeline

### Step 1: Collect Data
```bash
source .venv/bin/activate

# Real tattoos (HuggingFace)
python download_full_tatvton.py

# Sticker & pen-drawn (free CC, no key)
python collect_free_sources.py

# Sticker & pen-drawn (Pexels, better quality)
python collect_images.py --api-key YOUR_PEXELS_KEY --categories sticker_tattoo pen_drawn --per-query 40
```

### Step 2: Clean Data
```bash
# Dry run (report only)
python deep_clean.py

# Move bad images to _rejected/
python deep_clean.py --move

# Stricter filtering (use with caution)
python deep_clean.py --move --aggressive
```

### Step 3: Balance Dataset
```bash
# Create balanced dataset in data_balanced/
python balance_dataset.py --create --target 300
```

### Step 4: Train Models
```bash
# Install training dependencies
uv pip install "transformers[torch]" datasets Pillow scikit-learn accelerate

# Train balanced + unbalanced models for AI Act demo
python train_both_models.py --epochs 5

# Train and push to HuggingFace Hub
python train_both_models.py --epochs 10 --push-to-hub --hub-org yourname
```

## Three-Model Training Strategy

| Model | Data | Class Weights | App Mapping |
|-------|------|---------------|-------------|
| Balanced | cleaned + balanced | Yes | All AI Act protections ON |
| Unbalanced | cleaned + unbalanced | No | Bias-testing protection OFF |
| Uncleaned | raw + unbalanced | No | Transparency protection OFF |

The accuracy gap between models IS the demo — toggling AI Act protections shows real quality degradation.

## Documentation

- **`DATA_HANDLING_LOG.md`**: Full audit trail of every data handling step (AI Act Article 10)
- **`data/dataset_sources.json`**: Data provenance, sources, licenses, cleaning results
- **`data/free_sources_metadata.json`**: Per-image CC license tracking

## License

- Pexels images: **CC0** (free for any use)
- Openverse images: Various CC licenses (metadata tracked per-image)
- tatvton-tattoo-raw: See HuggingFace dataset card
