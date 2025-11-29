import { motion } from 'framer-motion';
import { SpeechBubble } from '../SpeechBubble';
import { Microscope, Brain, Shield, FileCheck, Cpu, Database } from 'lucide-react';
import { RegulatoryCard } from '../RegulatoryCard';
import { regulatoryComponents, frameworkAreas } from '@/lib/regulatoryData';
import { useState } from 'react';

interface UnderTheHoodSectionProps {
  userName: string;
  onCardExpandedChange?: (isExpanded: boolean) => void;
}

export function UnderTheHoodSection({ userName, onCardExpandedChange }: UnderTheHoodSectionProps) {
  const [hasExpandedCard, setHasExpandedCard] = useState(false);
  
  const handleCardExpandedChange = (isExpanded: boolean) => {
    setHasExpandedCard(isExpanded);
    onCardExpandedChange?.(isExpanded);
  };

  return (
    <section className="min-h-screen bg-gradient-to-b from-secondary/30 to-background relative overflow-hidden pt-4 pb-16">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-0 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        {/* Circuit-like pattern */}
        <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
          <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
            <circle cx="50" cy="50" r="2" fill="currentColor" />
            <line x1="50" y1="0" x2="50" y2="48" stroke="currentColor" strokeWidth="0.5" />
            <line x1="50" y1="52" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" />
            <line x1="0" y1="50" x2="48" y2="50" stroke="currentColor" strokeWidth="0.5" />
            <line x1="52" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#circuit)" />
        </svg>
      </div>

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-6"
        >
          <div className="inline-block px-3 py-1 bg-accent/10 rounded-full text-accent text-sm font-semibold mb-4">
            Step 4 of 4
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-foreground mb-4">
            Let's Look <span className="text-gradient">Under the Hood</span>
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Curious about how our AI works? Here's the technical breakdown of our 
            medical-grade detection system.
          </p>
        </motion.div>

        {/* Bear with microscope and speech bubble */}
        {!hasExpandedCard && (
          <div className="relative mb-8" style={{ minHeight: '150px' }}>
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="lg:max-w-[360px] absolute"
              style={{ 
                left: '22%', // Moved right from bear's position
                top: '125px', // 1/4 of 500px bear height
                transform: 'translateY(-50%)'
              }}
            >
              <SpeechBubble direction="left">
                <p className="text-lg font-semibold text-foreground">
                  Alright {userName}, put on your lab coat! 🔬
                </p>
                <p className="text-muted-foreground mt-2">
                  As a doctor, I believe in transparency. Let me show you exactly how our 
                  AI analyzes your images and makes its predictions. Knowledge is power!
                </p>
              </SpeechBubble>
            </motion.div>
          </div>
        )}

        {/* Compliance badges - moved to top */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="mb-8 p-6 glass-card"
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="text-xl font-bold text-foreground mb-2">Regulatory Compliance</h4>
              <p className="text-muted-foreground">
                Our AI system meets the highest standards for medical device software.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-primary/10 rounded-lg border border-primary/20">
                <span className="text-sm font-bold text-primary">MDR 2017/745</span>
              </div>
              <div className="px-4 py-2 bg-accent/10 rounded-lg border border-accent/20">
                <span className="text-sm font-bold text-accent">EU AI Act</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Framework areas overview */}
        <div className="mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            viewport={{ once: true }}
            className="text-center mb-8"
          >
            <h3 className="text-2xl font-bold text-foreground mb-4">Three Key Framework Areas</h3>
          </motion.div>

          {/* Framework badges */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 rounded-lg">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span className="text-sm font-medium">{frameworkAreas.mdr.title}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-green-500/10 rounded-lg">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="text-sm font-medium">{frameworkAreas.aiAct.title}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 rounded-lg">
              <div className="w-3 h-3 bg-purple-500 rounded-full" />
              <span className="text-sm font-medium">{frameworkAreas.overlap.title}</span>
            </div>
          </div>
        </div>

        {/* Regulatory components - expandable cards */}
        <div className="space-y-4" style={{ marginLeft: '50%', width: '50%', marginTop: '-8rem' }}>
          {regulatoryComponents.map((component, index) => (
            <RegulatoryCard 
              key={component.id} 
              component={component} 
              index={index} 
              onExpandedChange={handleCardExpandedChange}
            />
          ))}
        </div>


        {/* Final CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          viewport={{ once: true }}
          className="text-center mt-16"
        >
          <p className="text-lg text-muted-foreground mb-4">
            Ready to explore more features?
          </p>
          <p className="text-sm text-muted-foreground">
            This is just the beginning of your journey with Medical AI. 
            More sections and features coming soon!
          </p>
        </motion.div>
      </div>
    </section>
  );
}
