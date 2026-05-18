/**
 * Purpose:
 *   A visual "redaction" overlay that physically covers content the user
 *   isn't allowed to see because a regulation/shield is missing. Wraps any
 *   child element — when `active` is true the children are still rendered
 *   in the DOM for layout stability, but a diagonally-striped black bar is
 *   overlaid on top, with a short label explaining what's been removed.
 *
 *   This is a reusable visual primitive: the same component overlays
 *   the per-class bars when Clinical Evaluation is off, the MDR/AI Act
 *   text on the flip-back when Explainability is off, the "Source: ..."
 *   line when Transparency is off, etc.
 *
 * Dependencies:
 *   - framer-motion (animated reveal/hide)
 *
 * Used by:
 *   - src/components/tiles/Tile1Data.tsx
 *
 * Changes:
 *   2026-05-18: Initial.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Lock } from 'lucide-react';

interface RedactionStripProps {
  /** When true the overlay is shown. */
  active: boolean;
  /** Short label rendered on the overlay (e.g. "Explainability required"). */
  label?: string;
  /** Children rendered underneath — kept mounted for layout. */
  children: React.ReactNode;
}

export function RedactionStrip({ active, label, children }: RedactionStripProps) {
  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 flex items-center justify-center rounded-md"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, rgba(0,0,0,0.92) 0 10px, rgba(30,41,59,0.92) 10px 20px)',
            }}
            aria-label={label ?? 'Content redacted'}
          >
            {label && (
              <div className="flex items-center gap-1.5 rounded bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-100 backdrop-blur-sm">
                <Lock className="h-3 w-3" />
                {label}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
