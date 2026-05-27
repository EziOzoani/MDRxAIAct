/**
 * Purpose:
 *   Deterministic 8-epoch trajectory used by Tile 3 to illustrate the
 *   training -> peak -> drift narrative for the MDR + AI Act demo.
 *
 *   The live model only ever climbs (57 -> 80% over 9 epochs) so it cannot
 *   show drift on its own. This config fabricates a plausible drift curve
 *   and pairs each epoch with a real training reference image, so the
 *   visual story (model learns -> peaks -> drifts to wrong class) lines up
 *   with the regulatory framing (post-market surveillance, human oversight).
 *
 *   When the 15-epoch real-drift retrain finishes on the SLURM cluster the
 *   contents of this file will be replaced with real numbers, leaving the
 *   shape of the export untouched.
 *
 * Used by:
 *   - src/components/tiles/Tile3Model.tsx (epoch row + chart)
 *
 * Changes:
 *   2026-05-27: Initial fake-drift trajectory (per-class drift target).
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
 * the model wrongly snaps to in the last 2 epochs — picked to be the
 * irreducibly-hard neighbour for each class:
 *   sticker -> pen_drawn   (both temporary, similar fine detail)
 *   real    -> sticker     (the high-quality-fake confusion)
 *   pen     -> sticker     (drawn-on -> stuck-on)
 *   not_tat -> sticker     (false-positive case)
 */
function trajectoryFor(target: PredictedClass): FakeDriftEpoch[] {
  const driftTo: Record<PredictedClass, PredictedClass> = {
    sticker_tattoo: 'pen_drawn',
    real_tattoo:    'sticker_tattoo',
    pen_drawn:      'sticker_tattoo',
    not_tattoo:     'sticker_tattoo',
  };
  const wrong = driftTo[target];

  return [
    { step: 1, epoch: 1, predictedLabel: wrong,  confidence: 0.32, blurPx: 8, trainingRef: 'outlier',   phase: 'warmup',
      scores: softmax(wrong, 0.32) },
    { step: 2, epoch: 2, predictedLabel: wrong,  confidence: 0.45, blurPx: 6, trainingRef: 'outlier',   phase: 'warmup',
      scores: softmax(wrong, 0.45) },
    { step: 3, epoch: 3, predictedLabel: target, confidence: 0.61, blurPx: 4, trainingRef: 'canonical', phase: 'learning',
      scores: softmax(target, 0.61) },
    { step: 4, epoch: 4, predictedLabel: target, confidence: 0.78, blurPx: 2, trainingRef: 'canonical', phase: 'learning',
      scores: softmax(target, 0.78) },
    { step: 5, epoch: 5, predictedLabel: target, confidence: 0.87, blurPx: 0, trainingRef: 'canonical', phase: 'peak',
      scores: softmax(target, 0.87) },
    { step: 6, epoch: 6, predictedLabel: target, confidence: 0.89, blurPx: 0, trainingRef: 'canonical', phase: 'peak',
      scores: softmax(target, 0.89) },
    { step: 7, epoch: 7, predictedLabel: target, confidence: 0.76, blurPx: 2, trainingRef: 'outlier',   phase: 'drift',
      scores: softmax(target, 0.76) },
    { step: 8, epoch: 8, predictedLabel: wrong,  confidence: 0.58, blurPx: 5, trainingRef: 'outlier',   phase: 'drift',
      scores: softmax(wrong, 0.58) },
  ];
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
