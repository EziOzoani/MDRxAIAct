/**
 * Purpose:
 *   Single source of truth for the inference API base URL.
 *
 *   Three hooks (useKnnSimilarity, useCheckpointInference,
 *   useCheckpointNeighbours) each hardcoded '/api/models', which exists only as
 *   a vite dev-server proxy. In a production build that resolves against the
 *   GitHub Pages origin — eziozoani.github.io/api/models/... — and 404s, so the
 *   whole Under-the-Hood section (neighbours, per-epoch inference, checkpoint
 *   listing) was dead on the deployed site while working perfectly on
 *   localhost. Symptom seen in the wild: "Listing balanced checkpoints: 404".
 *
 *   huggingface.ts already switched on import.meta.env.DEV; this centralises
 *   that logic so a fourth caller cannot reintroduce the same bug.
 *
 * Dependencies:
 *   - vite's import.meta.env.DEV
 *
 * Used by:
 *   - src/hooks/useKnnSimilarity.ts
 *   - src/hooks/useCheckpointInference.ts
 *   - src/hooks/useCheckpointNeighbours.ts
 *
 * Changes:
 *   2026-07-20: Extracted after the hardcoded dev-only path was found to break
 *               production.
 */

/** No trailing slash — callers append `/tattoo-{tier}/...`. */
export const API_BASE: string = import.meta.env.DEV
  ? '/api/models'
  : 'https://35.210.194.145.nip.io/models';
