/**
 * Purpose:
 *   Draggable, minimisable, expandable Picture-in-Picture overlay window.
 *   Shows the opposite perspective (doctor/engineer) and contextual info
 *   that changes per demo step.
 *
 * Dependencies:
 *   - PiPContent.tsx (content renderer)
 *   - framer-motion (drag, animation)
 *   - lucide-react icons
 *
 * Used by:
 *   - pages/Index.tsx (rendered from MDR step onwards)
 *
 * Changes:
 *   2026-03-02: Added currentStep prop for step-aware contextual content
 *   2026-03-02: Initial version with drag/minimise/expand mechanics
 */

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, Maximize2, ArrowLeftRight, ChevronUp, ChevronDown } from 'lucide-react';
import { PiPContent } from './PiPContent';
import type { Perspective } from '@/pages/Index';
import type { RegState } from './RegulationMenu';

type Step = 'hero' | 'mdr' | 'name' | 'photo' | 'results' | 'hood';

interface PiPWindowProps {
  perspective: Perspective;
  currentStep: Step;
  classificationResult: any;
  appliedProtections: string[];
  regState: RegState;
}

export function PiPWindow({ perspective, currentStep, classificationResult, appliedProtections, regState }: PiPWindowProps) {
  // Start collapsed so the engineering-view panel doesn't cover the Under-the-
  // Hood cards on arrival. The user opens it from the small corner button when
  // they want the technical detail. (PiP only renders in the hood step now.)
  const [isMinimized, setIsMinimized] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const constraintRef = useRef<HTMLDivElement>(null);

  const oppositePerspective: Perspective = perspective === 'doctor' ? 'engineer' : 'doctor';

  if (isMinimized) {
    return (
      <>
        <div ref={constraintRef} className="fixed inset-0 pointer-events-none z-[44]" />
        <motion.div
          drag
          dragMomentum={false}
          dragConstraints={constraintRef}
          className="fixed bottom-6 right-6 z-[45] pointer-events-auto cursor-grab active:cursor-grabbing"
        >
          <button
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-full shadow-lg border border-slate-200 dark:border-slate-700 hover:shadow-xl transition-shadow"
          >
            <Maximize2 className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {oppositePerspective === 'doctor' ? 'Doctor' : 'Engineer'} View
            </span>
          </button>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <div ref={constraintRef} className="fixed inset-0 pointer-events-none z-[44]" />
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={constraintRef}
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`fixed bottom-6 right-6 z-[45] pointer-events-auto cursor-grab active:cursor-grabbing transition-[width] duration-300 ${
          isExpanded ? 'w-[480px]' : 'w-[380px]'
        }`}
      >
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header bar */}
          <div className={`flex items-center justify-between px-4 py-2.5 ${
            oppositePerspective === 'doctor'
              ? 'bg-primary/10 border-b border-primary/20'
              : 'bg-indigo-50 dark:bg-indigo-950/30 border-b border-indigo-200 dark:border-indigo-800'
          }`}>
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {oppositePerspective === 'doctor' ? 'Doctor View' : 'Engineer View'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                )}
              </button>
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={`${isExpanded}-${currentStep}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`p-4 overflow-y-auto transition-[max-height] duration-300 ${
                isExpanded ? 'max-h-[70vh]' : 'max-h-[350px]'
              }`}
            >
              <PiPContent
                perspective={oppositePerspective}
                currentStep={currentStep}
                classificationResult={classificationResult}
                appliedProtections={appliedProtections}
                regState={regState}
                expanded={isExpanded}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
