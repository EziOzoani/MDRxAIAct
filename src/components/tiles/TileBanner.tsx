/**
 * Purpose:
 *   Top-of-tile coloured banner used to call out missing protections that
 *   would otherwise prevent the device from being deployable (e.g. CE
 *   Marking removed → red "NOT CERTIFIED" banner; Drift Monitoring removed
 *   → amber "DRIFT NOT MONITORED"). Multiple banners can stack.
 *
 *   Visual hierarchy:
 *     critical = red, with icon + bold label
 *     warning  = amber, slightly softer
 *     info     = slate, used sparingly
 *
 * Dependencies:
 *   - framer-motion (slide-in animation)
 *   - lucide-react (icons)
 *
 * Used by:
 *   - src/components/tiles/Tile1Data.tsx
 *
 * Changes:
 *   2026-05-18: Initial.
 */

import { motion } from 'framer-motion';
import { AlertTriangle, Ban, Info } from 'lucide-react';
import type { ShieldSeverity } from '@/config/shieldRules';

interface TileBannerProps {
  severity: ShieldSeverity;
  label: string;
  detail?: string;
}

const STYLES: Record<ShieldSeverity, {
  bg: string;
  border: string;
  text: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  critical: {
    bg: 'bg-red-950/60',
    border: 'border-red-700',
    text: 'text-red-100',
    icon: Ban,
  },
  warning: {
    bg: 'bg-amber-950/60',
    border: 'border-amber-700',
    text: 'text-amber-100',
    icon: AlertTriangle,
  },
  info: {
    bg: 'bg-slate-800/60',
    border: 'border-slate-600',
    text: 'text-slate-100',
    icon: Info,
  },
};

export function TileBanner({ severity, label, detail }: TileBannerProps) {
  const s = STYLES[severity];
  const Icon = s.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22 }}
      className={`flex items-start gap-2 rounded-lg border-l-4 px-3 py-2 ${s.bg} ${s.border} ${s.text}`}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 text-left">
        <p className="text-xs font-bold uppercase tracking-wider">{label}</p>
        {detail && <p className="mt-0.5 text-[11px] opacity-90">{detail}</p>}
      </div>
    </motion.div>
  );
}
