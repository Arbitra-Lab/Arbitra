'use client';

import { useArbiterDashboard } from '@/lib/query/hooks/use-arbiter-onboarding';
import { reputationLabel, successRatePercent } from './arbiter-presentation';

/** Arbiter case-assignment dashboard with reputation metrics (#7). */
export function ArbiterDashboardPanel({ address }: { address: string }) {
  const { data, isLoading, isError } = useArbiterDashboard(address);

  if (!address) {
    return (
      <p className="text-sm text-white/60">No arbiter address supplied.</p>
    );
  }
  if (isLoading) {
    return <p className="text-sm text-white/60">Loading dashboard…</p>;
  }
  if (isError || !data) {
    return (
      <p className="text-sm text-red-300">
        Could not load the arbiter dashboard.
      </p>
    );
  }

  return (
    <section className="space-y-5" data-testid="arbiter-dashboard">
      <header>
        <h2 className="text-xl font-bold text-white">Arbiter dashboard</h2>
        <p className="mt-1 font-mono text-xs text-white/50">{address}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Reputation"
          value={String(data.reputationScore)}
          note={reputationLabel(data.reputationScore)}
        />
        <Metric
          label="Vote weight"
          value={String(data.weightedVoteWeight)}
          note="Reputation weighted"
        />
        <Metric
          label="Active cases"
          value={String(data.activeCases.length)}
          note={`${data.closedCases} closed`}
        />
        <Metric
          label="Success rate"
          value={`${successRatePercent(data.successRate)}%`}
          note={`${data.arbiter.totalVotes} votes cast`}
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="text-sm font-semibold text-white">
          Current assignments
        </h3>
        {data.activeCases.length === 0 ? (
          <p
            className="mt-2 text-sm text-white/60"
            data-testid="no-active-cases"
          >
            No active cases assigned.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.activeCases.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span className="text-white">{item.title}</span>
                <span className="text-white/60">{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/60">{note}</p>
    </div>
  );
}
