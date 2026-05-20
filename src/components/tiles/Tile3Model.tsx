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
import { Microscope, Brain, Shield, RotateCw, X } from 'lucide-react';
import type { TierCheckpoints } from '@/hooks/useCheckpointInference';
import { SHIELD_RULES, type ShieldEffect, type ShieldEffectTarget } from '@/config/shieldRules';
import { RedactionStrip } from './RedactionStrip';

interface Tile3ModelProps {
  appliedProtections: string[];
  userImageUrl?: string | null;
  /** Checkpoint trajectory for the active tier (from useCheckpointInference). */
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

export function Tile3Model({ appliedProtections, userImageUrl, checkpoints }: Tile3ModelProps) {
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

  const predictions = checkpoints?.predictions ?? [];
  const loading = checkpoints?.loading ?? false;
  const finalPrediction = predictions[predictions.length - 1];
  const baseURL = (import.meta as any).env?.BASE_URL ?? '/';

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

          {/* FRONT — checkpoint progression */}
          <div
            className="rounded-2xl border-2 border-border bg-card p-6 shadow-2xl"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="mb-4 flex items-center gap-2">
              <Microscope className="h-5 w-5 text-accent" />
              <h3 className="text-xl font-bold text-foreground">How the Model Learned Your Image</h3>
            </div>

            {loading && predictions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  className="h-8 w-8 rounded-full border-2 border-border border-t-accent"
                />
                <p className="text-sm text-muted-foreground">Running your image through each training checkpoint…</p>
              </div>
            ) : (
              <>
                {/* Epoch image row */}
                <div className="flex flex-wrap items-end justify-center gap-3">
                  {predictions.map((p, i) => {
                    const colour = confidenceColour(p.confidence);
                    const blur = blurForConfidence(p.confidence);
                    const isFinal = i === predictions.length - 1;
                    return (
                      <div key={p.step} className="text-center">
                        <div className="mb-1 text-[10px] text-muted-foreground">
                          Epoch {p.epoch ?? i + 1}{isFinal ? ' ★' : ''}
                        </div>
                        <div
                          className="relative mx-auto h-20 w-20 overflow-hidden rounded-lg border-2"
                          style={{ borderColor: isFinal ? '#22c55e' : '#475569' }}
                        >
                          {userImageUrl ? (
                            <img
                              src={userImageUrl}
                              alt=""
                              className="h-full w-full object-cover"
                              style={{ filter: `blur(${blur}px)` }}
                            />
                          ) : (
                            <div className="h-full w-full bg-muted" />
                          )}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold" style={{ color: colour }}>
                          {CLASS_DISPLAY[p.predictedLabel] ?? p.predictedLabel}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {(p.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Confidence-over-time chart */}
                {predictions.length > 1 && (
                  <div className="mt-6 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Confidence in the final prediction, over training
                    </p>
                    <ConfidenceChart predictions={predictions} />
                  </div>
                )}

                {finalPrediction && (
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    By the final epoch the model was{' '}
                    <span className="font-mono text-foreground">
                      {(finalPrediction.confidence * 100).toFixed(0)}%
                    </span>{' '}
                    confident your image is{' '}
                    <span className="font-semibold text-foreground">
                      {CLASS_DISPLAY[finalPrediction.predictedLabel] ?? finalPrediction.predictedLabel}
                    </span>.
                  </p>
                )}
              </>
            )}

            <div className="mt-5 flex justify-center border-t border-border pt-4">
              <button
                onClick={() => setState('flipped')}
                className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-4 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
              >
                <RotateCw className="h-3.5 w-3.5" />
                tap to flip — why checkpoints matter
              </button>
            </div>
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
