import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, AlertTriangle, Users, BrainCircuit, TrendingDown,
  Scale, Database, ImageOff, Factory, Stethoscope, Heart,
  ChevronRight, Check, X, Plus, ArrowRight, Brain, Ban,
  Map, Layers, Thermometer, MessageCircle, User, CheckCircle, XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  riskExamples,
  stakeholderPerspectives,
  coverageMappings,
  comparisonStats,
  type RiskExample,
  type StakeholderPerspective,
  type CoverageMapping
} from '@/lib/riskManagementData';
import type { VizMode } from './HeroSection';
import type { RegState } from '../RegulationMenu';

interface RiskManagementSectionProps {
  userName?: string;
  vizMode?: VizMode;
  regState?: RegState;
}

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  ImageOff,
  Users,
  BrainCircuit,
  AlertTriangle,
  TrendingDown,
  Scale,
  Database,
  Factory,
  Stethoscope,
  Heart,
  Shield
};

type ViewMode = 'overview' | 'risks' | 'stakeholders' | 'coverage';

export function RiskManagementSection({ userName, vizMode = 'reactive-bear', regState = 'both' }: RiskManagementSectionProps) {
  // Derive aiActEnabled from regState prop
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';
  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';

  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedStakeholder, setSelectedStakeholder] = useState<string | null>(null);

  // Filter risks based on toggle state
  const visibleRisks = aiActEnabled
    ? riskExamples
    : riskExamples.filter(r => r.mdrOnly);

  const aiActOnlyRisks = riskExamples.filter(r => r.aiActSpecific);

  return (
    <section className="min-h-screen bg-gradient-to-b from-background to-secondary/20 py-16">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-full text-amber-600 text-sm font-semibold mb-4">
            <Shield className="w-4 h-4" />
            Risk Management Deep Dive
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">
            MDR <span className="text-gradient">vs AI Act</span> Risk Requirements
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
            Explore how the EU AI Act adds new dimensions to medical device risk management.
            Toggle to see what changes when AI Act requirements apply.
          </p>

          {/* Regulation Status Display */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-4 p-3 bg-card rounded-xl border border-border shadow-lg">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                mdrEnabled ? "bg-blue-500/10 text-blue-600" : "bg-slate-100 text-slate-400"
              )}>
                <Shield className="w-4 h-4" />
                <span className="font-medium text-sm">MDR</span>
                {mdrEnabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </div>
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg",
                aiActEnabled ? "bg-green-500/10 text-green-600" : "bg-slate-100 text-slate-400"
              )}>
                <Brain className="w-4 h-4" />
                <span className="font-medium text-sm">AI Act</span>
                {aiActEnabled ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </div>
              <span className="text-xs text-muted-foreground ml-2">
                Use menu (☰) to toggle
              </span>
            </div>
          </div>

          {/* Stats Comparison */}
          <AnimatePresence mode="wait">
            <motion.div
              key={aiActEnabled ? 'with-ai' : 'mdr-only'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto mb-8"
            >
              <StatCard
                label="Requirements"
                value={aiActEnabled ? comparisonStats.withAiAct.totalRequirements : comparisonStats.mdrOnly.totalRequirements}
                delta={aiActEnabled ? `+${comparisonStats.withAiAct.additionalRequirements}` : null}
                aiActEnabled={aiActEnabled}
              />
              <StatCard
                label="Risk Categories"
                value={aiActEnabled ? comparisonStats.withAiAct.riskCategories : comparisonStats.mdrOnly.riskCategories}
                delta={aiActEnabled ? `+${comparisonStats.withAiAct.newRiskCategories}` : null}
                aiActEnabled={aiActEnabled}
              />
              <StatCard
                label="Document Types"
                value={aiActEnabled ? comparisonStats.withAiAct.documentTypes : comparisonStats.mdrOnly.documentTypes}
                delta={aiActEnabled ? `+${comparisonStats.withAiAct.newDocuments}` : null}
                aiActEnabled={aiActEnabled}
              />
              <StatCard
                label="Monitoring Metrics"
                value={aiActEnabled ? comparisonStats.withAiAct.monitoringMetrics : comparisonStats.mdrOnly.monitoringMetrics}
                delta={aiActEnabled ? `+${comparisonStats.withAiAct.newMetrics}` : null}
                aiActEnabled={aiActEnabled}
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Visualization based on vizMode */}
        <div className="mb-12">
          <VizModeDisplay vizMode={vizMode} aiActEnabled={aiActEnabled} />
        </div>

        {/* View Mode Tabs */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex bg-card rounded-lg p-1 border border-border">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'risks', label: 'Risk Examples' },
              { id: 'stakeholders', label: 'Stakeholder Views' },
              { id: 'coverage', label: 'Coverage Matrix' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id as ViewMode)}
                className={cn(
                  "px-4 py-2 rounded-md font-medium transition-all text-sm",
                  viewMode === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {viewMode === 'overview' && (
            <OverviewView aiActEnabled={aiActEnabled} />
          )}
          {viewMode === 'risks' && (
            <RisksView
              visibleRisks={visibleRisks}
              aiActEnabled={aiActEnabled}
              aiActOnlyRisks={aiActOnlyRisks}
            />
          )}
          {viewMode === 'stakeholders' && (
            <StakeholdersView
              aiActEnabled={aiActEnabled}
              selectedStakeholder={selectedStakeholder}
              setSelectedStakeholder={setSelectedStakeholder}
            />
          )}
          {viewMode === 'coverage' && (
            <CoverageView aiActEnabled={aiActEnabled} />
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  delta,
  aiActEnabled
}: {
  label: string;
  value: number;
  delta: string | null;
  aiActEnabled: boolean;
}) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="text-2xl font-bold text-foreground">
        {value}
        {delta && (
          <span className="text-sm text-green-500 ml-1">{delta}</span>
        )}
      </div>
      <div className="text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

// Overview View
function OverviewView({ aiActEnabled }: { aiActEnabled: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="grid md:grid-cols-2 gap-8">
        {/* MDR Column */}
        <div className="bg-card rounded-xl p-6 border-2 border-blue-500/50">
          <h3 className="text-xl font-bold text-blue-600 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            MDR Risk Management
          </h3>
          <ul className="space-y-3">
            {[
              'ISO 14971 risk management process',
              'Hazard identification & analysis',
              'Risk control measures',
              'Residual risk evaluation',
              'Post-market surveillance',
              'Incident reporting (Art. 87)',
              'Periodic safety update reports'
            ].map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-muted-foreground">
                <Check className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* AI Act Delta Column */}
        <div className={cn(
          "rounded-xl p-6 border-2 transition-all duration-500",
          aiActEnabled
            ? "bg-card border-green-500/50"
            : "bg-muted/30 border-dashed border-muted-foreground/30"
        )}>
          <h3 className={cn(
            "text-xl font-bold mb-4 flex items-center gap-2 transition-colors",
            aiActEnabled ? "text-green-600" : "text-muted-foreground"
          )}>
            <Plus className="w-5 h-5" />
            AI Act Additions
          </h3>
          <ul className="space-y-3">
            {[
              'Bias & fairness testing',
              'Demographic performance analysis',
              'Model explainability requirements',
              'Algorithmic drift monitoring',
              'Training data documentation',
              'Fundamental rights impact assessment',
              'Human oversight mechanism design'
            ].map((item, idx) => (
              <motion.li
                key={idx}
                className={cn(
                  "flex items-start gap-2 transition-colors",
                  aiActEnabled ? "text-muted-foreground" : "text-muted-foreground/50"
                )}
                initial={false}
                animate={{
                  opacity: aiActEnabled ? 1 : 0.5,
                  x: aiActEnabled ? 0 : -10
                }}
                transition={{ delay: idx * 0.05 }}
              >
                {aiActEnabled ? (
                  <Check className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
                ) : (
                  <X className="w-4 h-4 text-muted-foreground/50 mt-1 flex-shrink-0" />
                )}
                {item}
              </motion.li>
            ))}
          </ul>

          {!aiActEnabled && (
            <p className="mt-4 text-sm text-muted-foreground italic">
              Toggle "AI Act" to see additional requirements
            </p>
          )}
        </div>
      </div>

      {/* Visual Example */}
      {aiActEnabled && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 p-6 bg-gradient-to-r from-green-500/10 to-blue-500/10 rounded-xl border border-green-500/30"
        >
          <h4 className="font-bold text-lg mb-4">Example: Skin Lesion Classifier</h4>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg p-4">
              <div className="text-red-500 font-semibold mb-2">New Risk: Demographic Bias</div>
              <p className="text-sm text-muted-foreground">
                Model accuracy drops from 94% to 78% on Fitzpatrick skin types V-VI
              </p>
            </div>
            <div className="bg-card rounded-lg p-4">
              <div className="text-amber-500 font-semibold mb-2">New Risk: Hallucination</div>
              <p className="text-sm text-muted-foreground">
                AI cites "irregular border pattern" in image with no such feature
              </p>
            </div>
            <div className="bg-card rounded-lg p-4">
              <div className="text-purple-500 font-semibold mb-2">New Requirement: Explainability</div>
              <p className="text-sm text-muted-foreground">
                Must show which image regions influenced the classification
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// Risks View
function RisksView({
  visibleRisks,
  aiActEnabled,
  aiActOnlyRisks
}: {
  visibleRisks: RiskExample[];
  aiActEnabled: boolean;
  aiActOnlyRisks: RiskExample[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-5xl mx-auto"
    >
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleRisks.map((risk, idx) => {
          const Icon = iconMap[risk.icon] || AlertTriangle;
          const isAiActSpecific = risk.aiActSpecific;

          return (
            <motion.div
              key={risk.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.05 }}
              className={cn(
                "bg-card rounded-xl p-5 border-2 transition-all hover:shadow-lg",
                isAiActSpecific
                  ? "border-green-500/50 ring-2 ring-green-500/20"
                  : "border-border"
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center",
                  risk.severity === 'high' ? "bg-red-500/10" :
                  risk.severity === 'medium' ? "bg-amber-500/10" :
                  "bg-blue-500/10"
                )}>
                  <Icon className={cn(
                    "w-5 h-5",
                    risk.severity === 'high' ? "text-red-500" :
                    risk.severity === 'medium' ? "text-amber-500" :
                    "text-blue-500"
                  )} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-foreground">{risk.title}</h4>
                    {isAiActSpecific && (
                      <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-600 rounded-full">
                        AI Act
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-xs font-medium uppercase",
                    risk.severity === 'high' ? "text-red-500" :
                    risk.severity === 'medium' ? "text-amber-500" :
                    "text-blue-500"
                  )}>
                    {risk.severity} severity
                  </span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-3">
                {risk.description}
              </p>

              {risk.visualExample && (
                <div className="bg-muted/50 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-foreground mb-1">
                    {risk.visualExample.scenario}
                  </div>
                  <div className="text-muted-foreground">
                    Impact: {risk.visualExample.impact}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {!aiActEnabled && aiActOnlyRisks.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-8 p-6 bg-muted/30 rounded-xl border-2 border-dashed border-muted-foreground/30"
        >
          <h4 className="font-bold text-muted-foreground mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            {aiActOnlyRisks.length} Additional AI Act Risk Categories Hidden
          </h4>
          <div className="flex flex-wrap gap-2">
            {aiActOnlyRisks.map((risk) => (
              <span key={risk.id} className="px-3 py-1 bg-muted rounded-full text-sm text-muted-foreground">
                {risk.title}
              </span>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Enable "AI Act" toggle to see these risk categories
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

// Stakeholders View
function StakeholdersView({
  aiActEnabled,
  selectedStakeholder,
  setSelectedStakeholder
}: {
  aiActEnabled: boolean;
  selectedStakeholder: string | null;
  setSelectedStakeholder: (id: string | null) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-5xl mx-auto"
    >
      <div className="grid md:grid-cols-3 gap-6">
        {stakeholderPerspectives.map((stakeholder) => {
          const Icon = iconMap[stakeholder.icon] || Users;
          const isSelected = selectedStakeholder === stakeholder.id;

          return (
            <motion.div
              key={stakeholder.id}
              layout
              className={cn(
                "bg-card rounded-xl border-2 transition-all cursor-pointer",
                isSelected
                  ? "border-primary shadow-lg"
                  : "border-border hover:border-primary/50"
              )}
              onClick={() => setSelectedStakeholder(isSelected ? null : stakeholder.id)}
            >
              <div className="p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    stakeholder.role === 'manufacturer' ? "bg-amber-500/10" :
                    stakeholder.role === 'clinician' ? "bg-blue-500/10" :
                    "bg-pink-500/10"
                  )}>
                    <Icon className={cn(
                      "w-6 h-6",
                      stakeholder.role === 'manufacturer' ? "text-amber-500" :
                      stakeholder.role === 'clinician' ? "text-blue-500" :
                      "text-pink-500"
                    )} />
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">{stakeholder.title}</h4>
                    <p className="text-xs text-muted-foreground">Click to expand</p>
                  </div>
                </div>

                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {/* MDR Responsibilities */}
                      <div className="mb-4">
                        <h5 className="text-sm font-semibold text-blue-600 mb-2">
                          MDR Responsibilities
                        </h5>
                        <ul className="space-y-1">
                          {stakeholder.mdrResponsibilities.map((item, idx) => (
                            <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                              <Check className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* AI Act Additional */}
                      <div className={cn(
                        "mb-4 p-3 rounded-lg transition-all",
                        aiActEnabled ? "bg-green-500/10" : "bg-muted/50"
                      )}>
                        <h5 className={cn(
                          "text-sm font-semibold mb-2 flex items-center gap-1",
                          aiActEnabled ? "text-green-600" : "text-muted-foreground"
                        )}>
                          <Plus className="w-3 h-3" />
                          AI Act Additions
                        </h5>
                        <ul className="space-y-1">
                          {stakeholder.aiActAdditional.map((item, idx) => (
                            <li
                              key={idx}
                              className={cn(
                                "text-xs flex items-start gap-1 transition-opacity",
                                aiActEnabled ? "text-muted-foreground" : "text-muted-foreground/50"
                              )}
                            >
                              {aiActEnabled ? (
                                <Check className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                              ) : (
                                <X className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                              )}
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Benefits */}
                      {aiActEnabled && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                        >
                          <h5 className="text-sm font-semibold text-purple-600 mb-2">
                            Benefits with AI Act
                          </h5>
                          <ul className="space-y-1">
                            {stakeholder.benefits.map((item, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1">
                                <ArrowRight className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />
                                {item}
                              </li>
                            ))}
                          </ul>
                        </motion.div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// Coverage Matrix View
function CoverageView({ aiActEnabled }: { aiActEnabled: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-4 bg-muted/50 p-4 font-semibold text-sm">
          <div>Requirement</div>
          <div className="text-center text-blue-600">MDR Coverage</div>
          <div className={cn(
            "text-center transition-colors",
            aiActEnabled ? "text-green-600" : "text-muted-foreground"
          )}>
            AI Act Coverage
          </div>
          <div className="text-center">Gap / Action</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-border">
          {coverageMappings.map((mapping, idx) => (
            <motion.div
              key={mapping.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="grid grid-cols-4 p-4 items-center text-sm hover:bg-muted/30"
            >
              <div className="font-medium text-foreground">{mapping.requirement}</div>

              <div className="flex justify-center">
                <CoverageBadge coverage={mapping.mdrCoverage} />
              </div>

              <div className={cn(
                "flex justify-center transition-opacity",
                aiActEnabled ? "opacity-100" : "opacity-30"
              )}>
                <CoverageBadge coverage={mapping.aiActCoverage} />
              </div>

              <div className="text-xs text-muted-foreground">
                {aiActEnabled && mapping.gap ? (
                  <span className="text-amber-600">{mapping.gap}</span>
                ) : aiActEnabled && !mapping.gap ? (
                  <span className="text-green-600">Fully aligned</span>
                ) : (
                  <span>-</span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-muted-foreground">Full Coverage</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-muted-foreground">Partial Coverage</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-muted-foreground">No Coverage</span>
        </div>
      </div>
    </motion.div>
  );
}

// Coverage Badge Component
function CoverageBadge({ coverage }: { coverage: 'full' | 'partial' | 'none' }) {
  const colors = {
    full: 'bg-green-500/20 text-green-600 border-green-500/30',
    partial: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
    none: 'bg-red-500/20 text-red-600 border-red-500/30'
  };

  const labels = {
    full: 'Full',
    partial: 'Partial',
    none: 'None'
  };

  return (
    <span className={cn(
      "px-2 py-1 rounded-full text-xs font-medium border",
      colors[coverage]
    )}>
      {labels[coverage]}
    </span>
  );
}

// Visualization Mode Display Component
function VizModeDisplay({ vizMode, aiActEnabled }: { vizMode: VizMode; aiActEnabled: boolean }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={vizMode}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
      >
        {vizMode === 'patient-journey' && <PatientJourneyViz aiActEnabled={aiActEnabled} />}
        {vizMode === 'reactive-bear' && <ReactiveBearViz aiActEnabled={aiActEnabled} />}
        {vizMode === 'layers' && <LayersViz aiActEnabled={aiActEnabled} />}
        {vizMode === 'shields' && <ShieldsViz aiActEnabled={aiActEnabled} />}
        {vizMode === 'thermometer' && <ThermometerViz aiActEnabled={aiActEnabled} />}
      </motion.div>
    </AnimatePresence>
  );
}

// Patient Journey Visualization
function PatientJourneyViz({ aiActEnabled }: { aiActEnabled: boolean }) {
  const checkpoints = [
    { id: 'capture', label: 'Image Capture', mdr: true, aiAct: false },
    { id: 'process', label: 'AI Processing', mdr: true, aiAct: true },
    { id: 'bias', label: 'Bias Check', mdr: false, aiAct: true },
    { id: 'confidence', label: 'Confidence', mdr: false, aiAct: true },
    { id: 'clinical', label: 'Clinical Path', mdr: true, aiAct: false },
    { id: 'result', label: 'Result', mdr: true, aiAct: true },
  ];

  const isActive = (cp: typeof checkpoints[0]) => {
    if (aiActEnabled) return true;
    return cp.mdr;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Map className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Patient Journey</h3>
      </div>
      <div className="relative">
        {/* Connection line */}
        <div className="absolute top-6 left-0 right-0 h-1 bg-slate-200 dark:bg-slate-700" />
        <div className="flex justify-between relative">
          {checkpoints.map((cp, idx) => {
            const active = isActive(cp);
            return (
              <motion.div
                key={cp.id}
                className="flex flex-col items-center"
                animate={{ opacity: active ? 1 : 0.3 }}
              >
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center z-10 border-2 transition-all",
                  active
                    ? "bg-green-500 border-green-400 text-white"
                    : "bg-red-100 border-red-300 text-red-500"
                )}>
                  {active ? <CheckCircle className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                </div>
                <p className={cn(
                  "text-xs mt-2 text-center font-medium",
                  active ? "text-foreground" : "text-muted-foreground line-through"
                )}>
                  {cp.label}
                </p>
                <div className="flex gap-1 mt-1">
                  {cp.mdr && <span className="text-[10px] px-1 py-0.5 bg-blue-100 text-blue-600 rounded">MDR</span>}
                  {cp.aiAct && <span className={cn("text-[10px] px-1 py-0.5 rounded", aiActEnabled ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400")}>AI</span>}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground mt-6">
        {aiActEnabled
          ? "All checkpoints active - full patient protection"
          : `${checkpoints.filter(cp => !isActive(cp)).length} checkpoints skipped without AI Act`}
      </p>
    </div>
  );
}

// Reactive Bear Visualization
function ReactiveBearViz({ aiActEnabled }: { aiActEnabled: boolean }) {
  const messages = aiActEnabled
    ? [
        "All systems go! I've tested for bias AND validated clinically.",
        "If my confidence is low, you'll know - and there's a pathway to a real doctor.",
        "I monitor for drift continuously. Problems get caught in weeks, not years."
      ]
    : [
        "I'm clinically validated... but did anyone check if I work on all skin tones?",
        "No drift monitoring. I could get worse and no one would know for a year.",
        "I can't explain why I made this prediction. You just have to trust me."
      ];

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-start gap-6">
        {/* Bear */}
        <motion.div
          className={cn(
            "w-24 h-24 rounded-2xl flex items-center justify-center text-5xl flex-shrink-0",
            aiActEnabled ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"
          )}
          animate={{ scale: aiActEnabled ? 1 : [1, 1.02, 1] }}
          transition={{ duration: 2, repeat: aiActEnabled ? 0 : Infinity }}
        >
          {aiActEnabled ? '🐻' : '😟'}
        </motion.div>

        {/* Speech bubble */}
        <div className={cn(
          "flex-1 p-4 rounded-xl relative",
          aiActEnabled
            ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800"
            : "bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-800"
        )}>
          {/* Pointer */}
          <div className={cn(
            "absolute left-0 top-6 w-3 h-3 -translate-x-1.5 rotate-45",
            aiActEnabled ? "bg-green-50 dark:bg-green-900/20 border-l-2 border-b-2 border-green-200 dark:border-green-800" : "bg-amber-50 dark:bg-amber-900/20 border-l-2 border-b-2 border-amber-200 dark:border-amber-800"
          )} />

          <ul className="space-y-2">
            {messages.map((msg, idx) => (
              <motion.li
                key={idx}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "text-sm",
                  aiActEnabled ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300"
                )}
              >
                • {msg}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// Layers Visualization
function LayersViz({ aiActEnabled }: { aiActEnabled: boolean }) {
  const layers = [
    { label: 'Clinical Validation', source: 'mdr' },
    { label: 'Post-Market Surveillance', source: 'mdr' },
    { label: 'Incident Reporting', source: 'mdr' },
    { label: 'Bias Testing', source: 'aiAct' },
    { label: 'Drift Monitoring', source: 'aiAct' },
    { label: 'Explainability', source: 'aiAct' },
  ];

  const activeLayers = aiActEnabled ? layers : layers.filter(l => l.source === 'mdr');

  return (
    <div className="max-w-md mx-auto">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Layers className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Protection Layers</h3>
      </div>
      <div className="relative h-64 flex items-center justify-center">
        {/* Concentric circles */}
        {layers.map((layer, idx) => {
          const size = 100 - (idx * 12);
          const isActive = aiActEnabled || layer.source === 'mdr';
          return (
            <motion.div
              key={layer.label}
              className={cn(
                "absolute rounded-full border-4 flex items-end justify-center pb-2",
                isActive
                  ? layer.source === 'mdr'
                    ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/20"
                    : "border-green-400 bg-green-50/50 dark:bg-green-900/20"
                  : "border-dashed border-slate-300 dark:border-slate-700"
              )}
              style={{ width: `${size}%`, height: `${size}%` }}
              animate={{
                opacity: isActive ? 1 : 0.3,
                scale: isActive ? 1 : 0.95
              }}
            >
              {idx === layers.length - 1 && (
                <span className="text-xs font-medium text-slate-500">{layer.label}</span>
              )}
            </motion.div>
          );
        })}
        {/* Patient at center */}
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center z-10",
          aiActEnabled ? "bg-green-500" : "bg-amber-500"
        )}>
          <User className="w-6 h-6 text-white" />
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {activeLayers.length} / {layers.length} protection layers active
      </p>
    </div>
  );
}

// Shields Visualization
function ShieldsViz({ aiActEnabled }: { aiActEnabled: boolean }) {
  const mdrShields = ['CE', 'CLIN', 'PMS', 'INC', 'IFU'];
  const aiActShields = ['BIAS', 'XAI', 'DRFT', 'TRNS', 'HUM'];

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Shield Wall</h3>
      </div>
      <div className="flex justify-center gap-8">
        {/* MDR Tower */}
        <div className="text-center">
          <p className="text-sm font-bold text-blue-600 mb-2">MDR</p>
          <div className="flex flex-col-reverse gap-1">
            {mdrShields.map((shield, idx) => (
              <motion.div
                key={shield}
                className="w-16 h-8 bg-gradient-to-b from-blue-400 to-blue-600 rounded flex items-center justify-center text-white text-xs font-bold"
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
              >
                {shield}
              </motion.div>
            ))}
          </div>
        </div>

        {/* AI Act Tower */}
        <div className="text-center">
          <p className={cn("text-sm font-bold mb-2", aiActEnabled ? "text-green-600" : "text-slate-400")}>AI Act</p>
          <div className="flex flex-col-reverse gap-1">
            {aiActShields.map((shield, idx) => (
              <motion.div
                key={shield}
                className={cn(
                  "w-16 h-8 rounded flex items-center justify-center text-xs font-bold",
                  aiActEnabled
                    ? "bg-gradient-to-b from-green-400 to-green-600 text-white"
                    : "border-2 border-dashed border-slate-300 text-slate-400"
                )}
                animate={{
                  opacity: aiActEnabled ? 1 : 0.3,
                  y: aiActEnabled ? 0 : 10
                }}
                transition={{ delay: idx * 0.05 }}
              >
                {shield}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-sm text-muted-foreground mt-4">
        {aiActEnabled ? '10/10 shields active' : '5/10 shields active'}
      </p>
    </div>
  );
}

// Thermometer Visualization
function ThermometerViz({ aiActEnabled }: { aiActEnabled: boolean }) {
  const riskLevel = aiActEnabled ? 15 : 55;

  return (
    <div className="max-w-xs mx-auto">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Thermometer className="w-5 h-5 text-primary" />
        <h3 className="font-bold">Risk Level</h3>
      </div>
      <div className="flex items-end justify-center gap-4">
        {/* Thermometer */}
        <div className="relative w-12 h-48 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <motion.div
            className={cn(
              "absolute bottom-0 left-0 right-0 rounded-b-full",
              riskLevel > 50 ? "bg-red-500" : riskLevel > 30 ? "bg-amber-500" : "bg-green-500"
            )}
            animate={{ height: `${riskLevel}%` }}
            transition={{ type: 'spring', stiffness: 50, damping: 15 }}
          />
          {/* Scale marks */}
          {[25, 50, 75].map(mark => (
            <div key={mark} className="absolute left-0 right-0 border-t border-slate-300 dark:border-slate-600" style={{ bottom: `${mark}%` }} />
          ))}
        </div>

        {/* Labels */}
        <div className="h-48 flex flex-col justify-between text-xs text-muted-foreground py-2">
          <span>HIGH RISK</span>
          <span>MODERATE</span>
          <span>LOW RISK</span>
        </div>
      </div>
      <div className={cn(
        "text-center mt-4 px-4 py-2 rounded-full font-bold",
        riskLevel > 50 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" :
        riskLevel > 30 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
      )}>
        {aiActEnabled ? 'LOW RISK' : 'ELEVATED RISK'}
      </div>
    </div>
  );
}
