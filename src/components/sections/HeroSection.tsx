import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { ChevronDown } from 'lucide-react';

export type VizMode = 'reactive-bear' | 'shields' | 'thermometer';

interface HeroSectionProps {
  onGetStarted: () => void;
  vizMode?: VizMode;
  onVizModeChange?: (mode: VizMode) => void;
}

export function HeroSection({ onGetStarted }: HeroSectionProps) {
  const baseURL = (import.meta as any).env?.BASE_URL ?? '/';
  // TEMP preview: header colour scheme via ?hdr= (blue|teal|deepteal|neutral)
  const HDR: Record<string, { title: string; from: string; to: string; border: string; divider: string }> = {
    blue:     { title: '#146EF5', from: 'rgba(219,234,254,0.9)',  to: 'rgba(219,234,254,0.5)', border: '#146EF5', divider: 'rgba(20,110,245,0.30)' },
    teal:     { title: '#0F766E', from: 'rgba(204,251,241,0.85)', to: 'rgba(204,251,241,0.45)', border: '#0F766E', divider: 'rgba(15,118,110,0.30)' },
    deepteal: { title: '#084059', from: 'rgba(207,243,245,0.85)', to: 'rgba(224,242,254,0.5)', border: '#084059', divider: 'rgba(8,64,89,0.30)' },
    neutral:  { title: '#0F2A3A', from: 'rgba(255,255,255,0.95)', to: 'rgba(248,250,252,0.8)', border: '#CBD5E1', divider: 'rgba(148,163,184,0.5)' },
  };
  const hdrKey = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('hdr')) || 'teal';
  const S = HDR[hdrKey] || HDR.blue;

  return (
    <section className="min-h-screen hero-gradient flex flex-col relative overflow-hidden px-4">
      {/* Branded top bar. Replaces the old yellow "work in progress" banner:
          appliedAI lead on the left, BAIAA partner mark on the right, and a
          discreet "Prototype" chip that keeps the honest demo signal without
          the jarring full-width yellow. Mirrors practical-ai-act.eu's header. */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full z-20 border-b-2 backdrop-blur-sm"
        style={{ background: `linear-gradient(to right, ${S.from}, rgba(255,255,255,0.45), ${S.to})`, borderBottomColor: S.border }}
      >
        <div className="container mx-auto flex items-center justify-between gap-4 px-2 py-4">
          <div className="flex items-center gap-3 sm:gap-5">
            <img
              src={`${baseURL}images/brand/appliedai-logo.svg`}
              alt="appliedAI Institute for Europe"
              className="h-9 md:h-10 w-auto"
            />
            <span className="hidden sm:block h-8 w-px" style={{ background: S.divider }} />
            <span
              className="hidden sm:block text-lg md:text-2xl font-bold tracking-tight"
              style={{ color: S.title, fontFamily: "'Work Sans', sans-serif", letterSpacing: '-0.01em' }}
            >
              Medical AI Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Prototype
            </span>
            <img
              src={`${baseURL}images/brand/baiaa-logo-black.svg`}
              alt="Bavarian AI Act Accelerator"
              className="h-8 md:h-9 w-auto opacity-90"
            />
          </div>
        </div>
      </motion.header>

            
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-[100px]" />
      </div>
      
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="container mx-auto flex flex-col items-center justify-center z-10">
        {/* Content */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: 'easeOut' }}
          className="text-center max-w-xl"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="inline-block px-4 py-2 bg-primary/10 rounded-full text-primary font-semibold text-sm mb-6"
          >
            MDR × AI Act Compliant
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-foreground mb-6 leading-tight"
          >
            Welcome to the{' '}
            <span className="text-gradient">Medical AI</span>{' '}
            Dashboard
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed"
          >
            Explore our tattoo detection AI system. 
            Your friendly Doctor Bear will guide you through every step!
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 items-center justify-center ml-8"
          >
            <Button
              onClick={onGetStarted}
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-lg px-8 py-6 rounded-xl shadow-glow hover:shadow-[0_0_60px_hsl(175_55%_42%_/_0.3)] transition-all duration-300"
            >
              Jump Right In
              <ChevronDown className="ml-2 animate-bounce-soft" />
            </Button>
          </motion.div>
        </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <span className="text-sm font-medium">Scroll to begin</span>
          <ChevronDown className="w-5 h-5 animate-bounce" />
        </div>
      </motion.div>
    </section>
  );
}
