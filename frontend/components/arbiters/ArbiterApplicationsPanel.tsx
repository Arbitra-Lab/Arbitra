'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  useArbiterApplications,
  useReviewArbiterApplication,
  type ArbiterApplicationRecord,
} from '@/lib/query/hooks/use-arbiter-onboarding';

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-500/20 text-amber-300',
  APPROVED: 'bg-emerald-500/20 text-emerald-300',
  REJECTED: 'bg-red-500/20 text-red-300',
  SUSPENDED: 'bg-white/10 text-white/60',
};

/** Admin qualification verification workflow (#7). */
export function ArbiterApplicationsPanel() {
  const applications = useArbiterApplications();
  const review = useReviewArbiterApplication();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const decide = async (
    item: ArbiterApplicationRecord,
    status: 'APPROVED' | 'REJECTED',
  ) => {
    try {
      await review.mutateAsync({
        id: item.id,
        payload: { status, reviewNotes: notes[item.id] },
      });
      toast.success(`Application ${status.toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Review failed');
    }
  };

  const rows = applications.data ?? [];

  return (
    <section className="space-y-4" data-testid="arbiter-applications-panel">
      <header>
        <h2 className="text-xl font-bold text-white">Arbiter applications</h2>
        <p className="mt-1 text-sm text-white/60">
          Review KYC-linked applications. Approval registers the arbiter
          on-chain.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-white/60" data-testid="no-applications">
          No applications yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm text-white">
                    {item.stellarAddress}
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    {item.qualifications}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {item.specialization ?? 'General'} ·{' '}
                    {item.jurisdictions?.join(', ') || 'Any jurisdiction'}
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2 py-1 text-xs ${STATUS_CLASSES[item.status]}`}
                >
                  {item.status}
                </span>
              </div>

              {item.status === 'PENDING' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    className="min-w-[200px] flex-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-white"
                    placeholder="Review notes"
                    data-testid={`review-notes-${item.id}`}
                    value={notes[item.id] ?? ''}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                  <button
                    type="button"
                    disabled={review.isPending}
                    data-testid={`approve-${item.id}`}
                    onClick={() => decide(item, 'APPROVED')}
                    className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-300 disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={review.isPending}
                    data-testid={`reject-${item.id}`}
                    onClick={() => decide(item, 'REJECTED')}
                    className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-300 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
