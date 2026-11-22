'use client';

import { GenericEscrowForm } from '@/components/escrow/GenericEscrowForm';

export default function NewGenericEscrowPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold text-white">Create escrow</h1>
        <p className="mt-1 text-sm text-white/70">
          A reusable escrow for any agreement type, with multi-asset Stellar
          support and 2-of-3 multisig.
        </p>
      </header>
      <GenericEscrowForm />
    </main>
  );
}
