/**
 * Purpose:
 *   "The Data Behind Your Result" — first of two flip tiles that replace
 *   the text-heavy concluding slide of Under-the-Hood. Three states:
 *     1. Resting — small invitation with a training-image mosaic
 *     2. Expanded — full data composition + distribution bars
 *     3. Flipped — MDR + AI Act regulatory context
 *
 *   The tile reacts live to the shield/protection state — when the user
 *   toggles a protection in Under-the-Hood, the bars and imbalance ratio
 *   re-render to reflect the model tier they would now be using.
 *
 * Dependencies:
 *   - framer-motion (animation + 3D flip)
 *   - lucide-react (icons)
 *   - @/components/RegulationMenu (RegState type)
 *   - public/images/examples/* (training sample stand-ins until the
 *     /samples endpoint lands)
 *
 * Used by:
 *   - src/components/sections/UnderTheHoodSection.tsx
 *
 * Changes:
 *   2026-05-18: Initial — Tile 1 with resting / expanded / flipped states,
 *               reactive to RegState for data composition bars.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Database, Shield, AlertTriangle, CheckCircle2, RotateCw, X } from 'lucide-react';
import type { RegState } from '../RegulationMenu';
import type { TierSimilarity } from '@/hooks/useKnnSimilarity';
import { SHIELD_RULES, type ShieldEffect, type ShieldEffectTarget } from '@/config/shieldRules';
import { RedactionStrip } from './RedactionStrip';
import { TileBanner } from './TileBanner';

interface Tile1DataProps {
  regState: RegState;
  appliedProtections: string[];
  /**
   * Optional predicted class from the active classification result —
   * used to pick which training-sample row to highlight when expanded.
   */
  predictedClass?: 'real_tattoo' | 'sticker_tattoo' | 'pen_drawn' | 'not_tattoo';
  /** User's captured photo, if available. Falls back to a stand-in tile. */
  userImageUrl?: string | null;
  /** KNN neighbours for the currently-active tier (passed from UTH). */
  similarity?: TierSimilarity | null;
  /** True while the KNN pre-fetch is in flight for any tier. */
  similarityLoading?: boolean;
}

/**
 * Selects the model tier the user is currently looking at based on which
 * protections are active. Mirrors selectModelTier() in src/config/huggingface.ts
 * so the visualisation always agrees with the inference path.
 */
function tierForState(appliedProtections: string[]): 'balanced' | 'unbalanced' | 'uncleaned' {
  const hasBiasTesting = appliedProtections.includes('bias-testing');
  const hasTransparency = appliedProtections.includes('transparency');
  if (!hasTransparency) return 'uncleaned';
  if (!hasBiasTesting) return 'unbalanced';
  return 'balanced';
}

// Real counts from training_metadata.json for each variant — kept in sync
// with what the model actually trained on, so the bars never mislead.
const COMPOSITION = {
  balanced: {
    real_tattoo: 400,
    sticker_tattoo: 400,
    pen_drawn: 400,
    not_tattoo: 400,
    ratio: 1.0,
    label: 'Balanced',
    badgeColour: 'text-emerald-300 bg-emerald-950/50 border-emerald-800',
    badgeIcon: CheckCircle2,
  },
  unbalanced: {
    real_tattoo: 5444,
    sticker_tattoo: 438,
    pen_drawn: 433,
    not_tattoo: 150,
    ratio: 12.6,
    label: 'Imbalanced',
    badgeColour: 'text-amber-300 bg-amber-950/50 border-amber-800',
    badgeIcon: AlertTriangle,
  },
  uncleaned: {
    real_tattoo: 4902,
    sticker_tattoo: 481,
    pen_drawn: 494,
    not_tattoo: 350,
    ratio: 14.0,
    label: 'Uncleaned + Imbalanced',
    badgeColour: 'text-red-300 bg-red-950/50 border-red-800',
    badgeIcon: AlertTriangle,
  },
} as const;

const CLASS_LABELS: Record<string, string> = {
  real_tattoo: 'real_tattoo',
  sticker_tattoo: 'sticker',
  pen_drawn: 'pen_drawn',
  not_tattoo: 'not_tattoo',
};

const CLASS_COLOURS: Record<string, string> = {
  real_tattoo: 'bg-blue-500',
  sticker_tattoo: 'bg-violet-500',
  pen_drawn: 'bg-cyan-500',
  not_tattoo: 'bg-emerald-500',
};

// Static stand-ins for the swipeable training-sample grid. These will be
// replaced once the /samples API endpoint lands — for now they let us
// verify the visual layout end-to-end without a backend dependency.
const SAMPLE_THUMBS = [
  'images/examples/real_tattoo_1.png',
  'images/examples/real_tattoo_2.png',
  'images/examples/tattoo_example.png',
  'images/examples/sticker_tattoo.png',
];

export function Tile1Data({
  // regState is reserved for future use — currently the model tier is fully
  // derived from appliedProtections, which is what selectModelTier() also does.
  regState: _regState,
  appliedProtections,
  userImageUrl,
  similarity,
  similarityLoading,
}: Tile1DataProps) {
  const [state, setState] = useState<'resting' | 'expanded' | 'flipped'>('resting');

  const tier = tierForState(appliedProtections);
  const composition = COMPOSITION[tier];

  // Compute the set of visual effects that are currently active because
  // one or more protections is OFF. Memoised so we don't re-walk the rule
  // table on every render.
  const activeEffects = useMemo(() => {
    const protectionSet = new Set(appliedProtections);
    const effects: ShieldEffect[] = [];
    for (const rule of SHIELD_RULES) {
      if (!protectionSet.has(rule.protectionId)) {
        effects.push(...rule.effects);
      }
    }
    return effects;
  }, [appliedProtections]);

  // Helper: does any active effect target this UI region?
  const effectFor = (target: ShieldEffectTarget): ShieldEffect | undefined =>
    activeEffects.find((e) => e.target === target);
  // Helper: ALL effects targeting a region (e.g. multiple shields may cause
  // bottom callouts). Banners + callouts can stack.
  const effectsFor = (target: ShieldEffectTarget): ShieldEffect[] =>
    activeEffects.filter((e) => e.target === target);

  // Pre-computed slices the JSX below reads directly so the render stays
  // declarative.
  const topBanners = effectsFor('tile-top-banner');
  const bottomCallouts = effectsFor('bottom-callout');
  const perClassRedaction = effectFor('redact-per-class-bars');
  const sourceRedaction = effectFor('redact-source-line');
  const flipMdrRedaction = effectFor('redact-flip-mdr');
  const flipAiActRedaction = effectFor('redact-flip-aiact');
  const ifuHidden = !!effectFor('hide-ifu-disclaimer');

  // Count of shields currently off — the small "shields missing" badge on
  // the tile is the universal cue that something is being held back.
  const shieldsMissing = SHIELD_RULES.filter(
    (r) => !appliedProtections.includes(r.protectionId),
  ).length;
  const total = composition.real_tattoo + composition.sticker_tattoo +
                composition.pen_drawn + composition.not_tattoo;
  const maxClass = Math.max(
    composition.real_tattoo, composition.sticker_tattoo,
    composition.pen_drawn, composition.not_tattoo,
  );

  const BadgeIcon = composition.badgeIcon;
  const baseURL = (import.meta as any).env?.BASE_URL ?? '/';

  // First four KNN neighbours used as the resting-state mosaic preview.
  // Falls back to the static example images when KNN hasn't returned yet.
  const restingThumbs: string[] = similarity?.neighbours?.slice(0, 4)
    .map((n) => n.thumbnail ? `data:image/jpeg;base64,${n.thumbnail}` : '')
    .filter(Boolean) ?? SAMPLE_THUMBS.map((src) => `${baseURL}${src}`);

  // ─── RESTING STATE ───────────────────────────────────────────────────
  if (state === 'resting') {
    return (
      <motion.button
        layout
        onClick={() => setState('expanded')}
        whileHover={{ scale: 1.02, y: -2 }}
        animate={{ scale: [1, 1.015, 1] }}
        transition={{ scale: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
        className="group relative w-full max-w-sm cursor-pointer rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 text-left shadow-xl transition-shadow hover:border-blue-500 hover:shadow-blue-500/20"
      >
        <div className="flex items-center gap-4">
          {/* User photo placeholder on the left */}
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border-2 border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
            {userImageUrl ? (
              <img src={userImageUrl} alt="Your upload" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-slate-400 text-center px-2">Your<br />Photo</span>
            )}
          </div>
          {/* 2x2 mosaic from the current tier's nearest neighbours */}
          <div className="grid grid-cols-2 gap-1.5">
            {restingThumbs.slice(0, 4).map((src, i) => (
              <img
                key={`${tier}-${i}`}
                src={src}
                alt=""
                className="h-11 w-11 rounded-md border border-slate-600 object-cover"
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-blue-400" />
          <h3 className="text-lg font-bold text-slate-100">The Data Behind Your Result</h3>
        </div>

        <motion.p
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          className="mt-2 text-xs text-slate-500"
        >
          tap to explore →
        </motion.p>
      </motion.button>
    );
  }

  // ─── EXPANDED + FLIPPED STATES ───────────────────────────────────────
  // Both states share the same overlay shell — the inner content rotates
  // on the Y-axis to give the "flip the card over" effect.
  return (
    <motion.div
      layout
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
      onClick={() => setState('resting')}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl"
        style={{ perspective: 1200 }}
      >
        <motion.div
          animate={{ rotateY: state === 'flipped' ? 180 : 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          style={{ transformStyle: 'preserve-3d' }}
          className="relative"
        >
          {/* Close button — sits above the rotating card so it never flips upside down */}
          <button
            onClick={() => setState('resting')}
            className="absolute -top-3 -right-3 z-10 rounded-full bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 hover:text-white shadow-lg border border-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* FRONT — Expanded data view */}
          <div
            className="rounded-2xl border-2 border-slate-700 bg-slate-900 p-6 shadow-2xl"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* Stacked banners for every shield-driven "missing protection"
                consequence. Critical reds first via natural order of the
                rule table (CE Marking comes before drift monitor etc.) */}
            {topBanners.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {topBanners.map((e, i) => (
                  <TileBanner key={i} severity={e.severity} label={e.label} detail={e.detail} />
                ))}
              </div>
            )}

            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-blue-400" />
                <h3 className="text-xl font-bold text-slate-100">The Data Behind Your Result</h3>
              </div>
              {shieldsMissing > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-950/60 border border-red-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-200">
                  <AlertTriangle className="h-3 w-3" />
                  {shieldsMissing} shield{shieldsMissing > 1 ? 's' : ''} missing
                </span>
              )}
            </div>

            {/* Top row — user image + training samples */}
            <div className="flex flex-wrap gap-6">
              <div className="flex-shrink-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your Image</p>
                <div className="h-32 w-32 overflow-hidden rounded-xl border-2 border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center">
                  {userImageUrl ? (
                    <img src={userImageUrl} alt="Your upload" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm text-slate-400 text-center">User<br />Photo</span>
                  )}
                </div>
              </div>

              <div className="flex-1 min-w-[200px]">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Nearest Neighbours In The {composition.label} Dataset
                </p>
                <NeighbourGrid
                  similarity={similarity}
                  loading={similarityLoading}
                  baseURL={baseURL}
                  tier={tier}
                />
              </div>
            </div>

            {/* Distribution bars — wrapped in a redaction strip so Clinical
                Evaluation removal physically covers them with a black overlay
                rather than just toggling a text label. */}
            <div className="mt-6 border-t border-slate-700 pt-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                What the {tier} model trained on
              </p>

              <RedactionStrip active={!!perClassRedaction} label={perClassRedaction?.label}>
                <div className="space-y-2">
                  {(['real_tattoo', 'sticker_tattoo', 'pen_drawn', 'not_tattoo'] as const).map((cls) => {
                    const count = composition[cls];
                    const pct = (count / maxClass) * 100;
                    return (
                      <div key={cls} className="flex items-center gap-3 text-sm">
                        <span className="w-24 text-right font-mono text-xs text-slate-300">
                          {CLASS_LABELS[cls]}
                        </span>
                        <div className="flex-1 overflow-hidden rounded bg-slate-800 h-5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            className={`h-full ${CLASS_COLOURS[cls]}`}
                          />
                        </div>
                        <span className="w-14 font-mono text-xs text-slate-400">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </RedactionStrip>

              <div className="mt-4 flex items-center justify-between gap-3">
                <RedactionStrip active={!!sourceRedaction} label={sourceRedaction?.label}>
                  <span className="text-xs text-slate-500">
                    Total: <span className="font-mono text-slate-300">{total.toLocaleString()}</span> images
                  </span>
                </RedactionStrip>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${composition.badgeColour}`}>
                  <BadgeIcon className="h-3.5 w-3.5" />
                  {composition.label} — {composition.ratio}× ratio
                </span>
              </div>
            </div>

            {/* Bottom callouts — these are inline "shield removed" notes that
                are not redactions but standalone warning blocks. Multiple
                shields (e.g. HUM and BIAS) may both target this region. */}
            {bottomCallouts.length > 0 && (
              <div className="mt-4 space-y-2">
                {bottomCallouts.map((e, i) => (
                  <TileBanner key={i} severity={e.severity} label={e.label} detail={e.detail} />
                ))}
              </div>
            )}

            {/* IFU disclaimer — hidden when the rule says so, otherwise the
                standard "not a diagnosis" line. */}
            {!ifuHidden && (
              <p className="mt-4 text-center text-[10px] italic text-slate-500">
                AI-assisted result · Not a diagnosis · Consult a clinician
              </p>
            )}

            <div className="mt-5 flex justify-center border-t border-slate-700 pt-4">
              <button
                onClick={() => setState('flipped')}
                className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-500/30 transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" />
                tap to flip — see the regulatory requirements
              </button>
            </div>
          </div>

          {/* BACK — Regulatory view, mirrored on the Y-axis so it reads
              correctly once the card has rotated 180° */}
          <div
            className="absolute inset-0 rounded-2xl border-2 border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-violet-400" />
              <h3 className="text-xl font-bold text-slate-100">Why This Matters</h3>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border-l-4 border-blue-500 bg-slate-950 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  MDR — Clinical Evaluation
                </p>
                {/* Body text is redacted when Explainability is off — the
                    reasoning the regulator wants to see is what gets hidden. */}
                <RedactionStrip active={!!flipMdrRedaction} label={flipMdrRedaction?.label}>
                  <p className="mt-1 text-sm text-slate-300">
                    Clinical evaluation requires evidence that training data represents the intended
                    patient population. Insufficient diversity invalidates the device's intended use claim.
                  </p>
                </RedactionStrip>
              </div>

              <div className="rounded-xl border-l-4 border-violet-500 bg-slate-950 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
                  AI Act — Article 10 (Data Governance)
                </p>
                <RedactionStrip active={!!flipAiActRedaction} label={flipAiActRedaction?.label}>
                  <p className="mt-1 text-sm text-slate-300">
                    Training data must be relevant, representative, and free of errors.
                    Bias in datasets must be detected and corrected. Data governance practices must be documented.
                  </p>
                </RedactionStrip>
              </div>

              <div className="rounded-xl border border-amber-800/50 bg-amber-950/30 p-4">
                <p className="text-sm text-amber-200">
                  {tier === 'balanced' ? (
                    <>
                      <strong>You're seeing the balanced model.</strong> Equal counts across all four classes,
                      Fitzpatrick-balanced bare-skin images, and class weights — what compliance actually looks like.
                    </>
                  ) : tier === 'unbalanced' ? (
                    <>
                      <strong>Without bias testing, this model scores 96.5% overall</strong> — but only because
                      it overfits to <code>real_tattoo</code> (99.6%) and barely sees <code>not_tattoo</code>
                      (47% on epoch 1, only 150 training images). The headline hides the bias.
                    </>
                  ) : (
                    <>
                      <strong>Without transparency, you can't even audit the data.</strong> This model was
                      trained on noisy, unfiltered images mixed with edge cases like henna and body paint —
                      labels themselves are unreliable.
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-center border-t border-slate-700 pt-4">
              <button
                onClick={() => setState('expanded')}
                className="inline-flex items-center gap-2 rounded-full bg-slate-700/50 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition-colors"
              >
                <RotateCw className="h-3.5 w-3.5" />
                tap to flip back
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}


// ─── Helper: neighbour grid for the expanded view ──────────────────────────
// Lives in this file because it's only used by Tile 1 and depends on the
// composition / tier colour conventions defined above. Pulled out into its
// own component so the main Tile 1 render stays readable and so the
// loading / empty / error states have a single home.

interface NeighbourGridProps {
  similarity?: TierSimilarity | null;
  loading?: boolean;
  baseURL: string;
  tier: keyof typeof COMPOSITION;
}

function NeighbourGrid({ similarity, loading, baseURL, tier }: NeighbourGridProps) {
  // Loading state — show 8 pulsing skeleton tiles while KNN is in flight.
  if (loading && !similarity) {
    return (
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <motion.div
              key={`skeleton-${i}`}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.08 }}
              className="aspect-square w-full rounded-md border border-slate-700 bg-slate-800"
            />
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-slate-500/70">
          Finding your nearest neighbours…
        </p>
      </div>
    );
  }

  // No data at all (no user image yet, or pre-fetch hasn't fired) — fall back
  // to the bundled example images so the layout still reads as a grid.
  if (!similarity) {
    return (
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          {SAMPLE_THUMBS.map((src, i) => (
            <img
              key={`fallback-${i}`}
              src={`${baseURL}${src}`}
              alt=""
              className="aspect-square w-full rounded-md border border-slate-600 object-cover opacity-60"
              onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
            />
          ))}
        </div>
        <p className="mt-1 text-center text-[10px] text-slate-500/70 italic">
          Upload an image to see your nearest training-set neighbours
        </p>
      </div>
    );
  }

  // Warning case — class is starved in this tier (e.g. not_tattoo in
  // unbalanced has only 150 images). Show whatever we got with a note.
  const neighbours = similarity.neighbours;
  if (neighbours.length === 0) {
    return (
      <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-4 text-center text-xs text-amber-200">
        {similarity.warning ?? `No similar images available in the ${tier} dataset.`}
      </div>
    );
  }

  // Standard render — cross-fade between tiers via AnimatePresence so the
  // image swap on a shield toggle is smooth rather than a hard cut.
  const meanSim = similarity.mean_similarity;
  return (
    <div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${tier}-${neighbours.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="grid grid-cols-4 gap-1.5"
        >
          {neighbours.map((n, i) => (
            <div key={`${tier}-${n.path}-${i}`} className="relative">
              {n.thumbnail ? (
                <img
                  src={`data:image/jpeg;base64,${n.thumbnail}`}
                  alt=""
                  className="aspect-square w-full rounded-md border border-slate-600 object-cover"
                />
              ) : (
                <div className="aspect-square w-full rounded-md border border-slate-700 bg-slate-800" />
              )}
              <span className="absolute bottom-1 right-1 rounded bg-slate-900/85 px-1 py-0.5 text-[9px] font-mono text-slate-200 leading-none">
                {n.similarity.toFixed(2)}
              </span>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
      {meanSim !== null && (
        <p className="mt-1.5 text-center text-[10px] text-slate-400">
          Mean similarity:{' '}
          <span className="font-mono text-slate-200">{meanSim.toFixed(2)}</span>
          {' · '}
          <span className="text-slate-500">
            {meanSim >= 0.75 ? 'strong fit' : meanSim >= 0.55 ? 'moderate fit' : 'weak fit'}
          </span>
        </p>
      )}
    </div>
  );
}
