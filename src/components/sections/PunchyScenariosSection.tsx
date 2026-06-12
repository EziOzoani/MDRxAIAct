/**
 * PUNCHY SCENARIOS SECTION
 *
 * Shows real-world consequences of different regulatory states.
 * High visual impact, emotional storytelling, concrete numbers.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Brain, AlertTriangle, CheckCircle, XCircle, Clock,
  Skull, TrendingDown, UserX, ArrowRight, Heart, Activity,
  Phone, FileWarning, Users, Siren, Calendar, Ban
} from 'lucide-react';
import { cn } from '@/lib/utils';

type RegMode = 'both' | 'mdrOnly' | 'aiActOnly' | 'neither';

export function PunchyScenariosSection() {
  const [regMode, setRegMode] = useState<RegMode>('both');

  return (
    <section className="min-h-screen bg-slate-950 py-16 text-white">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black mb-4">
            What Happens When Things Go Wrong?
          </h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Toggle the regulations below. Watch what happens to patients.
          </p>
        </div>

        {/* 2x2 Regulation Toggle */}
        <div className="flex justify-center mb-12">
          <div className="inline-grid grid-cols-2 gap-1 p-1 bg-slate-800 rounded-2xl">
            <ToggleButton
              active={regMode === 'both'}
              onClick={() => setRegMode('both')}
              icon={<><Shield className="w-4 h-4" /><Brain className="w-4 h-4" /></>}
              label="MDR + AI Act"
              color="green"
            />
            <ToggleButton
              active={regMode === 'mdrOnly'}
              onClick={() => setRegMode('mdrOnly')}
              icon={<Shield className="w-4 h-4" />}
              label="MDR Only"
              color="blue"
            />
            <ToggleButton
              active={regMode === 'aiActOnly'}
              onClick={() => setRegMode('aiActOnly')}
              icon={<Brain className="w-4 h-4" />}
              label="AI Act Only"
              color="purple"
            />
            <ToggleButton
              active={regMode === 'neither'}
              onClick={() => setRegMode('neither')}
              icon={<Ban className="w-4 h-4" />}
              label="No Regulation"
              color="red"
            />
          </div>
        </div>

        {/* Status Banner */}
        <AnimatePresence mode="wait">
          <motion.div
            key={regMode}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={cn(
              "max-w-4xl mx-auto mb-12 p-6 rounded-2xl text-center",
              regMode === 'both' && "bg-green-500/20 border-2 border-green-500",
              regMode === 'mdrOnly' && "bg-blue-500/20 border-2 border-blue-500",
              regMode === 'aiActOnly' && "bg-purple-500/20 border-2 border-purple-500",
              regMode === 'neither' && "bg-red-500/20 border-2 border-red-500"
            )}
          >
            {regMode === 'both' && (
              <>
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-green-400">Full Protection Active</h3>
                <p className="text-green-300/80">Clinical validation + AI-specific monitoring = comprehensive safety</p>
              </>
            )}
            {regMode === 'mdrOnly' && (
              <>
                <AlertTriangle className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-blue-400">Partial Protection</h3>
                <p className="text-blue-300/80">Clinical framework exists, but AI-specific risks unmonitored</p>
              </>
            )}
            {regMode === 'aiActOnly' && (
              <>
                <AlertTriangle className="w-12 h-12 text-purple-400 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-purple-400">Partial Protection</h3>
                <p className="text-purple-300/80">AI monitoring exists, but no medical device framework</p>
              </>
            )}
            {regMode === 'neither' && (
              <>
                <Skull className="w-12 h-12 text-red-400 mx-auto mb-3" />
                <h3 className="text-2xl font-bold text-red-400">NO PROTECTION</h3>
                <p className="text-red-300/80">Deployed and forgotten. No one is watching.</p>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Scenarios */}
        <div className="max-w-5xl mx-auto space-y-8">
          <ScenarioCard
            regMode={regMode}
            scenario={{
              id: 'melanoma',
              title: 'Missed Melanoma',
              icon: Skull,
              patient: 'Maria, 34',
              situation: 'Early-stage melanoma. AI says "BENIGN" with 67% confidence.',
              outcomes: {
                both: {
                  status: 'prevented',
                  headline: 'CAUGHT',
                  detail: 'Low confidence triggers mandatory "See a dermatologist" warning.',
                  timeline: [
                    { time: 'Day 0', event: 'AI flags low confidence', icon: AlertTriangle },
                    { time: 'Day 0', event: 'Clinical escalation pathway activated', icon: Phone },
                    { time: 'Day 3', event: 'Maria sees dermatologist', icon: Activity },
                    { time: 'Day 7', event: 'Early melanoma diagnosed, excellent prognosis', icon: Heart },
                  ],
                  impact: 'Treatment started 8 months earlier than without regulation'
                },
                mdrOnly: {
                  status: 'partial',
                  headline: 'DELAYED',
                  detail: 'Clinical pathway exists, but no AI confidence explanation.',
                  timeline: [
                    { time: 'Day 0', event: 'AI says "BENIGN" - no confidence shown', icon: XCircle },
                    { time: 'Months 1-8', event: 'Maria trusts the result, lesion grows', icon: Clock },
                    { time: 'Month 8', event: 'Symptoms prompt doctor visit', icon: AlertTriangle },
                    { time: 'Month 9', event: 'Stage II melanoma diagnosed', icon: Skull },
                  ],
                  impact: '8-month delay. Now requires surgery + immunotherapy.'
                },
                aiActOnly: {
                  status: 'partial',
                  headline: 'MISSED HANDOFF',
                  detail: 'AI explains low confidence, but no clinical escalation exists.',
                  timeline: [
                    { time: 'Day 0', event: 'AI shows 67% confidence - Maria confused', icon: AlertTriangle },
                    { time: 'Day 0', event: 'No "see a doctor" prompt integrated', icon: XCircle },
                    { time: 'Months 1-6', event: 'Maria unsure what to do, waits', icon: Clock },
                    { time: 'Month 6', event: 'Finally sees GP, referred to specialist', icon: Activity },
                  ],
                  impact: '6-month delay. Treatable but worse prognosis.'
                },
                neither: {
                  status: 'happened',
                  headline: 'MISSED',
                  detail: 'AI says "BENIGN". No warnings. No escalation. No monitoring.',
                  timeline: [
                    { time: 'Day 0', event: 'AI says "BENIGN" - Maria goes home', icon: XCircle },
                    { time: 'Months 1-11', event: 'Cancer progresses undetected', icon: Clock },
                    { time: 'Month 11', event: 'Symptoms finally appear', icon: Skull },
                    { time: 'Month 12', event: 'Stage III melanoma. Spread to lymph nodes.', icon: Siren },
                  ],
                  impact: '11-month delay. Now requires aggressive treatment. 5-year survival: 68%'
                }
              }
            }}
          />

          <ScenarioCard
            regMode={regMode}
            scenario={{
              id: 'drift',
              title: 'Model Drift',
              icon: TrendingDown,
              patient: '~2,000 patients',
              situation: 'New smartphone cameras produce different images. Model accuracy drops 15%.',
              outcomes: {
                both: {
                  status: 'prevented',
                  headline: 'CAUGHT EARLY',
                  detail: 'AI Act drift monitoring + MDR incident reporting = rapid response.',
                  timeline: [
                    { time: 'Week 2', event: 'Drift detection system triggers alert', icon: AlertTriangle },
                    { time: 'Week 2', event: 'Model temporarily switched to conservative mode', icon: Shield },
                    { time: 'Week 3', event: 'All 50 affected patients contacted', icon: Phone },
                    { time: 'Week 4', event: 'Retrained model deployed', icon: CheckCircle },
                  ],
                  impact: '50 patients affected. All contacted. No missed diagnoses.'
                },
                mdrOnly: {
                  status: 'partial',
                  headline: 'FOUND TOO LATE',
                  detail: 'Annual review catches it at month 11. No continuous AI monitoring.',
                  timeline: [
                    { time: 'Months 1-11', event: 'Drift undetected. Accuracy degrading.', icon: Clock },
                    { time: 'Month 11', event: 'Annual post-market review finds problem', icon: FileWarning },
                    { time: 'Month 12', event: 'Retrospective patient review begins', icon: Users },
                    { time: 'Month 14', event: 'Finally resolved', icon: CheckCircle },
                  ],
                  impact: '2,000+ patients received degraded results. Unknown missed diagnoses.'
                },
                aiActOnly: {
                  status: 'partial',
                  headline: 'DETECTED BUT NO ACTION',
                  detail: 'Drift detected quickly, but no medical incident reporting system.',
                  timeline: [
                    { time: 'Week 2', event: 'AI monitoring detects drift', icon: AlertTriangle },
                    { time: 'Week 2', event: 'No regulatory pathway to contact patients', icon: XCircle },
                    { time: 'Week 3', event: 'Model fixed, but patients not notified', icon: Shield },
                    { time: 'Unknown', event: 'Some patients had wrong results - never told', icon: Users },
                  ],
                  impact: 'Model fixed quickly, but 50 patients never informed of potentially wrong results.'
                },
                neither: {
                  status: 'happened',
                  headline: 'NEVER FOUND',
                  detail: 'No monitoring. No reviews. No one watching.',
                  timeline: [
                    { time: 'Month 1', event: 'Drift begins', icon: TrendingDown },
                    { time: 'Months 2-18', event: 'Model serves wrong results', icon: XCircle },
                    { time: 'Month 18+', event: 'Problem never discovered', icon: Skull },
                    { time: 'Forever', event: 'Unknown number of misdiagnoses', icon: Users },
                  ],
                  impact: 'Unknown number of patients harmed. No one will ever know.'
                }
              }
            }}
          />

          <ScenarioCard
            regMode={regMode}
            scenario={{
              id: 'bias',
              title: 'Skin Tone Bias',
              icon: UserX,
              patient: 'All patients with darker skin',
              situation: 'Model trained mostly on lighter skin. 23% accuracy gap on Fitzpatrick V-VI.',
              outcomes: {
                both: {
                  status: 'prevented',
                  headline: 'NEVER LAUNCHED',
                  detail: 'AI Act fairness testing catches bias before market release.',
                  timeline: [
                    { time: 'Pre-launch', event: 'Mandatory demographic testing performed', icon: Users },
                    { time: 'Pre-launch', event: '23% gap discovered in testing', icon: AlertTriangle },
                    { time: 'Pre-launch', event: 'Launch blocked until fixed', icon: Ban },
                    { time: 'Launch', event: 'Retrained model with diverse data achieves parity', icon: CheckCircle },
                  ],
                  impact: 'Zero patients harmed. Bias fixed before anyone saw the product.'
                },
                mdrOnly: {
                  status: 'partial',
                  headline: 'NEVER TESTED',
                  detail: 'Clinical validation used limited demographic data. Bias not discovered.',
                  timeline: [
                    { time: 'Pre-launch', event: 'Clinical trial: 85% light-skinned participants', icon: Users },
                    { time: 'Launch', event: 'Product approved and deployed', icon: CheckCircle },
                    { time: 'Years 1-?', event: 'Patients with dark skin get worse care', icon: UserX },
                    { time: 'Never', event: 'Bias never formally discovered', icon: XCircle },
                  ],
                  impact: 'Systematic health disparity. Invisible and ongoing.'
                },
                aiActOnly: {
                  status: 'partial',
                  headline: 'CAUGHT POST-LAUNCH',
                  detail: 'AI Act monitoring detects emerging bias pattern, but damage done.',
                  timeline: [
                    { time: 'Month 3', event: 'Fairness monitoring flags performance gap', icon: AlertTriangle },
                    { time: 'Month 4', event: 'Investigation confirms bias', icon: FileWarning },
                    { time: 'Month 5', event: 'Model pulled for retraining', icon: Ban },
                    { time: 'Month 6', event: 'Retrospective review of all affected patients', icon: Users },
                  ],
                  impact: '3 months of biased results. Hundreds of patients need re-screening.'
                },
                neither: {
                  status: 'happened',
                  headline: 'INVISIBLE HARM',
                  detail: 'No testing. No monitoring. Systematic discrimination.',
                  timeline: [
                    { time: 'Launch', event: 'Product deployed', icon: Activity },
                    { time: 'Years 1-∞', event: 'Patients with dark skin systematically underserved', icon: UserX },
                    { time: 'Never', event: 'Bias never detected or addressed', icon: XCircle },
                    { time: 'Forever', event: 'Health disparities worsen', icon: Skull },
                  ],
                  impact: 'Perpetual discrimination baked into the healthcare system.'
                }
              }
            }}
          />
        </div>

        {/* Bottom Summary */}
        <motion.div
          className="max-w-4xl mx-auto mt-16 text-center"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <p className="text-slate-400 text-lg">
            These aren't hypotheticals. These are the scenarios regulation is designed to prevent.
          </p>
          {regMode === 'both' && (
            <p className="text-green-400 text-xl font-bold mt-4">
              With MDR + AI Act: Problems are caught. Patients are protected.
            </p>
          )}
          {regMode !== 'both' && regMode !== 'neither' && (
            <p className="text-amber-400 text-xl font-bold mt-4">
              Partial regulation = Partial protection. Gaps let harm through.
            </p>
          )}
          {regMode === 'neither' && (
            <p className="text-red-400 text-xl font-bold mt-4">
              Without regulation: We don't even know how many people are harmed.
            </p>
          )}
        </motion.div>
      </div>
    </section>
  );
}

// Toggle Button Component
function ToggleButton({
  active,
  onClick,
  icon,
  label,
  color
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: 'green' | 'blue' | 'purple' | 'red';
}) {
  const colors = {
    green: 'bg-green-500 text-white',
    blue: 'bg-blue-500 text-white',
    purple: 'bg-purple-500 text-white',
    red: 'bg-red-500 text-white'
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all",
        active ? colors[color] : "text-slate-400 hover:text-white hover:bg-slate-700"
      )}
    >
      <div className="flex items-center gap-1">{icon}</div>
      <span className="text-sm">{label}</span>
    </button>
  );
}

// Scenario Card Component
interface TimelineItem {
  time: string;
  event: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface Outcome {
  status: 'prevented' | 'partial' | 'happened';
  headline: string;
  detail: string;
  timeline: TimelineItem[];
  impact: string;
}

interface Scenario {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  patient: string;
  situation: string;
  outcomes: {
    both: Outcome;
    mdrOnly: Outcome;
    aiActOnly: Outcome;
    neither: Outcome;
  };
}

function ScenarioCard({
  regMode,
  scenario
}: {
  regMode: RegMode;
  scenario: Scenario;
}) {
  const Icon = scenario.icon;
  const outcome = scenario.outcomes[regMode];

  const statusColors = {
    prevented: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/50',
      text: 'text-green-400',
      badge: 'bg-green-500',
      icon: CheckCircle
    },
    partial: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/50',
      text: 'text-amber-400',
      badge: 'bg-amber-500',
      icon: AlertTriangle
    },
    happened: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/50',
      text: 'text-red-400',
      badge: 'bg-red-500',
      icon: XCircle
    }
  };

  const colors = statusColors[outcome.status];
  const StatusIcon = colors.icon;

  return (
    <motion.div
      layout
      className={cn(
        "rounded-2xl border-2 overflow-hidden",
        colors.bg,
        colors.border
      )}
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center",
              colors.bg
            )}>
              <Icon className={cn("w-7 h-7", colors.text)} />
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white">{scenario.title}</h3>
              <p className="text-slate-400">Affected: {scenario.patient}</p>
            </div>
          </div>
          <div className={cn(
            "px-4 py-2 rounded-full font-black text-white flex items-center gap-2",
            colors.badge
          )}>
            <StatusIcon className="w-5 h-5" />
            {outcome.headline}
          </div>
        </div>
        <p className="mt-4 text-slate-300 text-lg">{scenario.situation}</p>
      </div>

      {/* Outcome */}
      <AnimatePresence mode="wait">
        <motion.div
          key={regMode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="p-6"
        >
          <p className={cn("text-lg font-medium mb-6", colors.text)}>
            {outcome.detail}
          </p>

          {/* Timeline */}
          <div className="relative">
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-700" />
            <div className="space-y-4">
              {outcome.timeline.map((item, idx) => {
                const ItemIcon = item.icon;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="flex items-center gap-4 relative"
                  >
                    <div className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center z-10",
                      colors.bg,
                      "border-2",
                      colors.border
                    )}>
                      <ItemIcon className={cn("w-5 h-5", colors.text)} />
                    </div>
                    <div className="flex-1">
                      <span className="text-slate-500 text-sm font-mono">{item.time}</span>
                      <p className="text-white">{item.event}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Impact */}
          <div className={cn(
            "mt-6 p-4 rounded-xl",
            colors.bg
          )}>
            <div className="flex items-center gap-2 mb-1">
              <span className={cn("font-bold uppercase text-sm", colors.text)}>Impact</span>
            </div>
            <p className={cn("text-lg font-medium", colors.text)}>
              {outcome.impact}
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
