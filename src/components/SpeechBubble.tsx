import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface SpeechBubbleProps {
  children: ReactNode;
  direction?: 'left' | 'right' | 'bottom';
  className?: string;
  variant?: 'speech' | 'thought';
  style?: React.CSSProperties;
}

export function SpeechBubble({ children, direction = 'left', className = '', variant = 'speech', style }: SpeechBubbleProps) {
  const isThought = variant === 'thought';
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`relative bg-card border-2 border-primary/20 ${isThought ? 'rounded-3xl' : 'rounded-2xl'} p-6 shadow-soft ${className}`}
      style={style}
    >
      {children}
      {isThought ? (
        // Thought bubble circles
        <>
          <div className="absolute -bottom-2 left-10 w-3 h-3 bg-card border-2 border-primary/20 rounded-full" />
          <div className="absolute -bottom-5 left-6 w-5 h-5 bg-card border-2 border-primary/20 rounded-full" />
          <div className="absolute -bottom-8 left-2 w-6 h-6 bg-card border-2 border-primary/20 rounded-full" />
        </>
      ) : (
        direction === 'bottom' ? (
        <>
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-0 h-0 border-t-[12px] border-t-card border-x-[10px] border-x-transparent" />
          <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 w-0 h-0 border-t-[14px] border-t-primary/20 border-x-[12px] border-x-transparent" style={{ zIndex: -1 }} />
        </>
        ) : (
          <>
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
          </>
        )
      )}
    </motion.div>
  );
}
