'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, BarChart3, Download, RefreshCw, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { canAccessAdmin } from '@/lib/admin-access';
import {
  ANALYTICS_SECTIONS,
  downloadAdminAnalyticsCsv,
  useAdminAnalytics,
  type AdminAnalyticsFilters,
  type AnalyticsGroupBy,
  type AnalyticsSection,
  type TrendPoint,
} from '@/lib/query/hooks/use-admin-analytics';
import { useAuth } from '@/store/authStore';

const DAYS_OPTIONS = [7, 30, 90, 180, 365];
const SECTION_LABELS: Record<AnalyticsSection, string> = {
  usage: 'Protocol usage',
  revenue: 'Revenue',
  arbiters: 'Arbiter network',
  users: 'User growth',
  disputes: 'Dispute efficiency',
  health: 'Platform health',
};

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [filters, setFilters] = useState<AdminAnalyticsFilters>({
    days: 30,
    groupBy: 'day',
    sections: [...ANALYTICS_SECTIONS],
    compare: false,
  });

  const hasAccess = canAccessAdmin(user?.role);
  const analytics = useAdminAnalytics(filters, !authLoading && hasAccess);

  const sections = useMemo(() => new Set(filters.sections), [filters.sections]);

  useEffect(() => {
    if (!authLoading && !hasAccess) router.replace('/');
  }, [authLoading, hasAccess, router]);

  const toggleSection = (section: AnalyticsSection) => {
    setFilters((current) => ({
      ...current,
      sections: current.sections.includes(section)
        ? current.sections.filter((entry) => entry !== section)
        : [...current.sections, section],
    }));
  };

  if (!authLoading && !hasAccess) return null;

  const handleExport = async () => {
    try {
      await downloadAdminAnalyticsCsv(filters);
      toast.success('Analytics export downloaded');
    } catch {
      toast.error('Could not export analytics');
    }
  };

  if (authLoading) {
    return <div className="p-6 text-neutral-200">Loading analytics…</div>;
  }

  const report = analytics.data?.report;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-brand-accent">
            <BarChart3 className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">
              Platform Analytics
            </h1>
            <p className="mt-1 text-sm text-neutral-200/60">
              Aggregated usage, revenue and arbitration metrics for operators.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {analytics.data?.source === 'sample' && (
            <span className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
              Sample data, backend unavailable
            </span>
          )}
          <button
            type="button"
            onClick={() => void analytics.refetch()}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-accent/15 px-4 py-2 text-white hover:bg-brand-accent/25"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <ConfigSelect
            label="Range"
            value={String(filters.days)}
            options={DAYS_OPTIONS.map((day) => ({
              value: String(day),
              label: `Last ${day} days`,
            }))}
            onChange={(value) =>
              setFilters((current) => ({ ...current, days: Number(value) }))
            }
          />
          <ConfigSelect
            label="Group by"
            value={filters.groupBy}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                groupBy: value as AnalyticsGroupBy,
              }))
            }
          />
          <label className="flex items-center gap-2 pb-2 text-sm text-neutral-200/80">
            <input
              type="checkbox"
              checked={filters.compare}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  compare: event.target.checked,
                }))
              }
            />
            Compare to previous period
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ANALYTICS_SECTIONS.map((section) => (
            <button
              key={section}
              type="button"
              onClick={() => toggleSection(section)}
              aria-pressed={sections.has(section)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                sections.has(section)
                  ? 'border-brand-accent/40 bg-brand-accent/20 text-white'
                  : 'border-white/10 bg-white/5 text-neutral-300'
              }`}
            >
              {SECTION_LABELS[section]}
            </button>
          ))}
        </div>
      </div>

      {analytics.isLoading && (
        <div className="p-6 text-neutral-200">Loading report…</div>
      )}
      {analytics.isError && (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-red-200">
          The analytics service could not be reached.
        </div>
      )}

      {report && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sections.has('usage') && report.usage && (
            <Panel
              title="Protocol usage"
              subtitle="Activity in the selected range"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(report.usage.totals).map(([key, value]) => (
                  <Stat key={key} label={key} value={value} />
                ))}
              </div>
              <TrendChart
                points={report.usage.trends.disputes ?? []}
                label="Disputes"
              />
            </Panel>
          )}

          {sections.has('revenue') && report.revenue && (
            <Panel
              title="Revenue"
              subtitle="Completed payments by agreement flow"
            >
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Total" value={report.revenue.totalAmount} />
                <Stat
                  label="Transactions"
                  value={report.revenue.transactionCount}
                />
              </div>
              <Breakdown
                rows={report.revenue.byCategory.map((entry) => ({
                  key: entry.category,
                  value: entry.amount,
                }))}
              />
            </Panel>
          )}

          {sections.has('arbiters') && report.arbiters && (
            <Panel title="Arbiter network" subtitle="Weighted vote performance">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Total" value={report.arbiters.total} />
                <Stat label="Active" value={report.arbiters.active} />
                <Stat
                  label="Avg reputation"
                  value={report.arbiters.averageReputation}
                />
              </div>
              <Breakdown
                rows={report.arbiters.top.map((entry) => ({
                  key: `Arbiter ${entry.arbiterId}`,
                  value: entry.weightedVotesInRange,
                }))}
              />
            </Panel>
          )}

          {sections.has('users') && report.users && (
            <Panel
              title="User growth"
              subtitle="Acquisition and repeat activity"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="New" value={report.users.newUsers} />
                <Stat label="Active" value={report.users.activeUsers} />
                <Stat label="Retained" value={report.users.retainedUsers} />
                <Stat
                  label="Retention"
                  value={`${Math.round(report.users.retentionRate * 100)}%`}
                />
              </div>
              <Breakdown
                rows={report.users.byRole.map((entry) => ({
                  key: entry.role,
                  value: entry.count,
                }))}
              />
            </Panel>
          )}

          {sections.has('disputes') && report.disputes && (
            <Panel
              title="Dispute efficiency"
              subtitle="Resolution speed and mix"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Total" value={report.disputes.total} />
                <Stat
                  label="Resolution rate"
                  value={`${Math.round(report.disputes.resolutionRate * 100)}%`}
                />
                <Stat
                  label="Median hours"
                  value={report.disputes.medianResolutionHours}
                />
                <Stat
                  label="Avg votes"
                  value={report.disputes.averageWeightedVotes}
                />
              </div>
              <Breakdown
                rows={report.disputes.byStatus.map((entry) => ({
                  key: entry.key,
                  value: entry.count,
                }))}
              />
            </Panel>
          )}

          {sections.has('health') && report.health && (
            <Panel
              title="Platform health"
              subtitle="Signals that need operator review"
            >
              <div className="flex items-center gap-3">
                <Activity
                  className={
                    report.health.status === 'healthy'
                      ? 'text-emerald-400'
                      : 'text-amber-400'
                  }
                />
                <span className="text-lg font-semibold capitalize text-white">
                  {report.health.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Failed payments"
                  value={`${Math.round(report.health.failedPaymentRate * 100)}%`}
                />
                <Stat
                  label="SLA breaches"
                  value={`${Math.round(report.health.slaBreachRate * 100)}%`}
                />
                <Stat
                  label="Escalations"
                  value={report.health.escalationCount}
                />
                <Stat
                  label="Active arbiters"
                  value={report.health.activeArbiters}
                />
              </div>
            </Panel>
          )}

          {report.comparison && (
            <Panel title="Previous period" subtitle="Comparison totals">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Object.entries(report.comparison).map(([key, value]) => (
                  <Stat key={key} label={key} value={value} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {report && sections.has('users') && (
        <p className="flex items-center gap-2 text-xs text-neutral-400">
          <Users className="h-4 w-4" />
          Generated {new Date(report.generatedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mb-4 text-xs text-neutral-400">{subtitle}</p>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <p className="text-xs capitalize text-neutral-400">
        {label.replace(/([A-Z])/g, ' $1')}
      </p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Breakdown({ rows }: { rows: Array<{ key: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  return (
    <div className="space-y-2">
      {rows.slice(0, 8).map((row) => (
        <div key={row.key} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0 truncate text-neutral-300">
            {row.key.replace(/_/g, ' ')}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-brand-accent"
              style={{ width: `${(Math.abs(row.value) / max) * 100}%` }}
            />
          </div>
          <span className="w-16 text-right text-neutral-200">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({
  points,
  label,
}: {
  points: TrendPoint[];
  label: string;
}) {
  const max = Math.max(1, ...points.map((point) => point.count));
  return (
    <div>
      <p className="mb-2 text-xs text-neutral-400">{label} trend</p>
      <div className="flex h-20 items-end gap-1">
        {points.slice(-30).map((point) => (
          <div
            key={point.bucket}
            title={`${point.bucket}: ${point.count}`}
            className="flex-1 rounded-t bg-brand-accent/70"
            style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ConfigSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
