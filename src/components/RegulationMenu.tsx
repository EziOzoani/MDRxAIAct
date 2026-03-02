import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Shield, Brain, ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RegState = 'both' | 'mdrOnly' | 'aiActOnly' | 'neither';

interface RegulationMenuProps {
  regState: RegState;
  onRegStateChange: (state: RegState) => void;
  appliedProtections: string[];
  onProtectionToggle: (protectionId: string) => void;
}

// All available protections with their source regulation
export const allProtections = [
  // MDR protections
  { id: 'ce-marking', label: 'CE Marking', short: 'CE', source: 'mdr' as const, description: 'Conformity assessment' },
  { id: 'clinical-eval', label: 'Clinical Evaluation', short: 'CLIN', source: 'mdr' as const, description: 'Clinical evidence requirements' },
  { id: 'pms', label: 'Post-Market Surveillance', short: 'PMS', source: 'mdr' as const, description: 'Ongoing safety monitoring' },
  { id: 'incident', label: 'Incident Reporting', short: 'INC', source: 'mdr' as const, description: 'Adverse event reporting' },
  { id: 'ifu', label: 'Instructions for Use', short: 'IFU', source: 'mdr' as const, description: 'User documentation' },
  // AI Act protections
  { id: 'bias-testing', label: 'Bias Testing', short: 'BIAS', source: 'aiAct' as const, description: 'Demographic fairness checks' },
  { id: 'explainability', label: 'Explainability', short: 'XAI', source: 'aiAct' as const, description: 'Model decision transparency' },
  { id: 'drift-monitor', label: 'Drift Monitoring', short: 'DRFT', source: 'aiAct' as const, description: 'Performance degradation detection' },
  { id: 'transparency', label: 'Transparency', short: 'TRNS', source: 'aiAct' as const, description: 'AI system disclosure' },
  { id: 'human-oversight', label: 'Human Oversight', short: 'HUM', source: 'aiAct' as const, description: 'Human-in-the-loop requirements' },
];

export function RegulationMenu({
  regState,
  onRegStateChange,
  appliedProtections,
  onProtectionToggle
}: RegulationMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';

  const handleMdrToggle = () => {
    if (mdrEnabled && aiActEnabled) {
      onRegStateChange('aiActOnly');
    } else if (mdrEnabled && !aiActEnabled) {
      onRegStateChange('neither');
    } else if (!mdrEnabled && aiActEnabled) {
      onRegStateChange('both');
    } else {
      onRegStateChange('mdrOnly');
    }
  };

  const handleAiActToggle = () => {
    if (aiActEnabled && mdrEnabled) {
      onRegStateChange('mdrOnly');
    } else if (aiActEnabled && !mdrEnabled) {
      onRegStateChange('neither');
    } else if (!aiActEnabled && mdrEnabled) {
      onRegStateChange('both');
    } else {
      onRegStateChange('aiActOnly');
    }
  };

  const mdrProtections = allProtections.filter(p => p.source === 'mdr');
  const aiActProtections = allProtections.filter(p => p.source === 'aiAct');

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed top-4 right-4 z-50 p-3 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        aria-label="Open regulation menu"
      >
        <Menu className="w-6 h-6 text-slate-700 dark:text-slate-300" />
      </button>

      {/* No overlay - page stays fully visible when menu is open */}

      {/* Slide-out Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-80 bg-white dark:bg-slate-900 shadow-2xl z-50 overflow-y-auto"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">Regulation Controls</h2>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Toggles */}
            <div className="p-4 space-y-4">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Regulations</h3>

              {/* MDR Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    mdrEnabled ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                  )}>
                    <Shield className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">MDR</p>
                    <p className="text-xs text-slate-500">Medical Device Regulation</p>
                  </div>
                </div>
                <button
                  onClick={handleMdrToggle}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors",
                    mdrEnabled ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"
                  )}
                >
                  <motion.div
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
                    animate={{ left: mdrEnabled ? 'calc(100% - 22px)' : '2px' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {/* AI Act Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    aiActEnabled ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
                  )}>
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 dark:text-slate-200">AI Act</p>
                    <p className="text-xs text-slate-500">EU Artificial Intelligence Act</p>
                  </div>
                </div>
                <button
                  onClick={handleAiActToggle}
                  className={cn(
                    "relative w-12 h-6 rounded-full transition-colors",
                    aiActEnabled ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
                  )}
                >
                  <motion.div
                    className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
                    animate={{ left: aiActEnabled ? 'calc(100% - 22px)' : '2px' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>
            </div>

            {/* Protection Shields */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                Protection Shields
                <span className="ml-2 text-xs font-normal normal-case">(click to toggle)</span>
              </h3>

              {/* MDR Protections */}
              <div className="mb-4">
                <p className={cn(
                  "text-sm font-medium mb-2 flex items-center gap-1",
                  mdrEnabled ? "text-blue-600" : "text-slate-400"
                )}>
                  <Shield className="w-4 h-4" />
                  MDR Protections
                </p>
                <div className="flex flex-wrap gap-2">
                  {mdrProtections.map((protection) => {
                    const isApplied = appliedProtections.includes(protection.id);
                    const isAvailable = mdrEnabled;

                    return (
                      <div key={protection.id} className="group relative">
                        <button
                          onClick={() => isAvailable && onProtectionToggle(protection.id)}
                          disabled={!isAvailable}
                          className={cn(
                            "relative px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            isAvailable && isApplied
                              ? "bg-blue-500 text-white shadow-md hover:bg-blue-600"
                              : isAvailable && !isApplied
                              ? "bg-blue-100 text-blue-700 border-2 border-dashed border-blue-300 hover:border-blue-500"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          )}
                        >
                          {protection.short}
                          {isApplied && isAvailable && (
                            <Check className="absolute -top-1 -right-1 w-4 h-4 bg-white text-blue-500 rounded-full" />
                          )}
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                          <div className="font-bold">{protection.label}</div>
                          <div className="text-slate-300">{protection.description}</div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI Act Protections */}
              <div>
                <p className={cn(
                  "text-sm font-medium mb-2 flex items-center gap-1",
                  aiActEnabled ? "text-green-600" : "text-slate-400"
                )}>
                  <Brain className="w-4 h-4" />
                  AI Act Protections
                </p>
                <div className="flex flex-wrap gap-2">
                  {aiActProtections.map((protection) => {
                    const isApplied = appliedProtections.includes(protection.id);
                    const isAvailable = aiActEnabled;

                    return (
                      <div key={protection.id} className="group relative">
                        <button
                          onClick={() => isAvailable && onProtectionToggle(protection.id)}
                          disabled={!isAvailable}
                          className={cn(
                            "relative px-3 py-2 rounded-lg text-sm font-medium transition-all",
                            isAvailable && isApplied
                              ? "bg-green-500 text-white shadow-md hover:bg-green-600"
                              : isAvailable && !isApplied
                              ? "bg-green-100 text-green-700 border-2 border-dashed border-green-300 hover:border-green-500"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed"
                          )}
                        >
                          {protection.short}
                          {isApplied && isAvailable && (
                            <Check className="absolute -top-1 -right-1 w-4 h-4 bg-white text-green-500 rounded-full" />
                          )}
                        </button>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                          <div className="font-bold">{protection.label}</div>
                          <div className="text-slate-300">{protection.description}</div>
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-600 dark:text-slate-400">Active Protections</span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">
                  {appliedProtections.length} / {allProtections.length}
                </span>
              </div>
              <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    appliedProtections.length === allProtections.length
                      ? "bg-green-500"
                      : appliedProtections.length >= allProtections.length / 2
                      ? "bg-amber-500"
                      : "bg-red-500"
                  )}
                  animate={{ width: `${(appliedProtections.length / allProtections.length) * 100}%` }}
                  transition={{ type: 'spring', stiffness: 100, damping: 20 }}
                />
              </div>
              <p className="text-xs text-slate-500 mt-2 text-center">
                {regState === 'neither' && "No regulations active - patient at risk!"}
                {regState === 'mdrOnly' && "MDR only - missing AI-specific protections"}
                {regState === 'aiActOnly' && "AI Act only - missing medical device requirements"}
                {regState === 'both' && appliedProtections.length < allProtections.length && "Some protections disabled"}
                {regState === 'both' && appliedProtections.length === allProtections.length && "Full protection active!"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
