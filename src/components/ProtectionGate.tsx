import { motion, AnimatePresence } from 'framer-motion';
import { ShieldOff } from 'lucide-react';
import { ReactNode } from 'react';

interface ProtectionGateProps {
  protectionId: string;
  appliedProtections: string[];
  label?: string;
  children: ReactNode;
}

export function ProtectionGate({ protectionId, appliedProtections, label, children }: ProtectionGateProps) {
  const isEnabled = appliedProtections.includes(protectionId);

  return (
    <div className="relative">
      <AnimatePresence>
        {!isEnabled && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-10 pointer-events-none"
          >
            {/* Red diagonal stripe overlay */}
            <div className="absolute inset-0 overflow-hidden rounded-lg">
              <div
                className="absolute inset-0"
                style={{
                  background: `repeating-linear-gradient(
                    -45deg,
                    transparent,
                    transparent 10px,
                    rgba(239, 68, 68, 0.08) 10px,
                    rgba(239, 68, 68, 0.08) 20px
                  )`,
                }}
              />
            </div>
            {/* PROTECTION DISABLED banner */}
            <div className="absolute top-1 right-1 flex items-center gap-1 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold rounded shadow-sm uppercase tracking-wider">
              <ShieldOff className="w-3 h-3" />
              {label || 'Protection Disabled'}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div
        animate={{
          filter: isEnabled ? 'grayscale(0%)' : 'grayscale(100%)',
          opacity: isEnabled ? 1 : 0.35,
        }}
        transition={{ duration: 0.4 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
