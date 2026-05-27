/**
 * Purpose:
 *   "How the Model Learned Your Image" — second of the two flip tiles.
 *   Shows the user's own photo run through every epoch checkpoint of the
 *   active model tier, visualising the model's growing confidence as a
 *   frost-to-clear progression plus a confidence-over-time chart. Three
 *   states mirror Tile 1: resting / expanded / flipped.
 *
 *   The frost overlay is a deliberate metaphor: at epoch 1 the model can
 *   barely "see" the image (heavy blur, low confidence), by the final epoch
 *   it sees clearly (no blur, high confidence). The image never actually
 *   changes — only the model's interpretation does.
 *
 * Dependencies:
 *   - framer-motion (animation + 3D flip)
 *   - lucide-react (icons)
 *   - @/hooks/useCheckpointInference (per-checkpoint predictions)
 *   - @/config/shieldRules (redaction effects on the flip-back)
 *   - ./RedactionStrip (covers regulatory text when Explainability is off)
 *
 * Used by:
 *   - src/components/sections/UnderTheHoodSection.tsx
 *
 * Changes:
 *   2026-05-18: Initial — resting / expanded / flipped, frost progression,
 *               confidence chart, shield-reactive regulatory flip-back.
 */

import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { Microscope, Brain, Shield, RotateCw, X, AlertTriangle, Sparkles } from 'lucide-react';
import type { TierCheckpoints } from '@/hooks/useCheckpointInference';
import type { PredictedClass } from '@/config/huggingface';
import { SHIELD_RULES, type ShieldEffect, type ShieldEffectTarget } from '@/config/shieldRules';
import { FAKE_DRIFT, trainingRefUrl, type FakeDriftEpoch } from '@/config/fakeDrift';
import { RedactionStrip } from './RedactionStrip';
import { cn } from '@/lib/utils';

interface Tile3ModelProps {
  appliedProtections: string[];
  /** Toggle a shield by ID — used by the in-card seal button to flip the
   *  post-market-surveillance + drift-monitoring shields together. */
  onToggleProtection?: (id: string) => void;
  userImageUrl?: string | null;
  /** Predicted class of the user's image, used to pick the drift trajectory. */
  predictedClass?: PredictedClass;
  /** Real per-checkpoint trajectory (currently unused while the fake-drift
   *  config drives the visuals; preserved so the prop interface survives
   *  the real-drift swap once the cluster job lands). */
  checkpoints?: TierCheckpoints | null;
}

const CLASS_DISPLAY: Record<string, string> = {
  real_tattoo: 'real_tattoo',
  sticker_tattoo: 'sticker',
  pen_drawn: 'pen_drawn',
  not_tattoo: 'not_tattoo',
};

// Confidence drives a colour ramp from red (uncertain) to green (confident).
function confidenceColour(c: number): string {
  if (c >= 0.75) return '#22c55e';
  if (c >= 0.5) return '#f59e0b';
  return '#ef4444';
}

// Blur amount decreases as confidence rises — the frost lifts as the model
// learns to "see" the image.
function blurForConfidence(c: number): number {
  // 0 confidence → 8px blur, 1.0 confidence → 0px.
  return Math.max(0, 8 * (1 - c));
}

// Per-phase decoration: short label + colour for the small tag under each
// epoch tile. "drift" gets red so the eye lands on the failure at the right
// moment in the row.
const PHASE_META: Record<FakeDriftEpoch['phase'], { label: string; color: string }> = {
  warmup:   { label: 'warming up',  color: '#94a3b8' },
  learning: { label: 'learning',    color: '#3b82f6' },
  peak:     { label: 'performing',  color: '#22c55e' },
  drift:    { label: 'drifting',    color: '#ef4444' },
};

/**
 * The "seal" is intact only when BOTH drift-related shields are applied:
 * MDR Post-Market Surveillance (`pms`) AND AI Act Drift Monitoring
 * (`drift-monitor`). Together they form the regulatory layer that catches
 * model drift before it ships. Drop either one and the seal cracks — the
 * card visibly reveals the unmonitored drift epochs.
 */
function isSealIntact(appliedProtections: string[]): boolean {
  const s = new Set(appliedProtections);
  return s.has('pms') && s.has('drift-monitor');
}

export function Tile3Model({
  appliedProtections,
  onToggleProtection,
  userImageUrl,
  predictedClass,
  checkpoints,
}: Tile3ModelProps) {
  const [state, setState] = useState<'resting' | 'expanded' | 'flipped'>('resting');

  // Shield effects that target the flip-back regulatory text (same system
  // as Tile 1 — Explainability removal redacts the rationale).
  const activeEffects = useMemo(() => {
    const protectionSet = new Set(appliedProtections);
    const effects: ShieldEffect[] = [];
    for (const rule of SHIELD_RULES) {
      if (!protectionSet.has(rule.protectionId)) effects.push(...rule.effects);
    }
    return effects;
  }, [appliedProtections]);
  const effectFor = (target: ShieldEffectTarget): ShieldEffect | undefined =>
    activeEffects.find((e) => e.target === target);
  const flipMdrRedaction = effectFor('redact-flip-mdr');
  const flipAiActRedaction = effectFor('redact-flip-aiact');

  const baseURL = (import.meta as any).env?.BASE_URL ?? '/';

  // Drift trajectory: 8 fabricated epochs keyed off the predicted class.
  // Falls back to sticker if no class has been classified yet so the tile
  // preview always has data to render.
  const cls: PredictedClass = predictedClass ?? 'sticker_tattoo';
  const driftEpochs = FAKE_DRIFT[cls];
  const peakEpoch = driftEpochs.reduce(
    (a, b) => (b.confidence > a.confidence ? b : a),
    driftEpochs[0],
  );
  const finalEpoch = driftEpochs[driftEpochs.length - 1];

  // Sealed vs broken — drives whether drift is hidden or unfurled.
  const sealed = isSealIntact(appliedProtections);
  const xaiOn = appliedProtections.includes('explainability');
  const loading = checkpoints?.loading ?? false;

  // Tapping the seal toggles BOTH drift-related shields together. Sealed
  // → broken: drop both. Broken → sealed: add whichever is missing.
  const handleSealToggle = () => {
    if (!onToggleProtection) return;
    const s = new Set(appliedProtections);
    if (sealed) {
      // Sealed now — remove both to break it.
      if (s.has('pms')) onToggleProtection('pms');
      if (s.has('drift-monitor')) onToggleProtection('drift-monitor');
    } else {
      // Broken now — add whichever is missing.
      if (!s.has('pms')) onToggleProtection('pms');
      if (!s.has('drift-monitor')) onToggleProtection('drift-monitor');
    }
  };

  // ─── RESTING STATE — back of a poker card ────────────────────────────
  if (state === 'resting') {
    return (
      <motion.button
        layout
        onClick={() => setState('expanded')}
        whileHover={{ scale: 1.03, y: -6 }}
        animate={{ y: [0, -5, 0] }}
        transition={{ y: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 1.2 } }}
        className="group relative mx-auto aspect-[5/7] w-full max-w-[320px] cursor-pointer overflow-hidden rounded-2xl border-2 border-accent/40 bg-accent/5 shadow-medium transition-shadow hover:shadow-[0_22px_55px_-15px_rgba(0,0,0,0.4)]"
      >
        <div className="absolute inset-3 rounded-xl border-2 border-accent/30" />
        <Brain className="absolute left-3 top-3 h-4 w-4 text-accent/70" />
        <Brain className="absolute right-3 top-3 h-4 w-4 text-accent/70" />
        <Brain className="absolute left-3 bottom-3 h-4 w-4 text-accent/70 rotate-180" />
        <Brain className="absolute right-3 bottom-3 h-4 w-4 text-accent/70 rotate-180" />

        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-4">
          <div className="rounded-full border-2 border-accent/40 bg-card p-5 shadow-soft">
            <Brain className="h-10 w-10 text-accent" />
          </div>
          <span className="text-2xl font-extrabold tracking-[0.35em] text-accent">MODEL</span>
          <motion.span
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="text-xs font-medium text-muted-foreground"
          >
            tap to reveal →
          </motion.span>
        </div>

        {/* AppliedAI logo at the foot of the card */}
        <img
          src={`${baseURL}images/brand/appliedai-logo.svg`}
          alt="Applied AI Institute"
          className="absolute bottom-5 left-1/2 z-10 h-12 -translate-x-1/2 opacity-90"
        />
      </motion.button>
    );
  }

  // ─── EXPANDED + FLIPPED ──────────────────────────────────────────────
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
          <button
            onClick={() => setState('resting')}
            className="absolute -top-3 -right-3 z-10 rounded-full border border-border bg-muted p-2 text-foreground/80 shadow-soft hover:bg-muted/70"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>

          {/* FRONT — checkpoint progression, gated by the post-market-
              surveillance seal. */}
          <div
            className="relative rounded-2xl border-2 border-border bg-card p-6 shadow-2xl"
            style={{ backfaceVisibility: 'hidden' }}
          >
            {/* WAX SEAL — top-left corner. Tappable: toggles the drift
                shields (pms + drift-monitor) directly from the card.
                Visitors can flip the seal without going back to the
                top-of-page shield row. */}
            <WaxSeal sealed={sealed} onClick={onToggleProtection ? handleSealToggle : undefined} />

            {/* Companion toggle button — sits to the right of the title,
                makes the seal's interactivity obvious (some visitors
                won't notice the seal is tappable). */}
            {onToggleProtection && (
              <button
                onClick={handleSealToggle}
                className={cn(
                  'absolute right-12 top-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                  sealed
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                    : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/60',
                )}
                title={sealed ? 'Break the seal to reveal drift' : 'Reseal — hide drift'}
              >
                <Shield className="h-3.5 w-3.5" />
                {sealed ? 'Show drift' : 'Hide drift'}
              </button>
            )}

            <div className="mb-4 ml-20 flex items-center gap-2">
              <Microscope className="h-5 w-5 text-accent" />
              <h3 className="text-xl font-bold text-foreground">How the Model Learned Your Image</h3>
            </div>

            {/* SEAL-BROKEN warning band — only visible when monitoring is OFF */}
            {!sealed && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <span className="font-semibold">Drift detected — unmonitored shipping path.</span>
                  {' '}Without post-market surveillance + drift monitoring, the model below would have shipped at <span className="font-mono">{(finalEpoch.confidence * 100).toFixed(0)}%</span> confidence on the <em>wrong</em> class.
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="h-8 w-8 rounded-full border-2 border-border border-t-accent"
                />
                <p className="text-sm text-muted-foreground">Running your image through each training checkpoint…</p>
              </div>
            ) : sealed ? (
              /* SEALED: only the peak epoch shown — calm, one confident answer. */
              <SealedView
                peakEpoch={peakEpoch}
                userImageUrl={userImageUrl}
                refUrl={trainingRefUrl(baseURL, predictedClass, 'canonical')}
              />
            ) : (
              /* BROKEN: full 8-epoch row + chart, drift visible at the tail. */
              <BrokenView
                driftEpochs={driftEpochs}
                peakEpoch={peakEpoch}
                finalEpoch={finalEpoch}
                userImageUrl={userImageUrl}
                predictedClass={predictedClass}
                baseURL={baseURL}
              />
            )}

            {/* DOG-EAR — bottom-right page curl that invites the flip when
                Explainability (xai) is applied. The curl breathes gently so
                the eye notices it; tapping it (or anywhere on the curl
                area) flips the card to the regulatory rationale. */}
            <DogEar visible={xaiOn} onFlip={() => setState('flipped')} />
          </div>

          {/* BACK — regulatory rationale */}
          <div
            className="absolute inset-0 rounded-2xl border-2 border-border bg-gradient-to-br from-card to-muted p-6 shadow-2xl"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-accent" />
              <h3 className="text-xl font-bold text-foreground">Why Checkpoints Matter</h3>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              A regulator doesn't just want the final model. They want to see how it got there.
            </p>

            <div className="space-y-3">
              <div className="rounded-xl border-l-4 border-accent bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-accent">
                  AI Act — Article 15 (Accuracy &amp; Robustness)
                </p>
                <RedactionStrip active={!!flipAiActRedaction} label={flipAiActRedaction?.label}>
                  <p className="mt-1 text-sm text-foreground/80">
                    Accuracy, robustness and cybersecurity must be validated throughout the
                    development lifecycle — not just measured once at the end.
                  </p>
                </RedactionStrip>
              </div>

              <div className="rounded-xl border-l-4 border-primary bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                  MDR — Annex II (Technical Documentation)
                </p>
                <RedactionStrip active={!!flipMdrRedaction} label={flipMdrRedaction?.label}>
                  <p className="mt-1 text-sm text-foreground/80">
                    Design and manufacturing documentation must include verification and
                    validation activities at each design stage, with full traceability.
                  </p>
                </RedactionStrip>
              </div>

              <div className="rounded-xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-semibold text-foreground">Checkpoints prove:</p>
                <ul className="mt-1 space-y-0.5 text-sm text-foreground/80">
                  <li>• The model converged (didn't overfit)</li>
                  <li>• Performance improved consistently</li>
                  <li>• No sudden degradation between stages</li>
                </ul>
                <p className="mt-2 text-sm font-semibold text-accent">This is your audit trail.</p>
              </div>
            </div>

            <div className="mt-5 flex justify-center border-t border-border pt-4">
              <button
                onClick={() => setState('expanded')}
                className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-xs font-semibold text-foreground/80 transition-colors hover:bg-muted/70"
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


// ─── Helper: Wax seal corner indicator ───────────────────────────────────
function WaxSeal({ sealed, onClick }: { sealed: boolean; onClick?: () => void }) {
  const tone = sealed ? '#15803d' : '#b91c1c';
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'absolute -left-2 -top-2 z-10 flex h-16 w-16 items-center justify-center',
        onClick && 'cursor-pointer hover:scale-105 transition-transform',
      )}
      title={sealed
        ? 'Sealed: post-market surveillance + drift monitoring catches drift. Click to break the seal and reveal the drift.'
        : 'Broken: model would ship drifted. Click to re-seal — restore monitoring.'}
    >
      <motion.div
        animate={sealed ? { rotate: 0 } : { rotate: [-1, 1, -1], x: [-0.5, 0.5, -0.5] }}
        transition={sealed
          ? { duration: 0 }
          : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full border-[3px] shadow-medium"
        style={{
          background: sealed
            ? 'radial-gradient(circle at 30% 30%, #22c55e, #15803d 70%)'
            : 'radial-gradient(circle at 30% 30%, #f87171, #7f1d1d 70%)',
          borderColor: sealed ? '#bbf7d0' : '#fecaca',
        }}
      >
        <Shield className="h-7 w-7 text-white drop-shadow" strokeWidth={2.5} />
        {!sealed && (
          /* Crack line across the seal when broken. */
          <span
            aria-hidden
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 mx-auto h-[2px] w-[110%] rotate-12 bg-yellow-50 mix-blend-screen"
            style={{ boxShadow: '0 0 4px rgba(254, 240, 138, 0.85)' }}
          />
        )}
      </motion.div>
      <div
        className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white shadow-sm"
        style={{ backgroundColor: tone }}
      >
        {sealed ? 'monitored' : 'unmonitored'}
      </div>
    </div>
  );
}

// ─── Helper: Sealed view — quiet single-peak presentation ────────────────
function SealedView({
  peakEpoch,
  userImageUrl,
  refUrl,
}: {
  peakEpoch: FakeDriftEpoch;
  userImageUrl?: string | null;
  refUrl: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="flex items-end gap-3">
        {/* Training reference */}
        <div className="text-center">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Training ref</p>
          <div className="h-24 w-24 overflow-hidden rounded-lg border-2 border-emerald-300">
            <img src={refUrl} alt="" className="h-full w-full object-cover" />
          </div>
        </div>
        {/* Peak epoch — the prediction the regulator allowed to ship. */}
        <div className="text-center">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Shipped (epoch {peakEpoch.epoch} ★)</p>
          <div className="relative h-28 w-28 overflow-hidden rounded-lg border-[3px] border-emerald-500 shadow-medium">
            {userImageUrl ? (
              <img src={userImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
            <Sparkles className="absolute right-1 top-1 h-4 w-4 text-emerald-300 drop-shadow" />
          </div>
        </div>
      </div>
      <p className="text-center text-sm">
        <span className="font-bold text-emerald-700">
          {(peakEpoch.confidence * 100).toFixed(0)}%
        </span>{' '}
        confident — <span className="font-semibold">{peakEpoch.predictedLabel}</span>
      </p>
      <p className="max-w-md text-center text-xs text-muted-foreground">
        Post-market surveillance kept training from running past the peak. The model that shipped is the one above. Drift never reached users.
      </p>
    </div>
  );
}

// ─── Helper: Broken view — the full 8-epoch drift unfurled ───────────────
function BrokenView({
  driftEpochs,
  peakEpoch,
  finalEpoch,
  userImageUrl,
  predictedClass,
  baseURL,
}: {
  driftEpochs: FakeDriftEpoch[];
  peakEpoch: FakeDriftEpoch;
  finalEpoch: FakeDriftEpoch;
  userImageUrl?: string | null;
  predictedClass?: PredictedClass;
  baseURL: string;
}) {
  return (
    <>
      {/* Epoch row — paired training-ref (top) + user image (bottom). */}
      <div className="flex flex-wrap items-end justify-center gap-2.5">
        {driftEpochs.map((p) => {
          const meta = PHASE_META[p.phase];
          const isPeak = p.step === peakEpoch.step;
          const isDrift = p.phase === 'drift';
          const refUrl = trainingRefUrl(baseURL, predictedClass, p.trainingRef);
          const borderColor = isPeak ? '#22c55e' : isDrift ? '#ef4444' : '#475569';
          return (
            <div key={p.step} className="text-center">
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">
                Epoch {p.epoch}{isPeak ? ' ★' : ''}
              </div>
              <div
                className="relative mx-auto h-14 w-14 overflow-hidden rounded-md border"
                style={{ borderColor }}
                title={`Training ref at epoch ${p.epoch} (${p.trainingRef})`}
              >
                <img src={refUrl} alt="" className="h-full w-full object-cover opacity-90" />
                <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1 text-[8px] font-semibold uppercase tracking-wider text-white">
                  {p.trainingRef === 'canonical' ? 'ref' : 'edge'}
                </span>
              </div>
              <div
                className="relative mx-auto mt-1.5 h-14 w-14 overflow-hidden rounded-md border-2"
                style={{ borderColor }}
              >
                {userImageUrl ? (
                  <img
                    src={userImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    style={{ filter: `blur(${p.blurPx}px)` }}
                  />
                ) : (
                  <div className="h-full w-full bg-muted" />
                )}
                {isDrift && (
                  <AlertTriangle className="absolute right-0.5 top-0.5 h-3 w-3 text-red-500 drop-shadow" />
                )}
                {isPeak && (
                  <Sparkles className="absolute right-0.5 top-0.5 h-3 w-3 text-emerald-400 drop-shadow" />
                )}
              </div>
              <div
                className="mt-1 text-[11px] font-semibold"
                style={{ color: confidenceColour(p.confidence) }}
              >
                {CLASS_DISPLAY[p.predictedLabel] ?? p.predictedLabel}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {(p.confidence * 100).toFixed(0)}%
              </div>
              <div
                className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: meta.color }}
              >
                {meta.label}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Confidence over training — peak then drift
        </p>
        <ConfidenceChart predictions={driftEpochs.map((p) => ({
          confidence: p.confidence,
          epoch: p.epoch,
        }))} />
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        At epoch {peakEpoch.epoch} the model peaked at{' '}
        <span className="font-mono text-emerald-600">{(peakEpoch.confidence * 100).toFixed(0)}%</span>
        {' '}on{' '}
        <span className="font-semibold text-foreground">{peakEpoch.predictedLabel}</span>
        . By epoch {finalEpoch.epoch} it had drifted to{' '}
        <span className="font-semibold text-red-600">{finalEpoch.predictedLabel}</span>{' '}
        at {(finalEpoch.confidence * 100).toFixed(0)}%.
      </p>
    </>
  );
}

// ─── Helper: Dog-ear flip-invite (corner curl) ───────────────────────────
function DogEar({ visible, onFlip }: { visible: boolean; onFlip: () => void }) {
  if (!visible) return null;   // No invitation when Explainability is off.
  return (
    <motion.button
      onClick={onFlip}
      aria-label="Flip card — view regulatory rationale"
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      className="group absolute bottom-0 right-0 h-14 w-14 cursor-pointer"
      style={{ background: 'transparent' }}
    >
      {/* SVG folded-corner: a triangle of "back of card" peeking out. */}
      <svg viewBox="0 0 56 56" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id="dogear-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--muted))" />
            <stop offset="100%" stopColor="hsl(var(--accent) / 0.4)" />
          </linearGradient>
        </defs>
        {/* The peeled corner */}
        <path d="M 56 56 L 56 22 L 22 56 Z" fill="url(#dogear-bg)" stroke="hsl(var(--accent))" strokeWidth="1.5" />
        {/* Fold crease */}
        <line x1="56" y1="22" x2="22" y2="56" stroke="hsl(var(--accent))" strokeWidth="1" strokeDasharray="2 2" opacity="0.6" />
      </svg>
      <span className="absolute bottom-1 right-1 text-[8px] font-bold uppercase tracking-widest text-accent group-hover:text-accent">
        why?
      </span>
    </motion.button>
  );
}

// ─── Helper: SVG confidence-over-time line chart ───────────────────────────
function ConfidenceChart({ predictions }: { predictions: { confidence: number; epoch: number | null }[] }) {
  const w = 460;
  const h = 120;
  const padX = 40;
  const padY = 14;
  const n = predictions.length;
  const xFor = (i: number) => padX + (i / Math.max(1, n - 1)) * (w - padX - 16);
  const yFor = (c: number) => padY + (1 - c) * (h - padY - 20);

  const points = predictions.map((p, i) => `${xFor(i)},${yFor(p.confidence)}`).join(' ');

  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="overflow-visible">
      {/* gridlines */}
      <line x1={padX} y1={padY} x2={padX} y2={h - 20} stroke="#1e293b" strokeWidth="1" />
      <line x1={padX} y1={h - 20} x2={w - 16} y2={h - 20} stroke="#334155" strokeWidth="1" />
      <line x1={padX} y1={yFor(0.5)} x2={w - 16} y2={yFor(0.5)} stroke="#1e293b" strokeWidth="1" strokeDasharray="4" />
      <text x={padX - 6} y={yFor(1) + 3} fill="#64748b" fontSize="9" textAnchor="end">100%</text>
      <text x={padX - 6} y={yFor(0.5) + 3} fill="#64748b" fontSize="9" textAnchor="end">50%</text>
      <text x={padX - 6} y={yFor(0) + 3} fill="#64748b" fontSize="9" textAnchor="end">0%</text>
      {/* line */}
      <polyline points={points} fill="none" stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* dots + x labels */}
      {predictions.map((p, i) => (
        <g key={i}>
          <circle cx={xFor(i)} cy={yFor(p.confidence)} r={i === n - 1 ? 5 : 4} fill={confidenceColour(p.confidence)} stroke={i === n - 1 ? '#fff' : 'none'} strokeWidth="1.5" />
          <text x={xFor(i)} y={h - 6} fill="#64748b" fontSize="9" textAnchor="middle">E{p.epoch ?? i + 1}</text>
        </g>
      ))}
    </svg>
  );
}
