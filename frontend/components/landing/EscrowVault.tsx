'use client';

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Wallet, CircleUserRound, Gavel, Lock, Clock3 } from 'lucide-react';

type NodeId = 'depositor' | 'beneficiary' | 'arbiter';

interface Stage {
  label: string;
  detail: string;
  active: NodeId[];
  accent: 'teal' | 'coral' | 'neutral';
}

const STAGES: Stage[] = [
  {
    label: 'Mutual approval',
    detail: 'Depositor and beneficiary both sign off — funds release instantly.',
    active: ['depositor', 'beneficiary'],
    accent: 'teal',
  },
  {
    label: 'Arbiter ruling',
    detail: 'A dispute was raised. The arbiter casts the deciding signature.',
    active: ['arbiter', 'beneficiary'],
    accent: 'coral',
  },
  {
    label: 'Timeout release',
    detail: 'No response after the window closes — funds release automatically.',
    active: [],
    accent: 'neutral',
  },
];

const NODES: Record<
  NodeId,
  { label: string; icon: typeof Wallet; x: number; y: number }
> = {
  depositor: { label: 'Depositor', icon: Wallet, x: 18, y: 22 },
  beneficiary: { label: 'Beneficiary', icon: CircleUserRound, x: 82, y: 22 },
  arbiter: { label: 'Arbiter', icon: Gavel, x: 50, y: 88 },
};

const VAULT = { x: 50, y: 55 };

const ACCENT_HEX: Record<Stage['accent'], string> = {
  teal: '#2dd4bf',
  coral: '#ff6b5e',
  neutral: '#5c7570',
};

export default function EscrowVault() {
  const prefersReducedMotion = useReducedMotion();
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => {
      setStageIndex((i) => (i + 1) % STAGES.length);
    }, 3800);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  const stage = STAGES[stageIndex];
  const accentHex = ACCENT_HEX[stage.accent];

  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 sm:p-10 shadow-2xl overflow-hidden">
      {/* Ambient glow that shifts with the active stage */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-24 blur-3xl"
        animate={{ backgroundColor: `${accentHex}14` }}
        transition={{ duration: 0.8 }}
        style={{ borderRadius: '999px' }}
      />

      {/* Header row */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-2 font-mono text-xs text-neutral-200/60">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-accent opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-accent" />
          </span>
          ESCROW · CDDU&hellip;37DE · Stellar Testnet
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">1,250.00 USDC</div>
          <div className="text-xs text-neutral-200/50">held in 2-of-3 multi-sig</div>
        </div>
      </div>

      {/* Diagram */}
      <div className="relative z-10 mx-auto aspect-[16/11] w-full max-w-xl">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {(Object.keys(NODES) as NodeId[]).map((id) => {
            const node = NODES[id];
            const isActive = stage.active.includes(id);
            return (
              <line
                key={id}
                x1={VAULT.x}
                y1={VAULT.y}
                x2={node.x}
                y2={node.y}
                stroke={isActive ? accentHex : '#eef7f5'}
                strokeOpacity={isActive ? 0.9 : 0.12}
                strokeWidth={isActive ? 0.8 : 0.5}
                strokeLinecap="round"
                style={{ transition: 'stroke 0.5s ease, stroke-opacity 0.5s ease' }}
              />
            );
          })}
        </svg>

        {/* Vault */}
        <div
          className="absolute flex flex-col items-center"
          style={{ left: `${VAULT.x}%`, top: `${VAULT.y}%`, transform: 'translate(-50%, -50%)' }}
        >
          <motion.div
            animate={
              prefersReducedMotion
                ? undefined
                : { boxShadow: [`0 0 0 0 ${accentHex}55`, `0 0 0 14px ${accentHex}00`] }
            }
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
            className="flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-2xl border border-white/15 bg-neutral-900"
            style={{ borderColor: `${accentHex}55` }}
          >
            {stage.accent === 'neutral' ? (
              <Clock3 className="h-7 w-7 sm:h-8 sm:w-8" style={{ color: accentHex }} />
            ) : (
              <Lock className="h-7 w-7 sm:h-8 sm:w-8" style={{ color: accentHex }} />
            )}
          </motion.div>
        </div>

        {/* Signer nodes */}
        {(Object.keys(NODES) as NodeId[]).map((id) => {
          const node = NODES[id];
          const isActive = stage.active.includes(id);
          const Icon = node.icon;
          return (
            <div
              key={id}
              className="absolute flex flex-col items-center gap-1.5"
              style={{ left: `${node.x}%`, top: `${node.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              <div
                className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full border bg-neutral-900/80 transition-colors duration-500"
                style={{
                  borderColor: isActive ? accentHex : 'rgba(238,247,245,0.15)',
                  color: isActive ? accentHex : 'rgba(238,247,245,0.5)',
                }}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-[11px] font-medium text-neutral-200/70 whitespace-nowrap">
                {node.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stage caption */}
      <div className="relative z-10 mt-8 border-t border-white/10 pt-6 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={stage.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
          >
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ color: accentHex, backgroundColor: `${accentHex}1a` }}
            >
              {stage.label}
            </span>
            <p className="mt-3 text-sm text-neutral-200/70 max-w-md mx-auto">
              {stage.detail}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
