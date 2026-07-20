/**
 * Purpose:
 *   Per-epoch nearest-neighbour view for Tile 3. For a chosen training
 *   checkpoint it shows the training images that checkpoint considered most
 *   similar to the user's photo, alongside a legible confidence trajectory.
 *
 *   This replaces the old per-epoch row, which paired a training reference
 *   that was IDENTICAL across all nine epochs with the user's photo blurred
 *   by 8px*(1-confidence). Across a realistic 36-60% confidence band that
 *   blur spans 5.1px to 3.2px, so nine tiles read as nine copies of the same
 *   picture and the visual carries no information.
 *
 *   Nearest-neighbour retrieval was chosen over per-epoch attention maps on
 *   evidence (see dataset_collection/CHECKPOINT_KNN_CONTRACT.md): saliency
 *   methods survive weight randomisation and so cannot distinguish one
 *   checkpoint from another, which is exactly the distinction being claimed.
 *   Retrieval in the checkpoint's own embedding space is faithful by
 *   construction — it is the model's geometry, not an interpretation of it.
 *
 *   Editorial rule this component holds to: never state a conclusion the data
 *   on screen does not support. Low similarity is reported as a finding, not
 *   hidden; missing data is reported as missing, never filled with stand-ins.
 *
 * Dependencies:
 *   - framer-motion (cross-fade between epochs)
 *   - lucide-react (icons)
 *   - @/lib/utils (cn)
 *
 * Used by:
 *   - src/components/tiles/Tile3Model.tsx (wired by its owner)
 *
 * Changes:
 *   2026-07-19: Initial — sparkline trajectory, selectable epoch, neighbour
 *               grid, honest empty / low-similarity states.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { Search, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One retrieved training image. Mirrors the hook's neighbour shape. */
export interface EpochNeighbour {
  path: string;
  cls: string;
  similarity: number;
  thumbnail: string | null;
}

/** Per-checkpoint retrieval result. Mirrors `byStep[n]` from the hook. */
export interface EpochNeighbourStep {
  step: number;
  epoch: number | null;
  neighbours: EpochNeighbour[];
  meanSimilarity: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * One point of the confidence trajectory Tile 3 already computes. Kept
 * structurally minimal so the caller can map its own epoch type onto it
 * without this component depending on Tile 3's internals.
 */
export interface EpochConfidencePoint {
  step: number;
  epoch: number | null;
  confidence: number;
  /** Checkpoint's own argmax, if known. Shown only when it is known. */
  predictedLabel?: string;
}

export interface EpochNeighboursProps {
  /** Per-step retrieval results, keyed by step, exactly as the hook returns. */
  byStep: Record<number, EpochNeighbourStep>;
  /** True until every requested step has resolved. */
  loading?: boolean;
  /** Fetch-wide error (as opposed to a single step's error). */
  error?: string | null;
  /** Confidence trajectory Tile 3 already has, so both can be read together. */
  trajectory?: EpochConfidencePoint[];
  /** The user's photo, shown as the query alongside its neighbours. */
  userImageUrl?: string | null;
  /** Drops the trajectory and prose, leaving just the neighbour grid. */
  compact?: boolean;
  /**
   * Mean cosine below which we say plainly that nothing in the training data
   * closely resembles the photo. 0.5 by default.
   */
  weakSimilarityThreshold?: number;
  className?: string;
}

const CLASS_DISPLAY: Record<string, string> = {
  real_tattoo: 'real_tattoo',
  sticker_tattoo: 'sticker',
  pen_drawn: 'pen_drawn',
  not_tattoo: 'not_tattoo',
};

// Same red/amber/green ramp Tile 3 uses for confidence, so the sparkline and
// the surrounding tile speak one visual language.
function confidenceColour(c: number): string {
  if (c >= 0.75) return '#22c55e';
  if (c >= 0.5) return '#f59e0b';
  return '#ef4444';
}

/**
 * The backend answers 503 until the per-checkpoint embedding files have been
 * precomputed, which is the *normal* state on a fresh deployment rather than a
 * fault. Detected so we can phrase it as "not ready yet" instead of "failed".
 */
function isNotPrecomputed(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes('503') || m.includes('precompute') || m.includes('not available');
}

export function EpochNeighbours({
  byStep,
  loading = false,
  error = null,
  trajectory = [],
  userImageUrl,
  compact = false,
  weakSimilarityThreshold = 0.5,
  className,
}: EpochNeighboursProps) {
  // Null means "follow the data" — the selection tracks the last step until
  // the user picks one, so a late-arriving trajectory does not strand us on a
  // step that no longer exists.
  const [pickedStep, setPickedStep] = useState<number | null>(null);

  const steps = useMemo(
    () => Object.values(byStep).sort((a, b) => a.step - b.step),
    [byStep],
  );

  // The trajectory is the spine of the view: it decides which steps exist and
  // in what order. Fall back to the retrieval results when Tile 3 has not
  // supplied one, so the grid still works on its own.
  const points: EpochConfidencePoint[] = useMemo(() => {
    if (trajectory.length > 0) return [...trajectory].sort((a, b) => a.step - b.step);
    return steps.map((s) => ({ step: s.step, epoch: s.epoch, confidence: NaN }));
  }, [trajectory, steps]);

  const lastStep = points.length > 0
    ? points[points.length - 1].step
    : steps[steps.length - 1]?.step ?? null;

  const activeStep = pickedStep !== null && (byStep[pickedStep] || points.some((p) => p.step === pickedStep))
    ? pickedStep
    : lastStep;

  const active = activeStep !== null ? byStep[activeStep] : undefined;
  const activePoint = points.find((p) => p.step === activeStep);
  const activeEpochLabel = active?.epoch ?? activePoint?.epoch ?? activeStep;

  const hasTrajectory = points.some((p) => Number.isFinite(p.confidence));

  // Consecutive steps whose neighbours are identical came from a frozen
  // backbone. Detect it from the data rather than hard-coding "6": the phase
  // boundary is a training hyper-parameter and a longer phase-2 run would move
  // it.
  const frozenUntil = (() => {
    const steps = Object.values(byStep)
      .filter((st) => st.neighbours.length > 0)
      .sort((a, b) => a.step - b.step);
    if (steps.length < 2) return null;
    const sig = (st: EpochNeighbourStep) =>
      st.neighbours.map((n) => n.path).join('|');
    const first = sig(steps[0]);
    let last = steps[0].step;
    for (const st of steps.slice(1)) {
      if (sig(st) !== first) break;
      last = st.step;
    }
    return last > steps[0].step ? last : null;
  })();

  // Steps that share the frozen trunk collapse to a single selectable entry.
  // Offering six identical choices implied six distinct states; one entry
  // labelled for what it is tells the truth and shortens the row.
  const selectableSteps = (() => {
    const all = Object.values(byStep).sort((a, b) => a.step - b.step);
    if (frozenUntil === null) return all;
    return all.filter((st) => st.step === 1 || st.step > frozenUntil);
  })();

  return (
    <div className={cn('w-full', className)}>
      {frozenUntil !== null && (
        <p className="mb-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 text-[10px] leading-snug text-muted-foreground">
          Epochs 1&ndash;{frozenUntil} share one result: during this phase the
          backbone was frozen and only the classifier head trained, so the
          model&rsquo;s sense of similarity could not change yet. It starts
          moving at epoch {frozenUntil + 1}.
        </p>
      )}
      {!compact && hasTrajectory && (
        <TrajectorySparkline
          points={points}
          activeStep={activeStep}
          onSelect={setPickedStep}
        />
      )}

      {/* Epoch chips double as the selector when there is no trajectory to
          click on — the grid must stay navigable on its own. */}
      {!compact && !hasTrajectory && points.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {points
            .filter((p) => selectableSteps.some((st) => st.step === p.step))
            .map((p) => (
            <button
              key={p.step}
              onClick={() => setPickedStep(p.step)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                p.step === activeStep
                  ? 'border-accent bg-accent/15 text-foreground'
                  : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted',
              )}
            >
              E{p.epoch ?? p.step}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/25 p-4">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            Closest training images at epoch {activeEpochLabel ?? '—'}
          </p>
          {activePoint && Number.isFinite(activePoint.confidence) && (
            <span
              className="font-mono text-xs"
              style={{ color: confidenceColour(activePoint.confidence) }}
            >
              {(activePoint.confidence * 100).toFixed(0)}% confident
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-start gap-4">
          {/* The query image is shown next to what was retrieved for it, so a
              weak match is something the eye can check rather than take on
              trust from the number. */}
          <div className="shrink-0">
            <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Your photo
            </p>
            <div className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted">
              {userImageUrl ? (
                <img src={userImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-center text-[10px] text-muted-foreground">
                  no photo
                </div>
              )}
            </div>
          </div>

          <div className="min-w-[200px] flex-1">
            <NeighbourRow
              step={active}
              stepLoading={loading}
              fetchError={error}
              activeStep={activeStep}
              weakSimilarityThreshold={weakSimilarityThreshold}
            />
          </div>
        </div>
      </div>

      {/* One line, non-expert readable, stating exactly what this is and — as
          importantly — what it is not. */}
      {!compact && (
        <p className="mt-2.5 text-center text-[11px] leading-relaxed text-muted-foreground">
          These are the training pictures this checkpoint placed nearest to your photo in its own
          internal map of images. It is the model's own measure of similarity, not an explanation
          of it, and not a claim about why it answered as it did.
        </p>
      )}
    </div>
  );
}

// ─── Helper: neighbour row with all its data states ────────────────────────
// Kept in this file because every state it renders is specific to the honesty
// rules above: no fabricated thumbnails, no invented similarity numbers, and a
// distinct voice for "not computed yet" versus "failed".

function NeighbourRow({
  step,
  stepLoading,
  fetchError,
  activeStep,
  weakSimilarityThreshold,
}: {
  step: EpochNeighbourStep | undefined;
  stepLoading: boolean;
  fetchError: string | null;
  activeStep: number | null;
  weakSimilarityThreshold: number;
}) {
  const loading = step?.loading ?? (stepLoading && !step);
  const err = step ? step.error : fetchError;

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <motion.div
              key={`sk-${i}`}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.08 }}
              className="aspect-square w-full rounded-md border border-border bg-muted"
            />
          ))}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
          Searching this checkpoint's embedding space…
        </p>
      </div>
    );
  }

  // 503 is the expected state before the precompute job has run. Say so
  // calmly; a placeholder grid here would imply data that does not exist.
  if (err && isNotPrecomputed(err)) {
    return (
      <EmptyPanel
        icon={Clock}
        tone="neutral"
        title="Not computed yet"
        body="The per-checkpoint image index for this model hasn't been built, so there are no neighbours to show. Nothing has gone wrong — this view appears once that job has run."
      />
    );
  }

  if (err) {
    return (
      <EmptyPanel
        icon={AlertTriangle}
        tone="warn"
        title={`Couldn't load epoch ${activeStep ?? ''}`.trim()}
        body={err}
      />
    );
  }

  if (!step || step.neighbours.length === 0) {
    return (
      <EmptyPanel
        icon={Clock}
        tone="neutral"
        title="No neighbours for this epoch"
        body="This checkpoint returned no matching training images."
      />
    );
  }

  const mean = step.meanSimilarity;
  const weak = mean !== null && mean < weakSimilarityThreshold;

  return (
    <div>
      {/* Cross-fade keyed on the step so moving between epochs reads as the
          same panel changing, rather than as a hard cut between two panels. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="grid grid-cols-4 gap-1.5"
        >
          {step.neighbours.map((n, i) => (
            <div key={`${step.step}-${n.path}-${i}`}>
              {/* The image and its score badge share their own positioning
                  context. Previously the wrapper enclosed the caption too, so
                  `absolute bottom-1` anchored the badge to the bottom of the
                  whole cell and it sat across the class caption rather than in
                  the image corner. */}
              <div className="relative">
                {n.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${n.thumbnail}`}
                    /* alt is deliberately empty: the class is already stated in
                       the caption below, and a non-empty alt is painted as text
                       when a base64 payload fails to decode — which rendered
                       the class twice ("real_tattoo0.44" above "real_tattoo"). */
                    alt=""
                    className="aspect-square w-full rounded-md border border-border object-cover"
                    onError={(e) => {
                      // A malformed payload has nothing to fall back to
                      // otherwise; drop to the same placeholder the null case
                      // uses so a decode failure looks deliberate.
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.parentElement
                        ?.querySelector('[data-fallback]')
                        ?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                {/* No thumbnail is not the same as no neighbour — the match is
                    real, so keep its slot and its score rather than dropping it. */}
                <div
                  data-fallback
                  className={`${n.thumbnail ? 'hidden ' : ''}flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-border bg-muted text-[9px] text-muted-foreground`}
                >
                  no image
                </div>
                <span className="absolute bottom-1 right-1 rounded bg-slate-900/85 px-1 py-0.5 font-mono text-[9px] leading-none text-white">
                  {n.similarity.toFixed(2)}
                </span>
              </div>
              <span className="mt-1 block truncate text-center text-[9px] text-muted-foreground">
                {CLASS_DISPLAY[n.cls] ?? n.cls}
              </span>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>

      {mean !== null && (
        <p
          className={cn(
            'mt-2 text-center text-[10px]',
            weak ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
          )}
        >
          Mean similarity <span className="font-mono">{mean.toFixed(2)}</span>
          {weak
            ? ' — nothing in the training data closely resembles this photo.'
            : ' across the matches shown.'}
        </p>
      )}
    </div>
  );
}

// ─── Helper: calm empty / error panel ──────────────────────────────────────
function EmptyPanel({
  icon: Icon,
  tone,
  title,
  body,
}: {
  icon: typeof Clock;
  tone: 'neutral' | 'warn';
  title: string;
  body: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-lg border px-3 py-3',
        tone === 'warn'
          ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
          : 'border-border bg-muted/40',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0">
        <p
          className={cn(
            'text-xs font-semibold',
            tone === 'warn' ? 'text-amber-800 dark:text-amber-300' : 'text-foreground',
          )}
        >
          {title}
        </p>
        <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
          {body}
        </p>
      </div>
    </div>
  );
}

// ─── Helper: inline confidence sparkline with clickable epochs ─────────────
// A row of near-identical thumbnails cannot show an 8-point trend; a line can.
// Points are the click targets, so trajectory and selection are one control.

function TrajectorySparkline({
  points,
  activeStep,
  onSelect,
}: {
  points: EpochConfidencePoint[];
  activeStep: number | null;
  onSelect: (step: number) => void;
}) {
  const w = 460;
  const h = 96;
  const padX = 34;
  const padTop = 10;
  const padBottom = 20;
  const n = points.length;

  const xFor = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (w - padX - 14));
  const yFor = (c: number) => padTop + (1 - c) * (h - padTop - padBottom);

  // Indices must come from the full array, not a filtered one, or a gap in
  // the trajectory would silently shift every later point leftwards.
  const drawn = points
    .map((p, i) => (Number.isFinite(p.confidence) ? `${xFor(i)},${yFor(p.confidence)}` : null))
    .filter((s): s is string => s !== null)
    .join(' ');

  return (
    <div className="mb-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Confidence across training · tap an epoch
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" className="overflow-visible">
        <line x1={padX} y1={padTop} x2={padX} y2={h - padBottom} stroke="#334155" strokeWidth="1" />
        <line x1={padX} y1={h - padBottom} x2={w - 14} y2={h - padBottom} stroke="#334155" strokeWidth="1" />
        <line
          x1={padX}
          y1={yFor(0.5)}
          x2={w - 14}
          y2={yFor(0.5)}
          stroke="#334155"
          strokeWidth="1"
          strokeDasharray="4"
          opacity="0.6"
        />
        <text x={padX - 6} y={yFor(1) + 3} fill="#64748b" fontSize="9" textAnchor="end">100%</text>
        <text x={padX - 6} y={yFor(0.5) + 3} fill="#64748b" fontSize="9" textAnchor="end">50%</text>
        <text x={padX - 6} y={yFor(0) + 3} fill="#64748b" fontSize="9" textAnchor="end">0%</text>

        <polyline
          points={drawn}
          fill="none"
          stroke="#a78bfa"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => {
          if (!Number.isFinite(p.confidence)) return null;
          const isActive = p.step === activeStep;
          return (
            <g
              key={p.step}
              onClick={() => onSelect(p.step)}
              style={{ cursor: 'pointer' }}
              role="button"
              aria-label={`Epoch ${p.epoch ?? p.step}`}
            >
              {/* Oversized transparent hit area — the visible dot is far too
                  small to be a reliable tap target on a phone. */}
              <rect
                x={xFor(i) - 14}
                y={padTop - 6}
                width={28}
                height={h - padTop - padBottom + 12}
                fill="transparent"
              />
              {isActive && (
                <line
                  x1={xFor(i)}
                  y1={padTop}
                  x2={xFor(i)}
                  y2={h - padBottom}
                  stroke="#a78bfa"
                  strokeWidth="1"
                  strokeDasharray="3"
                  opacity="0.7"
                />
              )}
              <circle
                cx={xFor(i)}
                cy={yFor(p.confidence)}
                r={isActive ? 6 : 4}
                fill={confidenceColour(p.confidence)}
                stroke={isActive ? '#ffffff' : 'none'}
                strokeWidth="2"
              />
              <text
                x={xFor(i)}
                y={h - 5}
                fill={isActive ? '#a78bfa' : '#64748b'}
                fontSize="9"
                fontWeight={isActive ? 700 : 400}
                textAnchor="middle"
              >
                E{p.epoch ?? p.step}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
