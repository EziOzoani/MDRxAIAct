import { useState, useRef, useEffect, useCallback } from 'react';
import { HeroSection } from '@/components/sections/HeroSection';
import { NameInputSection } from '@/components/sections/NameInputSection';
import { PhotoCaptureSection } from '@/components/sections/PhotoCaptureSection';
import { ResultsSection } from '@/components/sections/ResultsSection';
import { UnderTheHoodSection } from '@/components/sections/UnderTheHoodSection';
import { PersistentBear } from '@/components/PersistentBear';

type Step = 'hero' | 'name' | 'photo' | 'results' | 'hood';

const Index = () => {
  const [currentStep, setCurrentStep] = useState<Step>('hero');
  const [userName, setUserName] = useState('');
  const [hideBear, setHideBear] = useState(false);

  const nameRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const hoodRef = useRef<HTMLDivElement>(null);

  // Track scroll position to update bear pose with throttling
  useEffect(() => {
    let ticking = false;
    let lastStep = currentStep;
    
    const updateStep = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      
      // Calculate which section is most visible
      const sections = [
        { ref: null, step: 'hero' as Step, top: 0 },
        { ref: nameRef.current, step: 'name' as Step },
        { ref: photoRef.current, step: 'photo' as Step },
        { ref: resultsRef.current, step: 'results' as Step },
        { ref: hoodRef.current, step: 'hood' as Step },
      ];

      let newStep = lastStep;
      
      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section.ref) {
          const rect = section.ref.getBoundingClientRect();
          if (rect.top < windowHeight * 0.5) {
            newStep = section.step;
            break;
          }
        } else if (i === 0 && scrollY < windowHeight * 0.5) {
          newStep = 'hero';
        }
      }
      
      if (newStep !== lastStep) {
        lastStep = newStep;
        setCurrentStep(newStep);
      }
      
      ticking = false;
    };
    
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(updateStep);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToRef = (ref: React.RefObject<HTMLDivElement>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleGetStarted = () => {
    setCurrentStep('name');
    setTimeout(() => scrollToRef(nameRef), 100);
  };

  const handleNameSubmit = (name: string) => {
    setUserName(name);
    setCurrentStep('photo');
    setTimeout(() => scrollToRef(photoRef), 100);
  };

  const handlePhotoContinue = () => {
    setCurrentStep('results');
    setTimeout(() => scrollToRef(resultsRef), 100);
  };

  const handleConfirm = () => {
    setCurrentStep('hood');
    setTimeout(() => scrollToRef(hoodRef), 100);
  };

  const handleDecline = () => {
    setCurrentStep('photo');
    scrollToRef(photoRef);
  };

  // Determine which sections to show based on progress
  const showName = currentStep !== 'hero' || userName !== '';
  const showPhoto = ['photo', 'results', 'hood'].includes(currentStep) || userName !== '';
  const showResults = ['results', 'hood'].includes(currentStep);
  const showHood = currentStep === 'hood';

  return (
    <main className="min-h-screen relative">
      {/* Persistent animated bear */}
      {!hideBear && <PersistentBear currentStep={currentStep} />}

      {/* Hero Section */}
      <HeroSection onGetStarted={handleGetStarted} />

      {/* Name Input Section */}
      {showName && (
        <div ref={nameRef}>
          <NameInputSection onSubmit={handleNameSubmit} />
        </div>
      )}

      {/* Photo Capture Section */}
      {showPhoto && userName && (
        <div ref={photoRef}>
          <PhotoCaptureSection userName={userName} onContinue={handlePhotoContinue} />
        </div>
      )}

      {/* Results Section */}
      {showResults && (
        <div ref={resultsRef}>
          <ResultsSection 
            userName={userName} 
            onConfirm={handleConfirm} 
            onDecline={handleDecline} 
          />
        </div>
      )}

      {/* Under the Hood Section */}
      {showHood && (
        <div ref={hoodRef}>
          <UnderTheHoodSection userName={userName} onCardExpandedChange={setHideBear} />
        </div>
      )}
    </main>
  );
};

export default Index;
