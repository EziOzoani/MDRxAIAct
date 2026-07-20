#!/bin/bash
#SBATCH --job-name=lpft-drift
#SBATCH --partition=gpu
#SBATCH --gres=gpu:1
#SBATCH --cpus-per-task=4
#SBATCH --mem=24G
#SBATCH --time=03:00:00
#SBATCH --output=/home/claude-training/jobs/lpft_drift_%j.out
#SBATCH --error=/home/claude-training/jobs/lpft_drift_%j.err

# Purpose:
#   Train a deliberately over-fitted LP-FT variant on the balanced sticker
#   dataset so post-peak drift is visible across per-epoch checkpoints.
#   Writes to dataset_collection/models_lpft_drift/  - the production
#   models_lpft/ directory is left untouched.
#
# Submit with:
#   sbatch dataset_collection/scripts/lpft_drift_train.sbatch
#
# Output:
#   - per-epoch checkpoints (15 total, no early stopping)
#   - trainer_state.json per checkpoint (matches dir step name)
#   - val accuracy logged per epoch so the drift curve is verifiable

set -euo pipefail

cd "$HOME/MDR_AiAct"
source dataset_collection/venv/bin/activate

OUT_DIR=dataset_collection/models_lpft_drift
mkdir -p "$OUT_DIR"

# Force the extended-epoch + no-early-stop config via env vars; lpft_train.py
# already reads these and applies them on top of the LP-FT recipe.
export LPFT_TOTAL_EPOCHS=15
export LPFT_NO_EARLY_STOP=1
export LPFT_OUTPUT_DIR="$OUT_DIR"
export LPFT_SAVE_PER_EPOCH=1

python dataset_collection/scripts/lpft_train.py \
  --variant balanced \
  --output "$OUT_DIR" \
  --epochs 15 \
  --no-early-stop \
  --save-per-epoch

echo "=== drift run complete - checkpoints in $OUT_DIR ==="
ls "$OUT_DIR"
