import { motion } from 'framer-motion';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { ArrowRight, Map, MessageCircle, Layers, Shield, Thermometer, AlertTriangle } from 'lucide-react';
import type { VizMode } from './HeroSection';
import { allProtections, type RegState } from '../RegulationMenu';
import { cn } from '@/lib/utils';

// Helper to get protection info
const getProtectionInfo = (id: string) => allProtections.find(p => p.id === id);

interface MDRExplanationSectionProps {
  onContinue: () => void;
  vizMode?: VizMode;
  regState?: RegState;
  appliedProtections?: string[];
}

export function MDRExplanationSection({ onContinue, vizMode = 'reactive-bear', regState = 'both', appliedProtections = [] }: MDRExplanationSectionProps) {
  const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
  const aiActEnabled = regState === 'both' || regState === 'aiActOnly';

  // Check specific protections
  const hasCeMarking = appliedProtections.includes('ce-marking');
  const hasClinicalEval = appliedProtections.includes('clinical-eval');
  const hasPms = appliedProtections.includes('pms');

  // Count active protections for this section
  const sectionProtections = ['ce-marking', 'clinical-eval', 'pms'];
  const activeCount = sectionProtections.filter(p => appliedProtections.includes(p)).length;
  return (
    <section className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 relative flex items-center overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/3 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-16 relative z-10">

        {/* Three bears conversation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end max-w-7xl mx-auto relative" style={{ paddingLeft: '0', marginLeft: '0' }}>
          {/* First Bear - Questioning */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            viewport={{ once: true }}
            className="relative flex items-start"
            style={{ marginLeft: '-250px' }}
          >
            <img 
              src={`${import.meta.env.BASE_URL}images/no_background/doctor_bear_thinking_no_background.png`} 
              alt="Thinking Doctor Bear" 
              style={{ width: '400px', height: '560px' }}
              className="object-contain flex-shrink-0"
            />
            <div className="absolute" style={{ left: '330px', top: '150px' }}>
              <SpeechBubble direction="left" variant="thought" className="max-w-xs">
                <p className="text-sm md:text-base">
                  Wait… if this is about medical devices, why are we building a 'sticker-tattoo vs real tattoo' detector instead of a skin lesion classifier?
                </p>
              </SpeechBubble>
            </div>
          </motion.div>

          {/* Second Bear - Explaining */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
            className="relative flex items-start"
          >
            <img 
              src={`${import.meta.env.BASE_URL}images/no_background/doctor_bear_idea_no_background.png`} 
              alt="Explaining Doctor Bear" 
              style={{ width: '550px', height: '770px' }}
              className="object-contain flex-shrink-0"
            />
            <div className="absolute" style={{ left: '100px', top: '-50px' }}>
              <SpeechBubble direction="bottom" className="max-w-2xl">
                <p className="text-sm md:text-base">
                  Because we want to explore regulation under the MDR × AI Act, but without the complexity, liability, or risk of a real medical device. This is an educational demonstration, not a diagnostic tool!
                </p>
              </SpeechBubble>
            </div>
          </motion.div>

          {/* Third Bear - Playful */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            viewport={{ once: true }}
            className="relative flex items-start"
            style={{ marginRight: '-100px' }}
          >
            <img 
              src={`${import.meta.env.BASE_URL}images/no_background/doctor_bear_handstand_nobackground.png`} 
              alt="Handstand Doctor Bear" 
              style={{ width: '550px', height: '400px' }}
              className="object-contain flex-shrink-0"
            />
            <div className="absolute" style={{ left: '480px', top: '50px' }}>
              <SpeechBubble direction="left" className="max-w-lg">
                <p className="text-sm md:text-base">
                  Maybe we'll do real medical detection in the future, but right now tattoos are more colourful… and I love colours 🎨
                </p>
              </SpeechBubble>
            </div>
          </motion.div>
          {/* Arrow between first and second bear */}
          <div className="absolute hidden lg:block text-primary/50 text-7xl font-bold" style={{ left: '33%', top: '70%', transform: 'translateX(-50%) translateY(-50%) rotate(-45deg)' }}>
            <span>›</span>
          </div>
          
          {/* Arrow between second and third bear */}
          <div className="absolute hidden lg:block text-primary/50 text-7xl font-bold" style={{ left: '66%', top: '70%', transform: 'translateX(-50%) translateY(-50%)' }}>
            <span>›</span>
          </div>
        </div>

        {/* Protection status now shown in the thermometer (left side) and PiP overlay */}

        {/* Continue button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          viewport={{ once: true }}
          className="mt-6 flex justify-center"
        >
          <Button
            onClick={onContinue}
            className="px-8 py-6 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-soft hover:shadow-medium transition-all duration-300"
          >
            Let's Continue
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </motion.div>
      </div>
    </section>
  );
}

// VizMode Preview Component - shows what visualization style is active
function VizModePreview({ vizMode }: { vizMode: VizMode }) {
  const vizConfig = {
    'patient-journey': {
      icon: Map,
      label: 'Patient Journey Mode',
      description: "You'll follow a patient through safety checkpoints",
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-200 dark:border-blue-800'
    },
    'reactive-bear': {
      icon: MessageCircle,
      label: 'Reactive Bear Mode',
      description: "Dr. Bear will explain what's happening at each step",
      color: 'text-amber-500',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
      border: 'border-amber-200 dark:border-amber-800'
    },
    'layers': {
      icon: Layers,
      label: 'Protection Layers Mode',
      description: "You'll see layers of protection around the patient",
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-200 dark:border-purple-800'
    },
    'shields': {
      icon: Shield,
      label: 'Stacking Shields Mode',
      description: "Watch shields stack up as protections are added",
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800'
    },
    'thermometer': {
      icon: Thermometer,
      label: 'Risk Thermometer Mode',
      description: "See risk levels change as protections are toggled",
      color: 'text-red-500',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800'
    }
  };

  const config = vizConfig[vizMode];
  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-3 px-5 py-3 rounded-xl border",
      config.bg,
      config.border
    )}>
      <Icon className={cn("w-5 h-5", config.color)} />
      <div>
        <p className={cn("font-semibold text-sm", config.color)}>{config.label}</p>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </div>
    </div>
  );
}