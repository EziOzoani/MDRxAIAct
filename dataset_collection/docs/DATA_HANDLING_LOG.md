# Data Handling Process Log

Full audit trail of every data collection, cleaning, balancing, and training step.
Required for AI Act Article 10 compliance documentation.

---

## 1. Data Collection

### 1.1 Real Tattoos (`real_tattoo`)
- **Source**: HuggingFace dataset `rlaope/tatvton-tattoo-raw`
- **Script**: `download_full_tatvton.py`
- **Total available**: 5,434 images
- **Downloaded**: 4,288 images (as of 2026-03-02)
- **Preprocessing**: Center-cropped to square, resized to 224x224 PNG
- **License**: See HuggingFace dataset card

### 1.2 Sticker/Temporary Tattoos (`sticker_tattoo`)
- **Sources**:
  - Openverse API (CC-licensed aggregator, no key needed) — 148 images
  - Pexels API (CC0, API key required) — 333 new images
- **Scripts**: `collect_free_sources.py`, `collect_images.py`
- **Total collected**: 480 images
- **Queries used**: 16 queries including "temporary tattoo on skin", "sticker tattoo on arm", "henna tattoo on hand", etc.
- **License tracking**: Per-image licenses in `data/free_sources_metadata.json`

### 1.3 Pen/Marker Drawings (`pen_drawn`)
- **Sources**:
  - Openverse API — 121 images
  - Pexels API — 370 new images
- **Scripts**: `collect_free_sources.py`, `collect_images.py`
- **Total collected**: 491 images
- **Queries used**: 12 queries including "pen drawing on skin", "sharpie drawing on arm", "marker drawing on skin", etc.
- **License tracking**: Per-image licenses in `data/free_sources_metadata.json`

---

## 2. Data Quality Assessment

### 2.1 Initial Audit (`audit_dataset.py`)
- **real_tattoo**: ~18% flagged as flat graphics or split comparison images
- **sticker_tattoo**: ~50% estimated irrelevant (insects, monuments, notebooks from Openverse)
- **pen_drawn**: ~50% estimated irrelevant (similar noise from Openverse)
- Pexels images significantly higher quality (~60-70% usable)

### 2.2 Skin Tone Distribution (Fitzpatrick scale, estimated from border pixel brightness)

| Skin Tone | real_tattoo | Notes |
|-----------|-------------|-------|
| I-II (Very light/Light) | 1.7% | Underrepresented |
| III (Medium light) | 18.3% | |
| IV (Medium/Olive) | 48.7% | Overrepresented |
| V (Medium dark) | 27.2% | |
| VI (Dark/Very dark) | 4.1% | Underrepresented |

**Method**: `estimate_skin_tone()` in `train_both_models.py` — samples border pixels, computes average brightness, maps to Fitzpatrick bins. This is an approximation, not a validated clinical method.

---

## 3. Data Cleaning

### 3.1 Basic Filter (`filter_noisy_images.py`)
- **Heuristics**: Brightness check (< 30 or > 240), flatness (std < 15), skin ratio (< 5%)
- **Result**: Only 4 images flagged — too lenient for the noise in Openverse data
- **Action**: Not used for final cleaning

### 3.2 Deep Clean (`deep_clean.py`) — USED FOR FINAL CLEANING
- **Date run**: 2026-03-02
- **Mode**: STANDARD (not aggressive)
- **Multi-signal heuristics**:
  1. Skin pixel ratio (warm tone detection: R > G > B with brightness constraints)
  2. Dark skin detection (mid-brightness, low channel spread)
  3. Color temperature (warm R-dominant vs cool B-dominant)
  4. Edge density (photos vs flat graphics)
  5. White background ratio (product shots)
  6. Dark pixel ratio (unusable images)
  7. Color saturation (skin has moderate saturation)
  8. Center-vs-border brightness (object-on-background detection)
  9. Unique color count (32x32 thumbnail — low = graphic, high = photo)

#### Results:

**sticker_tattoo**: 480 → 438 kept (42 rejected)
| Rejection Reason | Count |
|------------------|-------|
| cold_tones | 28 |
| white_bg | 9 |
| too_dark | 4 |
| low_texture | 1 |

**pen_drawn**: 491 → 433 kept (58 rejected)
| Rejection Reason | Count |
|------------------|-------|
| white_bg | 21 |
| cold_tones | 20 |
| no_skin | 10 |
| too_dark | 6 |
| low_texture | 1 |

**Total**: 100 images rejected (moved to `_rejected/` subdirectories)

#### Aggressive mode (NOT used, documented for reference):
- Would reject 204 images total (sticker: 85, pen: 119)
- Additional reasons: `not_warm` (77), `low_skin` (14), `product_shot` (6)
- Rejected as too aggressive — risk of losing valid dark-skin images

---

## 4. Dataset Variants for Training

Three dataset variants created to demonstrate AI Act impact:

### 4.1 UNCLEANED + Unbalanced (`data_uncleaned/`)
- **Purpose**: Model trained WITHOUT transparency (no data quality controls)
- **Maps to**: Transparency protection OFF in the app
- **Implementation**: Symlinks to `data/` plus `_rejected/` images restored
- Contains noisy images, no class or skin-tone balancing

| Category | Total | I-II | III | IV | V | VI |
|---|---|---|---|---|---|---|
| real_tattoo | 4,902 | 92 (1.9%) | 918 (18.7%) | 2,320 (47.3%) | 1,388 (28.3%) | 183 (3.7%) |
| sticker_tattoo | 481 | 23 (4.8%) | 88 (18.3%) | 156 (32.4%) | 156 (32.4%) | 58 (12.1%) |
| pen_drawn | 494 | 64 (13.0%) | 120 (24.3%) | 172 (34.8%) | 104 (21.1%) | 34 (6.9%) |
| **TOTAL** | **5,877** | **179 (3.0%)** | **1,126 (19.2%)** | **2,648 (45.1%)** | **1,648 (28.0%)** | **275 (4.7%)** |

### 4.2 CLEANED + Unbalanced (`data/`)
- **Purpose**: Model trained WITHOUT bias mitigation (clean data but no fairness controls)
- **Maps to**: Bias-testing protection OFF in the app
- Cleaned via `deep_clean.py` STANDARD mode — 100 images removed
- Class imbalance (11:1) and skin tone skew remain

| Category | Total | I-II | III | IV | V | VI |
|---|---|---|---|---|---|---|
| real_tattoo | 5,017 | 93 (1.9%) | 941 (18.8%) | 2,370 (47.2%) | 1,427 (28.4%) | 185 (3.7%) |
| sticker_tattoo | 438 | 18 (4.1%) | 77 (17.6%) | 141 (32.2%) | 148 (33.8%) | 54 (12.3%) |
| pen_drawn | 433 | 45 (10.4%) | 105 (24.2%) | 160 (37.0%) | 98 (22.6%) | 25 (5.8%) |
| **TOTAL** | **5,888** | **156 (2.6%)** | **1,123 (19.1%)** | **2,671 (45.4%)** | **1,673 (28.4%)** | **264 (4.5%)** |

### 4.3 CLEANED + BALANCED (`data_balanced/`)
- **Purpose**: Model trained WITH all AI Act protections
- **Maps to**: All protections ON in the app
- Created via `balance_dataset.py --create --target 400`
- Skin-tone-aware subsampling: keeps ALL rare types (I-II, VI), trims overrepresented IV
- Target distribution: 15% I-II, 20% III, 30% IV, 20% V, 10% VI
- Class weights applied during training: `weight = total / (n_classes × count)`

| Category | Total | I-II | III | IV | V | VI |
|---|---|---|---|---|---|---|
| real_tattoo | 400 | 60 (15.0%) | 84 (21.0%) | 129 (32.2%) | 84 (21.0%) | 42 (10.5%) |
| sticker_tattoo | 400 | 18 (4.5%) | 77 (19.2%) | 133 (33.2%) | 122 (30.5%) | 50 (12.5%) |
| pen_drawn | 400 | 45 (11.2%) | 99 (24.8%) | 142 (35.5%) | 89 (22.2%) | 25 (6.2%) |
| **TOTAL** | **1,200** | **123 (10.2%)** | **260 (21.7%)** | **404 (33.7%)** | **295 (24.6%)** | **117 (9.8%)** |

### 4.4 Comparison: Effect of Cleaning + Balancing

| Metric | Uncleaned | Cleaned | Balanced |
|---|---|---|---|
| Total images | 5,877 | 5,888 | 1,200 |
| Class ratio (max:min) | 10.2:1 | 11.6:1 | 1:1 |
| Type I-II overall | 3.0% | 2.6% | 10.2% |
| Type VI overall | 4.7% | 4.5% | 9.8% |
| Type IV overall | 45.1% | 45.4% | 33.7% |
| Noisy images included | Yes | No (100 removed) | No |
| Skin tone subsampling | None | None | Yes (rare types preserved) |

---

## 5. Training Pipeline

### 5.1 Model Architecture
- **Base**: google/vit-base-patch16-224-in21k (Vision Transformer)
- **Task**: 3-class classification (real_tattoo, sticker_tattoo, pen_drawn)
- **Input**: 224×224 RGB images
- **Script**: `train_classifier.py`

### 5.2 Training Variants

| Model | Data | Class Weights | Bias Mitigation | App Mapping |
|-------|------|---------------|-----------------|-------------|
| Model 1 (balanced) | cleaned + balanced | Yes (inverse-frequency) | Skin-tone-aware sampling | All protections ON |
| Model 2 (unbalanced) | cleaned + unbalanced | No | None | Bias-testing OFF |
| Model 3 (uncleaned) | uncleaned + unbalanced | No | None | Transparency OFF |

### 5.3 Training Infrastructure
- **GPU**: Lambda Cloud 1x A100 SXM4 40GB ($1.48/hr, us-east-1)
- **Instance ID**: `ba0f585340cd44bd8060eb82a6820852`
- **Training date**: 2026-03-02
- **Both models trained in parallel** on the same GPU
- **Duration**: Balanced ~7.5 min, Unbalanced ~15 min
- **Instance terminated after training** to stop billing

### 5.4 Training Results

#### BALANCED MODEL (all AI Act protections ON)
- **Data**: 1,200 images (400/class), skin-tone-aware sampling, class weights
- **Overall accuracy**: 81.7%
- **F1 (weighted)**: 0.816

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| real_tattoo | 0.84 | 0.74 | 0.79 | 86 |
| sticker_tattoo | 0.90 | 0.95 | 0.93 | 80 |
| pen_drawn | 0.70 | 0.76 | 0.73 | 74 |

#### UNBALANCED MODEL (bias-testing OFF)
- **Data**: 6,315 images (5,444 real / 438 sticker / 433 pen), no class weights
- **Overall accuracy**: 95.5% (inflated by majority class dominance)
- **F1 (weighted)**: 0.953

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| real_tattoo | 0.82 | 0.72 | 0.77 | 82 |
| sticker_tattoo | 0.98 | 0.99 | 0.99 | 1,082 |
| pen_drawn | 0.76 | 0.72 | 0.74 | 99 |

#### Key Comparison

| Metric | Balanced | Unbalanced | Gap |
|---|---|---|---|
| Overall accuracy | 81.7% | 95.5% | Unbalanced inflated by class imbalance |
| real_tattoo recall | 74.4% | 72.0% | Similar |
| sticker_tattoo recall | 95.0% | 99.4% | Unbalanced overfits to majority |
| pen_drawn recall | 75.7% | 71.7% | Balanced slightly better on minority |
| Macro avg F1 | 0.81 | 0.83 | Balanced more even across classes |

#### UNCLEANED MODEL (transparency OFF)
- **Data**: 5,877 images (4,902 real / 481 sticker / 494 pen), includes rejected noisy images
- **Overall accuracy**: 94.7% (inflated, same pattern as unbalanced)
- **F1 (weighted)**: 0.947
- **Trained**: 2026-03-02, Lambda A100 instance `f659467e851d43dc9090c41becde6f40`

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| real_tattoo | 0.85 | 0.71 | 0.77 | 96 |
| sticker_tattoo | 0.98 | 0.99 | 0.98 | 992 |
| pen_drawn | 0.70 | 0.76 | 0.73 | 88 |

#### Full 3-Model Comparison

| Metric | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| Overall accuracy | 81.7% | 95.5% | 94.7% |
| real_tattoo recall | 74.4% | 72.0% | 70.8% |
| sticker_tattoo recall | 95.0% | 99.4% | 98.7% |
| pen_drawn recall | 75.7% | 71.7% | 76.1% |
| Macro F1 | 0.81 | 0.83 | 0.83 |
| Data quality | Cleaned | Cleaned | Noisy (100 bad images included) |
| Class balance | 1:1 | 12.6:1 | 10.2:1 |
| App mapping | All protections ON | Bias-testing OFF | Transparency OFF |

**The demo effect**: Both unbalanced and uncleaned models report ~95% accuracy, but this is inflated because ~85% of their validation sets are the majority class (sticker_tattoo). On real tattoos and pen drawings (minority classes), they perform worse than the balanced model. The uncleaned model additionally learned from noisy rejected images, making its predictions less reliable on edge cases.

---

## 6. Known Limitations

1. **No gold-standard dataset**: No public real-vs-fake tattoo dataset exists. This dataset is novel and noisy.
2. **Skin tone estimation is approximate**: Border pixel brightness heuristic, not clinically validated Fitzpatrick assessment.
3. **Sticker/pen categories are small**: 438 + 433 vs 4,288 real tattoos — heavy augmentation and class weights needed.
4. **Openverse image quality**: ~50% irrelevant — only Pexels-sourced images are reliably useful.
5. **Deep clean may remove valid images**: Heuristic-based filtering can misclassify edge cases (e.g., dark-skin images with low warmth detected as "cold tones").
6. **No manual curation completed**: Automated cleaning only — manual review of remaining images would improve quality further.

---

## 7. Provenance & Licensing

| Source | License | Tracking |
|--------|---------|----------|
| rlaope/tatvton-tattoo-raw | See HuggingFace dataset card | `download_full_tatvton.py` |
| Openverse API | Various CC (per-image) | `data/free_sources_metadata.json` |
| Wikimedia Commons | CC / Public Domain | `data/free_sources_metadata.json` |
| Pexels API | CC0 (free for any use) | `data/free_sources_metadata.json` |

---

## 8. File Inventory

| File | Purpose |
|------|---------|
| `download_full_tatvton.py` | Download real tattoo images from HuggingFace |
| `collect_free_sources.py` | Collect from Openverse + Wikimedia (no key) |
| `collect_images.py` | Collect from Pexels API (needs key) |
| `audit_dataset.py` | Audit quality + skin tone distribution |
| `filter_noisy_images.py` | Basic noise filter (superseded by deep_clean) |
| `deep_clean.py` | Multi-signal aggressive cleaner |
| `balance_dataset.py` | Skin-tone-aware balancing + augmentation |
| `train_classifier.py` | ViT fine-tuning with WeightedTrainer |
| `train_both_models.py` | Orchestrate balanced + unbalanced training |
| `data/dataset_sources.json` | Full data provenance documentation |
| `data/free_sources_metadata.json` | Per-image CC license tracking |
| `.env` | API keys (gitignored) |
| `.gitignore` | Excludes data/, .env, model_output/ |
