import { motion } from 'framer-motion';
import { useState } from 'react';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { Camera, Upload, ArrowRight } from 'lucide-react';

interface PhotoCaptureSectionProps {
  userName: string;
  onContinue: () => void;
}

export function PhotoCaptureSection({ userName, onContinue }: PhotoCaptureSectionProps) {
  const [hasPhoto, setHasPhoto] = useState(false);

  const handlePhotoCapture = () => {
    setHasPhoto(true);
  };

  return (
    <section className="min-h-screen bg-secondary/30 relative flex items-center overflow-hidden">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-1/4 -left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 py-16 relative z-10">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
          {/* Content with speech bubble positioned near bear */}
          <div className="flex-1 space-y-6 relative">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              viewport={{ once: true }}
              className="inline-block px-3 py-1 bg-accent/10 rounded-full text-accent text-sm font-semibold"
            >
              Step 2 of 4
            </motion.div>

            {/* Speech bubble positioned at 1/4 height, moved to the right */}
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              viewport={{ once: true }}
              className="lg:max-w-[360px] absolute"
              style={{ 
                left: '22%', // Moved right from bear's position
                top: '25%', // 1/4 from top
                transform: 'translateY(-50%)'
              }}
            >
              <SpeechBubble direction="left">
                <p className="text-lg md:text-xl font-semibold text-foreground">
                  Nice to meet you, <span className="text-primary">{userName}</span>! 📸
                </p>
                <p className="text-muted-foreground mt-2">
                  Take a photo of your arm with a fake or real tattoo. 
                  Our AI will analyze the image for skin lesions and tattoo detection.
                </p>
              </SpeechBubble>
            </motion.div>

            {/* Action buttons - half screen on the right */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              viewport={{ once: true }}
              className="glass-card p-8 space-y-6 lg:ml-auto"
              style={{ marginLeft: '50%', width: '50%' }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Button
                  onClick={handlePhotoCapture}
                  variant="outline"
                  className="h-32 flex-col gap-3 border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-lg"
                >
                  <Camera className="w-8 h-8 text-primary" />
                  <span className="font-semibold text-lg">Take Photo</span>
                </Button>
                <Button
                  onClick={handlePhotoCapture}
                  variant="outline"
                  className="h-32 flex-col gap-3 border-2 border-dashed border-accent/30 hover:border-accent hover:bg-accent/5 rounded-xl transition-all text-lg"
                >
                  <Upload className="w-8 h-8 text-accent" />
                  <span className="font-semibold text-lg">Upload Image</span>
                </Button>
              </div>

              {hasPhoto && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4"
                >
                  <div className="p-6 bg-primary/10 rounded-xl border border-primary/20">
                    <p className="text-lg text-primary font-medium">
                      ✓ Photo captured successfully!
                    </p>
                  </div>
                  <Button
                    onClick={onContinue}
                    className="w-full h-20 text-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-soft hover:shadow-medium transition-all duration-300"
                  >
                    Analyze Image
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Button>
                </motion.div>
              )}
            </motion.div>

          </div>
        </div>
      </div>
    </section>
  );
}
