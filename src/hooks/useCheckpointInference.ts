/**
 * Purpose:
 *   Runs the user's photo through every epoch checkpoint of the active
 *   model tier and returns the predictions trajectory — what the model
 *   thought about this specific image at training step 1, 2, 3, 4 and 5.
 *
 *   This is the data layer behind Tile 3 ("How the model learned your
 *   image"). The endpoint exposed by serve_models.py is hit once per
 *   checkpoint (5 parallel calls per tier) so the result lands as quickly
 *   as the slowest checkpoint allows.
 *
 *   Caching strategy: per-tier results are kept across re-renders so
 *   toggling shields back and forth doesn't trigger fresh inference for
 *   tiers we've already computed. New uploads invalidate everything.
 *
 * Dependencies:
 *   - React (useEffect, useState, useRef)
 *   - Backend endpoints:
 *       GET  /api/models/tattoo-{tier}/checkpoints       — list + metrics
 *       POST /api/models/tattoo-{tier}/checkpoints/{step} — inference at step
 *
 * Used by:
 *   - src/components/tiles/Tile3Model.tsx (rendered inside UTH)
 *
 * Changes:
 *   2026-05-18: Initial. Lazy per-tier fetch (current tier only on first
 *               call) with caching, so the demo's 15 possible inference
 *               calls don't all fire upfront on CPU.
 */

import { useEffect, useRef, useState } from 'react';
import type { SimTier } from './useKnnSimilarity';

const API_BASE = '/api/models';

export interface CheckpointMetrics {
  eval_accuracy?: number;
  eval_f1?: number;
  eval_acc_real_tattoo?: number;
  eval_acc_sticker_tattoo?: number;
  eval_acc_pen_drawn?: number;
  eval_acc_not_tattoo?: number;
  eval_loss?: number;
}

export interface CheckpointEntry {
  step: number;
  epoch: number | null;
  metrics: CheckpointMetrics;
}

export interface CheckpointPrediction {
  step: number;
  epoch: number | null;
  /** Best class for the user's image at this checkpoint. */
  predictedLabel: string;
  /** Probability of the predicted class. */
  confidence: number;
  /** All 4 class scores. */
  scores: Record<string, number>;
  /** Training metrics at this checkpoint, for the trajectory chart. */
  metrics: CheckpointMetrics;
}

export interface TierCheckpoints {
  tier: SimTier;
  predictions: CheckpointPrediction[];
  /** True until every checkpoint inference for this tier has returned. */
  loading: boolean;
  error: string | null;
}

export interface CheckpointInferenceState {
  byTier: Partial<Record<SimTier, TierCheckpoints>>;
  /** Convenience: the result for the currently-active tier. */
  current: TierCheckpoints | null;
}

const LABEL_TO_CLASS: Record<string, string> = {
  LABEL_0: 'real_tattoo',
  LABEL_1: 'sticker_tattoo',
  LABEL_2: 'pen_drawn',
  LABEL_3: 'not_tattoo',
};

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function listCheckpoints(tier: SimTier, signal: AbortSignal): Promise<CheckpointEntry[]> {
  const response = await fetch(`${API_BASE}/tattoo-${tier}/checkpoints`, { signal });
  if (!response.ok) {
    throw new Error(`Listing ${tier} checkpoints: ${response.status}`);
  }
  const data = await response.json();
  return data.checkpoints ?? [];
}

async function infer(
  tier: SimTier,
  step: number,
  blob: Blob,
  signal: AbortSignal,
): Promise<{ predictedLabel: string; confidence: number; scores: Record<string, number> }> {
  const response = await fetch(`${API_BASE}/tattoo-${tier}/checkpoints/${step}`, {
    method: 'POST',
    body: blob,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Inferring ${tier}@${step}: ${response.status}`);
  }
  // Response shape matches the regular classify endpoint: array of
  // {label, score}, sorted by score descending.
  const raw: Array<{ label: string; score: number }> = await response.json();
  const scores: Record<string, number> = {};
  for (const { label, score } of raw) {
    const className = LABEL_TO_CLASS[label] ?? label;
    scores[className] = score;
  }
  const top = raw[0];
  return {
    predictedLabel: LABEL_TO_CLASS[top.label] ?? top.label,
    confidence: top.score,
    scores,
  };
}

/**
 * Hook entry point. Pass in the user's photo data URL and the active tier.
 * Returns the trajectory for that tier plus a per-tier cache so subsequent
 * toggles back to a previously-loaded tier are instant.
 */
export function useCheckpointInference(
  userImageUrl: string | null | undefined,
  tier: SimTier,
): CheckpointInferenceState {
  const [byTier, setByTier] = useState<Partial<Record<SimTier, TierCheckpoints>>>({});

  // What we've already started fetching, keyed by `${image}::${tier}`. Lives
  // in a ref — NOT in the effect deps — so triggering a fetch doesn't make
  // the effect re-run and abort its own in-flight request. The previous
  // version put `byTier` in the deps, which self-aborted on the first
  // setByTier and left the tile stuck on "loading" forever.
  const startedRef = useRef<Set<string>>(new Set());
  // Identity of the current image, so a new upload resets the cache.
  const imageRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (!userImageUrl) {
      startedRef.current.clear();
      imageRef.current = undefined;
      setByTier({});
      return;
    }

    // New upload → wipe everything and start fresh for this tier.
    if (imageRef.current !== userImageUrl) {
      imageRef.current = userImageUrl;
      startedRef.current.clear();
      setByTier({});
    }

    const key = `${userImageUrl}::${tier}`;
    if (startedRef.current.has(key)) return; // already fetching / fetched
    startedRef.current.add(key);

    const controller = new AbortController();

    // Optimistic loading marker so the UI shows a spinner immediately.
    setByTier((prev) => ({
      ...prev,
      [tier]: { tier, predictions: [], loading: true, error: null },
    }));

    (async () => {
      try {
        const blob = await dataUrlToBlob(userImageUrl);
        const checkpoints = await listCheckpoints(tier, controller.signal);
        if (checkpoints.length === 0) {
          throw new Error(`No checkpoints found for ${tier}`);
        }

        // Run all 5 inference calls in parallel. The backend caches the
        // first hit to each checkpoint, so later users get a faster paint.
        const inferences = await Promise.all(
          checkpoints.map((c) => infer(tier, c.step, blob, controller.signal)),
        );

        const predictions: CheckpointPrediction[] = checkpoints.map((c, i) => ({
          step: c.step,
          epoch: c.epoch,
          predictedLabel: inferences[i].predictedLabel,
          confidence: inferences[i].confidence,
          scores: inferences[i].scores,
          metrics: c.metrics,
        }));

        setByTier((prev) => ({
          ...prev,
          [tier]: { tier, predictions, loading: false, error: null },
        }));
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        // Allow a retry of this key since it failed.
        startedRef.current.delete(key);
        setByTier((prev) => ({
          ...prev,
          [tier]: {
            tier,
            predictions: [],
            loading: false,
            error: err instanceof Error ? err.message : String(err),
          },
        }));
      }
    })();

    // NOTE: deliberately no abort in cleanup. Checkpoint inference is
    // expensive (cold model loads); aborting on every tier toggle would
    // waste the work and, combined with React strict-mode double-invoke,
    // reintroduce the stuck-loading bug. Stale responses are harmless —
    // they write into the per-tier cache slot they belong to.
  }, [userImageUrl, tier]);

  return {
    byTier,
    current: byTier[tier] ?? null,
  };
}
