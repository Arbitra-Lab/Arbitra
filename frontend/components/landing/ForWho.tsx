'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { HandCoins, Gavel, Briefcase, ArrowRight } from 'lucide-react';

const audiences = [
  {
    icon: HandCoins,
    title: 'Two-Party Agreements',
    description:
      'Lock funds neutrally until both sides agree they got what they paid for — no middleman required.',
    features: [
      'Any Stellar asset, any amount',
      'Mutual-approval or timeout release',
      'Optional platform/referral fee splits',
      'Full on-chain audit trail',
    ],
    cta: 'View Agreements',
    href: '/user/contracts',
    gradient: 'from-brand-accent to-teal-700',
  },
  {
    icon: Gavel,
    title: 'Arbiters',
    description:
      'Vote on disputes routed through the arbitration engine and get compensated for fair rulings.',
    features: [
      'Case-agnostic dispute queue',
      'Weighted voting by reputation',
      'Built-in appeals process',
      'Timeout-based auto-resolution',
    ],
    cta: 'Manage Disputes',
    href: '/admin/disputes',
    gradient: 'from-brand-blue to-brand-blue-dark',
  },
  {
    icon: Briefcase,
    title: 'Manage Your Agreements',
    description:
      'Keep track of your escrows, evidence, and payouts all in one unified dashboard.',
    features: [
      'Automated dispute resolution',
      'Instant settlement',
      'Transparent tracking',
      'Unified user dashboard',
    ],
    cta: 'Go to Dashboard',
    href: '/user',
    gradient: 'from-brand-accent to-brand-blue',
  },
];

export default function ForWho() {
  return (
    <section className="relative py-32">
      <div className="container mx-auto px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Built for Everyone
          </h2>
          <p className="text-xl text-neutral-200/80 max-w-2xl mx-auto">
            Whether you&apos;re depositing, arbitrating, or managing
            agreements, we&apos;ve got you covered
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {audiences.map((audience, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative"
            >
              <div className="h-full backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all duration-300">
                {/* Icon */}
                <div
                  className={`w-16 h-16 bg-gradient-to-br ${audience.gradient} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                >
                  <audience.icon className="w-8 h-8 text-white" />
                </div>

                {/* Title */}
                <h3 className="text-2xl font-bold text-white mb-3">
                  {audience.title}
                </h3>

                {/* Description */}
                <p className="text-neutral-200/70 mb-6 leading-relaxed">
                  {audience.description.replace(/'/g, '\u2019')}
                </p>

                {/* Features */}
                <ul className="space-y-3 mb-8">
                  {audience.features.map((feature, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-neutral-200/80 text-sm"
                    >
                      <div className="w-1.5 h-1.5 bg-brand-accent rounded-full mt-2 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={audience.href}
                  className={`inline-flex items-center gap-2 text-white font-semibold group-hover:gap-3 transition-all`}
                >
                  {audience.cta}
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
