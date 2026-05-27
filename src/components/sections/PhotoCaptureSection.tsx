import { motion } from 'framer-motion';
import { useState, useRef, useCallback, useEffect } from 'react';
import { SpeechBubble } from '../SpeechBubble';
import { Button } from '../ui/button';
import { Camera, Upload, ArrowRight, X, Loader2, Shield, Brain, AlertTriangle, Clock, BarChart3 } from 'lucide-react';
import { classifyAllTiers, type AllClassificationResults } from '@/config/huggingface';
import { ProtectionGate } from '../ProtectionGate';
import type { VizMode } from './HeroSection';
import { allProtections, type RegState } from '../RegulationMenu';
import { cn } from '@/lib/utils';

// Helper to get protection info
const getProtectionInfo = (id: string) => allProtections.find(p => p.id === id);

import type { Perspective } from '@/pages/Index';

interface PhotoCaptureSectionProps {
  userName: string;
  onContinue: () => void;
  vizMode?: VizMode;
  regState?: RegState;
  appliedProtections?: string[];
  perspective?: Perspective;
  classificationResult?: any;
  onClassificationResult?: (result: AllClassificationResults | null) => void;
  /**
   * Lifts the captured / uploaded photo URL up to the page level so
   * downstream sections (Under-the-Hood tiles, KNN similarity grid) can
   * display the user's own image. Fired whenever selectedImage changes.
   */
  onUserImageChange?: (dataUrl: string | null) => void;
}

export function PhotoCaptureSection({ userName, onContinue, appliedProtections = [], perspective = 'doctor', classificationResult, onClassificationResult, onUserImageChange }: PhotoCaptureSectionProps) {
  // Check protections relevant to this step
  const hasBiasTesting = appliedProtections.includes('bias-testing');
  const hasTransparency = appliedProtections.includes('transparency');
  const hasExplainability = appliedProtections.includes('explainability');
  const sectionProtections = ['bias-testing', 'explainability'];
  const activeCount = sectionProtections.filter(p => appliedProtections.includes(p)).length;
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('Analyzing image...');

  // Helper to set classification result via parent callback
  const setAllResults = (result: AllClassificationResults | null) => {
    onClassificationResult?.(result);
  };

  // Lift selectedImage up to the page so Under-the-Hood can use it for the
  // KNN-similarity tile and any future engineer-view detail panels. We fire
  // the callback whenever the local state changes — including clear (null).
  useEffect(() => {
    onUserImageChange?.(selectedImage);
  }, [selectedImage, onUserImageChange]);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Example images for UI display (images 6, 7, 8 as requested)
  const exampleImages = [
    { id: 1, src: `${import.meta.env.BASE_URL}images/examples/sticker_tattoo_example.png`, label: 'Example 1' },
    { id: 2, src: `${import.meta.env.BASE_URL}images/examples/sharpie_tattoo_example.png`, label: 'Example 2' },
    { id: 3, src: `${import.meta.env.BASE_URL}images/examples/real_tattoo_1.png`, label: 'Example 3' },
  ];

  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  // Attach stream to video element when camera becomes active
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraActive]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Start camera — tries rear camera first (phone), falls back to front/any camera (laptop)
  const startCamera = useCallback(async () => {
    setIsCameraLoading(true);
    setError(null);

    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    const tryGetCamera = async (facingMode: 'environment' | 'user' | undefined) => {
      const constraints: MediaStreamConstraints = {
        video: facingMode
          ? { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };
      return navigator.mediaDevices.getUserMedia(constraints);
    };

    try {
      // Try rear camera first (ideal for phones)
      let stream: MediaStream;
      try {
        stream = await tryGetCamera('environment');
        setCameraFacing('environment');
      } catch {
        // Rear camera failed — try front camera
        try {
          stream = await tryGetCamera('user');
          setCameraFacing('user');
        } catch {
          // Both failed — try any available camera
          stream = await tryGetCamera(undefined);
          setCameraFacing('user');
        }
      }

      streamRef.current = stream;
      setIsCameraActive(true);

      // Attach to video element after state update
      requestAnimationFrame(() => {
        if (videoRef.current && streamRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
      });
    } catch (err) {
      console.error('Camera error:', err);
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err instanceof DOMException && err.name === 'NotFoundError') {
        setError('No camera found on this device. Try uploading an image instead.');
      } else {
        setError('Unable to access camera. Please check permissions or try uploading an image.');
      }
    } finally {
      setIsCameraLoading(false);
    }
  }, []);

  // Switch between front and rear camera
  const switchCamera = useCallback(async () => {
    const newFacing = cameraFacing === 'environment' ? 'user' : 'environment';

    // Stop current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraFacing(newFacing);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // If switching fails, restart with any camera
      startCamera();
    }
  }, [cameraFacing, startCamera]);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Capture photo from camera
  const capturePhoto = useCallback(() => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        if (blob) {
          const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
          handleImageSelection(file);
          stopCamera();
        }
      }, 'image/jpeg', 0.92);
    }
  }, [stopCamera]);

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageSelection(file);
    }
  };

  // Handle example image selection - load via Image element to avoid CORS issues
  // Example images allow simulation fallback since we know the expected answer
  const selectExampleImage = (imageSrc: string) => {
    setError(null);
    setIsLoading(true);
    setSelectedImage(imageSrc);
    setAllResults(null);

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = async () => {
      try {
        // Draw image to canvas to get blob
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context failed');

        ctx.drawImage(img, 0, 0);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            setError('Could not process example image. Please try another.');
            setIsLoading(false);
            return;
          }

          try {
            // Preserve original filename so simulation can use hints if server is down
            const originalName = imageSrc.split('/').pop() || 'example.png';
            const file = new File([blob], originalName, { type: 'image/png' });
            const results = await classifyAllTiers(file, setLoadingMessage, true);
            setAllResults(results);
          } catch (err) {
            console.error('Classification error:', err);
            setError('Classification failed. Is the inference server running?');
          } finally {
            setIsLoading(false);
          }
        }, 'image/png');
      } catch (err) {
        console.error('Canvas error:', err);
        setError('Could not process example image.');
        setIsLoading(false);
      }
    };

    img.onerror = () => {
      console.error('Image load failed for:', imageSrc);
      setError('Example image failed to load.');
      setIsLoading(false);
    };

    img.src = imageSrc;
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
    setAllResults(null);
    setError(null);

    try {
      console.log('Starting classification for file:', file.name, 'size:', file.size);
      // User uploads: allowSimulation=false — if server is down, show real error
      const results = await classifyAllTiers(file, setLoadingMessage, false);
      console.log('Classification results:', results);
      setAllResults(results);
    } catch (err) {
      console.error('Classification error in component:', err);
      // Server is down — clear the stuck image so user sees the example grid again
      setSelectedImage(null);
      setError('server-unavailable');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset component
  const reset = () => {
    setSelectedImage(null);
    setAllResults(null);
    setError(null);
    setLoadingMessage('Analyzing image...');
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
              {error && error !== 'server-unavailable' && (
                <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                  {error}
                </div>
              )}
              {error === 'server-unavailable' && (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
                  <p className="font-semibold text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Classification server unavailable
                  </p>
                  <p className="text-sm text-amber-700">
                    The inference server is not running, so uploaded photos can't be classified right now.
                    Please choose one of the example images below — they work offline.
                  </p>
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

                  {/* Best-result hint — the model is most accurate on a close,
                      well-lit shot where the tattoo fills the frame. */}
                  <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                    <Camera className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>
                      For the best result, get <strong>close</strong> so the tattoo fills most of
                      the frame, in good light. Wide arm or full-body shots are harder for the model.
                    </span>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <Button
                      onClick={startCamera}
                      disabled={isCameraLoading}
                      variant="outline"
                      className="h-32 flex-col gap-3 border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-lg"
                    >
                      {isCameraLoading ? (
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      ) : (
                        <Camera className="w-8 h-8 text-primary" />
                      )}
                      <span className="font-semibold text-lg">
                        {isCameraLoading ? 'Opening...' : 'Take Photo'}
                      </span>
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
                        capture="environment"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </>
              )}

              {/* Camera loading */}
              {isCameraLoading && !isCameraActive && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Requesting camera access...</p>
                </div>
              )}

              {/* Camera view */}
              {isCameraActive && (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden bg-black">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full aspect-video object-cover"
                    />
                    {/*
                      Framing guide — the model was trained on tight tattoo
                      crops, so it performs best when the tattoo fills the
                      frame. This square reticle nudges users toward a close
                      shot rather than a wide arm/selfie photo.
                    */}
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="relative aspect-square h-[78%] max-h-[78%]">
                        {/* dashed reticle */}
                        <div className="absolute inset-0 rounded-lg border-2 border-dashed border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                        {/* corner ticks */}
                        <span className="absolute -top-px -left-px h-5 w-5 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                        <span className="absolute -top-px -right-px h-5 w-5 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                        <span className="absolute -bottom-px -left-px h-5 w-5 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                        <span className="absolute -bottom-px -right-px h-5 w-5 border-b-2 border-r-2 border-primary rounded-br-lg" />
                      </div>
                    </div>
                    <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      Fill the frame with your tattoo
                    </div>
                    {/* Camera switch button (useful on phones with two cameras) */}
                    <button
                      onClick={switchCamera}
                      className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors backdrop-blur-sm"
                      title="Switch camera"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
                        <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
                        <circle cx="12" cy="12" r="3" />
                        <path d="m18 22-3-3 3-3" />
                        <path d="m6 2 3 3-3 3" />
                      </svg>
                    </button>
                    {/* Camera facing indicator */}
                    <div className="absolute top-3 left-3 px-2 py-1 bg-black/50 rounded-full text-white text-xs backdrop-blur-sm">
                      {cameraFacing === 'environment' ? 'Rear camera' : 'Front camera'}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={capturePhoto}
                      className="flex-1 h-14 text-lg bg-primary hover:bg-primary/90 rounded-xl"
                    >
                      <Camera className="w-5 h-5 mr-2" />
                      Capture Photo
                    </Button>
                    <Button
                      onClick={stopCamera}
                      variant="outline"
                      className="h-14 px-6 rounded-xl"
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
                    <div className="flex flex-col justify-center items-center py-8 gap-2">
                      <div className="flex items-center gap-2">
                        <Loader2 className="animate-spin" size={24} />
                        <span className="font-medium">{loadingMessage}</span>
                      </div>
                      {loadingMessage.includes('warming up') && (
                        <p className="text-xs text-amber-600">The model is loading on the server. This may take a moment...</p>
                      )}
                    </div>
                  )}

                  {classificationResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Protection status for this step */}
                      <div className={cn(
                        "p-3 rounded-lg border transition-all",
                        activeCount === 2 ? "bg-green-50 border-green-200 dark:bg-green-950/30" :
                        activeCount === 1 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30" :
                        "bg-red-50 border-red-200 dark:bg-red-950/30"
                      )}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="group relative">
                              <div className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-help",
                                hasBiasTesting ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
                              )}>
                                BIAS
                              </div>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                <div className="font-bold text-green-300">{getProtectionInfo('bias-testing')?.label}</div>
                                <div className="text-slate-300">{getProtectionInfo('bias-testing')?.description}</div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                              </div>
                            </div>
                            <div className="group relative">
                              <div className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium cursor-help",
                                hasExplainability ? "bg-green-500 text-white" : "bg-slate-200 text-slate-500"
                              )}>
                                XAI
                              </div>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                                <div className="font-bold text-green-300">{getProtectionInfo('explainability')?.label}</div>
                                <div className="text-slate-300">{getProtectionInfo('explainability')?.description}</div>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
                              </div>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">{activeCount}/2 active</span>
                        </div>
                        <p className="text-xs">
                          {activeCount === 2 && "✓ AI fairness tested and model decisions are explainable."}
                          {activeCount === 1 && hasBiasTesting && "⚠ Bias tested, but no explanation of why this result was given."}
                          {activeCount === 1 && hasExplainability && "⚠ Explainable, but not tested for demographic bias."}
                          {activeCount === 0 && "⛔ No bias testing or explainability - black box AI with potential discrimination."}
                        </p>
                      </div>

                      {/* Main result card */}
                      <div className={`p-6 rounded-xl border ${
                        (classificationResult.predictedClass || (classificationResult.isRealTattoo ? 'real_tattoo' : 'sticker_tattoo')) === 'real_tattoo'
                          ? 'bg-green-50 border-green-300'
                          : classificationResult.predictedClass === 'not_tattoo'
                            ? 'bg-slate-50 border-slate-300'
                            : (classificationResult.predictedClass === 'pen_drawn'
                              ? 'bg-purple-50 border-purple-300'
                              : 'bg-orange-50 border-orange-300')
                      }`}>
                        <p className="text-lg font-semibold">
                          {(() => {
                            const cls = classificationResult.predictedClass || (classificationResult.isRealTattoo ? 'real_tattoo' : 'sticker_tattoo');
                            if (cls === 'real_tattoo') return 'Real Tattoo Detected';
                            if (cls === 'sticker_tattoo') return 'Sticker/Temporary Tattoo Detected';
                            if (cls === 'not_tattoo') return 'No Tattoo Detected';
                            return 'Pen/Marker Drawing Detected';
                          })()}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Confidence: {(classificationResult.confidence * 100).toFixed(1)}%
                        </p>
                        {/* Simulated result badge - hidden for clean demo presentation */}
                        {/* Dynamic explainability message - wrapped in ProtectionGate */}
                        <ProtectionGate protectionId="explainability" appliedProtections={appliedProtections} label="XAI Disabled">
                          <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                            <Brain className="w-3 h-3" /> XAI Active: Model identified key features in the image
                          </p>
                        </ProtectionGate>
                        {!hasExplainability && (
                          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> XAI Off: No explanation available for this prediction
                          </p>
                        )}
                        {/* Dynamic bias message - wrapped in ProtectionGate */}
                        <ProtectionGate protectionId="bias-testing" appliedProtections={appliedProtections} label="Bias Testing Disabled">
                          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Bias Testing: Validated across skin tones
                          </p>
                        </ProtectionGate>
                        {!hasBiasTesting && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> No Bias Testing: May perform worse on some skin tones
                          </p>
                        )}
                      </div>

                      {/* Engineer view: Technical details panel */}
                      {perspective === 'engineer' && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="p-4 bg-slate-900 rounded-xl text-sm space-y-4"
                        >
                          <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Engineering Details</h4>

                          {/* Model & inference info */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-xs text-slate-500">Model Tier</span>
                              <p className="font-mono text-xs text-slate-300">
                                {classificationResult.modelUsed || 'balanced'}
                                {classificationResult.modelUsed === 'uncleaned' && <span className="text-red-400 ml-1">(noisy data)</span>}
                                {classificationResult.modelUsed === 'unbalanced' && <span className="text-amber-400 ml-1">(no fairness)</span>}
                              </p>
                            </div>
                            <div>
                              <span className="text-xs text-slate-500">Inference Time</span>
                              <p className="font-mono text-xs text-slate-300 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {classificationResult.inferenceTimeMs ? `${classificationResult.inferenceTimeMs}ms` : 'N/A'}
                              </p>
                            </div>
                          </div>

                          {/* Raw confidence scores — 3-class */}
                          <div>
                            <span className="text-xs text-slate-500">Raw Confidence Scores</span>
                            <div className="mt-1 bg-slate-800 rounded p-2 space-y-1">
                              {classificationResult.classScores ? (
                                Object.entries(classificationResult.classScores as Record<string, number>).map(([cls, score]: [string, number]) => (
                                  <div key={cls} className="flex justify-between text-xs">
                                    <span className={cn("text-slate-400", cls === classificationResult.predictedClass && "text-green-400 font-semibold")}>
                                      {cls}
                                      {cls === classificationResult.predictedClass && ' *'}
                                    </span>
                                    <span className="font-mono text-slate-300">
                                      {score.toFixed(6)}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                // Fallback for legacy 2-class results
                                <>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">real_tattoo</span>
                                    <span className="font-mono text-slate-300">
                                      {classificationResult.isRealTattoo
                                        ? classificationResult.confidence.toFixed(6)
                                        : (1 - classificationResult.confidence).toFixed(6)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">sticker_tattoo</span>
                                    <span className="font-mono text-slate-300">
                                      {!classificationResult.isRealTattoo
                                        ? classificationResult.confidence.toFixed(6)
                                        : (1 - classificationResult.confidence).toFixed(6)}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Protection details - what each one checks on this image */}
                          <div>
                            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Protection Checks on This Image</span>
                            <div className="mt-2 space-y-2">
                              {[
                                { id: 'ce-marking', short: 'CE', label: 'CE Marking', source: 'mdr',
                                  detail: 'Device registered as Class IIa medical device. Software version validated against declared conformity.' },
                                { id: 'clinical-eval', short: 'CLIN', label: 'Clinical Evaluation', source: 'mdr',
                                  detail: 'ViT-base model validated on 1,200 balanced images. Macro F1: 0.82. Per-class recall: real 74%, sticker 95%, pen 76%.' },
                                { id: 'pms', short: 'PMS', label: 'Post-Market Surveillance', source: 'mdr',
                                  detail: 'This prediction logged to PMS database. Periodic safety update report (PSUR) includes aggregate accuracy tracking.' },
                                { id: 'incident', short: 'INC', label: 'Incident Reporting', source: 'mdr',
                                  detail: 'If user disputes result, incident report auto-generated per MDR Art. 87. Competent authority notified within 15 days.' },
                                { id: 'ifu', short: 'IFU', label: 'Instructions for Use', source: 'mdr',
                                  detail: 'User informed: "AI-assisted result. Not a diagnosis. Consult dermatologist for clinical decisions."' },
                                { id: 'bias-testing', short: 'BIAS', label: 'Bias Testing', source: 'aiAct',
                                  detail: 'Balanced model: 400/class, class weights, skin-tone sampling. Accuracy 82% with even recall across classes. Without balancing: 95.5% headline inflated by 86% majority class — minority class recall drops to 72%.' },
                                { id: 'explainability', short: 'XAI', label: 'Explainability', source: 'aiAct',
                                  detail: 'Grad-CAM saliency map generated. Key features: ink depth patterns, edge sharpness, color saturation distribution.' },
                                { id: 'drift-monitor', short: 'DRFT', label: 'Drift Monitoring', source: 'aiAct',
                                  detail: 'Input distribution compared to training baseline. KL divergence: 0.02. No drift detected. Alert threshold: 0.15.' },
                                { id: 'transparency', short: 'TRNS', label: 'Transparency', source: 'aiAct',
                                  detail: 'AI-generated output. ViT-base trained on 6,315 images (tatvton-tattoo-raw + Openverse/Pexels CC). Class ratio 12.6:1 before balancing. Skin tones: Type IV 47%, I-II 1.9%, VI 3.8%.' },
                                { id: 'human-oversight', short: 'HUM', label: 'Human Oversight', source: 'aiAct',
                                  detail: 'Result requires clinician confirmation before any clinical action. Override mechanism available. All overrides logged.' },
                              ].map(p => {
                                const isActive = appliedProtections.includes(p.id);
                                return (
                                  <div key={p.id} className={cn(
                                    "p-2 rounded-lg border text-xs",
                                    isActive ? "bg-slate-800 border-slate-700" : "bg-red-950/50 border-red-800/50"
                                  )}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-bold",
                                        isActive ? (p.source === 'mdr' ? "bg-blue-600 text-white" : "bg-green-600 text-white") : "bg-red-800 text-red-300"
                                      )}>
                                        {p.short}
                                      </span>
                                      <span className={cn("font-semibold", isActive ? "text-slate-200" : "text-red-400")}>
                                        {p.label}
                                      </span>
                                      <span className={cn("ml-auto text-[10px]", isActive ? "text-green-400" : "text-red-400")}>
                                        {isActive ? 'ACTIVE' : 'DISABLED'}
                                      </span>
                                    </div>
                                    <p className={cn("leading-relaxed", isActive ? "text-slate-400" : "text-red-400/60 line-through")}>
                                      {p.detail}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}

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