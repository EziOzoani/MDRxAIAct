import { motion, AnimatePresence } from 'framer-motion';
import { SpeechBubble } from '../SpeechBubble';
import {
  Microscope, Brain, Shield, FileCheck, Cpu, Database, ShieldOff, AlertTriangle,
  Activity, BarChart3, Users, Layers, TrendingDown, Clock, XCircle, CheckCircle,
  Skull, Heart, Eye, UserX, Plus, Check, X, Scale
} from 'lucide-react';
import { RegulatoryCard } from '../RegulatoryCard';
import { regulatoryComponents, frameworkAreas } from '@/lib/regulatoryData';
import { comparisonStats, riskExamples, coverageMappings } from '@/lib/riskManagementData';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { VizMode } from './HeroSection';
import { allProtections, type RegState } from '../RegulationMenu';
import { ProtectionGate } from '../ProtectionGate';
import type { Perspective } from '@/pages/Index';
type ViewMode = 'requirements' | 'cards' | 'dashboard' | 'scenarios';

interface UnderTheHoodSectionProps {
  userName: string;
  onCardExpandedChange?: (isExpanded: boolean) => void;
  regState?: RegState;
  vizMode?: VizMode;
  appliedProtections?: string[];
  perspective?: Perspective;
}

// Monitoring Dashboard Component
function MonitoringDashboard({ regState, appliedProtections = [] }: { regState: RegState; appliedProtections?: string[] }) {
  const isActive = regState === 'both';
  const isPartial = regState === 'mdrOnly' || regState === 'aiActOnly';
  const isDead = regState === 'neither';

  const metrics = [
    { label: 'Model Accuracy', value: isActive ? '82% (balanced)' : isDead ? '???' : '95.5% (misleading)', status: isActive ? 'good' : isDead ? 'dead' : 'warn', icon: BarChart3, protectionId: 'bias-testing' as string | null },
    { label: 'Drift Detection', value: isActive ? '0.02%' : isDead ? 'DISABLED' : regState === 'mdrOnly' ? 'DISABLED' : '0.02%', status: isActive ? 'good' : (isDead || regState === 'mdrOnly') ? 'dead' : 'good', icon: TrendingDown, protectionId: 'drift-monitor' as string | null },
    { label: 'Bias Alerts', value: isActive ? '0' : isDead ? 'NO DATA' : regState === 'mdrOnly' ? 'NO DATA' : '0', status: isActive ? 'good' : (isDead || regState === 'mdrOnly') ? 'dead' : 'good', icon: Users, protectionId: 'bias-testing' as string | null },
    { label: 'Last Review', value: isActive ? '2 days ago' : isDead ? 'NEVER' : regState === 'mdrOnly' ? '11 months' : '2 days ago', status: isActive ? 'good' : isDead ? 'dead' : regState === 'mdrOnly' ? 'warn' : 'good', icon: Clock, protectionId: null as string | null },
    { label: 'Incidents Reported', value: isActive ? '0' : isDead ? 'N/A' : '0', status: isActive ? 'good' : isDead ? 'dead' : 'warn', icon: AlertTriangle, protectionId: null as string | null },
    { label: 'Human Oversight', value: isActive ? 'ACTIVE' : isDead ? 'NONE' : regState === 'aiActOnly' ? 'NONE' : 'ACTIVE', status: isActive ? 'good' : (isDead || regState === 'aiActOnly') ? 'dead' : 'good', icon: Eye, protectionId: 'human-oversight' as string | null },
  ];

  return (
    <div className={cn(
      "p-6 rounded-xl border-2",
      isActive && "bg-slate-900 border-green-500",
      isPartial && "bg-slate-900 border-amber-500",
      isDead && "bg-red-950 border-red-500"
    )}>
      {/* Dashboard Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className={cn(
            "w-6 h-6",
            isActive && "text-green-400 animate-pulse",
            isPartial && "text-amber-400",
            isDead && "text-red-400"
          )} />
          <h3 className="text-xl font-bold text-white">System Monitoring</h3>
        </div>
        <div className={cn(
          "px-3 py-1 rounded-full text-sm font-bold",
          isActive && "bg-green-500/20 text-green-400",
          isPartial && "bg-amber-500/20 text-amber-400",
          isDead && "bg-red-500/20 text-red-400"
        )}>
          {isActive ? '● LIVE' : isPartial ? '◐ PARTIAL' : '○ OFFLINE'}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {metrics.map((metric, idx) => {
          const metricCard = (
            <motion.div
              key={metric.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "p-4 rounded-lg border",
                metric.status === 'good' && "bg-green-900/30 border-green-700",
                metric.status === 'warn' && "bg-amber-900/30 border-amber-700",
                metric.status === 'dead' && "bg-red-900/30 border-red-700"
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <metric.icon className={cn(
                  "w-4 h-4",
                  metric.status === 'good' && "text-green-400",
                  metric.status === 'warn' && "text-amber-400",
                  metric.status === 'dead' && "text-red-400"
                )} />
                <span className="text-xs text-slate-400">{metric.label}</span>
              </div>
              <div className={cn(
                "text-xl font-bold",
                metric.status === 'good' && "text-green-300",
                metric.status === 'warn' && "text-amber-300",
                metric.status === 'dead' && "text-red-300"
              )}>
                {metric.value}
              </div>
            </motion.div>
          );

          if (metric.protectionId) {
            return (
              <ProtectionGate key={metric.label} protectionId={metric.protectionId} appliedProtections={appliedProtections}>
                {metricCard}
              </ProtectionGate>
            );
          }
          return metricCard;
        })}
      </div>

      {/* Status Message */}
      <div className={cn(
        "mt-6 p-4 rounded-lg text-center",
        isActive && "bg-green-900/20 text-green-300",
        isPartial && "bg-amber-900/20 text-amber-300",
        isDead && "bg-red-900/20 text-red-300"
      )}>
        {isActive && "✓ All systems operational. Continuous monitoring active."}
        {regState === 'mdrOnly' && "⚠ AI-specific monitoring disabled. Drift and bias undetected."}
        {regState === 'aiActOnly' && "⚠ Clinical oversight missing. No medical incident pathway."}
        {isDead && "✗ SYSTEM UNMONITORED. No one is watching for problems."}
      </div>
    </div>
  );
}

// Incident Scenarios Component
function IncidentScenarios({ regState }: { regState: RegState }) {
  const scenarios = [
    {
      id: 'melanoma',
      title: 'Missed Melanoma',
      icon: Skull,
      description: 'Patient with early-stage melanoma receives "BENIGN" result.',
      withBoth: { status: 'prevented', text: 'Confidence threshold triggers "See a dermatologist" warning. Clinical escalation pathway activated.' },
      withMdr: { status: 'partial', text: 'Clinical pathway exists, but no AI confidence explanation. Patient might trust result anyway.' },
      withAiAct: { status: 'partial', text: 'AI explains low confidence, but no "see a doctor" prompt integrated.' },
      withNeither: { status: 'happened', text: 'Patient sees "BENIGN" and goes home. Cancer progresses for 8 months before symptoms appear.' },
    },
    {
      id: 'drift',
      title: 'Model Drift',
      icon: TrendingDown,
      description: 'Model accuracy degrades 15% over 6 months due to new camera types.',
      withBoth: { status: 'prevented', text: 'Drift detected at week 2. Automatic alert triggers retraining. 50 patients affected, all contacted.' },
      withMdr: { status: 'partial', text: 'Annual review catches it at month 11. 2,000+ patients received degraded results.' },
      withAiAct: { status: 'partial', text: 'Drift detected early, but no medical incident reporting. Patients not contacted.' },
      withNeither: { status: 'happened', text: 'No one notices. Model serves wrong results for 18 months. Unknown number of misdiagnoses.' },
    },
    {
      id: 'bias',
      title: 'Skin Tone Bias',
      icon: UserX,
      description: 'Model performs 23% worse on darker skin tones.',
      withBoth: { status: 'prevented', text: 'Pre-market fairness testing catches bias. Retraining with diverse dataset before launch.' },
      withMdr: { status: 'partial', text: 'Clinical validation uses limited demographic data. Bias not tested.' },
      withAiAct: { status: 'partial', text: 'Bias detected post-launch by AI Act monitoring. Retrospective patient review required.' },
      withNeither: { status: 'happened', text: 'Bias never discovered. Patients with darker skin receive systematically worse care.' },
    },
  ];

  const getScenarioState = (scenario: typeof scenarios[0]) => {
    if (regState === 'both') return scenario.withBoth;
    if (regState === 'mdrOnly') return scenario.withMdr;
    if (regState === 'aiActOnly') return scenario.withAiAct;
    return scenario.withNeither;
  };

  return (
    <div className="space-y-4">
      {scenarios.map((scenario, idx) => {
        const state = getScenarioState(scenario);
        return (
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.15 }}
            className={cn(
              "p-5 rounded-xl border-2",
              state.status === 'prevented' && "bg-green-50 border-green-300",
              state.status === 'partial' && "bg-amber-50 border-amber-300",
              state.status === 'happened' && "bg-red-50 border-red-300"
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
                state.status === 'prevented' && "bg-green-200",
                state.status === 'partial' && "bg-amber-200",
                state.status === 'happened' && "bg-red-200"
              )}>
                <scenario.icon className={cn(
                  "w-6 h-6",
                  state.status === 'prevented' && "text-green-700",
                  state.status === 'partial' && "text-amber-700",
                  state.status === 'happened' && "text-red-700"
                )} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-lg">{scenario.title}</h4>
                  {state.status === 'prevented' && <CheckCircle className="w-5 h-5 text-green-600" />}
                  {state.status === 'partial' && <AlertTriangle className="w-5 h-5 text-amber-600" />}
                  {state.status === 'happened' && <XCircle className="w-5 h-5 text-red-600" />}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{scenario.description}</p>
                <div className={cn(
                  "p-3 rounded-lg text-sm",
                  state.status === 'prevented' && "bg-green-100 text-green-800",
                  state.status === 'partial' && "bg-amber-100 text-amber-800",
                  state.status === 'happened' && "bg-red-100 text-red-800"
                )}>
                  <span className="font-bold">
                    {state.status === 'prevented' && '✓ PREVENTED: '}
                    {state.status === 'partial' && '⚠ PARTIAL: '}
                    {state.status === 'happened' && '✗ THIS HAPPENED: '}
                  </span>
                  {state.text}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// Risk Requirements Comparison View (MDR vs AI Act)
function RiskRequirementsView({ regState, mdrEnabled, aiActEnabled }: { regState: RegState; mdrEnabled: boolean; aiActEnabled: boolean }) {
  return (
    <div className="space-y-6">
      {/* Stats Comparison */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Requirements"
          value={aiActEnabled ? comparisonStats.withAiAct.totalRequirements : comparisonStats.mdrOnly.totalRequirements}
          delta={aiActEnabled ? `+${comparisonStats.withAiAct.additionalRequirements}` : null}
          isActive={mdrEnabled || aiActEnabled}
        />
        <StatCard
          label="Risk Categories"
          value={aiActEnabled ? comparisonStats.withAiAct.riskCategories : comparisonStats.mdrOnly.riskCategories}
          delta={aiActEnabled ? `+${comparisonStats.withAiAct.newRiskCategories}` : null}
          isActive={mdrEnabled || aiActEnabled}
        />
        <StatCard
          label="Doc Types"
          value={aiActEnabled ? comparisonStats.withAiAct.documentTypes : comparisonStats.mdrOnly.documentTypes}
          delta={aiActEnabled ? `+${comparisonStats.withAiAct.newDocuments}` : null}
          isActive={mdrEnabled || aiActEnabled}
        />
        <StatCard
          label="Metrics"
          value={aiActEnabled ? comparisonStats.withAiAct.monitoringMetrics : comparisonStats.mdrOnly.monitoringMetrics}
          delta={aiActEnabled ? `+${comparisonStats.withAiAct.newMetrics}` : null}
          isActive={mdrEnabled || aiActEnabled}
        />
      </div>

      {/* Side by Side Comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* MDR Column */}
        <div className={cn(
          "rounded-xl p-5 border-2 transition-all",
          mdrEnabled ? "bg-blue-50 dark:bg-blue-950/30 border-blue-400" : "bg-slate-100 dark:bg-slate-800 border-slate-300 opacity-50"
        )}>
          <div className="flex items-center gap-2 mb-4">
            <Shield className={cn("w-5 h-5", mdrEnabled ? "text-blue-600" : "text-slate-400")} />
            <h3 className={cn("font-bold", mdrEnabled ? "text-blue-700 dark:text-blue-300" : "text-slate-500")}>
              MDR Requirements
            </h3>
            {mdrEnabled ? (
              <Check className="w-4 h-4 text-blue-500 ml-auto" />
            ) : (
              <X className="w-4 h-4 text-slate-400 ml-auto" />
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {[
              'ISO 14971 risk management',
              'Hazard identification',
              'Risk control measures',
              'Residual risk evaluation',
              'Post-market surveillance',
              'Incident reporting (Art. 87)',
              'Periodic safety reports'
            ].map((item, idx) => (
              <li key={idx} className={cn(
                "flex items-start gap-2",
                mdrEnabled ? "text-slate-700 dark:text-slate-300" : "text-slate-400"
              )}>
                {mdrEnabled ? (
                  <Check className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                )}
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* AI Act Column */}
        <div className={cn(
          "rounded-xl p-5 border-2 transition-all",
          aiActEnabled ? "bg-green-50 dark:bg-green-950/30 border-green-400" : "bg-slate-100 dark:bg-slate-800 border-dashed border-slate-300 opacity-50"
        )}>
          <div className="flex items-center gap-2 mb-4">
            <Brain className={cn("w-5 h-5", aiActEnabled ? "text-green-600" : "text-slate-400")} />
            <h3 className={cn("font-bold", aiActEnabled ? "text-green-700 dark:text-green-300" : "text-slate-500")}>
              AI Act Additions
            </h3>
            {aiActEnabled ? (
              <Check className="w-4 h-4 text-green-500 ml-auto" />
            ) : (
              <Plus className="w-4 h-4 text-slate-400 ml-auto" />
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {[
              'Bias & fairness testing',
              'Demographic analysis',
              'Model explainability',
              'Drift monitoring',
              'Training data docs',
              'Rights impact assessment',
              'Human oversight design'
            ].map((item, idx) => (
              <motion.li
                key={idx}
                className={cn(
                  "flex items-start gap-2",
                  aiActEnabled ? "text-slate-700 dark:text-slate-300" : "text-slate-400"
                )}
                animate={{
                  opacity: aiActEnabled ? 1 : 0.5,
                  x: aiActEnabled ? 0 : -5
                }}
                transition={{ delay: idx * 0.05 }}
              >
                {aiActEnabled ? (
                  <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                )}
                {item}
              </motion.li>
            ))}
          </ul>

          {!aiActEnabled && (
            <p className="mt-4 text-xs text-slate-500 italic text-center">
              Enable AI Act in menu (☰) to activate
            </p>
          )}
        </div>
      </div>

      {/* Example Card */}
      {(mdrEnabled || aiActEnabled) && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-5 rounded-xl border-2",
            regState === 'both'
              ? "bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/30 dark:to-blue-950/30 border-green-300"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-300"
          )}
        >
          <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Microscope className="w-5 h-5" />
            Example: Skin Lesion Classifier
          </h4>
          <div className="grid md:grid-cols-3 gap-3">
            <div className={cn(
              "p-3 rounded-lg",
              aiActEnabled ? "bg-white dark:bg-slate-800" : "bg-slate-100 dark:bg-slate-700 opacity-60"
            )}>
              <div className={cn("font-semibold text-sm mb-1", aiActEnabled ? "text-red-600" : "text-slate-500")}>
                {aiActEnabled ? "Risk: Demographic Bias" : "Undetected Risk"}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {aiActEnabled
                  ? "Balanced model: 82% accuracy on 400/class even split. Per-class recall: real 74%, sticker 95%, pen 76%. Skin tone gap: 6%."
                  : "Unbalanced model reports 95.5% accuracy — but 86% of val data is sticker_tattoo. Minority class recall drops to 72%. Headline hides the bias."}
              </p>
            </div>
            <div className={cn(
              "p-3 rounded-lg",
              aiActEnabled ? "bg-white dark:bg-slate-800" : "bg-slate-100 dark:bg-slate-700 opacity-60"
            )}>
              <div className={cn("font-semibold text-sm mb-1", aiActEnabled ? "text-amber-600" : "text-slate-500")}>
                {aiActEnabled ? "Risk: AI Hallucination" : "Undetected Risk"}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {aiActEnabled
                  ? "AI cites non-existent 'irregular border pattern'"
                  : "Would not be monitored without AI Act"}
              </p>
            </div>
            <div className={cn(
              "p-3 rounded-lg",
              aiActEnabled ? "bg-white dark:bg-slate-800" : "bg-slate-100 dark:bg-slate-700 opacity-60"
            )}>
              <div className={cn("font-semibold text-sm mb-1", aiActEnabled ? "text-purple-600" : "text-slate-500")}>
                {aiActEnabled ? "Req: Explainability" : "Missing Requirement"}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {aiActEnabled
                  ? "Must show which regions influenced classification"
                  : "No explainability required without AI Act"}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {regState === 'neither' && (
        <div className="p-6 bg-red-100 dark:bg-red-950/50 border-2 border-red-400 rounded-xl text-center">
          <ShieldOff className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 dark:text-red-300 font-bold text-lg">
            No Regulatory Framework Active
          </p>
          <p className="text-red-600 dark:text-red-400 text-sm mt-2">
            Enable MDR and/or AI Act in the menu (☰) to see requirements
          </p>
        </div>
      )}
    </div>
  );
}

// Stat Card for Requirements View
function StatCard({ label, value, delta, isActive }: { label: string; value: number; delta: string | null; isActive: boolean }) {
  return (
    <div className={cn(
      "rounded-xl p-4 border transition-all",
      isActive ? "bg-card border-border" : "bg-slate-100 dark:bg-slate-800 border-slate-200 opacity-50"
    )}>
      <div className="text-2xl font-bold text-foreground">
        {isActive ? value : '—'}
        {delta && isActive && (
          <span className="text-sm text-green-500 ml-1">{delta}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function UnderTheHoodSection({ userName, onCardExpandedChange, regState = 'both', appliedProtections = [], perspective = 'doctor' }: UnderTheHoodSectionProps) {
  const [hasExpandedCard, setHasExpandedCard] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('requirements');
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';
  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';

  // Check human oversight (final protection)
  const hasHumanOversight = appliedProtections.includes('human-oversight');
  const totalProtections = appliedProtections.length;
  
  const handleCardExpandedChange = (isExpanded: boolean) => {
    setHasExpandedCard(isExpanded);
    onCardExpandedChange?.(isExpanded);
  };

  return (
    <section className="min-h-screen bg-gradient-to-b from-secondary/30 to-background relative overflow-hidden pt-4 pb-16">
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



        {/* View Mode Switcher */}
        <div className="mb-6" style={{ marginLeft: '50%', width: '50%' }}>
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              onClick={() => setViewMode('requirements')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
                viewMode === 'requirements'
                  ? "bg-white dark:bg-slate-700 shadow text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Scale className="w-4 h-4" />
              MDR vs AI Act
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
                viewMode === 'cards'
                  ? "bg-white dark:bg-slate-700 shadow text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Layers className="w-4 h-4" />
              Cards
            </button>
            <button
              onClick={() => setViewMode('dashboard')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
                viewMode === 'dashboard'
                  ? "bg-white dark:bg-slate-700 shadow text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Activity className="w-4 h-4" />
              Monitor
            </button>
            <button
              onClick={() => setViewMode('scenarios')}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-md text-xs font-medium transition-all",
                viewMode === 'scenarios'
                  ? "bg-white dark:bg-slate-700 shadow text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              Scenarios
            </button>
          </div>
        </div>

        {/* Warning banner when regulations are off */}
        {regState === 'neither' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-red-600 text-white rounded-xl shadow-lg"
            style={{ marginLeft: '50%', width: '50%' }}
          >
            <div className="flex items-center gap-4">
              <ShieldOff className="w-12 h-12 flex-shrink-0" />
              <div>
                <h3 className="text-2xl font-black">⚠️ DEPLOYED AND FORGOTTEN</h3>
                <p className="text-red-100 mt-1">
                  Without MDR or AI Act compliance, this system has:
                </p>
                <ul className="mt-2 space-y-1 text-red-100">
                  <li>• No clinical validation or CE marking</li>
                  <li>• No bias testing or fairness monitoring</li>
                  <li>• No post-market surveillance</li>
                  <li>• No incident reporting</li>
                  <li>• No one watching for problems</li>
                </ul>
                <p className="mt-3 font-bold text-yellow-300">
                  This is how patients get harmed.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Warning for partial regulation */}
        {(regState === 'mdrOnly' || regState === 'aiActOnly') && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-amber-100 border-2 border-amber-400 text-amber-900 rounded-xl"
            style={{ marginLeft: '50%', width: '50%' }}
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="text-lg font-bold">
                  {regState === 'mdrOnly' ? 'MDR Only - Missing AI-Specific Oversight' : 'AI Act Only - Missing Medical Device Framework'}
                </h3>
                <p className="text-sm mt-1">
                  {regState === 'mdrOnly'
                    ? 'Annual review catches problems 11 months too late. No drift detection, no bias monitoring.'
                    : 'No clinical validation, no CE marking, no medical incident reporting pathway.'}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Content based on view mode */}
        <div style={{ marginLeft: '50%', width: '50%' }}>
          {/* Doctor view: Simplified monitoring overview */}
          {perspective === 'doctor' && (
            <AnimatePresence mode="wait">
              {viewMode === 'requirements' && (
                <motion.div
                  key="requirements"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <RiskRequirementsView regState={regState} mdrEnabled={mdrEnabled} aiActEnabled={aiActEnabled} />
                </motion.div>
              )}

              {viewMode === 'cards' && (
                <motion.div
                  key="cards"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {regulatoryComponents.map((component, index) => (
                    <RegulatoryCard
                      key={component.id}
                      component={component}
                      index={index}
                      onExpandedChange={handleCardExpandedChange}
                      regState={regState}
                    />
                  ))}
                </motion.div>
              )}

              {viewMode === 'dashboard' && (
                <motion.div
                  key="dashboard-doctor"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {/* Simplified doctor dashboard - status indicators */}
                  <div className={cn(
                    "p-6 rounded-xl border-2",
                    regState === 'both' ? "bg-green-50 dark:bg-green-950/30 border-green-400" :
                    regState === 'neither' ? "bg-red-50 dark:bg-red-950/30 border-red-400" :
                    "bg-amber-50 dark:bg-amber-950/30 border-amber-400"
                  )}>
                    <h3 className="text-lg font-bold mb-4">System Status</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">AI System Monitoring</span>
                        <span className={cn("text-sm font-bold", regState === 'both' ? "text-green-600" : regState === 'neither' ? "text-red-600" : "text-amber-600")}>
                          {regState === 'both' ? 'All systems operational' : regState === 'neither' ? 'OFFLINE' : 'Partial'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Patient Safety Level</span>
                        <span className={cn("text-sm font-bold", regState === 'both' ? "text-green-600" : regState === 'neither' ? "text-red-600" : "text-amber-600")}>
                          {regState === 'both' ? 'Maximum' : regState === 'neither' ? 'None' : 'Reduced'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Active Protections</span>
                        <span className="text-sm font-bold">{appliedProtections.length}/{allProtections.length}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {viewMode === 'scenarios' && (
                <motion.div
                  key="scenarios"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <IncidentScenarios regState={regState} />
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Engineer view: Full technical details */}
          {perspective === 'engineer' && (
            <AnimatePresence mode="wait">
              {viewMode === 'requirements' && (
                <motion.div
                  key="requirements"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <RiskRequirementsView regState={regState} mdrEnabled={mdrEnabled} aiActEnabled={aiActEnabled} />
                </motion.div>
              )}

              {viewMode === 'cards' && (
                <motion.div
                  key="cards"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  {regulatoryComponents.map((component, index) => (
                    <RegulatoryCard
                      key={component.id}
                      component={component}
                      index={index}
                      onExpandedChange={handleCardExpandedChange}
                      regState={regState}
                    />
                  ))}
                </motion.div>
              )}

              {viewMode === 'dashboard' && (
                <motion.div
                  key="dashboard-engineer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <MonitoringDashboard regState={regState} appliedProtections={appliedProtections} />
                  {/* Extra engineer-only technical panel */}
                  <div className="p-4 bg-slate-900 rounded-xl space-y-3">
                    <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Technical Metrics</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Model Version</span>
                        <p className="font-mono text-slate-300">tattoo-detection v1.0</p>
                      </div>
                      <div>
                        <span className="text-slate-500">Training Samples</span>
                        <p className="font-mono text-slate-300">12,847</p>
                      </div>
                      <div>
                        <span className="text-slate-500">F1 Score</span>
                        <p className="font-mono text-slate-300">0.943</p>
                      </div>
                      <div>
                        <span className="text-slate-500">AUC-ROC</span>
                        <p className="font-mono text-slate-300">0.971</p>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Protection Checks — System Level</span>
                      <div className="mt-2 space-y-2">
                        {[
                          { id: 'ce-marking', short: 'CE', label: 'CE Marking', source: 'mdr',
                            detail: 'Class IIa medical device. Software lifecycle per IEC 62304. Conformity re-assessed annually.' },
                          { id: 'clinical-eval', short: 'CLIN', label: 'Clinical Evaluation', source: 'mdr',
                            detail: 'Clinical investigation on 1,200 balanced images. Macro F1: 0.82. Weighted F1: 0.82. Per-class: real 0.79, sticker 0.93, pen 0.73. Updated per MDCG 2020-1.' },
                          { id: 'pms', short: 'PMS', label: 'Post-Market Surveillance', source: 'mdr',
                            detail: 'Continuous PMS plan active. PSUR generated every 12 months. Trend analysis on prediction accuracy.' },
                          { id: 'incident', short: 'INC', label: 'Incident Reporting', source: 'mdr',
                            detail: 'Vigilance system per MDR Art. 87. Serious incidents reported within 15 days. Field safety corrective actions tracked.' },
                          { id: 'ifu', short: 'IFU', label: 'Instructions for Use', source: 'mdr',
                            detail: 'IFU includes intended purpose, contraindications, residual risks, and warnings about AI limitations.' },
                          { id: 'bias-testing', short: 'BIAS', label: 'Bias Testing', source: 'aiAct',
                            detail: 'WITH bias testing: 400/class balanced data, class weights, skin-tone sampling. Accuracy 82%, even across classes (recall: real 74%, sticker 95%, pen 76%). WITHOUT: 95.5% headline accuracy is inflated — 86% of validation is sticker_tattoo. Model overfits to majority class, minority recall drops to 72%. The high number hides the bias.' },
                          { id: 'explainability', short: 'XAI', label: 'Explainability', source: 'aiAct',
                            detail: 'Grad-CAM + SHAP explanations for every prediction. Feature importance: ink depth, edge sharpness, color saturation.' },
                          { id: 'drift-monitor', short: 'DRFT', label: 'Drift Monitoring', source: 'aiAct',
                            detail: 'KL divergence tracked on input distribution. Current: 0.02. Alert threshold: 0.15. Auto-retrain triggered at 0.25.' },
                          { id: 'transparency', short: 'TRNS', label: 'Transparency', source: 'aiAct',
                            detail: 'Public model card: ViT-base fine-tuned on 6,315 images. Sources: tatvton-tattoo-raw (5,444 real), Openverse+Pexels CC (438 sticker, 433 pen). Class ratio 12.6:1 before balancing. Skin tones: Type IV 47%, Types I-II 1.9%, VI 3.8%. All documented in DATA_HANDLING_LOG.md.' },
                          { id: 'human-oversight', short: 'HUM', label: 'Human Oversight', source: 'aiAct',
                            detail: 'All predictions require clinician confirmation. Override rate tracked. Automated stop if override rate > 15%.' },
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
                  </div>
                </motion.div>
              )}

              {viewMode === 'scenarios' && (
                <motion.div
                  key="scenarios"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <IncidentScenarios regState={regState} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>


        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <p className="text-lg text-muted-foreground mb-4">
            Ready to explore more features?
          </p>
          <p className="text-sm text-muted-foreground">
            This is just the beginning of your journey with Medical AI. 
            More sections and features coming soon!
          </p>
        </motion.div>
      </div>
    </section>
  );
}
