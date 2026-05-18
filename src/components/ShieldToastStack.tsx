/**
 * Purpose:
 *   Renders the stack of transient shield-change toasts emitted by the
 *   useShieldToast hook. Sits at the top of the Under-the-Hood section,
 *   anchored to the page so multiple stacks don't fight for the same
 *   pixels. Each toast slides in from the top, lingers ~4 seconds, and
 *   slides out.
 *
 * Dependencies:
 *   - framer-motion (AnimatePresence + slide animations)
 *   - lucide-react (icons)
 *   - @/hooks/useShieldToast (the hook providing the toasts)
 *
 * Used by:
 *   - src/components/sections/UnderTheHoodSection.tsx
 *
 * Changes:
 *   2026-05-18: Initial.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ShieldOff, ShieldCheck } from 'lucide-react';
import type { ShieldToast } from '@/hooks/useShieldToast';

interface ShieldToastStackProps {
  toasts: ShieldToast[];
}

export function ShieldToastStack({ toasts }: ShieldToastStackProps) {
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => {
          const isDisable = t.variant === 'disable';
          const Icon = isDisable ? ShieldOff : ShieldCheck;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.25 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border-2 px-4 py-3 shadow-lg backdrop-blur-md ${
                isDisable
                  ? 'border-red-700 bg-red-950/85 text-red-100'
                  : 'border-emerald-700 bg-emerald-950/85 text-emerald-100'
              }`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1 text-left">
                <p className="text-xs font-bold uppercase tracking-wider">
                  {t.shortLabel}{' '}{isDisable ? 'disabled' : 'restored'}
                </p>
                <p className="mt-0.5 text-[11px] opacity-95">{t.message}</p>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
