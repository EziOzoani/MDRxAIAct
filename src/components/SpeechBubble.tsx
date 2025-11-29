import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface SpeechBubbleProps {
  children: ReactNode;
  direction?: 'left' | 'right';
  className?: string;
}

export function SpeechBubble({ children, direction = 'left', className = '' }: SpeechBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`relative bg-card border-2 border-primary/20 rounded-2xl p-6 shadow-soft ${className}`}
    >
      {children}
      <div 
        className={`absolute top-1/2 -translate-y-1/2 w-0 h-0 ${
          direction === 'left' 
            ? '-left-3 border-r-[12px] border-r-card border-y-[10px] border-y-transparent' 
            : '-right-3 border-l-[12px] border-l-card border-y-[10px] border-y-transparent'
        }`}
      />
      <div 
        className={`absolute top-1/2 -translate-y-1/2 w-0 h-0 ${
          direction === 'left' 
            ? '-left-4 border-r-[14px] border-r-primary/20 border-y-[12px] border-y-transparent' 
            : '-right-4 border-l-[14px] border-l-primary/20 border-y-[12px] border-y-transparent'
        }`}
        style={{ zIndex: -1 }}
      />
    </motion.div>
  );
}
