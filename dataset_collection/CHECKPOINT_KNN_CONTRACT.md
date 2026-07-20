# Per-checkpoint nearest neighbours — interface contract

Shared spec so backend and frontend can be built independently. Do not change
anything here without updating both sides.

## Why this feature exists

Tile 3 currently pairs each training epoch with a static training-reference
image (identical for all 9 epochs) and the user's photo blurred in proportion to
confidence. Over a realistic 36–60% confidence range that blur spans 5.1px to
3.2px, which is imperceptible, so the tile communicates nothing per-epoch.

Per-epoch attention heatmaps were investigated and rejected on evidence:

- Adebayo et al. (NeurIPS 2018) show Guided BackProp / Guided Grad-CAM are
  invariant to progressive weight randomisation — they cannot distinguish a
  trained checkpoint from a randomised one, which is precisely the distinction
  a per-epoch tile would be claiming to draw.
- Wu et al. (CVPR 2024) find standard deletion/insertion faithfulness metrics
  cannot separate advanced ViT explanation methods from random attribution.
- Attention rollout (Abnar & Zuidema, ACL 2020) is class-agnostic by
  construction, so it cannot answer "why sticker rather than pen".
- Class-specific alternatives (Chefer et al., LRP) need backward passes:
  LRP runs at 4.0 fps vs GradCAM's 108 fps on ViT-B/16, which would take the
  existing ~2.5s budget for 9 checkpoints to roughly 7–8s.

Nearest-neighbour retrieval in each checkpoint's own embedding space is
**faithful by construction**: it is not an interpretation of the model, it is
the model's own geometry. No gradients, no extra forward passes beyond those
already being run, and nothing that can look plausible while being wrong.

## Endpoint

```
POST /models/{model_name}/checkpoints/{step}/similar?k=4
body: raw image bytes (same as the existing /similar and /checkpoints/{step})
```

`model_name` is `tattoo-balanced` | `tattoo-unbalanced` | `tattoo-uncleaned`.
`step` is the checkpoint number (1..9). `k` defaults to 4, clamped to [1, 32].

### Response

```json
{
  "variant": "balanced",
  "step": 3,
  "epoch": 3,
  "k": 4,
  "mean_similarity": 0.4512,
  "neighbours": [
    { "path": "sticker_tattoo/abc123.png",
      "class": "sticker_tattoo",
      "similarity": 0.6161,
      "thumbnail": "<base64 jpeg, 112x112>" }
  ]
}
```

Mirrors the existing `/models/{name}/similar` response, plus `step` and `epoch`.
Similarity is cosine in [-1, 1] on L2-normalised vectors. Neighbours are sorted
by descending similarity. Search is over the whole corpus (no class filter):
the point is to show what the checkpoint considers similar, not to confirm a
label.

### Errors

- 404 unknown `model_name`
- 404 checkpoint `step` not found for that variant
- 400 `k` not an integer
- 503 embeddings for that checkpoint have not been precomputed — body should
  name the missing file so the cause is obvious

## Embedding files

```
dataset_collection/embeddings_checkpoint/{variant}/step-{n}.npz
  embeddings : float32 [N, 768], L2-normalised
  paths      : str [N], relative to data/{variant}/  e.g. "sticker_tattoo/x.png"
```

Produced by embedding every training image of that variant through
`checkpoint-{n}`'s **trunk** (`model.vit`), not the classifier head — the head
collapses each image to 4 logits and destroys the detail k-NN needs.

The query image must be embedded with the SAME checkpoint, or the dot product
compares points in two unrelated spaces and the neighbours are meaningless.

## Frontend contract

Hook `useCheckpointNeighbours(userImageUrl, tier, steps)` returns:

```ts
{
  byStep: Record<number, {
    step: number;
    epoch: number | null;
    neighbours: { path: string; cls: string; similarity: number; thumbnail: string | null }[];
    meanSimilarity: number | null;
    loading: boolean;
    error: string | null;
  }>;
  loading: boolean;   // true until every requested step has resolved
  error: string | null;
}
```

Requirements:

- refetch when `userImageUrl` changes; a new photo invalidates everything
- cache per (image, tier, step) so toggling back to a visited tier is instant
- fire the per-step requests in parallel, but tolerate partial failure: one
  checkpoint erroring must not blank the others
- guard against out-of-order responses (a stale request resolving late must not
  overwrite a newer one)

## Performance

Nine steps x ~276ms/forward = ~2.5s on the 4-core CPU box, matching the existing
checkpoint-inference path. Embedding files are ~4.4MB (balanced) to ~18MB
(unbalanced) each; load them lazily per checkpoint and cache, or the resident
set for one tier reaches ~160MB.
