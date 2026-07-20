/**
 * Purpose:
 *   Fetches nearest-neighbour training images for the user's photo against
 *   all three model tiers in parallel. Returns a per-tier cache plus the
 *   current loading / error state. The "fetch once, swap client-side"
 *   strategy keeps tier toggles instant — the moment the user flips a shield,
 *   the new tier's neighbours are already in memory.
 *
 * Dependencies:
 *   - React (useEffect, useState, useRef)
 *   - The backend KNN endpoint at /api/models/{tier}/similar (in dev) or
 *     the same path under the production Cloudflare tunnel.
 *
 * Used by:
 *   - src/components/sections/UnderTheHoodSection.tsx (and any future tile
 *     that needs per-tier similarity data)
 *
 * Changes:
 *   2026-05-18: Initial. One fetch per tier, fired in parallel when
 *               userImageUrl + predictedClass are both present.
 */

import { useEffect, useRef, useState } from 'react';

export type SimTier = 'balanced' | 'unbalanced' | 'uncleaned';

export interface SimNeighbour {
  path: string;
  similarity: number;
  /** Base64 JPEG, or null if the source file could not be read. */
  thumbnail: string | null;
}

export interface TierSimilarity {
  variant: SimTier;
  class: string;
  k: number;
  mean_similarity: number | null;
  neighbours: SimNeighbour[];
  warning?: string;
}

export interface KnnState {
  balanced: TierSimilarity | null;
  unbalanced: TierSimilarity | null;
  uncleaned: TierSimilarity | null;
  loading: boolean;
  error: string | null;
}

const TIERS: SimTier[] = ['balanced', 'unbalanced', 'uncleaned'];

// In dev the vite proxy rewrites /api/models/* -> the local FastAPI. In
// production the same path is reachable through the existing tunnel — both
// already work for the other model endpoints, so KNN reuses the same URL.
const API_BASE = '/api/models';

/**
 * Convert the data URL we store for the user's photo into a Blob suitable
 * for a fetch body. The KNN endpoint expects raw image bytes, the same way
 * the inference endpoints already do.
 */
async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function fetchTier(
  tier: SimTier,
  imageBlob: Blob,
  predictedClass: string,
  k: number,
  signal: AbortSignal,
): Promise<TierSimilarity> {
  // Global search, no class filter. Restricting to the predicted class
  // pre-answered the tile's own question — within one class every tier ranks
  // the obvious matches identically, which is why toggling the bias shield
  // returned byte-identical results. Measured on a sticker query at k=8:
  // class-filtered gave 4/4 identical across tiers; global gives 4/8 differing
  // and surfaces an off-class neighbour in the skewed tiers. This also matches
  // the checkpoint endpoint, so both tiles now ask the same question.
  const url = `${API_BASE}/tattoo-${tier}/similar?k=${k}`;
  const response = await fetch(url, {
    method: 'POST',
    body: imageBlob,
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(`${tier}: ${response.status} ${text.slice(0, 200)}`);
  }
  return response.json();
}

/**
 * Hook entry point. Pass in the user's photo data URL and the predicted
 * class; receive back the per-tier neighbour sets and loading state.
 * Re-runs whenever the image or class changes. Aborts in-flight fetches
 * if either changes mid-flight to avoid stale state writes.
 */
export function useKnnSimilarity(
  userImageUrl: string | null | undefined,
  predictedClass: string | undefined,
  k = 8,
): KnnState {
  const [state, setState] = useState<KnnState>({
    balanced: null,
    unbalanced: null,
    uncleaned: null,
    loading: false,
    error: null,
  });

  // Track the latest invocation so out-of-order responses can be discarded.
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!userImageUrl || !predictedClass) {
      setState({
        balanced: null,
        unbalanced: null,
        uncleaned: null,
        loading: false,
        error: null,
      });
      return;
    }

    const runId = ++runIdRef.current;
    const controller = new AbortController();
    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const blob = await dataUrlToBlob(userImageUrl);
        const results = await Promise.all(
          TIERS.map((tier) => fetchTier(tier, blob, predictedClass, k, controller.signal)),
        );
        if (runId !== runIdRef.current) return; // stale, ignore
        setState({
          balanced: results[0],
          unbalanced: results[1],
          uncleaned: results[2],
          loading: false,
          error: null,
        });
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') return;
        if (runId !== runIdRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    })();

    return () => controller.abort();
  }, [userImageUrl, predictedClass, k]);

  return state;
}
