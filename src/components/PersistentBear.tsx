import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

type Step = 'hero' | 'name' | 'photo' | 'results' | 'hood';

interface PersistentBearProps {
  currentStep: Step;
}

// Map steps to bear images
const BEAR_IMAGES: Record<Step, string> = {
  hero: '/images/no_background/landing_page.png',
  name: '/images/no_background/ask_name.png',
  photo: '/images/no_background/take_photo.png',
  results: '/images/no_background/chart_read.png',
  hood: '/images/no_background/under_the_hood.png',
};

export function PersistentBear({ currentStep }: PersistentBearProps) {
  const [isScrolling, setIsScrolling] = useState(false);
  const [scrollOpacity, setScrollOpacity] = useState(1);
  
  // Handle scroll for opacity
  useEffect(() => {
    let scrollTimeout: NodeJS.Timeout;
    
    const handleScroll = () => {
      setIsScrolling(true);
      
      // Calculate opacity based on scroll position
      const scrollY = window.scrollY;
      const maxScroll = 200; // Fade starts after 200px
      const opacity = Math.max(0.3, 1 - (scrollY - maxScroll) / 500);
      setScrollOpacity(opacity);
      
      // Reset scrolling state after scroll stops
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, []);

  // Get position config for each step
  const getPositionConfig = (step: Step) => {
    switch (step) {
      case 'hero':
        return {
          x: '65%',
          y: '50%',
          translateY: '-50%',
          scale: 1.2,
          width: 500,
          height: 700,
        };
      case 'name':
        return {
          x: '35%',
          y: '48%',
          translateX: '-50%',
          translateY: '-50%',
          scale: 1.3,
          width: 650,
          height: 750,
          zIndex: 25, // Behind the form but above background
        };
      case 'photo':
        return {
          x: '5%',
          y: '50%',
          translateY: '-50%',
          scale: 1.0,
          width: 400,
          height: 500,
        };
      case 'results':
        return {
          x: '5%',
          y: '50%',
          translateY: '-50%',
          scale: 1.0,
          width: 400,
          height: 500,
        };
      case 'hood':
        return {
          x: '5%',
          y: '50%',
          translateY: '-50%',
          scale: 1.0,
          width: 400,
          height: 500,
        };
      default:
        return {
          x: '88%',
          y: '50%',
          translateY: '-50%',
          scale: 1,
          width: 400,
          height: 500,
        };
    }
  };

  const config = getPositionConfig(currentStep);
  const currentImage = BEAR_IMAGES[currentStep];

  return (
    <motion.div
      className={`fixed pointer-events-none ${currentStep === 'name' ? 'z-[25]' : 'z-30'}`}
      initial={false}
      animate={{
        left: config.x,
        top: config.y,
        x: config.translateX || '0%',
        y: config.translateY || '0%',
        scale: config.scale,
        width: config.width,
        height: config.height,
        opacity: isScrolling ? scrollOpacity : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 100,
        damping: 25,
        mass: 0.8,
        restDelta: 0.001,
        restSpeed: 0.001,
        opacity: { duration: 0.2 },
      }}
      style={{
        right: 'auto',
        marginRight: '2rem',
        ...(currentStep === 'name' && {
          clipPath: 'polygon(0 0, 85% 0, 85% 85%, 0 100%)',
        }),
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.3 }}
          className="relative w-full h-full"
        >
          {/* Floating animation wrapper */}
          <motion.div
            animate={{
              y: [0, -10, 0],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            className="w-full h-full"
          >
            {/* Subtle rotation animation */}
            <motion.div
              animate={{
                rotate: [-2, 2, -2],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="w-full h-full"
            >
              <img
                src={currentImage}
                alt="Doctor Bear"
                className="w-full h-full object-contain"
                style={{
                  filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.2))',
                }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}