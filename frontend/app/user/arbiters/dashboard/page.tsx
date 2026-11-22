'use client';

import { useState } from 'react';
import { ArbiterDashboardPanel } from '@/components/arbiters/ArbiterDashboardPanel';

export default function ArbiterDashboardPage() {
  const [address, setAddress] = useState('');

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold text-white">My arbiter dashboard</h1>
        <p className="mt-1 text-sm text-white/70">
          Enter your registered arbiter address to view assignments and metrics.
        </p>
        <input
          className="mt-3 w-full max-w-xl rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
          placeholder="G…"
          value={address}
          data-testid="dashboard-address"
          onChange={(event) => setAddress(event.target.value)}
        />
      </header>
      <ArbiterDashboardPanel address={address} />
    </main>
  );
}
