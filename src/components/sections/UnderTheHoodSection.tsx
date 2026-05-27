/**
 * Purpose:
 *   Step 4 of the demo — the "Workshop" where users explore why the model
 *   returned what it did. Has shed its old 4-view-mode tab interface
 *   (Requirements / Cards / Monitor / Scenarios) in favour of two
 *   interactive flip tiles (Data + Model). Shield/protection toggles will
 *   relocate here from the top of the page so the toggle→tile-update loop
 *   is visible in a single glance.
 *
 * Dependencies:
 *   - framer-motion (header animations)
 *   - @/components/SpeechBubble (lab-coat bear voice)
 *   - @/components/RegulationMenu (RegState type + protection list)
 *   - @/components/tiles/Tile1Data (data-composition flip tile)
 *
 * Used by:
 *   - src/pages/Index.tsx (Step 6 of the flow)
 *
 * Changes:
 *   2026-05-18: Stripped out the four legacy view modes, their helper
 *               components (MonitoringDashboard, IncidentScenarios,
 *               RiskRequirementsView, StatCard) and the "Ready to explore
 *               more" footer. Replaced with a workshop placeholder while
 *               Tile 3 and the relocated shield toggles are built.
 */

import { motion } from 'framer-motion';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Eye } from 'lucide-react';
import { allProtections, type RegState } from '../RegulationMenu';
import { SpeechBubble } from '../SpeechBubble';
import { Tile1Data } from '../tiles/Tile1Data';
import { Tile3Model } from '../tiles/Tile3Model';
import { ShieldToastStack } from '../ShieldToastStack';
import { useKnnSimilarity, type SimTier } from '@/hooks/useKnnSimilarity';
import { useCheckpointInference } from '@/hooks/useCheckpointInference';
import { useShieldToast } from '@/hooks/useShieldToast';
import type { VizMode } from './HeroSection';
import type { Perspective } from '@/pages/Index';

// Mirror of selectModelTier() in src/config/huggingface.ts. Kept locally
// so the tile rendering layer can derive the active tier without importing
// classifier-specific code.
function activeTier(appliedProtections: string[]): SimTier {
  if (!appliedProtections.includes('transparency')) return 'uncleaned';
  if (!appliedProtections.includes('bias-testing')) return 'unbalanced';
  return 'balanced';
}

interface UnderTheHoodSectionProps {
  userName: string;
  onCardExpandedChange?: (isExpanded: boolean) => void;
  regState?: RegState;
  vizMode?: VizMode;
  appliedProtections?: string[];
  /** Toggle a shield by ID. Plumbed in so the in-card seal/tier buttons
   *  can mutate shield state directly from the tile. */
  onToggleProtection?: (id: string) => void;
  perspective?: Perspective;
  /** User's captured photo (data URL) lifted up from PhotoCaptureSection. */
  userImageUrl?: string | null;
  /** Active classification result, gives us the predicted class for the tile. */
  classificationResult?: any;
}


export function UnderTheHoodSection({ userName, onCardExpandedChange, regState = 'both', appliedProtections = [], onToggleProtection, userImageUrl, classificationResult }: UnderTheHoodSectionProps) {
  const [hasExpandedCard, setHasExpandedCard] = useState(false);

  // Pre-fetch nearest-neighbour images for all three tiers in parallel. Tier
  // toggles then become a client-side array swap with no network round-trip,
  // which is what makes the shield→tile feedback feel instantaneous.
  const knn = useKnnSimilarity(userImageUrl, classificationResult?.predictedClass);
  const tier = activeTier(appliedProtections);
  const currentTierSimilarity = knn[tier];

  // Run the user's photo through the active tier's epoch checkpoints. Lazy
  // per tier — the first toggle to a new tier triggers its inference, then
  // it's cached for the rest of the session.
  const checkpointInference = useCheckpointInference(userImageUrl, tier);

  // Emit "what just changed" toasts whenever a shield is toggled. The toast
  // text lives in shieldRules.ts so adding a new shield is a single-row
  // change in the rule table.
  const toasts = useShieldToast(appliedProtections);

  // Check human oversight (final protection)
  const hasHumanOversight = appliedProtections.includes('human-oversight');
  const totalProtections = appliedProtections.length;
  
  const handleCardExpandedChange = (isExpanded: boolean) => {
    setHasExpandedCard(isExpanded);
    onCardExpandedChange?.(isExpanded);
  };

  // BASE_URL respects Vite's deployment base path (e.g. '/MDRxAIAct/' on
  // GitHub Pages, '/' locally) so the logo resolves in both contexts.
  const baseURL = (import.meta as any).env?.BASE_URL ?? '/';

  return (
    <section className="min-h-screen bg-gradient-to-b from-secondary/30 to-background relative overflow-hidden pt-4 pb-16">
      {/*
        Transient "shield just changed" toast stack, slides in at the top
        of the page whenever the user toggles a protection. Fixed-position
        so it survives the section's own scroll/transform context.
      */}
      <ShieldToastStack toasts={toasts} />
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        {/* Circuit-like pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
          <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <circle cx="50" cy="50" r="2" fill="currentColor" />
            <line x1="50" y1="0" x2="50" y2="48" stroke="currentColor" strokeWidth="0.5" />
            <line x1="50" y1="52" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="48" y2="50" stroke="currentColor" strokeWidth="0.5" />
            <line x1="52" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#circuit)" />
        </svg>
      </div>

      {/* Content is padded left on wide screens so the header text and cards
          sit to the upper-right, clear of the bear + speech bubble on the
          left. Below xl the bear is hidden, so no padding is needed. */}
      <div className="container mx-auto px-4 relative z-10 xl:pl-[26rem]">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-6"
        >
          <div className="inline-block px-3 py-1 bg-accent/10 rounded-full text-accent text-sm font-semibold mb-4">
            Step 4 of 4
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">
            Let's Look <span className="text-gradient">Under the Hood</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
            Pick a card to flip it over. Toggle the shields and watch the
            <span className="text-primary font-medium"> data</span> and the
            <span className="text-accent font-medium"> model</span> react in real time, to your own image.
          </p>

          {/* Final Protection Summary */}
          <div className={cn(
            "max-w-xl mx-auto p-4 rounded-xl border-2 transition-all",
            totalProtections === 10 ? "bg-green-50 dark:bg-green-950/30 border-green-400" :
            totalProtections >= 5 ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400" :
            "bg-red-50 dark:bg-red-950/30 border-red-400"
          )}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold">
                {totalProtections === 10 ? "✓ Full Protection Stack Complete" :
                 totalProtections >= 5 ? `⚠ ${totalProtections}/10 Protections Active` :
                 `⛔ Only ${totalProtections}/10 Protections Active`}
              </span>
              <div className="group relative">
                <div className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-help",
                  hasHumanOversight ? "bg-purple-500 text-white" : "bg-slate-200 text-slate-500"
                )}>
                  <Eye className="w-3 h-3" />
                  HUM
                </div>
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                  <div className="font-bold text-purple-300">{allProtections.find(p => p.id === 'human-oversight')?.label}</div>
                  <div className="text-slate-300">{allProtections.find(p => p.id === 'human-oversight')?.description}</div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            </div>
            <p className="text-sm text-center">
              {hasHumanOversight
                ? "Human oversight active - a qualified person reviews AI decisions."
                : "⚠ No human oversight - AI decisions are fully automated without review."}
            </p>
          </div>
        </motion.div>

        {/*
          Bear speech bubble, fixed at the bear's MOUTH height (he's centred
          vertically, face in the upper third → ~mouth at ~42% of viewport),
          just to his right with the tail pointing back at him. The content
          block is padded right (xl:pl on the container) so cards/text never
          sit under it. Hidden on narrow screens and while a card is expanded.
        */}
        {!hasExpandedCard && (
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="fixed z-30 hidden xl:block w-56"
            style={{ left: 'calc(5% + 300px)', top: '42%' }}
          >
            <SpeechBubble direction="left">
              <p className="text-sm font-semibold text-foreground">
                Put on your lab coat, {userName}! 🔬
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Flip a card and toggle the shields, watch how the data and model
                react to your own image.
              </p>
            </SpeechBubble>
          </motion.div>
        )}

        {/* ────────────────────────────────────────────────────────────────
            The two flip cards, shown as the backs of poker cards. Both the
            same size (aspect 5/7), centred as a pair. Stacks to one column
            on narrow screens.

            Tile 1, the data the model learned from (KNN neighbours + bars)
            Tile 3, how the model learned the user's image (checkpoints)
        ──────────────────────────────────────────────────────────────── */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto items-stretch">
          <Tile1Data
            regState={regState}
            appliedProtections={appliedProtections}
            onToggleProtection={onToggleProtection}
            userImageUrl={userImageUrl}
            predictedClass={classificationResult?.predictedClass}
            similarity={currentTierSimilarity}
            similarityLoading={knn.loading}
          />
          <Tile3Model
            appliedProtections={appliedProtections}
            onToggleProtection={onToggleProtection}
            userImageUrl={userImageUrl}
            predictedClass={classificationResult?.predictedClass}
            checkpoints={checkpointInference.current}
          />
        </div>

        {/* Acknowledgement footer. Compact, centred, with a themed border
            so it sits as a distinct element at the foot of the page
            without competing with the tiles. BAIAA logo + appliedAI lead.
            Source: https://practical-ai-act.eu/latest/Acknowledgment */}
        <div className="mt-14 flex justify-center">
          <div
            className="relative max-w-xl rounded-2xl bg-card/80 backdrop-blur-sm px-6 py-5 shadow-soft"
            style={{
              borderTop: '3px solid hsl(var(--primary) / 0.55)',
              borderLeft: '1px solid hsl(var(--border))',
              borderRight: '1px solid hsl(var(--border))',
              borderBottom: '1px solid hsl(var(--border))',
            }}
          >
            <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
              Acknowledgement
            </p>

            {/* BAIAA logo, centred. Black variant works on the light theme. */}
            <div className="flex justify-center mb-3">
              <img
                src={`${baseURL}images/brand/baiaa-logo-black.svg`}
                alt="Bavarian AI Act Accelerator"
                className="h-9 w-auto opacity-90"
              />
            </div>

            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              A two-year project funded by the Bavarian State Ministry of Digital
              Affairs, led by the{' '}
              <span className="font-semibold text-primary">appliedAI Institute for Europe</span>
              {' '}with LMU, TUM, and TH Nuremberg, supporting SMEs, start-ups, and the
              public sector in complying with the EU AI Act.
            </p>

            <p className="mt-3 text-center text-[10px]">
              <a
                href="https://practical-ai-act.eu/latest/Acknowledgment"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                practical-ai-act.eu/latest/Acknowledgment
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
