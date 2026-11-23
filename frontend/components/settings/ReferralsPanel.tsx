'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsCard } from './SettingsCard';
import { apiClient } from '@/lib/api-client';
import { notify } from '@/components/ui/toast';

interface ReferralRow {
  id: string;
  referredName: string;
  status: string;
  createdAt: string;
}

interface ReferralStats {
  totalReferrals: number;
  completedReferrals: number;
  totalRewards: number;
  referrals: ReferralRow[];
}

function toStats(raw: unknown): ReferralStats {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<
    string,
    unknown
  >;
  const rows = Array.isArray(data.referrals) ? data.referrals : [];
  return {
    totalReferrals: Number(data.totalReferrals) || 0,
    completedReferrals: Number(data.completedReferrals) || 0,
    totalRewards: Number(data.totalRewards) || 0,
    referrals: rows
      .filter(
        (row): row is Record<string, unknown> =>
          Boolean(row) && typeof row === 'object',
      )
      .map((row) => ({
        id: String(row.id ?? ''),
        referredName: String(row.referredName ?? 'Someone'),
        status: String(row.status ?? 'pending'),
        createdAt: String(row.createdAt ?? ''),
      }))
      .filter((row) => row.id),
  };
}

/** Your referral code and how your referrals are doing. */
export function ReferralsPanel() {
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [codeResponse, statsResponse] = await Promise.all([
        apiClient.get<{ referralCode?: string | null }>('/referrals/code'),
        apiClient.get<unknown>('/referrals/stats'),
      ]);
      setCode(codeResponse.data?.referralCode ?? null);
      setStats(toStats(statsResponse.data));
    } catch {
      setError('We could not load your referral details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      notify.success('Referral code copied');
    } catch {
      notify.error('Could not copy. Select the code and copy it manually.');
    }
  };

  return (
    <SettingsCard
      title="Referrals"
      description="Share your code. You earn a reward when someone you refer completes their first rental."
    >
      {loading ? (
        <p role="status" className="text-sm text-neutral-200/60">
          Loading referral details…
        </p>
      ) : error ? (
        <div role="alert" className="text-sm text-red-300">
          {error}{' '}
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium text-white">
              Your referral code
            </p>
            {code ? (
              <div className="flex flex-wrap items-center gap-3">
                <code
                  data-testid="referral-code"
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 font-mono text-sm text-white"
                >
                  {code}
                </code>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white"
                >
                  Copy code
                </button>
              </div>
            ) : (
              <p className="text-sm text-neutral-200/60">
                You do not have a referral code yet.
              </p>
            )}
          </div>

          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ['Referrals', stats?.totalReferrals ?? 0],
              ['Completed', stats?.completedReferrals ?? 0],
              ['Rewards earned', stats?.totalRewards ?? 0],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <dt className="text-xs text-neutral-200/60">{label}</dt>
                <dd className="mt-1 text-xl font-bold text-white">{value}</dd>
              </div>
            ))}
          </dl>

          {stats && stats.referrals.length > 0 ? (
            <ul className="divide-y divide-white/10">
              {stats.referrals.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between py-2 text-sm text-white"
                >
                  <span>{row.referredName}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs capitalize">
                    {row.status.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-200/60">No referrals yet.</p>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
