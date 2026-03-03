/**
 * Purpose:
 *   Main page orchestrating the 6-step demo flow. Manages scroll tracking,
 *   regulation state, and wires all sections together.
 *   Main view is always Doctor perspective; PiP overlay shows Engineer perspective.
 *
 * Used by:
 *   - App.tsx router
 */

import { useState, useRef, useEffect } from 'react';
import { HeroSection } from '@/components/sections/HeroSection';
import { NameInputSection } from '@/components/sections/NameInputSection';
import { PhotoCaptureSection } from '@/components/sections/PhotoCaptureSection';
import { MDRExplanationSection } from '@/components/sections/MDRExplanationSection';
import { ResultsSection } from '@/components/sections/ResultsSection';
import { UnderTheHoodSection } from '@/components/sections/UnderTheHoodSection';
import { PersistentBear } from '@/components/PersistentBear';
import { allProtections, type RegState } from '@/components/RegulationMenu';
import { RiskThermometer } from '@/components/RiskThermometer';
import { PiPWindow } from '@/components/PiPWindow';
import { selectActiveResult, type AllClassificationResults } from '@/config/huggingface';

type Step = 'hero' | 'mdr' | 'name' | 'photo' | 'results' | 'hood';
export type Perspective = 'doctor' | 'engineer';

const Index = () => {
  const [currentStep, setCurrentStep] = useState<Step>('hero');
  const [userName, setUserName] = useState('');
  const [hideBear, setHideBear] = useState(false);

  // Main view is always doctor; PiP shows engineer (the opposite)
  const perspective: Perspective = 'doctor';

  // Regulation state
  const [regState, setRegState] = useState<RegState>('both');
  const [appliedProtections, setAppliedProtections] = useState<string[]>(
    allProtections.map(p => p.id),
  );

  // All 3 model results (run in parallel at classification time)
  const [allResults, setAllResults] = useState<AllClassificationResults | null>(null);

  // Derive active result reactively from current protection toggles — no re-classification needed
  const classificationResult = allResults
    ? selectActiveResult(allResults, appliedProtections)
    : null;

  const handleProtectionToggle = (protectionId: string) => {
    setAppliedProtections(prev =>
      prev.includes(protectionId)
        ? prev.filter(id => id !== protectionId)
        : [...prev, protectionId],
    );
  };

  // When regState changes, remove protections whose regulation is now off
  useEffect(() => {
    const mdrEnabled = regState === 'both' || regState === 'mdrOnly';
    const aiActEnabled = regState === 'both' || regState === 'aiActOnly';

    setAppliedProtections(prev =>
      prev.filter(id => {
        const protection = allProtections.find(p => p.id === id);
        if (!protection) return false;
        if (protection.source === 'mdr' && !mdrEnabled) return false;
        if (protection.source === 'aiAct' && !aiActEnabled) return false;
        return true;
      }),
    );
  }, [regState]);

  const mdrRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const hoodRef = useRef<HTMLDivElement>(null);

  // Scroll-based step tracking
  useEffect(() => {
    let ticking = false;
    let lastStep = currentStep;

    const updateStep = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;

      const sections = [
        { ref: null, step: 'hero' as Step },
        { ref: mdrRef.current, step: 'mdr' as Step },
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
    setCurrentStep('mdr');
    setTimeout(() => scrollToRef(mdrRef), 100);
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

  const handleMDRContinue = () => {
    setCurrentStep('name');
    setTimeout(() => scrollToRef(nameRef), 100);
  };

  const handleConfirm = () => {
    setCurrentStep('hood');
    setTimeout(() => scrollToRef(hoodRef), 100);
  };

  const handleDecline = () => {
    setCurrentStep('photo');
    scrollToRef(photoRef);
  };

  // Section visibility based on progress
  const showMDR = currentStep !== 'hero';
  const showName = ['name', 'photo', 'results', 'hood'].includes(currentStep) || userName !== '';
  const showPhoto = ['photo', 'results', 'hood'].includes(currentStep) || userName !== '';
  const showResults = ['results', 'hood'].includes(currentStep);
  const showHood = currentStep === 'hood';

  return (
    <main className="min-h-screen relative">
      {/* Risk Thermometer with integrated shield toggles (left side) */}
      <RiskThermometer
        currentStep={currentStep}
        regState={regState}
        appliedProtections={appliedProtections}
        onRegStateChange={setRegState}
        onProtectionToggle={handleProtectionToggle}
      />

      {/* Picture-in-Picture Window (Engineer View) — visible from MDR step onwards */}
      {showMDR && (
        <PiPWindow
          perspective={perspective}
          currentStep={currentStep}
          classificationResult={classificationResult}
          appliedProtections={appliedProtections}
          regState={regState}
        />
      )}

      {/* Persistent animated bear */}
      {!hideBear && <PersistentBear currentStep={currentStep} />}

      {/* Hero Section */}
      <HeroSection
        onGetStarted={handleGetStarted}
        vizMode="thermometer"
        onVizModeChange={() => {}}
      />

      {/* MDR Explanation Section */}
      {showMDR && (
        <div ref={mdrRef}>
          <MDRExplanationSection
            onContinue={handleMDRContinue}
            vizMode="thermometer"
            regState={regState}
            appliedProtections={appliedProtections}
          />
        </div>
      )}

      {/* Name Input Section */}
      {showName && (
        <div ref={nameRef}>
          <NameInputSection onSubmit={handleNameSubmit} regState={regState} appliedProtections={appliedProtections} />
        </div>
      )}

      {/* Photo Capture Section */}
      {showPhoto && userName && (
        <div ref={photoRef}>
          <PhotoCaptureSection
            userName={userName}
            onContinue={handlePhotoContinue}
            vizMode="thermometer"
            regState={regState}
            appliedProtections={appliedProtections}
            perspective={perspective}
            classificationResult={classificationResult}
            onClassificationResult={setAllResults}
          />
        </div>
      )}

      {/* Results Section */}
      {showResults && (
        <div ref={resultsRef}>
          <ResultsSection
            userName={userName}
            onConfirm={handleConfirm}
            onDecline={handleDecline}
            regState={regState}
            vizMode="thermometer"
            appliedProtections={appliedProtections}
            perspective={perspective}
            classificationResult={classificationResult}
          />
        </div>
      )}

      {/* Under the Hood Section */}
      {showHood && (
        <div ref={hoodRef}>
          <UnderTheHoodSection
            userName={userName}
            onCardExpandedChange={setHideBear}
            vizMode="thermometer"
            regState={regState}
            appliedProtections={appliedProtections}
            perspective={perspective}
          />
        </div>
      )}
    </main>
  );
};

export default Index;
