import { motion } from 'framer-motion';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { Check, X, AlertCircle } from 'lucide-react';

interface ResultsSectionProps {
  userName: string;
  onConfirm: () => void;
  onDecline: () => void;
}

export function ResultsSection({ userName, onConfirm, onDecline }: ResultsSectionProps) {
  const results = {
    tattooDetected: true,
    confidence: 94.7,
    skinLesionRisk: 'low',
    recommendations: [
      'No concerning skin lesions detected in the analyzed area',
      'Tattoo ink appears healthy with no signs of allergic reaction',
      'Consider regular skin checks for tattooed areas'
    ]
  };

  return (
    <section className="min-h-screen bg-background relative flex items-center overflow-hidden py-16">
      {/* Background decoration */}
      <div className="absolute inset-0">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
          {/* Results content */}
          <div className="flex-1 space-y-6 relative">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              viewport={{ once: true }}
              className="inline-block px-3 py-1 bg-accent/10 rounded-full text-accent text-sm font-semibold"
            >
              Step 3 of 4
            </motion.div>

            {/* Speech bubble positioned at 1/4 height, moved to the right */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              viewport={{ once: true }}
              className="lg:max-w-[320px] absolute"
              style={{ 
                left: '22%', // Moved right from bear's position
                top: '25%', // 1/4 from top
                transform: 'translateY(-50%)'
              }}
            >
              <SpeechBubble direction="left">
                <p className="text-lg font-semibold text-foreground">
                  Here are your results, {userName}! 📋
                </p>
                <p className="text-muted-foreground mt-1">
                  Please review the AI analysis and confirm if you agree with the findings.
                </p>
              </SpeechBubble>
            </motion.div>

            {/* Results card - half screen on the right */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              viewport={{ once: true }}
              className="glass-card overflow-hidden lg:ml-auto"
              style={{ marginLeft: '50%', width: '50%' }}
            >
              {/* Header */}
              <div className="p-8 bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border">
                <h3 className="text-2xl font-bold text-foreground">Detection Results</h3>
                <p className="text-lg text-muted-foreground">AI Model Analysis Report</p>
              </div>

              {/* Results grid */}
              <div className="p-8 space-y-8">
                {/* Main metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="p-6 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                        <Check className="w-7 h-7 text-primary" />
                      </div>
                      <div>
                        <p className="text-lg text-muted-foreground">Tattoo Detected</p>
                        <p className="text-2xl font-bold text-foreground">Yes</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-primary/5 rounded-xl border border-primary/20">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-bold text-lg">{results.confidence}%</span>
                      </div>
                      <div>
                        <p className="text-lg text-muted-foreground">Confidence</p>
                        <p className="text-2xl font-bold text-foreground">High</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Risk assessment */}
                <div className="p-6 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                      <Check className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-xl font-semibold text-green-800 dark:text-green-200">Low Risk Assessment</p>
                      <p className="text-lg text-green-600 dark:text-green-400 mt-1">
                        No concerning skin lesions detected in the analyzed area.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Recommendations */}
                <div>
                  <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    Recommendations
                  </h4>
                  <ul className="space-y-2">
                    {results.recommendations.map((rec, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-border">
                  <Button
                    onClick={onConfirm}
                    className="flex-1 h-16 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-soft hover:shadow-medium transition-all duration-300"
                  >
                    <Check className="mr-2 w-5 h-5" />
                    Confirm Results
                  </Button>
                  <Button
                    onClick={onDecline}
                    variant="outline"
                    className="flex-1 h-16 text-lg font-bold border-2 border-destructive/30 text-destructive hover:bg-destructive/5 rounded-xl transition-all duration-300"
                  >
                    <X className="mr-2 w-5 h-5" />
                    Decline / Retake
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
