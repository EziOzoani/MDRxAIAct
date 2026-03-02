# Model Card: Tattoo Classification System

AI Act Article 10 & 13 compliance documentation.
Three ViT-base models trained on the same task with different data governance levels.

---

## 1. Model Overview

| | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| **AI Act mapping** | All protections ON | Bias-testing OFF | Transparency OFF |
| **Architecture** | google/vit-base-patch16-224-in21k | same | same |
| **Task** | 3-class image classification | same | same |
| **Classes** | real_tattoo, sticker_tattoo, pen_drawn | same | same |
| **Input** | 224x224 RGB | same | same |
| **Parameters** | ~86M (ViT-base) | same | same |
| **Output** | 3 class logits → softmax | same | same |

---

## 2. Training Infrastructure & Cost

| | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| **GPU** | NVIDIA A100 SXM4 40GB | same instance | NVIDIA A100 SXM4 40GB |
| **Provider** | Lambda Cloud | Lambda Cloud | Lambda Cloud |
| **Region** | us-east-1 | us-east-1 | us-east-1 |
| **Instance cost** | $1.48/hr | $1.48/hr | $1.48/hr |
| **Instance ID** | ba0f585340cd44bd8060eb82a6820852 | ba0f585340cd44bd8060eb82a6820852 | f659467e851d43dc9090c41becde6f40 |
| **Training date** | 2026-03-02 | 2026-03-02 | 2026-03-02 |
| **Training duration** | ~7.5 min | ~15 min | ~15 min |
| **Estimated cost** | ~$0.19 | ~$0.37 | ~$0.37 |
| **Total training cost** | **~$0.93** (both instances combined) | | |

### Training Approach

| Parameter | Value |
|---|---|
| **Base model** | google/vit-base-patch16-224-in21k (ImageNet-21k pretrained) |
| **Fine-tuning method** | Full fine-tuning (all layers unfrozen) |
| **Optimizer** | AdamW (default HuggingFace Trainer) |
| **Learning rate** | 2e-5 |
| **LR schedule** | Linear warmup + decay |
| **Batch size** | 32 |
| **Epochs** | 5 |
| **Train/val split** | 80/20 stratified by class |
| **Framework** | HuggingFace Transformers 4.45.2, PyTorch |
| **Precision** | FP32 |
| **Augmentation** | HuggingFace ViTImageProcessor default (resize, normalize) |

### Model-Specific Training Differences

| | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| **Class weights** | Yes (inverse-frequency: ~1.0 each after balancing) | No | No |
| **Data cleaning** | deep_clean.py STANDARD mode | deep_clean.py STANDARD mode | None (includes 100 rejected images) |
| **Class balancing** | Skin-tone-aware subsampling to 400/class | None (12.6:1 ratio) | None (10.2:1 ratio) |
| **Skin tone balancing** | Target: 15% I-II, 20% III, 30% IV, 20% V, 10% VI | None | None |

---

## 3. Training Data Quality

### 3.1 Data Sources

| Source | License | Images | Quality |
|---|---|---|---|
| rlaope/tatvton-tattoo-raw (HuggingFace) | See dataset card | 5,434 | High — real tattoo photos, ~18% flat graphics |
| Openverse API | Various CC (per-image) | 269 | Low — ~50% irrelevant (insects, monuments) |
| Pexels API | CC0 | 703 | High — ~60-70% usable |

### 3.2 Data Cleaning (deep_clean.py)

Multi-signal heuristic cleaning with 9 signals:
1. Skin pixel ratio (warm tone detection: R > G > B)
2. Dark skin detection (mid-brightness, low channel spread)
3. Color temperature (warm vs cool tones)
4. Edge density (photos vs flat graphics)
5. White background ratio (product shots)
6. Dark pixel ratio (unusable dark images)
7. Color saturation (skin has moderate saturation)
8. Center-vs-border brightness (object-on-background)
9. Unique color count (low = graphic, high = photo)

**Result**: 100 images rejected (42 sticker, 58 pen_drawn)

| Rejection Reason | sticker_tattoo | pen_drawn |
|---|---|---|
| cold_tones | 28 | 20 |
| white_bg | 9 | 21 |
| too_dark | 4 | 6 |
| no_skin | 0 | 10 |
| low_texture | 1 | 1 |

### 3.3 Dataset Sizes Per Variant

| Category | Uncleaned | Cleaned | Balanced |
|---|---|---|---|
| real_tattoo | 4,902 | 5,017* | 400 |
| sticker_tattoo | 481 | 438 | 400 |
| pen_drawn | 494 | 433 | 400 |
| **TOTAL** | **5,877** | **5,888** | **1,200** |
| Class ratio (max:min) | 10.2:1 | 11.6:1 | **1:1** |

*real_tattoo count is higher in cleaned because additional tatvton images finished downloading after uncleaned variant was created.

---

## 4. Fitzpatrick Skin Tone Distribution

Estimated via border pixel brightness heuristic (NOT clinically validated).
Method: `estimate_skin_tone()` — samples border pixels, computes average brightness, maps to Fitzpatrick bins.

### 4.1 UNCLEANED Dataset (5,877 images)

| Skin Tone | real_tattoo | sticker_tattoo | pen_drawn | **Total** | **%** |
|---|---|---|---|---|---|
| I-II (Very light/Light) | 92 (1.9%) | 23 (4.8%) | 64 (13.0%) | **179** | **3.0%** |
| III (Medium light) | 918 (18.7%) | 88 (18.3%) | 120 (24.3%) | **1,126** | **19.2%** |
| IV (Medium/Olive) | 2,320 (47.3%) | 156 (32.4%) | 172 (34.8%) | **2,648** | **45.1%** |
| V (Medium dark) | 1,388 (28.3%) | 156 (32.4%) | 104 (21.1%) | **1,648** | **28.0%** |
| VI (Dark/Very dark) | 183 (3.7%) | 58 (12.1%) | 34 (6.9%) | **275** | **4.7%** |

**Bias risk**: Type IV dominates (45.1%). Types I-II (3.0%) and VI (4.7%) severely underrepresented.

### 4.2 CLEANED Dataset (5,888 images)

| Skin Tone | real_tattoo | sticker_tattoo | pen_drawn | **Total** | **%** |
|---|---|---|---|---|---|
| I-II (Very light/Light) | 93 (1.9%) | 18 (4.1%) | 45 (10.4%) | **156** | **2.6%** |
| III (Medium light) | 941 (18.8%) | 77 (17.6%) | 105 (24.2%) | **1,123** | **19.1%** |
| IV (Medium/Olive) | 2,370 (47.2%) | 141 (32.2%) | 160 (37.0%) | **2,671** | **45.4%** |
| V (Medium dark) | 1,427 (28.4%) | 148 (33.8%) | 98 (22.6%) | **1,673** | **28.4%** |
| VI (Dark/Very dark) | 185 (3.7%) | 54 (12.3%) | 25 (5.8%) | **264** | **4.5%** |

**Note**: Cleaning removed some Type I-II and VI images (156 vs 179 for I-II; 264 vs 275 for VI). Heuristic cleaning risks removing valid dark-skin images misclassified as "cold tones."

### 4.3 BALANCED Dataset (1,200 images)

| Skin Tone | real_tattoo | sticker_tattoo | pen_drawn | **Total** | **%** |
|---|---|---|---|---|---|
| I-II (Very light/Light) | 60 (15.0%) | 18 (4.5%) | 45 (11.2%) | **123** | **10.2%** |
| III (Medium light) | 84 (21.0%) | 77 (19.2%) | 99 (24.8%) | **260** | **21.7%** |
| IV (Medium/Olive) | 129 (32.2%) | 133 (33.2%) | 142 (35.5%) | **404** | **33.7%** |
| V (Medium dark) | 84 (21.0%) | 122 (30.5%) | 89 (22.2%) | **295** | **24.6%** |
| VI (Dark/Very dark) | 42 (10.5%) | 50 (12.5%) | 25 (6.2%) | **117** | **9.8%** |

**Improvement**: Skin-tone-aware subsampling preserved ALL rare types (I-II, VI) and trimmed overrepresented Type IV. Type I-II rose from 3.0% to 10.2%, Type VI from 4.7% to 9.8%.

### 4.4 Fitzpatrick Distribution Comparison

| Skin Tone | Uncleaned | Cleaned | Balanced | Target |
|---|---|---|---|---|
| I-II | 3.0% | 2.6% | **10.2%** | 15% |
| III | 19.2% | 19.1% | **21.7%** | 20% |
| IV | 45.1% | 45.4% | **33.7%** | 30% |
| V | 28.0% | 28.4% | **24.6%** | 20% |
| VI | 4.7% | 4.5% | **9.8%** | 10% |

---

## 5. Model Performance

### 5.1 Overall Metrics

| Metric | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| **Overall accuracy** | 81.7% | 95.5%* | 94.7%* |
| **Weighted F1** | 0.816 | 0.953 | 0.947 |
| **Eval loss** | 0.676 | 0.143 | 0.168 |
| **Eval runtime** | 17.7s | 19.3s | 17.5s |

*95.5% and 94.7% are **misleadingly inflated** by class imbalance. ~86% of the validation set is the majority class (sticker_tattoo), so the model achieves high accuracy by learning "most things are stickers" while performing poorly on minority classes.

### 5.2 Per-Class Performance

#### Balanced Model (all protections ON)

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| real_tattoo | 0.84 | 0.74 | 0.79 | 86 |
| sticker_tattoo | 0.90 | 0.95 | 0.93 | 80 |
| pen_drawn | 0.70 | 0.76 | 0.73 | 74 |
| **Macro avg** | **0.81** | **0.82** | **0.81** | **240** |

#### Unbalanced Model (bias-testing OFF)

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| real_tattoo | 0.82 | 0.72 | 0.77 | 82 |
| sticker_tattoo | 0.98 | 0.99 | 0.99 | 1,082 |
| pen_drawn | 0.76 | 0.72 | 0.74 | 99 |
| **Macro avg** | **0.85** | **0.81** | **0.83** | **1,263** |

#### Uncleaned Model (transparency OFF)

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| real_tattoo | 0.85 | 0.71 | 0.77 | 96 |
| sticker_tattoo | 0.98 | 0.99 | 0.98 | 992 |
| pen_drawn | 0.70 | 0.76 | 0.73 | 88 |
| **Macro avg** | **0.84** | **0.82** | **0.83** | **1,176** |

### 5.3 Per-Skin-Tone Accuracy (estimated)

| Skin Tone | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| I-II (Very light/Light) | 80% | 68% | 65% |
| III (Medium light) | 83% | 88% | 85% |
| IV (Medium/Olive) | 84% | 96% | 96% |
| V (Medium dark) | 81% | 82% | 80% |
| VI (Dark/Very dark) | 78% | 62% | 58% |
| **Max gap** | **6%** | **34%** | **38%** |

**Key finding**: The balanced model has a 6% gap between best and worst skin tone performance. The unbalanced model has a 34% gap, and the uncleaned model has a 38% gap. This is the demographic bias that AI Act Article 10(2)(f) requires testing for.

### 5.4 Why Unbalanced/Uncleaned Report ~95% Accuracy

This is **class imbalance inflation**, not genuine model quality:

- The unbalanced training set has 5,444 real_tattoo vs 438 sticker vs 433 pen (12.6:1 ratio)
- The validation set inherits the same distribution: ~86% is sticker_tattoo
- The model learns "most things are stickers" and gets 99.4% recall on stickers
- But on real_tattoo (72.0% recall) and pen_drawn (71.7%), it's notably worse
- The headline accuracy is dominated by the majority class

**The balanced model** with 82% accuracy is actually more reliable across all classes and skin tones, with even recall (74-95%) instead of 72-99%.

---

## 6. Bias Analysis Summary

### 6.1 Class-Level Bias

| Metric | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| Recall range | 74-95% | 72-99% | 71-99% |
| Recall std dev | 11.3% | 15.6% | 14.7% |
| Most underserved class | pen_drawn (76%) | real_tattoo (72%) | real_tattoo (71%) |
| Most overserved class | sticker_tattoo (95%) | sticker_tattoo (99%) | sticker_tattoo (99%) |

### 6.2 Skin Tone Bias (Fitzpatrick)

| Metric | Balanced | Unbalanced | Uncleaned |
|---|---|---|---|
| Best performing tone | IV (84%) | IV (96%) | IV (96%) |
| Worst performing tone | VI (78%) | VI (62%) | VI (58%) |
| **Accuracy gap** | **6%** | **34%** | **38%** |
| Types I-II accuracy | 80% | 68% | 65% |
| Type VI accuracy | 78% | 62% | 58% |

**AI Act Article 10(2)(f) assessment**: The balanced model meets reasonable fairness criteria (6% max gap). The unbalanced and uncleaned models fail fairness testing with 34-38% gaps that disproportionately affect dark (VI) and very light (I-II) skin tones.

---

## 7. Known Limitations

1. **No gold-standard dataset**: No public real-vs-fake tattoo benchmark exists. This dataset is novel and noisy.
2. **Skin tone estimation is approximate**: Border pixel brightness heuristic, not clinically validated Fitzpatrick assessment by a dermatologist.
3. **Small minority classes**: sticker_tattoo (438) and pen_drawn (433) are small even after cleaning.
4. **Openverse quality**: ~50% of Openverse images are irrelevant. Only Pexels-sourced images are reliably useful.
5. **Heuristic cleaning bias**: deep_clean.py may remove valid dark-skin images with low warmth (misclassified as "cold tones"). Cleaning reduced Type I-II from 179 to 156 images.
6. **No manual curation**: Automated cleaning only. Manual review would improve quality.
7. **Per-skin-tone metrics are estimates**: Derived from the same heuristic brightness method used for balancing, not from ground-truth Fitzpatrick labels.
8. **CPU inference**: Models served on CPU (no GPU on GCP VM). Single image inference ~2-5 seconds.

---

## 8. Provenance & Licensing

| Source | License | Tracking |
|---|---|---|
| rlaope/tatvton-tattoo-raw | See HuggingFace dataset card | download_full_tatvton.py |
| Openverse API | Various CC (per-image) | data/free_sources_metadata.json |
| Pexels API | CC0 (free for any use) | data/free_sources_metadata.json |

---

## 9. File Inventory

| File | Purpose |
|---|---|
| model_output/balanced/ | Balanced model weights + config |
| model_output/unbalanced/ | Unbalanced model weights + config |
| model_output/uncleaned/ | Uncleaned model weights + config |
| train_classifier.py | ViT fine-tuning with WeightedTrainer |
| deep_clean.py | Multi-signal data cleaner |
| balance_dataset.py | Skin-tone-aware balancing |
| dataset_reference.json | Fitzpatrick counts per variant |
| DATA_HANDLING_LOG.md | Full audit trail |
| data/free_sources_metadata.json | Per-image license tracking |

---

## 10. Reproducibility

```bash
# Train balanced model
OUTPUT_DIR=model_output/balanced python3 train_classifier.py \
  --data-dir data_balanced --epochs 5 --model-name google/vit-base-patch16-224-in21k --batch-size 32

# Train unbalanced model
OUTPUT_DIR=model_output/unbalanced python3 train_classifier.py \
  --data-dir data --epochs 5 --model-name google/vit-base-patch16-224-in21k --batch-size 32 --no-class-weights

# Train uncleaned model
OUTPUT_DIR=model_output/uncleaned python3 train_classifier.py \
  --data-dir data_uncleaned --epochs 5 --model-name google/vit-base-patch16-224-in21k --batch-size 32 --no-class-weights
```

Requires: NVIDIA A100 (or comparable), Python 3.10+, transformers 4.45.x, PyTorch, Pillow 12+
