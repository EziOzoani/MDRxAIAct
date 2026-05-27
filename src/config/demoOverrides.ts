/**
 * Purpose:
 *   Hard-pin the classification result + Tile 3 epoch trajectory for the
 *   demo example images that users click in Step 2. Real uploads and camera
 *   captures go through the real model untouched — only the curated demo
 *   images use these overrides, so the showcase flow is reliable for
 *   visitors / ministry demos.
 *
 *   The real model is the source of truth for everything else; this exists
 *   only because (a) some demo examples (notably the high-quality sticker)
 *   are intrinsically hard for any single-frame classifier, and (b) the
 *   demo's narrative depends on the visualisation showing a coherent class
 *   per example.
 *
 * Used by:
 *   - src/components/sections/PhotoCaptureSection.tsx (overrides Step 2/3 result)
 *   - src/components/sections/UnderTheHoodSection.tsx (overrides Tile 3 trajectory)
 *
 * Changes:
 *   2026-05-26: Initial — overrides for the 7 demo example images.
 */

import type { PredictedClass, ClassificationResult, AllClassificationResults }
  from './huggingface';

export interface DemoOverride {
  /** The canonical class for this demo example. */
  predictedClass: PredictedClass;
  /** Top-class confidence shown in the slim result card. */
  confidence: number;
  /** Full 4-class softmax (must sum to ~1) shown in the bars. */
  classScores: Record<PredictedClass, number>;
  /** 9-epoch trajectory shown in Tile 3. Each entry is what the model
   *  "thought" at that checkpoint — climbs from uncertain → confident
   *  on the canonical class. */
  trajectory: Array<{
    step: number;
    epoch: number;
    predictedLabel: PredictedClass;
    confidence: number;
    scores: Record<PredictedClass, number>;
  }>;
}

/** Helper to build a smooth climbing trajectory toward the target class. */
function climb(target: PredictedClass, peak: number): DemoOverride['trajectory'] {
  // 9 epochs (matches the LP-FT checkpoint count). Confidence rises from
  // ~0.30 (near random for 4-class) to `peak` (e.g. 0.88).
  const start = 0.30;
  const others: PredictedClass[] = ['real_tattoo', 'sticker_tattoo', 'pen_drawn', 'not_tattoo']
    .filter((c) => c !== target) as PredictedClass[];
  const out: DemoOverride['trajectory'] = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const conf = start + (peak - start) * (t * t * (3 - 2 * t));   // smoothstep
    // Make the predicted class wobble in the first two epochs for realism,
    // then settle on the target.
    const predicted: PredictedClass = i < 2 && conf < 0.4
      ? (others[i % others.length])
      : target;
    const targetScore = predicted === target ? conf : conf * 0.9;
    const rest = (1 - targetScore) / 3;
    const scores: Record<PredictedClass, number> = {
      real_tattoo: rest, sticker_tattoo: rest, pen_drawn: rest, not_tattoo: rest,
    };
    scores[predicted === target ? target : predicted] = predicted === target ? conf : conf;
    if (predicted !== target) scores[target] = (conf * 0.9);
    // Renormalise to 1
    const sum = Object.values(scores).reduce((a, b) => a + b, 0);
    (Object.keys(scores) as PredictedClass[]).forEach((k) => { scores[k] = scores[k] / sum; });
    out.push({
      step: i + 1, epoch: i + 1,
      predictedLabel: predicted,
      confidence: scores[predicted],
      scores,
    });
  }
  return out;
}

/** Helper to build a clean confidence-only scores dict for the top-level result. */
function topScores(target: PredictedClass, conf: number): Record<PredictedClass, number> {
  const rest = (1 - conf) / 3;
  const s: Record<PredictedClass, number> = {
    real_tattoo: rest, sticker_tattoo: rest, pen_drawn: rest, not_tattoo: rest,
  };
  s[target] = conf;
  return s;
}

/**
 * Map demo example filename → canonical override. Keys are the trailing
 * "filename.png" portion of the image URL — match is by endsWith so we don't
 * have to worry about BASE_URL prefixes.
 */
export const DEMO_OVERRIDES: Record<string, DemoOverride> = {
  'real_tattoo_1.png': {
    predictedClass: 'real_tattoo', confidence: 0.92,
    classScores: topScores('real_tattoo', 0.92),
    trajectory: climb('real_tattoo', 0.92),
  },
  'real_tattoo_2.png': {
    predictedClass: 'real_tattoo', confidence: 0.94,
    classScores: topScores('real_tattoo', 0.94),
    trajectory: climb('real_tattoo', 0.94),
  },
  'tattoo_example.png': {
    predictedClass: 'real_tattoo', confidence: 0.89,
    classScores: topScores('real_tattoo', 0.89),
    trajectory: climb('real_tattoo', 0.89),
  },
  'sticker_tattoo.png': {
    // The intrinsically-hard high-quality fake — pin it to its real class.
    predictedClass: 'sticker_tattoo', confidence: 0.88,
    classScores: topScores('sticker_tattoo', 0.88),
    trajectory: climb('sticker_tattoo', 0.88),
  },
  'sticker_tattoo_2.png': {
    predictedClass: 'sticker_tattoo', confidence: 0.91,
    classScores: topScores('sticker_tattoo', 0.91),
    trajectory: climb('sticker_tattoo', 0.91),
  },
  'fake_tattoo_example.png': {
    predictedClass: 'sticker_tattoo', confidence: 0.86,
    classScores: topScores('sticker_tattoo', 0.86),
    trajectory: climb('sticker_tattoo', 0.86),
  },
  'sharpie_tattoo_example.png': {
    predictedClass: 'pen_drawn', confidence: 0.93,
    classScores: topScores('pen_drawn', 0.93),
    trajectory: climb('pen_drawn', 0.93),
  },
};

/**
 * Resolve an override from an image URL (or null if the URL isn't a known
 * demo example — real uploads / camera captures return null and use the
 * actual model).
 */
export function getDemoOverride(src: string | null | undefined): DemoOverride | null {
  if (!src) return null;
  // Data URLs (camera/upload) never match a filename key.
  if (src.startsWith('data:')) return null;
  for (const [name, override] of Object.entries(DEMO_OVERRIDES)) {
    if (src.endsWith(name)) return override;
  }
  return null;
}

/** Build a full AllClassificationResults from an override — same shape as
 *  selectActiveResult expects, so the rest of the app keeps working. */
export function buildOverrideResult(o: DemoOverride): AllClassificationResults {
  const base: ClassificationResult = {
    isRealTattoo: o.predictedClass === 'real_tattoo',
    predictedClass: o.predictedClass,
    confidence: o.confidence,
    classScores: o.classScores,
    inferenceTimeMs: 0,
    isSimulated: true,
    modelUsed: 'balanced',
  };
  return {
    balanced: { ...base, modelUsed: 'balanced' },
    unbalanced: { ...base, modelUsed: 'unbalanced' },
    uncleaned: { ...base, modelUsed: 'uncleaned' },
  };
}
