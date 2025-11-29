import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Camera, Sliders, Brain, FileCheck, Shield, ArrowLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RegulatoryComponent } from '@/lib/regulatoryData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface RegulatoryCardProps {
  component: RegulatoryComponent;
  index: number;
  onExpandedChange?: (isExpanded: boolean) => void;
}

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Camera,
  Sliders,
  Brain,
  FileCheck,
  Shield
};

export function RegulatoryCard({ component, index, onExpandedChange }: RegulatoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = iconMap[component.icon] || Camera;

  const handleExpandedChange = (expanded: boolean) => {
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  return (
    <>
      {/* Collapsed Card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        viewport={{ once: true }}
        className="w-full"
      >
        <div className="glass-card overflow-hidden">
          <button
            onClick={() => handleExpandedChange(true)}
            className="w-full p-6 text-left hover:bg-muted/5 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">{component.name}</h3>
                  <p className="text-muted-foreground mt-1">{component.description}</p>
                </div>
              </div>
              <ChevronDown className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </button>
        </div>
      </motion.div>

      {/* Fullscreen Expanded Modal */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
              onClick={() => handleExpandedChange(false)}
            />
            
            {/* Modal Content */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.3, type: 'spring', damping: 25 }}
              className="fixed inset-x-8 inset-y-16 md:inset-x-16 md:inset-y-20 lg:inset-x-32 lg:inset-y-24 z-50 overflow-hidden"
            >
              <div className="h-full bg-card border border-border rounded-xl shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExpandedChange(false)}
                      className="gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </Button>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-bold text-foreground">{component.name}</h2>
                        <p className="text-lg text-muted-foreground">{component.description}</p>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleExpandedChange(false)}
                    className="rounded-full"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {/* Instructional text */}
                  <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                    <p className="text-muted-foreground">
                      Click on any component below to explore MDR requirements, AI Act requirements, and Overlap Zones where both frameworks apply.
                    </p>
                  </div>
                  
                  <Tabs defaultValue="mdr" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-8">
                      <TabsTrigger value="mdr" className="data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600">
                        MDR Requirements
                      </TabsTrigger>
                      <TabsTrigger value="ai" className="data-[state=active]:bg-green-500/10 data-[state=active]:text-green-600">
                        AI Act Requirements
                      </TabsTrigger>
                      <TabsTrigger value="overlap" className="data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600">
                        Overlap Zone
                      </TabsTrigger>
                    </TabsList>

                  {/* MDR Tab */}
                  <TabsContent value="mdr" className="space-y-4">
                    <div>
                      <h4 className="font-bold text-2xl text-blue-600 mb-3">Medical Device Regulation (MDR)</h4>
                      
                      <div className="mb-4">
                        <h5 className="font-semibold text-lg text-foreground mb-2">Legislation:</h5>
                        <ul className="space-y-2">
                          {component.mdrRequirements.legislation.map((item, idx) => (
                            <li key={idx} className="text-base text-muted-foreground">• {item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="mb-4">
                        <h5 className="font-semibold text-lg text-foreground mb-2">Requirements:</h5>
                        <ul className="space-y-2">
                          {component.mdrRequirements.requirements.map((req, idx) => (
                            <li key={idx} className="text-base text-muted-foreground">• {req}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                        <h5 className="font-semibold text-lg text-blue-800 dark:text-blue-200 mb-2">Regulatory Text:</h5>
                        <p className="text-base text-blue-700 dark:text-blue-300">
                          {component.mdrRequirements.regulatoryText}
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  {/* AI Act Tab */}
                  <TabsContent value="ai" className="space-y-4">
                    <div>
                      <h4 className="font-bold text-2xl text-green-600 mb-3">EU AI Act</h4>
                      
                      <div className="mb-4">
                        <h5 className="font-semibold text-lg text-foreground mb-2">Legislation:</h5>
                        <ul className="space-y-2">
                          {component.aiActRequirements.legislation.map((item, idx) => (
                            <li key={idx} className="text-base text-muted-foreground">• {item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="mb-4">
                        <h5 className="font-semibold text-lg text-foreground mb-2">Requirements:</h5>
                        <ul className="space-y-2">
                          {component.aiActRequirements.requirements.map((req, idx) => (
                            <li key={idx} className="text-base text-muted-foreground">• {req}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                        <h5 className="font-semibold text-lg text-green-800 dark:text-green-200 mb-2">Regulatory Text:</h5>
                        <p className="text-base text-green-700 dark:text-green-300">
                          {component.aiActRequirements.regulatoryText}
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Overlap Tab */}
                  <TabsContent value="overlap" className="space-y-4">
                    <div>
                      <h4 className="font-bold text-2xl text-purple-600 mb-3">Integrated Compliance</h4>
                      
                      <div className="mb-4">
                        <h5 className="font-semibold text-lg text-foreground mb-2">Legislation:</h5>
                        <ul className="space-y-2">
                          {component.overlapRequirements.legislation.map((item, idx) => (
                            <li key={idx} className="text-base text-muted-foreground">• {item}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="mb-4">
                        <h5 className="font-semibold text-lg text-foreground mb-2">Integrated Requirements:</h5>
                        <ul className="space-y-2">
                          {component.overlapRequirements.requirements.map((req, idx) => (
                            <li key={idx} className="text-base text-muted-foreground">• {req}</li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800">
                        <h5 className="font-semibold text-lg text-purple-800 dark:text-purple-200 mb-2">Integration Text:</h5>
                        <p className="text-base text-purple-700 dark:text-purple-300">
                          {component.overlapRequirements.regulatoryText}
                        </p>
                      </div>
                    </div>
                  </TabsContent>
                    </Tabs>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </>
    );
  }