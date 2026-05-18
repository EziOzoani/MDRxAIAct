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
import { SpeechBubble } from '../SpeechBubble';
import { allProtections, type RegState } from '../RegulationMenu';
import { Tile1Data } from '../tiles/Tile1Data';
import { ShieldToastStack } from '../ShieldToastStack';
import { useKnnSimilarity, type SimTier } from '@/hooks/useKnnSimilarity';
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
  perspective?: Perspective;
  /** User's captured photo (data URL) lifted up from PhotoCaptureSection. */
  userImageUrl?: string | null;
  /** Active classification result — gives us the predicted class for the tile. */
  classificationResult?: any;
}


export function UnderTheHoodSection({ userName, onCardExpandedChange, regState = 'both', appliedProtections = [], userImageUrl, classificationResult }: UnderTheHoodSectionProps) {
  const [hasExpandedCard, setHasExpandedCard] = useState(false);

  // Pre-fetch nearest-neighbour images for all three tiers in parallel. Tier
  // toggles then become a client-side array swap with no network round-trip,
  // which is what makes the shield→tile feedback feel instantaneous.
  const knn = useKnnSimilarity(userImageUrl, classificationResult?.predictedClass);
  const tier = activeTier(appliedProtections);
  const currentTierSimilarity = knn[tier];

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

  return (
    <section className="min-h-screen bg-gradient-to-b from-secondary/30 to-background relative overflow-hidden pt-4 pb-16">
      {/*
        Transient "shield just changed" toast stack — slides in at the top
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

      <div className="container mx-auto px-4 relative z-10">
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

          {/* ─── NEW: Tile preview — shows the new flip-tile approach alongside
              the existing view modes so the comparison is visible. Once the
              new design is approved this can replace the modes below. */}
          <div className="my-6 flex flex-col items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300 border border-amber-500/30">
              ✦ NEW · Tile preview · click the card below
            </div>
            <Tile1Data
              regState={regState}
              appliedProtections={appliedProtections}
              userImageUrl={userImageUrl}
              predictedClass={classificationResult?.predictedClass}
              similarity={currentTierSimilarity}
              similarityLoading={knn.loading}
            />
          </div>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
            Curious about how our AI works? Here's the technical breakdown of our
            medical-grade detection system.
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

        {/* Bear with microscope and speech bubble */}
        {!hasExpandedCard && (
          <div className="relative mb-8" style={{ minHeight: '150px' }}>
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="lg:max-w-[360px] absolute"
              style={{ 
                left: '22%', // Moved right from bear's position
                top: '125px', // 1/4 of 500px bear height
                transform: 'translateY(-50%)'
              }}
            >
              <SpeechBubble direction="left">
                <p className="text-lg font-semibold text-foreground">
                  Alright {userName}, put on your lab coat! 🔬
                </p>
                <p className="text-muted-foreground mt-2">
                  As a doctor, I believe in transparency. Let me show you exactly how our 
                  AI analyzes your images and makes its predictions. Knowledge is power!
                </p>
              </SpeechBubble>
            </motion.div>
          </div>
        )}


        {/* ────────────────────────────────────────────────────────────────
            The previous Under-the-Hood content (4 view modes — Requirements /
            Cards / Monitor / Scenarios — plus the "Ready to explore more"
            footer) has been removed. The replacement is a pair of interactive
            flip tiles that react live to shield/protection toggles.

            Currently in place:
              • Tile 1 (Data Behind Your Result)   — shown above in the header
            Coming next:
              • Relocated shield/protection toggles (will sit above the tiles)
              • Tile 3 (How the Model Learned Your Image, uses /checkpoints API)

            See: src/components/tiles/Tile1Data.tsx
        ──────────────────────────────────────────────────────────────── */}
        <div className="mt-12 flex flex-col items-center gap-3 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-dashed border-slate-700 px-6 py-4 max-w-md text-center">
            <p className="font-semibold text-slate-300 mb-1">Workshop area</p>
            <p className="text-xs">
              Shield toggles + Tile 3 (model learning progression) will appear
              here. Click the data tile above to test the new interaction.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
