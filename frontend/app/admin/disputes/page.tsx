'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  CheckCircle2,
  Clock3,
  Eye,
  Gavel,
  MessageSquareMore,
  RefreshCw,
  Scale,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { DisputeDetail } from '@/components/admin/disputes/DisputeDetail';
import { isArbitrationAdmin } from '@/lib/admin-access';
import {
  loadAdminDisputeDetail,
  submitAdminDisputeAppeal,
  submitAdminDisputeVote,
  type AdminDisputeDetail,
} from '@/lib/admin-dispute-detail';
import {
  useAdminAnalytics,
  type AdminAnalyticsFilters,
} from '@/lib/query/hooks/use-admin-analytics';
import {
  useAdminDisputes,
  useUpdateAdminDisputeStatus,
  type AdminDisputePriority,
  type AdminDisputeRecord,
  type AdminDisputeStatus,
} from '@/lib/query/hooks/use-admin-disputes';
import { useAuth } from '@/store/authStore';

const STATUS_OPTIONS: Array<AdminDisputeStatus | 'ALL'> = [
  'ALL',
  'OPEN',
  'UNDER_REVIEW',
  'RESOLVED',
  'REJECTED',
  'WITHDRAWN',
];

const PRIORITY_OPTIONS: Array<AdminDisputePriority | 'ALL'> = [
  'ALL',
  'urgent',
  'high',
  'medium',
  'low',
];

const PRIORITY_STYLES: Record<AdminDisputePriority, string> = {
  urgent: 'bg-red-500/15 text-red-300 border-red-500/30',
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
};

const ANALYTICS_FILTERS: AdminAnalyticsFilters = {
  days: 30,
  groupBy: 'day',
  sections: ['arbiters', 'disputes'],
  compare: false,
};

export default function AdminDisputesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AdminDisputeStatus | 'ALL'>('ALL');
  const [priority, setPriority] = useState<AdminDisputePriority | 'ALL'>('ALL');
  const [selected, setSelected] = useState<AdminDisputeRecord | null>(null);
  const [selectedDetail, setSelectedDetail] =
    useState<AdminDisputeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const hasAccess = isArbitrationAdmin(user?.role);
  const analytics = useAdminAnalytics(
    ANALYTICS_FILTERS,
    !authLoading && hasAccess,
  );
  const disputesQuery = useAdminDisputes({ search, status, priority });
  const updateStatus = useUpdateAdminDisputeStatus();

  const disputes = useMemo(
    () => disputesQuery.data ?? [],
    [disputesQuery.data],
  );

  const metrics = useMemo(() => {
    return disputes.reduce(
      (acc, dispute) => {
        acc.total += 1;
        if (dispute.status === 'OPEN') acc.open += 1;
        if (dispute.status === 'UNDER_REVIEW') acc.underReview += 1;
        if (dispute.status === 'RESOLVED') acc.resolved += 1;
        return acc;
      },
      { total: 0, open: 0, underReview: 0, resolved: 0 },
    );
  }, [disputes]);

  useEffect(() => {
    if (!authLoading && !hasAccess) router.replace('/');
  }, [authLoading, hasAccess, router]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setSelectedDetail(null);
      return () => {
        cancelled = true;
      };
    }

    setDetailLoading(true);
    void loadAdminDisputeDetail(selected.id)
      .then((detail) => {
        if (cancelled) return;
        setSelectedDetail(detail);
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSelectedDetail(null);
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const reloadDetail = async (disputeId: string) => {
    const detail = await loadAdminDisputeDetail(disputeId);
    setSelectedDetail(detail);
  };

  const handleQuickAction = async (
    disputeId: string,
    nextStatus: AdminDisputeStatus,
  ) => {
    try {
      const result = await updateStatus.mutateAsync({
        disputeId,
        status: nextStatus,
        resolution:
          nextStatus === 'RESOLVED'
            ? 'Resolved from admin dashboard.'
            : undefined,
      });

      toast.success(
        result.localOnly
          ? `Updated locally to ${formatLabel(nextStatus)}`
          : `Moved to ${formatLabel(nextStatus)}`,
      );
    } catch {
      toast.error('Could not update dispute status');
    }
  };

  const handleResolution = async (args: {
    resolutionNotes: string;
    action: 'approve' | 'reject';
  }) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await updateStatus.mutateAsync({
        disputeId: selected.id,
        status: args.action === 'approve' ? 'RESOLVED' : 'REJECTED',
        resolution: args.resolutionNotes,
      });
      await reloadDetail(selected.id);
      toast.success('Resolution recorded');
    } catch {
      toast.error('Could not record the resolution');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVote = async (vote: {
    arbiterName: string;
    weight: number;
    favor: 'landlord' | 'tenant';
    comment?: string;
  }) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await submitAdminDisputeVote(selected.id, vote);
      await reloadDetail(selected.id);
      toast.success('Weighted vote recorded');
    } catch {
      toast.error('Could not record the vote');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAppeal = async (reason: string) => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await submitAdminDisputeAppeal(selected.id, reason);
      await reloadDetail(selected.id);
      toast.success('Appeal submitted');
    } catch {
      toast.error('Could not submit the appeal');
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-neutral-200/80">
        Loading...
      </div>
    );
  }

  if (!hasAccess) return null;

  const arbiterStats = analytics.data?.report.arbiters;

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-amber-300">
            <Gavel className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">
              Disputes Dashboard
            </h1>
            <p className="text-sm text-neutral-200/60">
              Review, vote on and appeal arbitration cases.
            </p>
          </div>
        </div>

        <button
          onClick={() => void disputesQuery.refetch()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {arbiterStats && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Award className="h-4 w-4 text-brand-accent" />
            Arbiter performance
            {analytics.data?.source === 'sample' && (
              <span className="ml-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[10px] font-normal text-amber-200">
                Sample data
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <MiniStat label="Arbiters" value={arbiterStats.total} />
            <MiniStat label="Active" value={arbiterStats.active} />
            <MiniStat
              label="Avg reputation"
              value={arbiterStats.averageReputation}
            />
            <MiniStat
              label="Top weighted votes"
              value={arbiterStats.top[0]?.weightedVotesInRange ?? 0}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard label="Total" value={metrics.total} icon={<Gavel />} />
        <MetricCard label="Open" value={metrics.open} icon={<Clock3 />} />
        <MetricCard
          label="Review"
          value={metrics.underReview}
          icon={<MessageSquareMore />}
        />
        <MetricCard
          label="Resolved"
          value={metrics.resolved}
          icon={<CheckCircle2 />}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-[200px] flex-1 rounded-xl bg-slate-900 px-3 py-2 text-white"
        />
        <select
          aria-label="Filter by status"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as AdminDisputeStatus | 'ALL')
          }
          className="rounded-xl bg-slate-900 px-3 py-2 text-white"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {formatLabel(option)}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by priority"
          value={priority}
          onChange={(e) =>
            setPriority(e.target.value as AdminDisputePriority | 'ALL')
          }
          className="rounded-xl bg-slate-900 px-3 py-2 text-white"
        >
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === 'ALL' ? 'All priorities' : formatLabel(option)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="p-3">Case</th>
              <th className="p-3">Priority</th>
              <th className="p-3">Status</th>
              <th className="p-3">Evidence</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map((dispute) => (
              <tr key={dispute.id} className="border-t border-white/5">
                <td className="p-3 text-white">
                  <p className="font-medium">{dispute.disputeId}</p>
                  <p className="text-xs text-neutral-400">
                    {formatLabel(dispute.disputeType)}
                  </p>
                </td>
                <td className="p-3">
                  <span
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${PRIORITY_STYLES[dispute.priority]}`}
                  >
                    {formatLabel(dispute.priority)}
                  </span>
                </td>
                <td className="p-3">{formatLabel(dispute.status)}</td>
                <td className="p-3">{dispute.evidenceCount} files</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setSelected(dispute)}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white hover:bg-white/10"
                    >
                      <Eye className="h-4 w-4" />
                      Review
                    </button>
                    {dispute.status === 'OPEN' && (
                      <button
                        onClick={() =>
                          void handleQuickAction(dispute.id, 'RESOLVED')
                        }
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {disputes.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-neutral-400">
                  No disputes match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Scale className="h-5 w-5 text-brand-accent" />
              Case workspace
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
            >
              Close
            </button>
          </div>
          {detailLoading ? (
            <p className="p-6 text-neutral-300">Loading case detail…</p>
          ) : selectedDetail ? (
            <DisputeDetail
              dispute={selectedDetail}
              onBack={() => setSelected(null)}
              onSubmitResolution={handleResolution}
              onSubmitAppeal={handleAppeal}
              onCastVote={handleVote}
              isSubmitting={actionLoading}
              isSubmittingAppeal={actionLoading}
              isSubmittingVote={actionLoading}
            />
          ) : (
            <p className="p-6 text-neutral-400">
              Case detail is not available for this record.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
      {icon}
      <p>{label}</p>
      <h3>{value}</h3>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function formatLabel(value: string) {
  return value.replace(/_/g, ' ');
}
