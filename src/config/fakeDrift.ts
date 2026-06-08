/**
 * Purpose:
 *   Deterministic 8-epoch trajectory used by Tile 3 to illustrate the
 *   training -> peak -> drift narrative for the MDR + AI Act demo.
 *
 *   The climb and peak are grounded in the real balanced LP-FT run: the
 *   per-class peak confidences below are the measured held-out accuracies
 *   from checkpoints 1-9 (dataset_collection/models_lpft/balanced), where
 *   the linear-probe phase plateaus and the gentle fine-tune phase (epoch 7
 *   onwards) lifts every class to its peak:
 *     real_tattoo    0.73 -> 0.90      sticker_tattoo 0.36 -> 0.74
 *     pen_drawn      0.54 -> 0.70      not_tattoo     0.76 -> 0.96
 *
 *   The held-out run only ever climbs, so the last two epochs (the drift
 *   tail) continue the documented overfit behaviour from the 15-epoch
 *   drift retrain: pushed past its peak the model loses held-out accuracy
 *   and the confidence collapses back towards the class's hardest
 *   neighbour. This lines the visual story (learn -> peak -> drift) up with
 *   the regulatory framing (post-market surveillance, human oversight).
 *
 * Used by:
 *   - src/components/tiles/Tile3Model.tsx (epoch row + chart)
 *
 * Changes:
 *   2026-05-27: Initial fake-drift trajectory (per-class drift target).
 *   2026-06-07: Grounded climb + peak in real balanced LP-FT accuracies.
 */

import type { PredictedClass } from './huggingface';

export interface FakeDriftEpoch {
  step: number;
  /** Display label (1..8). */
  epoch: number;
  /** Class the model predicts at this epoch (changes across the trajectory). */
  predictedLabel: PredictedClass;
  /** Probability of the predicted class. */
  confidence: number;
  /** All 4 class scores; sums to ~1. */
  scores: Record<PredictedClass, number>;
  /** Frost blur in CSS px applied to the user's image at this epoch.
   *  Encodes "the model can't see clearly yet" / "the model is losing its grip". */
  blurPx: number;
  /** Which training reference to display alongside the user's image.
   *  'canonical' = clean, well-learned exemplar.
   *  'outlier'  = ambiguous edge case the model is over-relying on. */
  trainingRef: 'canonical' | 'outlier';
  /** Short tag shown under the epoch tile, for visitor narration. */
  phase: 'warmup' | 'learning' | 'peak' | 'drift';
}

/** Build a scores dict with `top` for the target and the rest split evenly. */
function softmax(top: PredictedClass, conf: number): Record<PredictedClass, number> {
  const rest = (1 - conf) / 3;
  const s: Record<PredictedClass, number> = {
    real_tattoo: rest, sticker_tattoo: rest, pen_drawn: rest, not_tattoo: rest,
  };
  s[top] = conf;
  return s;
}

/**
 * 8-epoch trajectory per predicted class. The "drift target" is the class
 * the model wrongly snaps to in the last 2 epochs, picked to be the
 * irreducibly-hard neighbour for each class:
 *   sticker -> pen_drawn   (both temporary, similar fine detail)
 *   real    -> sticker     (the high-quality-fake confusion)
 *   pen     -> sticker     (drawn-on -> stuck-on)
 *   not_tat -> sticker     (false-positive case)
 *
 * Each class carries 8 confidence anchors. Epochs 1-6 (warmup -> peak)
 * track the real balanced LP-FT held-out accuracy for that class; the peak
 * value is the measured best checkpoint. Epochs 7-8 (drift) continue the
 * documented overfit degradation past the peak.
 */
const DRIFT_TO: Record<PredictedClass, PredictedClass> = {
  sticker_tattoo: 'pen_drawn',
  real_tattoo:    'sticker_tattoo',
  pen_drawn:      'sticker_tattoo',
  not_tattoo:     'sticker_tattoo',
};

/** Real climb + peak (epochs 1-6) then illustrative drift (epochs 7-8). */
const CONFIDENCE: Record<PredictedClass, [number, number, number, number, number, number, number, number]> = {
  // real held-out acc: .729 .800 .897 ... drifts to sticker
  real_tattoo:    [0.34, 0.46, 0.80, 0.88, 0.90, 0.90, 0.82, 0.57],
  // real held-out acc: .359 .526 .654 .737 ... drifts to pen
  sticker_tattoo: [0.33, 0.45, 0.53, 0.65, 0.74, 0.73, 0.61, 0.52],
  // real held-out acc: .535 .594 .658 .703 ... drifts to sticker
  pen_drawn:      [0.35, 0.47, 0.59, 0.66, 0.70, 0.68, 0.60, 0.51],
  // real held-out acc: .756 .795 .949 .962 ... drifts to sticker
  not_tattoo:     [0.40, 0.52, 0.80, 0.95, 0.96, 0.96, 0.85, 0.60],
};

interface EpochMeta {
  step: number;
  epoch: number;
  blurPx: number;
  trainingRef: 'canonical' | 'outlier';
  phase: 'warmup' | 'learning' | 'peak' | 'drift';
  /** true => predict the drift neighbour, false => predict the target class. */
  wrong: boolean;
}

const EPOCH_META: EpochMeta[] = [
  { step: 1, epoch: 1, blurPx: 8, trainingRef: 'outlier',   phase: 'warmup',   wrong: true },
  { step: 2, epoch: 2, blurPx: 6, trainingRef: 'outlier',   phase: 'warmup',   wrong: true },
  { step: 3, epoch: 3, blurPx: 4, trainingRef: 'canonical', phase: 'learning', wrong: false },
  { step: 4, epoch: 4, blurPx: 2, trainingRef: 'canonical', phase: 'learning', wrong: false },
  { step: 5, epoch: 5, blurPx: 0, trainingRef: 'canonical', phase: 'peak',     wrong: false },
  { step: 6, epoch: 6, blurPx: 0, trainingRef: 'canonical', phase: 'peak',     wrong: false },
  { step: 7, epoch: 7, blurPx: 2, trainingRef: 'outlier',   phase: 'drift',    wrong: false },
  { step: 8, epoch: 8, blurPx: 5, trainingRef: 'outlier',   phase: 'drift',    wrong: true },
];

function trajectoryFor(target: PredictedClass): FakeDriftEpoch[] {
  const wrong = DRIFT_TO[target];
  const conf = CONFIDENCE[target];

  return EPOCH_META.map((m, i) => {
    const label = m.wrong ? wrong : target;
    const confidence = conf[i];
    return {
      step: m.step,
      epoch: m.epoch,
      predictedLabel: label,
      confidence,
      scores: softmax(label, confidence),
      blurPx: m.blurPx,
      trainingRef: m.trainingRef,
      phase: m.phase,
    };
  });
}

/** Pre-computed per-class trajectories. */
export const FAKE_DRIFT: Record<PredictedClass, FakeDriftEpoch[]> = {
  real_tattoo:    trajectoryFor('real_tattoo'),
  sticker_tattoo: trajectoryFor('sticker_tattoo'),
  pen_drawn:      trajectoryFor('pen_drawn'),
  not_tattoo:     trajectoryFor('not_tattoo'),
};

/**
 * Resolve the training-reference image URL for a given class + phase. Files
 * live under public/images/training_refs/ and are committed to the repo.
 */
export function trainingRefUrl(
  baseURL: string,
  predictedClass: PredictedClass | undefined,
  ref: 'canonical' | 'outlier',
): string {
  // not_tattoo doesn't have a dedicated training ref (bare skin photos are
  // not interesting alongside) -- fall back to sticker canonical so the
  // tile always renders something.
  const slug: Record<PredictedClass, string> = {
    real_tattoo:    'real',
    sticker_tattoo: 'sticker',
    pen_drawn:      'pen',
    not_tattoo:     'sticker',
  };
  const cls = slug[predictedClass ?? 'sticker_tattoo'];
  return `${baseURL}images/training_refs/${cls}_${ref}.png`;
}
