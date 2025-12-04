import { motion } from 'framer-motion';
import { useState, useRef, useCallback } from 'react';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { Camera, Upload, ArrowRight, X, Loader2 } from 'lucide-react';
import { classifyTattoo } from '@/config/huggingface';

interface PhotoCaptureSectionProps {
  userName: string;
  onContinue: () => void;
}

export function PhotoCaptureSection({ userName, onContinue }: PhotoCaptureSectionProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [classificationResult, setClassificationResult] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Example images for UI display (images 6, 7, 8 as requested)
  const exampleImages = [
    { id: 1, src: `${import.meta.env.BASE_URL}images/examples/fake_tattoo_example.png`, label: 'Example 1' },
    { id: 2, src: `${import.meta.env.BASE_URL}images/examples/sharpie_tattoo_example.png`, label: 'Example 2' },
    { id: 3, src: `${import.meta.env.BASE_URL}images/examples/real_tattoo_1.png`, label: 'Example 3' },
  ];

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      streamRef.current = stream;
      setIsCameraActive(true);
      setError(null);
      
      // Wait for state update then set video source
      setTimeout(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      }, 100);
    } catch (err) {
      setError('Unable to access camera. Please check permissions.');
      console.error('Camera error:', err);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  };

  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(videoRef.current, 0, 0);
      
      canvas.toBlob(blob => {
        if (blob) {
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
          handleImageSelection(file);
          stopCamera();
        }
      }, 'image/jpeg');
    }
  };

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageSelection(file);
    }
  };

  // Handle example image selection
  const selectExampleImage = async (imageSrc: string) => {
    try {
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const file = new File([blob], 'example-image.jpg', { type: 'image/jpeg' });
      handleImageSelection(file);
    } catch (err) {
      setError('Failed to load example image');
    }
  };

  const handleImageSelection = (file: File) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
      classifyImage(file);
    };
    
    reader.readAsDataURL(file);
  };

  const classifyImage = async (file: File) => {
    setIsLoading(true);
    setClassificationResult(null);
    setError(null);

    try {
      console.log('Starting classification for file:', file.name, 'size:', file.size);
      const result = await classifyTattoo(file);
      console.log('Classification result:', result);
      setClassificationResult(result);
    } catch (err) {
      console.error('Classification error in component:', err);
      setError('Classification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset component
  const reset = () => {
    setSelectedImage(null);
    setClassificationResult(null);
    setError(null);
    stopCamera();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
                left: '22%',
                top: '25%',
                transform: 'translateY(-50%)'
              }}
            >
              <SpeechBubble direction="left">
                <p className="text-lg md:text-xl font-semibold text-foreground">
                  Nice to meet you, <span className="text-primary">{userName}</span>! 📸
                </p>
                <p className="text-muted-foreground mt-2">
                  Take a photo of your arm with a fake or real tattoo. 
                  Our AI will analyze whether it's a real tattoo or a sticker.
                </p>
              </SpeechBubble>
            </motion.div>

            {/* Main content area */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              viewport={{ once: true }}
              className="glass-card p-8 space-y-6 lg:ml-auto"
              style={{ marginLeft: '50%', width: '50%' }}
            >
              {/* Error display */}
              {error && (
                <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                  {error}
                </div>
              )}

              {!selectedImage && !isCameraActive && (
                <>
                  {/* Example images */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Try an example:</h3>
                    <div className="grid grid-cols-3 gap-3">
                      {exampleImages.map((example) => (
                        <button
                          key={example.id}
                          onClick={() => selectExampleImage(example.src)}
                          className="relative group overflow-hidden rounded-lg border-2 border-gray-300 hover:border-primary transition-all hover:scale-105"
                        >
                          <img 
                            src={example.src}
                            alt={example.label}
                            className="w-full h-24 object-cover"
                            onError={(e) => {
                              e.currentTarget.src = `${import.meta.env.BASE_URL}placeholder.svg`;
                            }}
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity flex items-center justify-center">
                            <span className="text-white text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 px-2 py-1 rounded">
                              {example.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-300" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-2 bg-white text-gray-500">OR</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <Button
                      onClick={startCamera}
                      variant="outline"
                      className="h-32 flex-col gap-3 border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-lg"
                    >
                      <Camera className="w-8 h-8 text-primary" />
                      <span className="font-semibold text-lg">Take Photo</span>
                    </Button>
                    <label>
                      <Button
                        variant="outline"
                        className="h-32 w-full flex-col gap-3 border-2 border-dashed border-accent/30 hover:border-accent hover:bg-accent/5 rounded-xl transition-all text-lg cursor-pointer"
                        asChild
                      >
                        <span>
                          <Upload className="w-8 h-8 text-accent" />
                          <span className="font-semibold text-lg">Upload Image</span>
                        </span>
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </>
              )}

              {/* Camera view */}
              {isCameraActive && (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full aspect-video object-cover"
                    />
                  </div>
                  <div className="flex gap-4">
                    <Button
                      onClick={capturePhoto}
                      className="flex-1 bg-primary hover:bg-primary/90"
                    >
                      Capture Photo
                    </Button>
                    <Button
                      onClick={stopCamera}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Selected image and results */}
              {selectedImage && (
                <div className="space-y-4">
                  <div className="relative">
                    <img
                      src={selectedImage}
                      alt="Selected"
                      className="w-full rounded-lg"
                    />
                    {!isLoading && !classificationResult && (
                      <button
                        onClick={reset}
                        className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-lg hover:bg-gray-100"
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>

                  {isLoading && (
                    <div className="flex justify-center items-center py-8">
                      <Loader2 className="animate-spin mr-2" size={24} />
                      <span>Analyzing image...</span>
                    </div>
                  )}

                  {classificationResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      <div className={`p-6 rounded-xl border ${
                        classificationResult.isRealTattoo 
                          ? 'bg-green-50 border-green-300' 
                          : 'bg-orange-50 border-orange-300'
                      }`}>
                        <p className="text-lg font-semibold">
                          {classificationResult.isRealTattoo ? '✓ Real Tattoo Detected' : '✓ Fake/Sticker Tattoo Detected'}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Confidence: {(classificationResult.confidence * 100).toFixed(1)}%
                        </p>
                        {classificationResult.rawResult?.simulated && (
                          <p className="text-xs text-gray-500 mt-2">
                            (Simulation mode - Model temporarily unavailable)
                          </p>
                        )}
                      </div>
                      <Button
                        onClick={onContinue}
                        className="w-full h-20 text-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-soft hover:shadow-medium transition-all duration-300"
                      >
                        Continue to Analysis
                        <ArrowRight className="ml-2 w-5 h-5" />
                      </Button>
                      <Button
                        onClick={reset}
                        variant="outline"
                        className="w-full"
                      >
                        Try Another Image
                      </Button>
                    </motion.div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}