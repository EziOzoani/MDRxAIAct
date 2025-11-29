import { motion } from 'framer-motion';
import { useState } from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';

interface NameInputSectionProps {
  onSubmit: (name: string) => void;
}

export function NameInputSection({ onSubmit }: NameInputSectionProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <section className="min-h-screen bg-background relative flex flex-col">
      {/* Space for bear peeking from top */}
      <div className="h-32" />

      {/* Sheet/Form held by bear */}
      <div className="flex-1 flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
          className="w-full max-w-lg relative z-[26] mt-20"
        >
          {/* Paper sheet effect */}
          <div className="glass-card p-8 md:p-12 relative bg-card/95 backdrop-blur-md">
            {/* Paper fold effect */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-muted to-transparent rounded-bl-2xl" />
            
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.5 }}
                  viewport={{ once: true }}
                  className="inline-block px-3 py-1 bg-accent/10 rounded-full text-accent text-sm font-semibold"
                >
                  Step 1 of 4
                </motion.div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Let's Get Started!
                </h2>
                <p className="text-muted-foreground">
                  Let's get to know each other, tell me your name
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground">
                    Your Name
                  </label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Enter your name..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-14 text-lg bg-background border-2 border-border focus:border-primary transition-colors rounded-xl"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={!name.trim()}
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-soft hover:shadow-medium transition-all duration-300 disabled:opacity-50"
                >
                  Continue
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </form>

            </div>
          </div>
        </motion.div>
      </div>

      {/* Decorative elements */}
      <div className="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-secondary/30 to-transparent pointer-events-none" />
    </section>
  );
}
