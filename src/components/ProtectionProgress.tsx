import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Brain, Check, X, AlertTriangle, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { allProtections, type RegState } from './RegulationMenu';

type Step = 'hero' | 'mdr' | 'name' | 'photo' | 'results' | 'hood';

interface ProtectionProgressProps {
  currentStep: Step;
  regState: RegState;
  appliedProtections: string[];
  onProtectionClick?: (id: string) => void;
}

// Map which protections become relevant at each step (progressive unlock)
const stepProtections: Record<Step, string[]> = {
  hero: [],
  mdr: ['ce-marking', 'clinical-eval', 'pms'],  // MDR basics unlock
  name: ['ifu', 'transparency'],  // Documentation & transparency
  photo: ['bias-testing', 'explainability'],  // AI-specific for image analysis
  results: ['incident', 'drift-monitor'],  // Monitoring for results
  hood: ['human-oversight'],  // Final oversight
};

// Cumulative protections up to each step
const getCumulativeProtections = (step: Step): string[] => {
  const order: Step[] = ['hero', 'mdr', 'name', 'photo', 'results', 'hood'];
  const stepIndex = order.indexOf(step);
  const cumulative: string[] = [];

  for (let i = 0; i <= stepIndex; i++) {
    cumulative.push(...stepProtections[order[i]]);
  }

  return cumulative;
};

export function ProtectionProgress({
  currentStep,
  regState,
  appliedProtections,
  onProtectionClick
}: ProtectionProgressProps) {
  const revealedProtections = getCumulativeProtections(currentStep);
  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';

  // Don't show on hero
  if (currentStep === 'hero') return null;

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 max-w-xs"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm text-slate-700 dark:text-slate-300">Protection Status</h3>
          <div className="flex items-center gap-1">
            <span className={cn(
              "w-2 h-2 rounded-full",
              regState === 'both' ? "bg-green-500" :
              regState === 'neither' ? "bg-red-500" : "bg-amber-500"
            )} />
            <span className="text-xs text-slate-500">
              {appliedProtections.length}/{allProtections.length}
            </span>
          </div>
        </div>

        {/* Jigsaw Grid */}
        <div className="grid grid-cols-5 gap-1.5">
          {allProtections.map((protection, idx) => {
            const isRevealed = revealedProtections.includes(protection.id);
            const isApplied = appliedProtections.includes(protection.id);
            const isAvailable = protection.source === 'mdr' ? mdrEnabled : aiActEnabled;
            const isNewThisStep = stepProtections[currentStep]?.includes(protection.id);

            return (
              <div key={protection.id} className="group relative">
                <motion.button
                  onClick={() => isAvailable && isRevealed && onProtectionClick?.(protection.id)}
                  disabled={!isAvailable || !isRevealed}
                  className={cn(
                    "relative w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold transition-all",
                    !isRevealed && "bg-slate-100 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600",
                    isRevealed && isAvailable && isApplied && protection.source === 'mdr' && "bg-blue-500 text-white shadow-md hover:bg-blue-600",
                    isRevealed && isAvailable && isApplied && protection.source === 'aiAct' && "bg-green-500 text-white shadow-md hover:bg-green-600",
                    isRevealed && isAvailable && !isApplied && "bg-red-100 dark:bg-red-900/30 text-red-600 border-2 border-red-300 hover:bg-red-200",
                    isRevealed && !isAvailable && "bg-slate-200 dark:bg-slate-700 text-slate-400"
                  )}
                  initial={isNewThisStep ? { scale: 0, rotate: -180 } : false}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                >
                  {!isRevealed ? (
                    <span className="text-slate-400">?</span>
                  ) : isAvailable && isApplied ? (
                    protection.short
                  ) : isAvailable && !isApplied ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <span className="text-slate-400 text-[10px]">{protection.short}</span>
                  )}

                  {/* New indicator */}
                  {isNewThisStep && isRevealed && (
                    <motion.div
                      className="absolute -top-1 -right-1 w-3 h-3 bg-amber-400 rounded-full"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.5, repeat: 2 }}
                    />
                  )}
                </motion.button>

                {/* Tooltip on hover */}
                <div className={cn(
                  "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg",
                  isRevealed ? "bg-slate-900 text-white" : "bg-slate-600 text-slate-200"
                )}>
                  {isRevealed ? (
                    <>
                      <div className="font-bold flex items-center gap-1">
                        {protection.label}
                        <span className={cn(
                          "text-[10px] px-1 rounded",
                          protection.source === 'mdr' ? "bg-blue-500/30" : "bg-green-500/30"
                        )}>
                          {protection.source === 'mdr' ? 'MDR' : 'AI Act'}
                        </span>
                      </div>
                      <div className="text-slate-300">{protection.description}</div>
                      {isAvailable && (
                        <div className="text-[10px] mt-1 text-slate-400">
                          Click to {isApplied ? 'disable' : 'enable'}
                        </div>
                      )}
                    </>
                  ) : (
                    <div>Unlocks in a later step</div>
                  )}
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex justify-center gap-3 mt-3 text-[10px] text-slate-500">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-blue-500" />
            <span>MDR</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-green-500" />
            <span>AI Act</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded bg-red-200 border border-red-300" />
            <span>Off</span>
          </div>
        </div>

        {/* Warning Message */}
        <AnimatePresence>
          {(regState === 'neither' || appliedProtections.length < revealedProtections.length) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 p-2 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800"
            >
              <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {regState === 'neither'
                  ? "No regulations active!"
                  : "Some protections disabled"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// Floating shield visualization that follows scroll
export function FloatingShieldWall({
  regState,
  appliedProtections
}: {
  regState: RegState;
  appliedProtections: string[];
}) {
  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';

  const mdrProtections = allProtections.filter(p => p.source === 'mdr');
  const aiActProtections = allProtections.filter(p => p.source === 'aiAct');

  const appliedMdr = mdrProtections.filter(p => appliedProtections.includes(p.id));
  const appliedAiAct = aiActProtections.filter(p => appliedProtections.includes(p.id));

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-30 hidden xl:block">
      <div className="flex flex-col items-center gap-2">
        {/* Patient icon at center */}
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center shadow-lg",
          appliedProtections.length === allProtections.length
            ? "bg-green-500"
            : appliedProtections.length >= allProtections.length / 2
            ? "bg-amber-500"
            : "bg-red-500"
        )}>
          <User className="w-6 h-6 text-white" />
        </div>

        {/* Shield stacks */}
        <div className="flex gap-2">
          {/* MDR Stack */}
          <div className="flex flex-col-reverse items-center">
            {mdrProtections.map((protection, idx) => {
              const isApplied = appliedProtections.includes(protection.id);
              return (
                <motion.div
                  key={protection.id}
                  className={cn(
                    "w-8 h-6 rounded flex items-center justify-center text-[8px] font-bold",
                    mdrEnabled && isApplied
                      ? "bg-blue-500 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                  )}
                  animate={{
                    opacity: mdrEnabled && isApplied ? 1 : 0.3,
                    scale: mdrEnabled && isApplied ? 1 : 0.9,
                  }}
                >
                  {protection.short}
                </motion.div>
              );
            })}
            <span className={cn(
              "text-[10px] font-bold mt-1",
              mdrEnabled ? "text-blue-600" : "text-slate-400"
            )}>
              MDR
            </span>
          </div>

          {/* AI Act Stack */}
          <div className="flex flex-col-reverse items-center">
            {aiActProtections.map((protection, idx) => {
              const isApplied = appliedProtections.includes(protection.id);
              return (
                <motion.div
                  key={protection.id}
                  className={cn(
                    "w-8 h-6 rounded flex items-center justify-center text-[8px] font-bold",
                    aiActEnabled && isApplied
                      ? "bg-green-500 text-white"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-400"
                  )}
                  animate={{
                    opacity: aiActEnabled && isApplied ? 1 : 0.3,
                    scale: aiActEnabled && isApplied ? 1 : 0.9,
                  }}
                >
                  {protection.short}
                </motion.div>
              );
            })}
            <span className={cn(
              "text-[10px] font-bold mt-1",
              aiActEnabled ? "text-green-600" : "text-slate-400"
            )}>
              AI Act
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
