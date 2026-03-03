import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Camera, Sliders, Brain, FileCheck, Shield, ArrowLeft, X, ShieldOff, AlertTriangle, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RegulatoryComponent } from '@/lib/regulatoryData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

type RegState = 'both' | 'mdrOnly' | 'aiActOnly' | 'neither';

interface RegulatoryCardProps {
  component: RegulatoryComponent;
  index: number;
  onExpandedChange?: (isExpanded: boolean) => void;
  regState?: RegState;
}

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Camera,
  Sliders,
  Brain,
  FileCheck,
  Shield
};

export function RegulatoryCard({ component, index, onExpandedChange, regState = 'both' }: RegulatoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = iconMap[component.icon] || Camera;

  const handleExpandedChange = (expanded: boolean) => {
    // Can't expand when no regulations
    if (regState === 'neither' && expanded) return;
    setIsExpanded(expanded);
    onExpandedChange?.(expanded);
  };

  // Warning messages for partial/no regulation
  const getCardWarning = () => {
    if (regState === 'neither') {
      return { icon: ShieldOff, text: 'NO OVERSIGHT', color: 'red' };
    }
    if (regState === 'mdrOnly') {
      return { icon: AlertTriangle, text: 'Missing AI monitoring', color: 'amber' };
    }
    if (regState === 'aiActOnly') {
      return { icon: AlertTriangle, text: 'Missing clinical validation', color: 'amber' };
    }
    return null;
  };

  const warning = getCardWarning();

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
        <div className={cn(
          "glass-card overflow-hidden relative",
          regState === 'neither' && "opacity-60 border-red-300 bg-red-50/50"
        )}>
          {/* Warning badge */}
          {warning && (
            <div className={cn(
              "absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 z-10",
              warning.color === 'red' && "bg-red-500 text-white",
              warning.color === 'amber' && "bg-amber-500 text-black"
            )}>
              <warning.icon className="w-3 h-3" />
              {warning.text}
            </div>
          )}

          <button
            onClick={() => handleExpandedChange(true)}
            disabled={regState === 'neither'}
            className={cn(
              "w-full p-6 text-left transition-colors group",
              regState === 'neither'
                ? "cursor-not-allowed"
                : "hover:bg-muted/5"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center transition-colors",
                  regState === 'neither'
                    ? "bg-red-100"
                    : "bg-primary/10 group-hover:bg-primary/20"
                )}>
                  {regState === 'neither' ? (
                    <Lock className="w-7 h-7 text-red-500" />
                  ) : (
                    <Icon className="w-7 h-7 text-primary" />
                  )}
                </div>
                <div>
                  <h3 className={cn(
                    "text-xl font-bold",
                    regState === 'neither' ? "text-red-700" : "text-foreground"
                  )}>{component.name}</h3>
                  <p className={cn(
                    "mt-1",
                    regState === 'neither' ? "text-red-500" : "text-muted-foreground"
                  )}>
                    {regState === 'neither'
                      ? "No documentation, no validation, no monitoring"
                      : component.description}
                  </p>
                </div>
              </div>
              {regState !== 'neither' && (
                <ChevronDown className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
              )}
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
                  
                  <Tabs defaultValue={regState === 'aiActOnly' ? 'ai' : 'mdr'} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 mb-8">
                      <TabsTrigger
                        value="mdr"
                        disabled={regState === 'aiActOnly'}
                        className={cn(
                          "data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-600",
                          regState === 'aiActOnly' && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {regState === 'aiActOnly' ? '🔒 MDR (Disabled)' : 'MDR Requirements'}
                      </TabsTrigger>
                      <TabsTrigger
                        value="ai"
                        disabled={regState === 'mdrOnly'}
                        className={cn(
                          "data-[state=active]:bg-green-500/10 data-[state=active]:text-green-600",
                          regState === 'mdrOnly' && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {regState === 'mdrOnly' ? '🔒 AI Act (Disabled)' : 'AI Act Requirements'}
                      </TabsTrigger>
                      <TabsTrigger
                        value="overlap"
                        disabled={regState !== 'both'}
                        className={cn(
                          "data-[state=active]:bg-purple-500/10 data-[state=active]:text-purple-600",
                          regState !== 'both' && "opacity-40 cursor-not-allowed"
                        )}
                      >
                        {regState !== 'both' ? '🔒 Overlap (Requires Both)' : 'Overlap Zone'}
                      </TabsTrigger>
                    </TabsList>

                    {/* Warning banner for partial regulation */}
                    {regState !== 'both' && (
                      <div className={cn(
                        "mb-6 p-4 rounded-lg border flex items-center gap-3",
                        regState === 'mdrOnly' && "bg-amber-50 border-amber-300 text-amber-800",
                        regState === 'aiActOnly' && "bg-amber-50 border-amber-300 text-amber-800"
                      )}>
                        <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                        <div>
                          <p className="font-bold">
                            {regState === 'mdrOnly' && 'AI Act requirements not active'}
                            {regState === 'aiActOnly' && 'MDR requirements not active'}
                          </p>
                          <p className="text-sm">
                            {regState === 'mdrOnly' && 'Missing: Bias testing, drift monitoring, explainability, transparency requirements'}
                            {regState === 'aiActOnly' && 'Missing: Clinical validation, CE marking, post-market surveillance, IFU requirements'}
                          </p>
                        </div>
                      </div>
                    )}

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