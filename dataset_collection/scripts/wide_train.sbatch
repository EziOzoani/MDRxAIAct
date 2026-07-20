#!/bin/bash
#SBATCH --job-name=wide-train
#SBATCH --partition=all
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=04:00:00
#SBATCH --output=/shared/claude_drift/wide/logs/wide_train_%j.out
#SBATCH --error=/shared/claude_drift/wide/logs/wide_train_%j.err

# Purpose:
#   Close the wide-shot accuracy gap by fixing the training distribution rather
#   than the inference path. The served model trains on tight 224x224 crops but
#   is deployed on wide camera frames; centre-cropping at inference recovered
#   only 4.4pp, so this retrains on data that matches deployment.
#
#   Measured baseline (models_lpft/balanced via eval_honest.py):
#     real demo photos ..... 83.3%   (5/6)
#     soft wide-shot val ... 76.7%   feathered composites, no artefact
#     hard wide-shot val ... 68.0%   legacy set, hard-edged paste
#
#   Changes exactly ONE variable — the training data — so any gain is
#   attributable. The augmentation recipe in lpft_train.py is untouched.
#
#   Runs entirely in /shared/claude_drift (scratch). Ezi's tree at
#   /shared/ezi/mdr_aiact is read-only here and is only ever read via symlinks.
#
# Submit with:
#   sbatch /shared/claude_drift/wide/code/wide_train.sbatch
#
# Output:
#   /shared/claude_drift/wide/output/balanced/ — checkpoints + metrics
#   Baseline-vs-retrained comparison printed at the end of the log.

set -euo pipefail

W=/shared/claude_drift/wide
E=/shared/ezi/mdr_aiact
mkdir -p "$W/logs"
cd "$W"
source "$E/venv/bin/activate"

# Keep HF cache in scratch — the home quota is small.
export HF_HOME=/shared/claude_drift/hf_cache
export EXAMPLES_DIR="$W/demo_examples"
export OUTPUT_DIR="$W/output/balanced"
mkdir -p "$OUTPUT_DIR"

nvidia-smi --query-gpu=name,memory.total --format=csv,noheader || true

echo
echo "=== 1/3  Building wide-shot training set ==="
python "$W/code/build_wide_train.py" \
  --src "$W/data/balanced_lpft" \
  --out "$W/data/balanced_wide"

echo
echo "=== 2/3  Training LP-FT on the wide-shot distribution ==="
python "$E/code/lpft_train.py" \
  --variant balanced \
  --data-root "$W/data/balanced_wide" \
  --batch-size 32

echo
echo "=== 3/3  Honest evaluation: baseline vs retrained ==="
echo "--- BASELINE (currently served) ---"
python "$W/code/eval_honest.py" "$E/output_lpft/balanced" || true
echo
echo "--- RETRAINED (wide-shot distribution) ---"
python "$W/code/eval_honest.py" "$OUTPUT_DIR" || true

echo "=== complete — checkpoints in $OUTPUT_DIR ==="
