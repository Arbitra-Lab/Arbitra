'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  useApplyAsArbiter,
  type ArbiterApplicationRecord,
} from '@/lib/query/hooks/use-arbiter-onboarding';
import {
  INITIAL_ARBITER_APPLICATION,
  toArbiterApplicationPayload,
  type ArbiterApplicationFormState,
} from './arbiter-presentation';

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white';

/** Arbiter application with KYC reference (#7). */
export function ArbiterApplicationForm() {
  const [form, setForm] = useState<ArbiterApplicationFormState>(
    INITIAL_ARBITER_APPLICATION,
  );
  const [submitted, setSubmitted] = useState<ArbiterApplicationRecord | null>(
    null,
  );
  const apply = useApplyAsArbiter();

  const update = (key: keyof ArbiterApplicationFormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    try {
      const payload = toArbiterApplicationPayload(form);
      const application = await apply.mutateAsync(payload);
      setSubmitted(application);
      toast.success('Application submitted for verification');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not submit application',
      );
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Apply as an arbiter</h2>
      <p className="mb-4 mt-1 text-sm text-white/60">
        Applications are reviewed after KYC approval and qualification checks.
        Approved arbiters are registered on-chain.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="text-white/70">Stellar public key</span>
          <input
            className={inputClass}
            value={form.stellarAddress}
            data-testid="arbiter-address"
            onChange={(event) => update('stellarAddress', event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">KYC reference</span>
          <input
            className={inputClass}
            value={form.kycReference}
            data-testid="arbiter-kyc-reference"
            onChange={(event) => update('kycReference', event.target.value)}
            placeholder="Optional existing KYC id"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-white/70">Qualifications</span>
          <textarea
            className={inputClass}
            value={form.qualifications}
            data-testid="arbiter-qualifications"
            onChange={(event) => update('qualifications', event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">Specialization</span>
          <input
            className={inputClass}
            value={form.specialization}
            data-testid="arbiter-specialization"
            onChange={(event) => update('specialization', event.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">Stake amount</span>
          <input
            className={inputClass}
            value={form.stakeAmount}
            data-testid="arbiter-stake"
            onChange={(event) => update('stakeAmount', event.target.value)}
            placeholder="1000"
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">Jurisdictions (comma separated)</span>
          <input
            className={inputClass}
            value={form.jurisdictions}
            data-testid="arbiter-jurisdictions"
            onChange={(event) => update('jurisdictions', event.target.value)}
            placeholder="NG, US"
          />
        </label>
        <label className="block text-sm">
          <span className="text-white/70">Languages (comma separated)</span>
          <input
            className={inputClass}
            value={form.languages}
            data-testid="arbiter-languages"
            onChange={(event) => update('languages', event.target.value)}
            placeholder="en, fr"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={apply.isPending}
        data-testid="submit-arbiter-application"
        className="mt-5 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
      >
        {apply.isPending ? 'Submitting…' : 'Submit application'}
      </button>

      {submitted && (
        <p
          className="mt-4 text-sm text-emerald-200"
          data-testid="application-submitted"
        >
          Application {submitted.id} submitted with status {submitted.status}.
        </p>
      )}
    </section>
  );
}
