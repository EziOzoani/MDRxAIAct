/**
 * Purpose:
 *   Primary left-side visualisation showing patient protection level as a
 *   thermometer. Includes collapsible shield toggles for MDR and AI Act
 *   protections so users can toggle them directly without the hamburger menu.
 *
 * Dependencies:
 *   - RegulationMenu (allProtections, RegState)
 *   - framer-motion, lucide-react
 *
 * Used by:
 *   - pages/Index.tsx (always rendered from MDR step onwards)
 *
 * Changes:
 *   2026-03-02: Integrated shield toggle panel below thermometer, removed
 *               hamburger dependency. Added MDR/AI Act master toggles.
 *   2026-03-02: Initial thermometer-only version
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Thermometer, AlertTriangle, CheckCircle, Shield, Brain, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { allProtections, type RegState } from './RegulationMenu';

type Step = 'hero' | 'mdr' | 'name' | 'photo' | 'results' | 'hood';

interface RiskThermometerProps {
  currentStep: Step;
  appliedProtections: string[];
  regState: RegState;
  onRegStateChange: (state: RegState) => void;
  onProtectionToggle: (id: string) => void;
}

export function RiskThermometer({
  currentStep,
  appliedProtections,
  regState,
  onRegStateChange,
  onProtectionToggle,
}: RiskThermometerProps) {
  const [shieldsOpen, setShieldsOpen] = useState(false);

  if (currentStep === 'hero') return null;

  const totalPossible = allProtections.length;
  const activeCount = appliedProtections.length;
  const protectionLevel = Math.round((activeCount / totalPossible) * 100);

  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';
  const mdrCount = allProtections.filter(p => p.source === 'mdr' && appliedProtections.includes(p.id)).length;
  const aiActCount = allProtections.filter(p => p.source === 'aiAct' && appliedProtections.includes(p.id)).length;
  const mdrProtections = allProtections.filter(p => p.source === 'mdr');
  const aiActProtections = allProtections.filter(p => p.source === 'aiAct');

  const getColor = (level: number) => {
    if (level >= 80) return { bg: 'bg-green-500', text: 'text-green-500' };
    if (level >= 60) return { bg: 'bg-lime-500', text: 'text-lime-500' };
    if (level >= 40) return { bg: 'bg-yellow-500', text: 'text-yellow-500' };
    if (level >= 20) return { bg: 'bg-orange-500', text: 'text-orange-500' };
    return { bg: 'bg-red-500', text: 'text-red-500' };
  };

  const colors = getColor(protectionLevel);

  const getStatus = () => {
    if (protectionLevel >= 80) return 'SAFE';
    if (protectionLevel >= 60) return 'GOOD';
    if (protectionLevel >= 40) return 'MODERATE';
    if (protectionLevel >= 20) return 'AT RISK';
    return 'DANGER';
  };

  const handleMdrToggle = () => {
    if (mdrEnabled && aiActEnabled) onRegStateChange('aiActOnly');
    else if (mdrEnabled && !aiActEnabled) onRegStateChange('neither');
    else if (!mdrEnabled && aiActEnabled) onRegStateChange('both');
    else onRegStateChange('mdrOnly');
  };

  const handleAiActToggle = () => {
    if (aiActEnabled && mdrEnabled) onRegStateChange('mdrOnly');
    else if (aiActEnabled && !mdrEnabled) onRegStateChange('neither');
    else if (!aiActEnabled && mdrEnabled) onRegStateChange('both');
    else onRegStateChange('aiActOnly');
  };

  return (
    <div className="fixed left-4 top-1/2 -translate-y-1/2 z-40 hidden md:block">
      <motion.div
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 w-28"
      >
        {/* Thermometer visual */}
        <div className="relative mx-auto w-12 h-44 mb-3">
          <div className="absolute inset-x-2 top-0 bottom-8 bg-red-200 dark:bg-red-900/50 rounded-full overflow-hidden">
            <motion.div
              className={cn("absolute bottom-0 left-0 right-0", colors.bg)}
              initial={{ height: '0%' }}
              animate={{ height: `${protectionLevel}%` }}
              transition={{ type: 'spring', stiffness: 50, damping: 15 }}
              style={{ borderRadius: protectionLevel > 95 ? '9999px' : '0 0 9999px 9999px' }}
            />
            {[25, 50, 75].map(mark => (
              <div key={mark} className="absolute left-0 right-0 border-t border-white/30" style={{ bottom: `${mark}%` }} />
            ))}
          </div>

          {/* Bulb */}
          <motion.div
            className={cn(
              "absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full flex items-center justify-center",
              colors.bg,
              protectionLevel <= 30 && "animate-pulse",
            )}
          >
            <Thermometer className="w-5 h-5 text-white" />
          </motion.div>
        </div>

        {/* Level display */}
        <div className="text-center">
          <motion.div key={protectionLevel} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={cn("text-2xl font-black", colors.text)}>
            {protectionLevel}%
          </motion.div>
          <div className={cn("text-xs font-bold uppercase tracking-wide", colors.text)}>
            {getStatus()}
          </div>
        </div>

        {/* Regulation summary row */}
        <div className="flex justify-center gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className={cn("flex flex-col items-center", mdrEnabled ? "opacity-100" : "opacity-30")}>
            <Shield className="w-4 h-4 text-blue-500" />
            <span className="text-[10px] text-slate-500">{mdrCount}/5</span>
          </div>
          <div className={cn("flex flex-col items-center", aiActEnabled ? "opacity-100" : "opacity-30")}>
            <Brain className="w-4 h-4 text-green-500" />
            <span className="text-[10px] text-slate-500">{aiActCount}/5</span>
          </div>
        </div>

        {/* Status icon */}
        <div className="flex justify-center mt-2">
          {protectionLevel < 50 ? (
            <AlertTriangle className={cn("w-5 h-5", colors.text)} />
          ) : (
            <CheckCircle className={cn("w-5 h-5", colors.text)} />
          )}
        </div>

        {/* Toggle shields panel button */}
        <button
          onClick={() => setShieldsOpen(!shieldsOpen)}
          className="w-full mt-3 pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {shieldsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {shieldsOpen ? 'Hide' : 'Edit'} Shields
        </button>
      </motion.div>

      {/* Collapsible shield toggle panel */}
      <AnimatePresence>
        {shieldsOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="mt-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-3 w-48 overflow-hidden"
          >
            {/* MDR section */}
            <div className="mb-3">
              <button onClick={handleMdrToggle} className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-1.5">
                  <Shield className={cn("w-3.5 h-3.5", mdrEnabled ? "text-blue-500" : "text-slate-400")} />
                  <span className={cn("text-xs font-bold", mdrEnabled ? "text-blue-600" : "text-slate-400")}>MDR</span>
                </div>
                <div className={cn("w-8 h-4 rounded-full relative transition-colors", mdrEnabled ? "bg-blue-500" : "bg-slate-300")}>
                  <motion.div
                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow"
                    animate={{ left: mdrEnabled ? 'calc(100% - 14px)' : '2px' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </button>
              <div className="flex flex-wrap gap-1">
                {mdrProtections.map(p => {
                  const isActive = appliedProtections.includes(p.id);
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        onClick={() => mdrEnabled && onProtectionToggle(p.id)}
                        disabled={!mdrEnabled}
                        className={cn(
                          "relative px-2 py-1 rounded text-[10px] font-bold transition-all",
                          mdrEnabled && isActive
                            ? "bg-blue-500 text-white shadow-sm hover:bg-blue-600"
                            : mdrEnabled && !isActive
                              ? "bg-blue-50 text-blue-400 border border-dashed border-blue-300 hover:border-blue-500"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed",
                        )}
                      >
                        {p.short}
                        {isActive && mdrEnabled && (
                          <Check className="absolute -top-1 -right-1 w-3 h-3 bg-white text-blue-500 rounded-full" />
                        )}
                      </button>
                      {/* Tooltip */}
                      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1.5 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        <div className="font-bold text-blue-300">{p.label}</div>
                        <div className="text-slate-300">{p.description}</div>
                        {mdrEnabled && <div className="text-slate-400 mt-0.5">Click to {isActive ? 'disable' : 'enable'}</div>}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Act section */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <button onClick={handleAiActToggle} className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-1.5">
                  <Brain className={cn("w-3.5 h-3.5", aiActEnabled ? "text-green-500" : "text-slate-400")} />
                  <span className={cn("text-xs font-bold", aiActEnabled ? "text-green-600" : "text-slate-400")}>AI Act</span>
                </div>
                <div className={cn("w-8 h-4 rounded-full relative transition-colors", aiActEnabled ? "bg-green-500" : "bg-slate-300")}>
                  <motion.div
                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow"
                    animate={{ left: aiActEnabled ? 'calc(100% - 14px)' : '2px' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </button>
              <div className="flex flex-wrap gap-1">
                {aiActProtections.map(p => {
                  const isActive = appliedProtections.includes(p.id);
                  return (
                    <div key={p.id} className="group relative">
                      <button
                        onClick={() => aiActEnabled && onProtectionToggle(p.id)}
                        disabled={!aiActEnabled}
                        className={cn(
                          "relative px-2 py-1 rounded text-[10px] font-bold transition-all",
                          aiActEnabled && isActive
                            ? "bg-green-500 text-white shadow-sm hover:bg-green-600"
                            : aiActEnabled && !isActive
                              ? "bg-green-50 text-green-400 border border-dashed border-green-300 hover:border-green-500"
                              : "bg-slate-100 text-slate-400 cursor-not-allowed",
                        )}
                      >
                        {p.short}
                        {isActive && aiActEnabled && (
                          <Check className="absolute -top-1 -right-1 w-3 h-3 bg-white text-green-500 rounded-full" />
                        )}
                      </button>
                      {/* Tooltip */}
                      <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-2 py-1.5 bg-slate-900 text-white text-[10px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        <div className="font-bold text-green-300">{p.label}</div>
                        <div className="text-slate-300">{p.description}</div>
                        {aiActEnabled && <div className="text-slate-400 mt-0.5">Click to {isActive ? 'disable' : 'enable'}</div>}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-900" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
