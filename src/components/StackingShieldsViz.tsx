import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Brain, User, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { allProtections } from './RegulationMenu';

type Step = 'hero' | 'mdr' | 'name' | 'photo' | 'results' | 'hood';

interface StackingShieldsVizProps {
  currentStep: Step;
  appliedProtections: string[];
  regState: 'both' | 'mdrOnly' | 'aiActOnly' | 'neither';
  onProtectionToggle?: (id: string) => void;
}

export function StackingShieldsViz({ currentStep, appliedProtections, regState, onProtectionToggle }: StackingShieldsVizProps) {
  // Don't show on hero
  if (currentStep === 'hero') return null;

  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';

  const mdrProtections = allProtections.filter(p => p.source === 'mdr');
  const aiActProtections = allProtections.filter(p => p.source === 'aiAct');

  const activeMdr = mdrProtections.filter(p => appliedProtections.includes(p.id));
  const activeAiAct = aiActProtections.filter(p => appliedProtections.includes(p.id));

  const totalActive = appliedProtections.length;
  const isFullyProtected = totalActive === allProtections.length;
  const isInDanger = totalActive < 3;

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden md:block">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4"
      >
        {/* Header */}
        <div className="text-center mb-3">
          <h3 className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
            Shield Wall
          </h3>
          <p className={cn(
            "text-lg font-black",
            isFullyProtected ? "text-green-500" : isInDanger ? "text-red-500" : "text-amber-500"
          )}>
            {totalActive}/10
          </p>
        </div>

        {/* Patient at center */}
        <div className="flex justify-center mb-3">
          <motion.div
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isFullyProtected ? "bg-green-500" : isInDanger ? "bg-red-500" : "bg-amber-500"
            )}
            animate={{
              boxShadow: isInDanger ? '0 0 15px rgb(239 68 68 / 0.5)' : 'none'
            }}
          >
            <User className="w-5 h-5 text-white" />
          </motion.div>
        </div>

        {/* Shield Stacks */}
        <div className="flex gap-3 justify-center">
          {/* MDR Stack */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "flex items-center gap-1 mb-2 px-2 py-0.5 rounded text-xs font-bold",
              mdrEnabled ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300" : "bg-slate-100 text-slate-400"
            )}>
              <Shield className="w-3 h-3" />
              MDR
            </div>
            <div className="flex flex-col-reverse gap-1">
              <AnimatePresence>
                {mdrProtections.map((protection, idx) => {
                  const isActive = appliedProtections.includes(protection.id);
                  return (
                    <div key={protection.id} className="group relative">
                      <motion.button
                        onClick={() => mdrEnabled && onProtectionToggle?.(protection.id)}
                        disabled={!mdrEnabled}
                        initial={{ opacity: 0, scale: 0, y: -20 }}
                        animate={{
                          opacity: mdrEnabled && isActive ? 1 : 0.3,
                          scale: mdrEnabled && isActive ? 1 : 0.9,
                          y: 0
                        }}
                        exit={{ opacity: 0, scale: 0, y: -20 }}
                        transition={{ delay: idx * 0.05, type: 'spring', stiffness: 200 }}
                        whileHover={mdrEnabled ? { scale: 1.1 } : {}}
                        whileTap={mdrEnabled ? { scale: 0.95 } : {}}
                        className={cn(
                          "w-10 h-7 rounded flex items-center justify-center text-[10px] font-bold transition-colors cursor-pointer",
                          mdrEnabled && isActive
                            ? "bg-gradient-to-b from-blue-400 to-blue-600 text-white shadow-md hover:from-blue-500 hover:to-blue-700"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-400 border border-dashed border-slate-300",
                          !mdrEnabled && "cursor-not-allowed"
                        )}
                      >
                        {protection.short}
                      </motion.button>
                      {/* Tooltip */}
                      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        <div className="font-bold text-blue-300">{protection.label}</div>
                        <div className="text-slate-300 text-[10px] max-w-[150px] whitespace-normal">{protection.description}</div>
                        {mdrEnabled && (
                          <div className="text-[10px] mt-1 text-slate-400">
                            Click to {isActive ? 'disable' : 'enable'}
                          </div>
                        )}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                      </div>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">
              {activeMdr.length}/5
            </span>
          </div>

          {/* AI Act Stack */}
          <div className="flex flex-col items-center">
            <div className={cn(
              "flex items-center gap-1 mb-2 px-2 py-0.5 rounded text-xs font-bold",
              aiActEnabled ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300" : "bg-slate-100 text-slate-400"
            )}>
              <Brain className="w-3 h-3" />
              AI Act
            </div>
            <div className="flex flex-col-reverse gap-1">
              <AnimatePresence>
                {aiActProtections.map((protection, idx) => {
                  const isActive = appliedProtections.includes(protection.id);
                  return (
                    <div key={protection.id} className="group relative">
                      <motion.button
                        onClick={() => aiActEnabled && onProtectionToggle?.(protection.id)}
                        disabled={!aiActEnabled}
                        initial={{ opacity: 0, scale: 0, y: -20 }}
                        animate={{
                          opacity: aiActEnabled && isActive ? 1 : 0.3,
                          scale: aiActEnabled && isActive ? 1 : 0.9,
                          y: 0
                        }}
                        exit={{ opacity: 0, scale: 0, y: -20 }}
                        transition={{ delay: idx * 0.05, type: 'spring', stiffness: 200 }}
                        whileHover={aiActEnabled ? { scale: 1.1 } : {}}
                        whileTap={aiActEnabled ? { scale: 0.95 } : {}}
                        className={cn(
                          "w-10 h-7 rounded flex items-center justify-center text-[10px] font-bold transition-colors cursor-pointer",
                          aiActEnabled && isActive
                            ? "bg-gradient-to-b from-green-400 to-green-600 text-white shadow-md hover:from-green-500 hover:to-green-700"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-400 border border-dashed border-slate-300",
                          !aiActEnabled && "cursor-not-allowed"
                        )}
                      >
                        {protection.short}
                      </motion.button>
                      {/* Tooltip */}
                      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        <div className="font-bold text-green-300">{protection.label}</div>
                        <div className="text-slate-300 text-[10px] max-w-[150px] whitespace-normal">{protection.description}</div>
                        {aiActEnabled && (
                          <div className="text-[10px] mt-1 text-slate-400">
                            Click to {isActive ? 'disable' : 'enable'}
                          </div>
                        )}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                      </div>
                    </div>
                  );
                })}
              </AnimatePresence>
            </div>
            <span className="text-[10px] text-slate-500 mt-1">
              {activeAiAct.length}/5
            </span>
          </div>
        </div>

        {/* Status */}
        <div className={cn(
          "mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 text-center"
        )}>
          <div className="flex items-center justify-center gap-1">
            {isFullyProtected ? (
              <>
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs font-bold text-green-600">PROTECTED</span>
              </>
            ) : isInDanger ? (
              <>
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="text-xs font-bold text-red-600">VULNERABLE</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-amber-600">PARTIAL</span>
              </>
            )}
          </div>
        </div>

        {/* Hint */}
        <p className="text-[9px] text-center text-slate-400 mt-2">
          Use ☰ menu to toggle
        </p>
      </motion.div>
    </div>
  );
}
