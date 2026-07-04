'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FileSignature, Lock, Gavel, ArrowRight } from 'lucide-react';

const steps = [
  {
    icon: FileSignature,
    title: 'Agree & Deposit',
    description:
      'Connect your wallet, set the terms, and lock funds in a 2-of-3 multi-sig escrow.',
  },
  {
    icon: Lock,
    title: 'Fulfill the Agreement',
    description:
      'Funds stay held neutrally until both parties confirm they got what they agreed to.',
  },
  {
    icon: Gavel,
    title: 'Release or Arbitrate',
    description:
      'Funds release on mutual approval or timeout — or an arbiter rules if a dispute is raised.',
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative py-32 bg-white/5 backdrop-blur-sm"
    >
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            How It Works
          </h2>
          <p className="text-xl text-neutral-200/80 max-w-2xl mx-auto">
            Get started in three simple steps
          </p>
        </motion.div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 relative">
            {/* Connection lines */}
            <div
              className="hidden md:block absolute top-20 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-accent/30 to-transparent"
              style={{ left: '16.666%', right: '16.666%' }}
            />

            {steps.map((step, index) => {
              const isVerdictStep = index === steps.length - 1;
              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.2 }}
                  className="relative"
                >
                  <div className="text-center">
                    {/* Step number */}
                    <div
                      className={`relative inline-flex items-center justify-center w-16 h-16 rounded-full mb-6 z-10 bg-gradient-to-br ${
                        isVerdictStep
                          ? 'from-brand-blue to-brand-blue-dark'
                          : 'from-brand-accent to-teal-700'
                      }`}
                    >
                      <span className="text-2xl font-bold text-white">
                        {index + 1}
                      </span>
                    </div>

                    {/* Icon */}
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                      <step.icon
                        className={`w-10 h-10 ${isVerdictStep ? 'text-brand-blue' : 'text-brand-accent'}`}
                      />
                    </div>

                    {/* Content */}
                    <h3 className="text-2xl font-bold text-white mb-3">
                      {step.title}
                    </h3>
                    <p className="text-neutral-200/70 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Arrow between steps */}
                  {index < steps.length - 1 && (
                    <div className="hidden md:block absolute top-20 -right-4 text-brand-accent/30">
                      <ArrowRight className="w-8 h-8" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
