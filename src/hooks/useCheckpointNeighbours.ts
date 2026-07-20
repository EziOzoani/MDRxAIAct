/**
 * Purpose:
 *   Fetches the nearest training images to the user's photo *in each
 *   checkpoint's own embedding space*, for every epoch of the active tier.
 *
 *   This is the data layer behind the per-epoch panel of Tile 3. Unlike an
 *   attention heatmap, a nearest-neighbour set is faithful by construction:
 *   it is not an interpretation of the model, it is the model's own geometry,
 *   so what changes between epoch 1 and epoch 9 is a real change in what the
 *   network considers "close" to the user's image.
 *
 *   Caching strategy: results are cached per (image, tier, step), so toggling
 *   shields back to an already-visited tier repaints instantly. A new upload
 *   invalidates the whole cache — neighbours are only meaningful relative to
 *   the query image that produced them.
 *
 *   Partial failure is expected, not exceptional: the backend answers 503 for
 *   any checkpoint whose embedding file has not been precomputed yet, which is
 *   the common case until the precompute job has run over every variant. One
 *   step erroring must therefore never blank the steps that did succeed.
 *
 * Dependencies:
 *   - React (useEffect, useState, useRef)
 *   - Backend endpoints:
 *       GET  /api/models/tattoo-{tier}/checkpoints                  — step list
 *       POST /api/models/tattoo-{tier}/checkpoints/{step}/similar?k — k-NN
 *   - src/hooks/useKnnSimilarity.ts (SimTier)
 *
 * Used by:
 *   - src/components/tiles/Tile3Model.tsx
 *
 * Changes:
 *   2026-07-19: Initial. Parallel per-step k-NN with per-(image,tier,step)
 *               caching, per-step error isolation and a run-id staleness
 *               guard.
 */

import { useEffect, useRef, useState } from 'react';
import type { SimTier } from './useKnnSimilarity';
import { API_BASE } from '@/config/apiBase';

// Same base as the other model hooks: the vite proxy rewrites this to the
// local FastAPI in dev, and it resolves through the Cloudflare tunnel in
// production. Keeping it identical avoids a second URL to keep in sync.


export interface CheckpointNeighbour {
  /** Path relative to data/{variant}/, e.g. "sticker_tattoo/abc123.png". */
  path: string;
  /** Ground-truth class folder of the neighbour. Named `cls` because
   *  `class` is a reserved word — the backend sends it as `class`. */
  cls: string;
  /** Cosine similarity in [-1, 1] against L2-normalised vectors. */
  similarity: number;
  /** Base64 JPEG (112x112), or null if the source file could not be read. */
  thumbnail: string | null;
}

export interface StepNeighbours {
  step: number;
  epoch: number | null;
  neighbours: CheckpointNeighbour[];
  meanSimilarity: number | null;
  loading: boolean;
  error: string | null;
}

export interface CheckpointNeighboursState {
  byStep: Record<number, StepNeighbours>;
  /** True until every requested step has resolved, successfully or not. */
  loading: boolean;
  /** Set only when the whole run failed (e.g. the step list could not be
   *  fetched). Per-step failures live on the step, so the tile can still
   *  render the epochs that worked. */
  error: string | null;
}

/** Raw response shape from POST /checkpoints/{step}/similar. */
interface SimilarResponse {
  variant?: string;
  step?: number;
  epoch?: number | null;
  k?: number;
  mean_similarity?: number | null;
  neighbours?: Array<{
    path: string;
    class: string;
    similarity: number;
    thumbnail: string | null;
  }>;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function listCheckpointSteps(tier: SimTier): Promise<number[]> {
  const response = await fetch(`${API_BASE}/tattoo-${tier}/checkpoints`);
  if (!response.ok) {
    throw new Error(`Listing ${tier} checkpoints: ${response.status}`);
  }
  const data = await response.json();
  const entries: Array<{ step: number }> = data.checkpoints ?? [];
  return entries.map((entry) => entry.step);
}

async function fetchStepNeighbours(
  tier: SimTier,
  step: number,
  blob: Blob,
  k: number,
): Promise<StepNeighbours> {
  const url = `${API_BASE}/tattoo-${tier}/checkpoints/${step}/similar?k=${k}`;
  const response = await fetch(url, { method: 'POST', body: blob });

  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    // 503 means the embeddings for this checkpoint were never precomputed.
    // It is a configuration gap rather than a fault, so it gets a message
    // the tile can show verbatim instead of a bare status code.
    const detail =
      response.status === 503
        ? 'Neighbours not available for this epoch yet (embeddings not precomputed).'
        : `${response.status} ${text.slice(0, 200)}`;
    throw new Error(detail);
  }

  const data: SimilarResponse = await response.json();
  return {
    step: data.step ?? step,
    epoch: data.epoch ?? null,
    neighbours: (data.neighbours ?? []).map((n) => ({
      path: n.path,
      cls: n.class,
      similarity: n.similarity,
      thumbnail: n.thumbnail ?? null,
    })),
    meanSimilarity: data.mean_similarity ?? null,
    loading: false,
    error: null,
  };
}

const cacheKey = (image: string, tier: SimTier, step: number) => `${image}::${tier}::${step}`;

/**
 * Hook entry point. Pass the user's photo data URL, the active tier and
 * optionally the steps to query; omit `steps` and the hook asks the backend
 * which checkpoints exist for that tier.
 */
export function useCheckpointNeighbours(
  userImageUrl: string | null | undefined,
  tier: SimTier,
  steps?: number[],
  k = 4,
): CheckpointNeighboursState {
  const [state, setState] = useState<CheckpointNeighboursState>({
    byStep: {},
    loading: false,
    error: null,
  });

  // Results keyed by (image, tier, step). Held in a ref rather than state so
  // that writing to the cache cannot retrigger the effect that fills it —
  // the same self-abort trap that once left useCheckpointInference stuck on
  // "loading" forever.
  const cacheRef = useRef<Map<string, StepNeighbours>>(new Map());
  // Identity of the photo the cache belongs to; a new upload wipes it.
  const imageRef = useRef<string | null | undefined>(undefined);
  // Monotonic run counter: a response from an older run must never publish
  // over a newer one, even though its data is still cached for later reuse.
  const runIdRef = useRef(0);

  // Serialise the steps so the effect compares by value; a caller passing a
  // fresh array literal each render would otherwise refetch on every render.
  const stepsKey = steps ? steps.join(',') : '';

  useEffect(() => {
    if (!userImageUrl) {
      runIdRef.current += 1; // invalidate anything still in flight
      cacheRef.current.clear();
      imageRef.current = undefined;
      setState({ byStep: {}, loading: false, error: null });
      return;
    }

    if (imageRef.current !== userImageUrl) {
      imageRef.current = userImageUrl;
      cacheRef.current.clear();
    }

    const runId = ++runIdRef.current;
    const image = userImageUrl;

    // Publish the cache slice for this run's steps. Called after every step
    // settles so the tile fills in progressively rather than waiting for the
    // slowest checkpoint.
    const publish = (requested: number[], done: boolean, fatal: string | null) => {
      if (runId !== runIdRef.current) return; // stale run, drop the write
      const byStep: Record<number, StepNeighbours> = {};
      for (const step of requested) {
        const cached = cacheRef.current.get(cacheKey(image, tier, step));
        byStep[step] = cached ?? {
          step,
          epoch: null,
          neighbours: [],
          meanSimilarity: null,
          loading: true,
          error: null,
        };
      }
      setState({ byStep, loading: !done, error: fatal });
    };

    // Explicit steps let us paint the cached tier immediately; without them
    // the step list itself has to be fetched first.
    if (steps && steps.length > 0) {
      publish(steps, false, null);
    } else {
      setState((prev) => ({ ...prev, loading: true, error: null }));
    }

    (async () => {
      let requested: number[] = [];
      try {
        requested = steps && steps.length > 0 ? steps : await listCheckpointSteps(tier);
        if (runId !== runIdRef.current) return;
        if (requested.length === 0) {
          setState({ byStep: {}, loading: false, error: `No checkpoints found for ${tier}` });
          return;
        }
        publish(requested, false, null);

        const blob = await dataUrlToBlob(image);
        if (runId !== runIdRef.current) return;

        // Parallel, but each step settles independently: a rejected step
        // records its own error and leaves its siblings untouched. This is
        // why we do not use Promise.all, which would discard the successes.
        await Promise.all(
          requested.map(async (step) => {
            const key = cacheKey(image, tier, step);
            const cached = cacheRef.current.get(key);
            // A cached success or a cached error both count as settled;
            // re-requesting a 503 on every tier toggle would just re-fail.
            if (cached) {
              publish(requested, false, null);
              return;
            }
            try {
              cacheRef.current.set(key, await fetchStepNeighbours(tier, step, blob, k));
            } catch (err) {
              cacheRef.current.set(key, {
                step,
                epoch: null,
                neighbours: [],
                meanSimilarity: null,
                loading: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
            publish(requested, false, null);
          }),
        );

        publish(requested, true, null);
      } catch (err) {
        if (runId !== runIdRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();

    // NOTE: deliberately no abort in cleanup, matching useCheckpointInference.
    // Each per-step call runs a forward pass through a cold checkpoint;
    // aborting on every tier toggle throws that work away, and under React
    // strict-mode's double-invoke it reliably reintroduced a stuck-loading
    // bug. Staleness is handled by runId instead, and late responses still
    // land usefully in the (image, tier, step) cache.
  }, [userImageUrl, tier, stepsKey, k]);

  return state;
}
