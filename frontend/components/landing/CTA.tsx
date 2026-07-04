'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function CTA() {
  return (
    <section className="relative py-32">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative max-w-5xl mx-auto"
        >
          {/* Background glow — escrow teal resolving to verdict coral */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-accent/20 to-brand-blue/20 rounded-3xl blur-3xl" />

          {/* Content */}
          <div className="relative backdrop-blur-xl bg-gradient-to-br from-brand-accent/10 to-brand-blue/10 border border-white/20 rounded-3xl p-12 md:p-16 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm mb-8">
              <Sparkles className="w-4 h-4 text-brand-accent" />
              <span className="text-sm font-semibold text-white">
                Trust Infrastructure for Any Agreement
              </span>
            </div>

            <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6">
              Ready to Get Started?
            </h2>

            <p className="text-xl text-neutral-100/90 mb-10 max-w-2xl mx-auto">
              Join the two-party agreements already settling instantly and
              disputing fairly on Arbitra.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <p className="text-neutral-200/60 text-sm">
                Connect your wallet to get started
              </p>
            </div>

            <p className="text-neutral-200/60 text-sm mt-8">
              No signup forms • No custodian • Funds never leave escrow until
              release
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
