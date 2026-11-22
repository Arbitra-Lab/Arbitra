'use client';

import { ArbiterApplicationForm } from '@/components/arbiters/ArbiterApplicationForm';

export default function ApplyAsArbiterPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-2xl font-bold text-white">Become an arbiter</h1>
      <ArbiterApplicationForm />
    </main>
  );
}
