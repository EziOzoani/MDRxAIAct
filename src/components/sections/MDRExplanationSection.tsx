import { motion } from 'framer-motion';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';

interface MDRExplanationSectionProps {
  onContinue: () => void;
}

export function MDRExplanationSection({ onContinue }: MDRExplanationSectionProps) {
  return (
    <section className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 relative flex items-center overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/3 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 -right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-16 relative z-10">

        {/* Three bears conversation */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-end max-w-7xl mx-auto" style={{ paddingLeft: '0', marginLeft: '0' }}>
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
              <SpeechBubble direction="bottom" className="max-w-xs">
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
        </div>

        {/* Continue button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.9 }}
          viewport={{ once: true }}
          className="mt-12 flex justify-center"
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