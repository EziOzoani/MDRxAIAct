import { motion } from 'framer-motion';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { Check, X, AlertCircle, AlertTriangle, ShieldOff, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { VizMode } from './HeroSection';
import { allProtections, type RegState } from '../RegulationMenu';
import { ProtectionGate } from '../ProtectionGate';
import type { Perspective } from '@/pages/Index';

// Helper to get protection info
const getProtectionInfo = (id: string) => allProtections.find(p => p.id === id);

interface ResultsSectionProps {
  userName: string;
  onConfirm: () => void;
  onDecline: () => void;
  regState?: RegState;
  vizMode?: VizMode;
  appliedProtections?: string[];
  perspective?: Perspective;
  classificationResult?: any;
}

export function ResultsSection({ userName, onConfirm, onDecline, regState = 'both', appliedProtections = [], perspective = 'doctor', classificationResult }: ResultsSectionProps) {
  // Check protections relevant to this step
  const hasIncident = appliedProtections.includes('incident');
  const hasDriftMonitor = appliedProtections.includes('drift-monitor');
  const sectionProtections = ['incident', 'drift-monitor'];
  const activeCount = sectionProtections.filter(p => appliedProtections.includes(p)).length;
  // Derive the displayed detection from the ACTUAL model result so Step 3
  // matches what Step 2 showed. Previously this card hard-coded
  // "Tattoo Detected: Yes" + 82%, which contradicted Step 2 whenever the
  // model said pen / sticker / not_tattoo.
  const DETECTION_LABELS: Record<string, string> = {
    real_tattoo: 'Real Tattoo',
    sticker_tattoo: 'Sticker / Temporary',
    pen_drawn: 'Pen / Marker Drawing',
    not_tattoo: 'No Tattoo',
  };
  const predictedClass: string = classificationResult?.predictedClass ?? 'real_tattoo';
  const detectionLabel = DETECTION_LABELS[predictedClass] ?? 'Real Tattoo';
  const confidencePct = Math.round((classificationResult?.confidence ?? 0.82) * 100);
  const confidenceBand = confidencePct >= 80 ? 'High' : confidencePct >= 55 ? 'Medium' : 'Low';

  const results = {
    tattooDetected: predictedClass !== 'not_tattoo',
    confidence: confidencePct,
    skinLesionRisk: 'low',
    recommendations: [
      'No concerning skin lesions detected in the analyzed area',
      'Tattoo ink appears healthy with no signs of allergic reaction',
      'Consider regular skin checks for tattooed areas'
    ]
  };

  return (
    <section className="min-h-screen bg-background relative flex items-center overflow-hidden py-16">
      {/* Background decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
          {/* Results content */}
          <div className="flex-1 space-y-6 relative">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
              className="inline-block px-3 py-1 bg-accent/10 rounded-full text-accent text-sm font-semibold"
            >
              Step 3 of 4
            </motion.div>

            {/* Speech bubble positioned at 1/4 height, moved to the right */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="lg:max-w-[320px] absolute"
              style={{ 
                left: '22%', // Moved right from bear's position
                top: '25%', // 1/4 from top
                transform: 'translateY(-50%)'
              }}
            >
              <SpeechBubble direction="left">
                <p className="text-lg font-semibold text-foreground">
                  Here are your results, {userName}! 📋
                </p>
                <p className="text-muted-foreground mt-1">
                  Please review the AI analysis and confirm if you agree with the findings.
                </p>
              </SpeechBubble>
            </motion.div>

            {/* Results card - half screen on the right */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              viewport={{ once: true }}
              className="glass-card overflow-hidden lg:ml-auto relative"
              style={{ marginLeft: '50%', width: '50%' }}
            >
              {/* DANGER overlay when no regulations */}
              {regState === 'neither' && (
                <div className="absolute inset-0 bg-red-900/90 z-20 flex flex-col items-center justify-center text-white p-8">
                  <ShieldOff className="w-20 h-20 mb-4 text-red-300" />
                  <h3 className="text-3xl font-bold mb-2">⚠️ DANGEROUS OUTPUT</h3>
                  <p className="text-xl text-center mb-4">No regulatory protection active</p>
                  <div className="bg-white text-black p-6 rounded-xl text-center">
                    <p className="text-4xl font-black">BENIGN</p>
                    <p className="text-sm text-gray-500 mt-2">That's all you get. No confidence. No explanation. No "see a doctor".</p>
                  </div>
                  <p className="mt-6 text-red-200 text-center max-w-sm">
                    A user might trust this and ignore a real melanoma. This is why regulations matter.
                  </p>
                </div>
              )}

              {/* Warning overlay for partial regulation */}
              {(regState === 'mdrOnly' || regState === 'aiActOnly') && (
                <div className="absolute top-0 left-0 right-0 bg-amber-500 text-black py-2 px-4 z-10 flex items-center justify-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  <span className="font-bold">
                    {regState === 'mdrOnly' ? 'Missing: AI explainability requirements' : 'Missing: Medical device clinical guidance'}
                  </span>
                </div>
              )}

              {/* Header */}
              <div className={`p-8 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border ${(regState === 'mdrOnly' || regState === 'aiActOnly') ? 'mt-10' : ''}`}>
                <h3 className="text-2xl font-bold text-foreground">Detection Results</h3>
                <p className="text-lg text-muted-foreground">AI Model Analysis Report</p>

                {/* Protection status for this step */}
                <div className={cn(
                  "mt-4 p-3 rounded-lg border transition-all",
                  activeCount === 2 ? "bg-green-50 border-green-200 dark:bg-green-950/30" :
                  activeCount === 1 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30" :
                  "bg-red-50 border-red-200 dark:bg-red-950/30"
                )}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="group relative">
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-help",
                        hasIncident ? "bg-blue-500 text-white" : "bg-slate-200 text-slate-500"
                      )}>
                        <AlertCircle className="w-3 h-3" />
                        INC
                      </div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        <div className="font-bold text-blue-300">{getProtectionInfo('incident')?.label}</div>
                        <div className="text-slate-300">{getProtectionInfo('incident')?.description}</div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                      </div>
                    </div>
                    <div className="group relative">
                      <div className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-help",
                        hasDriftMonitor ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
                      )}>
                        <TrendingDown className="w-3 h-3" />
                        DRFT
                      </div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        <div className="font-bold text-green-300">{getProtectionInfo('drift-monitor')?.label}</div>
                        <div className="text-slate-300">{getProtectionInfo('drift-monitor')?.description}</div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground ml-auto">Monitoring: {activeCount}/2</span>
                  </div>
                  <p className="text-xs">
                    {activeCount === 2 && "✓ Results monitored with incident reporting and drift detection active."}
                    {activeCount === 1 && hasIncident && "⚠ Incident reporting on, but no drift detection - model may degrade unnoticed."}
                    {activeCount === 1 && hasDriftMonitor && "⚠ Drift monitored, but no incident reporting pathway for problems."}
                    {activeCount === 0 && "⛔ No monitoring - if this result is wrong, no one will ever know."}
                  </p>
                </div>
              </div>

              {/* Results grid */}
              <div className="p-8 space-y-8">
                {/* Main metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="p-6 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <p className="text-lg text-muted-foreground">Detection</p>
                        <p className="text-2xl font-bold text-foreground">{detectionLabel}</p>
                      </div>
                    </div>
                  </div>

                  {/* Confidence - hidden or shown based on regulation */}
                  <div className={`p-6 bg-primary/5 rounded-xl border border-primary/20 ${regState === 'aiActOnly' ? 'opacity-40 relative' : ''}`}>
                    {regState === 'aiActOnly' && (
                      <div className="absolute inset-0 bg-gray-200/80 rounded-xl flex items-center justify-center">
                        <span className="text-gray-600 font-bold text-sm">MDR Required</span>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-bold text-lg">{confidencePct}%</span>
                      </div>
                      <div>
                        <p className="text-lg text-muted-foreground">Confidence</p>
                        <p className="text-2xl font-bold text-foreground">{confidenceBand}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk assessment - wrapped with explainability ProtectionGate */}
                <ProtectionGate protectionId="explainability" appliedProtections={appliedProtections} label="Explainability Disabled">
                  <div className={`p-6 rounded-xl border ${
                    regState === 'mdrOnly'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                        regState === 'mdrOnly' ? 'bg-amber-100' : 'bg-green-100 dark:bg-green-900'
                      }`}>
                        {regState === 'mdrOnly' ? (
                          <AlertTriangle className="w-6 h-6 text-amber-600" />
                        ) : (
                          <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      <div>
                        <p className={`text-xl font-semibold ${
                          regState === 'mdrOnly' ? 'text-amber-800' : 'text-green-800 dark:text-green-200'
                        }`}>
                          {regState === 'mdrOnly' ? 'Result: Low Risk' : 'Low Risk Assessment'}
                        </p>
                        <p className={`text-lg mt-1 ${
                          regState === 'mdrOnly' ? 'text-amber-600' : 'text-green-600 dark:text-green-400'
                        }`}>
                          {regState === 'mdrOnly'
                            ? 'No explanation provided. AI Act would require explainability.'
                            : 'No concerning skin lesions detected in the analyzed area.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </ProtectionGate>

                {/* Recommendations - only with full regulation or MDR */}
                {(regState === 'both' || regState === 'mdrOnly') && (
                  <div className={regState === 'mdrOnly' ? 'opacity-60' : ''}>
                    <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-primary" />
                      Recommendations
                      {regState === 'mdrOnly' && <span className="text-xs text-amber-600">(Limited - no AI context)</span>}
                    </h4>
                    <ul className="space-y-2">
                      {results.recommendations.map((rec, index) => (
                        <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* AI Act only - missing clinical guidance */}
                {regState === 'aiActOnly' && (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl">
                    <p className="text-amber-800 font-medium flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Missing: Clinical follow-up recommendations (requires MDR)
                    </p>
                  </div>
                )}

                {/* Engineer view: Technical details */}
                {perspective === 'engineer' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-slate-900 rounded-xl text-sm space-y-3"
                  >
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Model Card</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Model</span>
                        <p className="font-mono text-slate-300">tattoo-detection v1.0</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Task</span>
                        <p className="font-mono text-slate-300">image-classification</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Macro F1</span>
                        <p className="font-mono text-slate-300">0.86 (balanced)</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Accuracy</span>
                        <p className="font-mono text-slate-300">86% balanced / 97% unbalanced*</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">*97% inflated by majority real_tattoo class in val set</p>
                      </div>
                    </div>

                    {classificationResult?.classScores && (
                      <div>
                        <span className="text-xs text-slate-500">Confidence Scores</span>
                        <div className="mt-1 bg-slate-800 rounded p-2 space-y-1">
                          {/* All four model logits, in LABEL_0..3 order so the
                              engineer view matches the model's real output. */}
                          {([
                            ['real_tattoo', 'LABEL_0 (real_tattoo)'],
                            ['sticker_tattoo', 'LABEL_1 (sticker_tattoo)'],
                            ['pen_drawn', 'LABEL_2 (pen_drawn)'],
                            ['not_tattoo', 'LABEL_3 (not_tattoo)'],
                          ] as const).map(([key, label]) => (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="text-slate-400">{label}</span>
                              <span className="font-mono text-slate-300">
                                {(classificationResult.classScores[key] ?? 0).toFixed(6)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Protection Checks on This Result</span>
                      <div className="mt-2 space-y-2">
                        {[
                          { id: 'ce-marking', short: 'CE', label: 'CE Marking', source: 'mdr',
                            detail: 'Device registered as Class IIa medical device. Software version validated against declared conformity.' },
                          { id: 'clinical-eval', short: 'CLIN', label: 'Clinical Evaluation', source: 'mdr',
                            detail: 'ViT-base validated on the held-out balanced split. Macro F1: 0.86. Per-class recall: real 98%, sticker 81%, pen 79%, none 86%.' },
                          { id: 'pms', short: 'PMS', label: 'Post-Market Surveillance', source: 'mdr',
                            detail: 'Result logged to PMS database. Aggregate accuracy tracked in periodic safety update report (PSUR).' },
                          { id: 'incident', short: 'INC', label: 'Incident Reporting', source: 'mdr',
                            detail: 'Decline button triggers incident pathway per MDR Art. 87. Competent authority notified within 15 days if disputed.' },
                          { id: 'ifu', short: 'IFU', label: 'Instructions for Use', source: 'mdr',
                            detail: 'Recommendation text follows IFU guidelines: "AI-assisted. Not a diagnosis. Consult dermatologist."' },
                          { id: 'bias-testing', short: 'BIAS', label: 'Bias Testing', source: 'aiAct',
                            detail: 'Balanced model: 400/class, class weights, skin-tone sampling → 82% accuracy, even recall. Without: 95.5% inflated by 86% majority class in val. Minority recall drops to 72%. High headline hides the bias.' },
                          { id: 'explainability', short: 'XAI', label: 'Explainability', source: 'aiAct',
                            detail: 'Risk assessment explanation generated from Grad-CAM saliency map. Feature attribution visible to clinician.' },
                          { id: 'drift-monitor', short: 'DRFT', label: 'Drift Monitoring', source: 'aiAct',
                            detail: 'Result confidence compared to rolling baseline. KL divergence: 0.02. No drift detected. Alert at 0.15.' },
                          { id: 'transparency', short: 'TRNS', label: 'Transparency', source: 'aiAct',
                            detail: 'AI-generated. ViT-base on 6,315 images (tatvton-tattoo-raw + Openverse/Pexels CC). Class ratio 12.6:1 before balancing. Skin tones: IV 47%, I-II 1.9%, VI 3.8%. Full provenance in DATA_HANDLING_LOG.md.' },
                          { id: 'human-oversight', short: 'HUM', label: 'Human Oversight', source: 'aiAct',
                            detail: 'Confirm/Decline buttons enforce clinician review. No automated action without human approval. All decisions logged.' },
                        ].map(p => {
                          const isActive = appliedProtections.includes(p.id);
                          return (
                            <div key={p.id} className={cn(
                              "p-2 rounded-lg border text-xs",
                              isActive ? "bg-slate-800 border-slate-700" : "bg-red-950/50 border-red-800/50"
                            )}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={cn(
                                  "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                  isActive ? (p.source === 'mdr' ? "bg-blue-600 text-white" : "bg-green-600 text-white") : "bg-red-800 text-red-300"
                                )}>
                                  {p.short}
                                </span>
                                <span className={cn("font-semibold", isActive ? "text-slate-200" : "text-red-400")}>
                                  {p.label}
                                </span>
                                <span className={cn("ml-auto text-[10px]", isActive ? "text-green-400" : "text-red-400")}>
                                  {isActive ? 'ACTIVE' : 'DISABLED'}
                                </span>
                              </div>
                              <p className={cn("leading-relaxed", isActive ? "text-slate-400" : "text-red-400/60 line-through")}>
                                {p.detail}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}

                {/*
                  Action buttons.
                  When Human Oversight is OFF we don't hard-block navigation -
                  the shield toggles only live in Under-the-Hood, so trapping
                  the user here would leave them with no way out. Instead, we
                  reframe the primary button as "Go under the hood (enable
                  Human Oversight there)", same action as Confirm, just a
                  message that teaches the lesson instead of stonewalling.
                */}
                <div className="flex flex-col gap-4 pt-6 border-t border-border">
                  {!appliedProtections.includes('human-oversight') && (
                    <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-800 text-sm">
                      <p className="font-semibold">Human Oversight is disabled</p>
                      <p className="text-xs mt-1">
                        Without human-in-the-loop review, AI results cannot be <em>confirmed</em> for clinical use.
                        In this demo you can still continue, head under the hood to re-enable Human Oversight
                        and other protections, then come back to confirm.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Button
                      onClick={onConfirm}
                      className="flex-1 h-16 text-lg font-bold rounded-xl shadow-soft hover:shadow-medium transition-all duration-300 bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <Check className="mr-2 w-5 h-5" />
                      {appliedProtections.includes('human-oversight')
                        ? 'Confirm Results'
                        : 'Go under the hood to enable'}
                    </Button>
                    <Button
                      onClick={onDecline}
                      variant="outline"
                      className="flex-1 h-16 text-lg font-bold border-2 border-destructive/30 text-destructive hover:bg-destructive/5 rounded-xl transition-all duration-300"
                    >
                      <X className="mr-2 w-5 h-5" />
                      Decline / Retake
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
