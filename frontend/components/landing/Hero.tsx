'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/store/authStore';
import { useAuthRedirect } from '@/hooks/useAuthRedirect';
import EscrowVault from './EscrowVault';

export default function Hero() {
  // AUTH DISABLED - useAuthRedirect commented out for development
  // useAuthRedirect(); // Redirect authenticated users to their dashboard
  const { walletAddress } = useAuth();

  return (
    <section className="relative pt-20 pb-32 overflow-hidden">
      {/* Ambient background — teal (escrow) and coral (verdict) duotone */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-accent/10 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-blue/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: '1s' }}
        ></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-accent/5 rounded-full blur-3xl"></div>
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-5xl mx-auto text-center space-y-8">
          {/* Main Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight"
          >
            Trustless Escrow.
            <br />
            <span className="text-gradient-verdict">Fair Arbitration.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl md:text-2xl text-neutral-100/90 max-w-3xl mx-auto leading-relaxed"
          >
            Hold funds neutrally on the Stellar network and settle disputes
            through credibly-neutral arbitration — no middleman, instant
            settlement, ultra-low fees.
          </motion.p>

          {/* Display Wallet Address if Connected */}
          {walletAddress && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="inline-block px-4 py-2 rounded-lg bg-brand-accent/10 border border-brand-accent/40 backdrop-blur-sm"
            >
              <p className="text-sm text-brand-accent">
                Connected Wallet:{' '}
                <span className="font-mono font-semibold">
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-6)}
                </span>
              </p>
            </motion.div>
          )}

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Link
              href="#how-it-works"
              className="w-full sm:w-auto bg-white/10 backdrop-blur-sm border border-white/20 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-white/20 transition-all duration-200"
            >
              See How It Works
            </Link>
          </motion.div>

          {/* Trust Indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap items-center justify-center gap-6 pt-8 text-neutral-200/80 text-sm"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-accent" />
              <span>Instant Settlement</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-accent" />
              <span>Ultra-Low Fees</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-accent" />
              <span>Transparent Contracts</span>
            </div>
          </motion.div>
        </div>

        {/* Hero Visual — live escrow release mechanics, not a dashboard screenshot */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.5 }}
          className="mt-20 max-w-3xl mx-auto"
        >
          <EscrowVault />
        </motion.div>
      </div>
    </section>
  );
}
