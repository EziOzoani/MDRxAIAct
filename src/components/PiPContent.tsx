/**
 * Purpose:
 *   Step-aware content for the Picture-in-Picture overlay. Shows contextual
 *   engineering or clinical information that changes as the user scrolls
 *   through the demo, replacing the need for a separate "Under the Hood" page.
 *
 * Dependencies:
 *   - RegulationMenu (allProtections, RegState)
 *   - huggingface.ts types (PredictedClass, ModelTier, ClassificationResult)
 *   - lucide-react icons
 *
 * Used by:
 *   - PiPWindow.tsx (sole consumer)
 *
 * Changes:
 *   2026-03-02: Rewritten to be step-aware with contextual panels per demo step
 *   2026-03-02: Fixed 3-class scores, uses real modelUsed tier and skinToneMetrics
 *   2026-03-02: Initial static version with doctor/engineer split
 */

import { Check, X, Shield, Cpu, Clock, AlertCircle, Activity, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Perspective } from '@/pages/Index';
import type { RegState } from './RegulationMenu';
import { allProtections } from './RegulationMenu';
import { HUGGING_FACE_CONFIG } from '@/config/huggingface';
import type { ModelTier, PredictedClass } from '@/config/huggingface';

type Step = 'hero' | 'mdr' | 'name' | 'photo' | 'results' | 'hood';

interface PiPContentProps {
  perspective: Perspective;
  currentStep: Step;
  classificationResult: any;
  appliedProtections: string[];
  regState: RegState;
  expanded?: boolean;
}

const CLASS_DISPLAY: Record<PredictedClass, string> = {
  real_tattoo: 'Real Tattoo',
  sticker_tattoo: 'Sticker/Temporary Tattoo',
  pen_drawn: 'Pen/Marker Drawing',
  not_tattoo: 'No Tattoo',
};

/** Derive which model tier the current protections imply. */
function inferModelTier(appliedProtections: string[]): ModelTier {
  if (!appliedProtections.includes('transparency')) return 'uncleaned';
  if (!appliedProtections.includes('bias-testing')) return 'unbalanced';
  return 'balanced';
}

function getMetricsForTier(tier: ModelTier) {
  const map: Record<ModelTier, typeof HUGGING_FACE_CONFIG.BALANCED_METRICS> = {
    balanced: HUGGING_FACE_CONFIG.BALANCED_METRICS,
    unbalanced: HUGGING_FACE_CONFIG.UNBALANCED_METRICS,
    uncleaned: HUGGING_FACE_CONFIG.UNCLEANED_METRICS,
  };
  return map[tier];
}

// ---------------------------------------------------------------------------
// Main entry point — routes to step-specific content
// ---------------------------------------------------------------------------

export function PiPContent({
  perspective,
  currentStep,
  classificationResult,
  appliedProtections,
  regState,
  expanded = false,
}: PiPContentProps) {
  // Before classification exists, show step-contextual status panels
  if (!classificationResult) {
    return (
      <PreAnalysisContent
        currentStep={currentStep}
        perspective={perspective}
        appliedProtections={appliedProtections}
        regState={regState}
        expanded={expanded}
      />
    );
  }

  // After classification, show result-aware panels
  if (perspective === 'doctor') {
    return (
      <DoctorPiP
        currentStep={currentStep}
        classificationResult={classificationResult}
        appliedProtections={appliedProtections}
        expanded={expanded}
      />
    );
  }

  return (
    <EngineerPiP
      currentStep={currentStep}
      classificationResult={classificationResult}
      appliedProtections={appliedProtections}
      expanded={expanded}
    />
  );
}

// ---------------------------------------------------------------------------
// Pre-analysis: shown before any classification result exists
// ---------------------------------------------------------------------------

function PreAnalysisContent({
  currentStep,
  perspective,
  appliedProtections,
  regState,
  expanded,
}: {
  currentStep: Step;
  perspective: Perspective;
  appliedProtections: string[];
  regState: RegState;
  expanded: boolean;
}) {
  const tier = inferModelTier(appliedProtections);
  const metrics = getMetricsForTier(tier);
  const mdrActive = regState === 'both' || regState === 'mdrOnly';
  const aiActActive = regState === 'both' || regState === 'aiActOnly';

  // Hero / MDR steps — system status overview
  if (currentStep === 'hero' || currentStep === 'mdr') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          <Activity className="w-4 h-4 text-green-500" />
          System Status
        </div>

        <div className="space-y-2">
          <StatusRow
            label="MDR Baseline"
            active={mdrActive}
            activeText="Active, Class IIa medical device"
            inactiveText="Disabled"
          />
          <StatusRow
            label="AI Act Obligations"
            active={aiActActive}
            activeText="Active, High-risk AI requirements"
            inactiveText="Off, No additional AI safeguards"
          />
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          {perspective === 'engineer'
            ? `Model tier: ${tier}. Accuracy: ${(metrics.overall_accuracy * 100).toFixed(0)}%. Skin-tone gap: ${(metrics.max_gap * 100).toFixed(0)}%.`
            : 'This device is MDR-compliant by default. Toggle AI Act in the menu to see additional obligations.'}
        </p>

        {expanded && (
          <ProtectionBadgeRow appliedProtections={appliedProtections} />
        )}
      </div>
    );
  }

  // Name step — brief "ready to analyse" state
  if (currentStep === 'name') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
          <Cpu className="w-4 h-4 text-indigo-500" />
          Model Ready
        </div>
        <p className="text-xs text-slate-500">
          ViT-base classifier ({tier}) loaded on CPU. Waiting for image input.
        </p>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">Active protections</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">
            {appliedProtections.length}/{allProtections.length}
          </span>
        </div>
        {expanded && <ProtectionBadgeRow appliedProtections={appliedProtections} />}
      </div>
    );
  }

  // Photo step (before result) — upload / triage status
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300">
        <Eye className="w-4 h-4 text-amber-500" />
        Awaiting Image
      </div>
      <p className="text-xs text-slate-500">
        {perspective === 'engineer'
          ? `Will classify using tattoo-${tier} model. 4-class output: real_tattoo, sticker_tattoo, pen_drawn, not_tattoo.`
          : 'Select or upload an image. The AI will determine if it is a real tattoo, sticker, pen drawing, or not a tattoo at all.'}
      </p>
      {perspective === 'engineer' && (
        <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Model</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">tattoo-{tier}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Accuracy</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">{(metrics.overall_accuracy * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Skin-tone gap</span>
            <span className={cn("font-mono", metrics.max_gap > 0.20 ? "text-red-500" : "text-green-600")}>
              {(metrics.max_gap * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}
      {expanded && <ProtectionBadgeRow appliedProtections={appliedProtections} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctor PiP — clinical view after classification
// ---------------------------------------------------------------------------

function DoctorPiP({
  currentStep,
  classificationResult,
  appliedProtections,
  expanded,
}: {
  currentStep: Step;
  classificationResult: any;
  appliedProtections: string[];
  expanded: boolean;
}) {
  const hasHumanOversight = appliedProtections.includes('human-oversight');
  const predictedClass: PredictedClass = classificationResult.predictedClass
    || (classificationResult.isRealTattoo ? 'real_tattoo' : 'sticker_tattoo');
  const confidence: number = classificationResult.confidence;
  const isReal = predictedClass === 'real_tattoo';

  const verdictColour = predictedClass === 'real_tattoo'
    ? 'bg-green-50 text-green-700 border-green-200'
    : predictedClass === 'not_tattoo'
      ? 'bg-slate-50 text-slate-700 border-slate-200'
      : predictedClass === 'pen_drawn'
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-orange-50 text-orange-700 border-orange-200';

  const barColour = predictedClass === 'real_tattoo'
    ? 'bg-green-500'
    : predictedClass === 'not_tattoo'
      ? 'bg-slate-500'
      : predictedClass === 'pen_drawn'
        ? 'bg-purple-500'
        : 'bg-orange-500';

  return (
    <div className="space-y-3">
      {/* Verdict badge */}
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold border ${verdictColour}`}>
        {isReal ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
        <span className="text-base">{CLASS_DISPLAY[predictedClass]}</span>
      </div>

      {/* Confidence */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">Confidence</span>
        <span className="font-bold text-slate-700 text-base">{(confidence * 100).toFixed(1)}%</span>
      </div>

      {/* Confidence bar */}
      <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
        <div className={cn("h-2 rounded-full transition-all", barColour)} style={{ width: `${confidence * 100}%` }} />
      </div>

      {/* Step-contextual patient guidance */}
      <p className="text-xs text-slate-500 leading-relaxed">
        {currentStep === 'results' || currentStep === 'hood'
          ? getDetailedGuidance(predictedClass)
          : getShortGuidance(predictedClass)}
      </p>

      {/* Human oversight status, shown on results/hood steps */}
      {(currentStep === 'results' || currentStep === 'hood') && !hasHumanOversight && (
        <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 rounded-lg">
          <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold">Human Oversight Off</p>
          <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
            Results cannot be confirmed for clinical use without human-in-the-loop review.
          </p>
        </div>
      )}
      {(currentStep === 'results' || currentStep === 'hood') && hasHumanOversight && (
        <div className="p-2 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg">
          <p className="text-xs text-green-700 dark:text-green-300 flex items-center gap-1">
            <Check className="w-3 h-3" /> Human review required before clinical action
          </p>
        </div>
      )}

      {/* Expanded: clinical summary cards */}
      {expanded && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          {/* Was "Clinical Summary" with risk levels and monitoring advice. The
              model classifies tattoo type; it has never been evaluated against
              any clinical endpoint, so phrases like "low risk", "no signs of
              allergic reaction" and "include in annual skin examination"
              asserted a competence it does not have. In a demonstrator about
              medical-device regulation that is the exact failure mode being
              taught, so the panel now describes the classification only. */}
          <h4 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">What the model determined</h4>

          <InfoCard icon={<AlertCircle className="w-3.5 h-3.5 text-blue-500" />} title="Classification">
            {predictedClass === 'real_tattoo' && 'Classified as a permanent tattoo — ink judged to sit under the skin.'}
            {predictedClass === 'sticker_tattoo' && 'Classified as a temporary transfer applied to the skin surface.'}
            {predictedClass === 'pen_drawn' && 'Classified as pen or marker drawn on the skin surface.'}
            {predictedClass === 'not_tattoo' && 'No tattoo, transfer or drawing detected in this image.'}
          </InfoCard>

          <InfoCard icon={<Clock className="w-3.5 h-3.5 text-blue-500" />} title="Scope">
            This system distinguishes tattoo types only. It does not assess skin
            health and has not been evaluated for lesions, allergic reactions or
            any other clinical question.
          </InfoCard>

          <InfoCard icon={<Shield className="w-3.5 h-3.5 text-blue-500" />} title="Regulatory Note">
            AI-assisted result, not a diagnosis. Final clinical determination must be made by a qualified healthcare professional per MDR requirements.
          </InfoCard>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Engineer PiP — technical view after classification
// ---------------------------------------------------------------------------

function EngineerPiP({
  currentStep,
  classificationResult,
  appliedProtections,
  expanded,
}: {
  currentStep: Step;
  classificationResult: any;
  appliedProtections: string[];
  expanded: boolean;
}) {
  const activeCount = appliedProtections.length;
  const totalCount = allProtections.length;
  const tier: ModelTier = classificationResult.modelUsed || inferModelTier(appliedProtections);
  const metrics = classificationResult.skinToneMetrics || getMetricsForTier(tier);
  const classScores: Record<string, number> | undefined = classificationResult.classScores;
  const predictedClass: PredictedClass | undefined = classificationResult.predictedClass;

  return (
    <div className="space-y-3">
      {/* Model info, now shows real tier */}
      <div className="flex items-center gap-2 text-sm">
        <Cpu className="w-4 h-4 text-indigo-500" />
        <span className="text-slate-500">Model:</span>
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
          tattoo-{tier}
          {tier === 'uncleaned' && <span className="text-red-400 ml-1">(noisy)</span>}
          {tier === 'unbalanced' && <span className="text-amber-400 ml-1">(biased)</span>}
        </span>
      </div>

      {/* 3-class scores */}
      <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
        {classScores ? (
          Object.entries(classScores).map(([cls, score]) => (
            <div key={cls} className="flex justify-between text-xs">
              <span className={cn(
                "text-slate-500",
                cls === predictedClass && "text-green-600 dark:text-green-400 font-semibold",
              )}>
                {cls}{cls === predictedClass ? ' *' : ''}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {(score as number).toFixed(4)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-400">Scores not available</p>
        )}
      </div>

      {/* Protection count */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-green-500" />
          <span className="text-slate-500">Protections</span>
        </div>
        <span className={cn(
          "font-bold",
          activeCount === totalCount ? 'text-green-600' : activeCount > 0 ? 'text-amber-600' : 'text-red-600',
        )}>
          {activeCount}/{totalCount}
        </span>
      </div>

      <ProtectionBadgeRow appliedProtections={appliedProtections} />

      {/* Inference time */}
      {classificationResult.inferenceTimeMs != null && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">Inference</span>
          </div>
          <span className="font-mono text-slate-700 dark:text-slate-300">
            {classificationResult.inferenceTimeMs}ms
            {classificationResult.isSimulated && ' (simulated)'}
          </span>
        </div>
      )}

      {/* Expanded: real metrics from training + per-protection breakdown */}
      {expanded && (
        <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
          {/* Step-contextual heading */}
          <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider">
            {currentStep === 'results' || currentStep === 'hood' ? 'Full Audit Trail' : 'Model Metrics'}
          </h4>

          {/* Real training metrics from the active model tier */}
          <div className="grid grid-cols-2 gap-2">
            <MetricBox label="Accuracy" value={`${(metrics.overall_accuracy * 100).toFixed(0)}%`} />
            <MetricBox label="Skin-tone Gap" value={`${(metrics.max_gap * 100).toFixed(0)}%`}
              warn={metrics.max_gap > 0.20} />
            <MetricBox label="Training Data" value={tier === 'balanced' ? '400/class' : tier === 'unbalanced' ? '12.6:1 ratio' : '10.2:1 + noisy'} />
            <MetricBox label="Class Weights" value={tier === 'balanced' ? 'Yes (1.0)' : 'None'} />
          </div>

          {/* Skin-tone breakdown */}
          {metrics.per_skin_tone && (
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2 space-y-1">
              <span className="text-[10px] text-slate-500 font-semibold">Fitzpatrick Accuracy</span>
              {Object.entries(metrics.per_skin_tone).map(([tone, acc]) => (
                <div key={tone} className="flex justify-between text-[11px]">
                  <span className="text-slate-500">Type {tone}</span>
                  <span className={cn(
                    "font-mono",
                    (acc as number) < 0.70 ? "text-red-500" : "text-slate-700 dark:text-slate-300",
                  )}>
                    {((acc as number) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Per-protection breakdown, only on results/hood steps to avoid clutter */}
          {(currentStep === 'results' || currentStep === 'hood') && (
            <ProtectionDetailList appliedProtections={appliedProtections} />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared small components — DRY reusable pieces
// ---------------------------------------------------------------------------

function StatusRow({ label, active, activeText, inactiveText }: {
  label: string; active: boolean; activeText: string; inactiveText: string;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between px-3 py-2 rounded-lg text-xs border",
      active ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800" : "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800",
    )}>
      <span className="font-semibold text-slate-700 dark:text-slate-300">{label}</span>
      <span className={active ? "text-green-600" : "text-red-500"}>{active ? activeText : inactiveText}</span>
    </div>
  );
}

function ProtectionBadgeRow({ appliedProtections }: { appliedProtections: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {allProtections.map(p => (
        <span key={p.id} className={cn(
          "px-1.5 py-0.5 rounded text-[10px] font-bold",
          appliedProtections.includes(p.id)
            ? (p.source === 'mdr' ? "bg-blue-600 text-white" : "bg-green-600 text-white")
            : "bg-red-200 dark:bg-red-800 text-red-600 dark:text-red-300",
        )}>
          {p.short}
        </span>
      ))}
    </div>
  );
}

function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="p-2.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{title}</span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{children}</p>
    </div>
  );
}

function MetricBox({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
      <span className="text-[10px] text-slate-500">{label}</span>
      <p className={cn("font-mono text-xs font-bold", warn ? "text-red-500" : "text-slate-700 dark:text-slate-300")}>
        {value}
      </p>
    </div>
  );
}

function ProtectionDetailList({ appliedProtections }: { appliedProtections: string[] }) {
  const protectionDetails = [
    { id: 'ce-marking', short: 'CE', detail: 'Class IIa. Software version validated.', source: 'mdr' },
    { id: 'clinical-eval', short: 'CLIN', detail: 'ViT-base on balanced 4-class dataset. Validated per MDR.', source: 'mdr' },
    { id: 'pms', short: 'PMS', detail: 'Prediction logged. PSUR tracking active.', source: 'mdr' },
    { id: 'incident', short: 'INC', detail: 'MDR Art. 87 pathway ready.', source: 'mdr' },
    { id: 'ifu', short: 'IFU', detail: 'AI-assisted disclaimer shown to user.', source: 'mdr' },
    { id: 'bias-testing', short: 'BIAS', detail: 'Balanced 4-class model vs unbalanced. Headline accuracy hides bias.', source: 'aiAct' },
    { id: 'explainability', short: 'XAI', detail: 'Grad-CAM saliency map generated.', source: 'aiAct' },
    { id: 'drift-monitor', short: 'DRFT', detail: 'KL div: 0.02. Threshold: 0.15.', source: 'aiAct' },
    { id: 'transparency', short: 'TRNS', detail: 'Model card and data docs public.', source: 'aiAct' },
    { id: 'human-oversight', short: 'HUM', detail: 'Clinician confirmation required.', source: 'aiAct' },
  ];

  return (
    <div className="space-y-1.5">
      {protectionDetails.map(p => {
        const isActive = appliedProtections.includes(p.id);
        return (
          <div key={p.id} className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded text-[11px]",
            isActive ? "bg-slate-50 dark:bg-slate-700/30" : "bg-red-50 dark:bg-red-950/30",
          )}>
            <span className={cn(
              "px-1 py-0.5 rounded text-[9px] font-bold flex-shrink-0",
              isActive
                ? (p.source === 'mdr' ? "bg-blue-600 text-white" : "bg-green-600 text-white")
                : "bg-red-200 dark:bg-red-800 text-red-600 dark:text-red-300",
            )}>
              {p.short}
            </span>
            <span className={cn("flex-1", isActive ? "text-slate-600 dark:text-slate-400" : "text-red-400 line-through")}>
              {p.detail}
            </span>
            <span className={cn("text-[9px] font-bold flex-shrink-0", isActive ? "text-green-500" : "text-red-400")}>
              {isActive ? 'ON' : 'OFF'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Guidance text helpers
// ---------------------------------------------------------------------------

// Guidance describes the CLASSIFICATION, never a clinical judgement. Phrases
// like "regular skin checks recommended" or "no clinical concern" are advice
// this system is not qualified to give: it was trained to tell tattoo types
// apart and has never been evaluated against a clinical endpoint.
function getShortGuidance(cls: PredictedClass): string {
  if (cls === 'real_tattoo') return 'Classified as a permanent tattoo.';
  if (cls === 'sticker_tattoo') return 'Classified as a temporary transfer tattoo.';
  if (cls === 'not_tattoo') return 'No tattoo detected in the image.';
  return 'Classified as pen or marker drawn on skin.';
}

function getDetailedGuidance(cls: PredictedClass): string {
  if (cls === 'real_tattoo') {
    return 'The model judged the ink to sit under the skin rather than on it. This is a classification of tattoo type only — it says nothing about the condition of the skin.';
  }
  if (cls === 'sticker_tattoo') {
    return 'The model judged this to be a transfer applied to the skin surface, rather than ink under the skin.';
  }
  if (cls === 'not_tattoo') {
    return 'The image does not appear to contain a tattoo, transfer or drawing. Point the camera at the marking you want classified.';
  }
  return 'The model judged this to be pigment drawn onto the skin surface, such as pen, marker or henna.';
}
