'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Gavel,
  MessageSquare,
  Scale,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  AdminDisputeDetail,
  AdminDisputeVote,
} from '@/lib/admin-dispute-detail';
import {
  statusLabel,
  timelineIconType,
  typeLabel,
} from '@/lib/admin-dispute-detail';
import type { DisputeStatus } from '@/lib/dashboard-data';
import { EvidenceGallery } from '@/components/common/EvidenceGallery';

const STATUS_STYLES: Record<DisputeStatus, string> = {
  OPEN: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  UNDER_REVIEW: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
  RESOLVED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
  WITHDRAWN: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const PRIORITY_STYLES = {
  low: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
  high: 'bg-rose-500/15 text-rose-300 border-rose-500/25',
};

const TIMELINE_DOT: Record<'info' | 'success' | 'warning' | 'neutral', string> =
  {
    success: 'bg-emerald-400',
    warning: 'bg-amber-400',
    info: 'bg-brand-accent',
    neutral: 'bg-slate-500',
  };

function DecisionBadge({ decision }: { decision: string }) {
  const map: Record<string, string> = {
    approve: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    reject: 'bg-red-500/15 text-red-300 border-red-500/30',
    partial: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    withdrawn: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  };
  return (
    <span
      className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${map[decision] ?? map.withdrawn}`}
    >
      {decision}
    </span>
  );
}

export interface DisputeDetailProps {
  dispute: AdminDisputeDetail;
  onBack: () => void;
  onSubmitResolution?: (args: {
    resolutionNotes: string;
    action: 'approve' | 'reject';
  }) => Promise<void>;
  onSubmitAppeal?: (reason: string) => Promise<void>;
  onCastVote?: (vote: {
    arbiterName: string;
    weight: number;
    favor: 'landlord' | 'tenant';
    comment?: string;
  }) => Promise<void>;
  isSubmitting?: boolean;
  isSubmittingAppeal?: boolean;
  isSubmittingVote?: boolean;
}

export function DisputeDetail({
  dispute,
  onBack,
  onSubmitResolution,
  onSubmitAppeal,
  onCastVote,
  isSubmitting = false,
  isSubmittingAppeal = false,
  isSubmittingVote = false,
}: DisputeDetailProps) {
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [appealReason, setAppealReason] = useState('');
  const [voteArbiter, setVoteArbiter] = useState('');
  const [voteWeight, setVoteWeight] = useState(1);
  const [voteFavor, setVoteFavor] = useState<'landlord' | 'tenant'>('tenant');
  const [voteComment, setVoteComment] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  const canResolve = useMemo(() => {
    return dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW';
  }, [dispute.status]);

  const sortedTimeline = useMemo(() => {
    return [...dispute.timeline].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [dispute.timeline]);

  const weightedTotals = useMemo(() => {
    return (dispute.votes ?? []).reduce(
      (totals, vote: AdminDisputeVote) => {
        totals[vote.favor] += vote.weight;
        return totals;
      },
      { landlord: 0, tenant: 0 },
    );
  }, [dispute.votes]);

  const handleSubmit = async (action: 'approve' | 'reject') => {
    setLocalError(null);
    if (!resolutionNotes.trim()) {
      setLocalError('Add resolution notes before recording a decision.');
      return;
    }
    if (!onSubmitResolution) return;
    await onSubmitResolution({
      resolutionNotes: resolutionNotes.trim(),
      action,
    });
  };

  const handleVote = async () => {
    setVoteError(null);
    if (voteArbiter.trim().length < 2 || voteWeight < 1) {
      setVoteError('Enter an arbiter name and a positive weight.');
      return;
    }
    if (!onCastVote) return;
    await onCastVote({
      arbiterName: voteArbiter.trim(),
      weight: voteWeight,
      favor: voteFavor,
      comment: voteComment.trim() || undefined,
    });
    setVoteArbiter('');
    setVoteWeight(1);
    setVoteComment('');
  };

  const handleAppeal = async () => {
    setAppealError(null);
    if (appealReason.trim().length < 10) {
      setAppealError('Add at least 10 characters explaining the appeal.');
      return;
    }
    if (!onSubmitAppeal) return;
    await onSubmitAppeal(appealReason.trim());
    setAppealReason('');
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl border border-white/10 transition-all text-sm group shrink-0"
            aria-label="Back"
          >
            <ArrowLeft
              size={18}
              className="group-hover:-translate-x-1 transition-transform"
            />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                {dispute.disputeId}
              </h1>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-lg border uppercase tracking-wide ${STATUS_STYLES[dispute.status]}`}
              >
                {statusLabel(dispute.status)}
              </span>
              <span
                className={`text-xs font-semibold px-3 py-1 rounded-lg border uppercase tracking-wide ${PRIORITY_STYLES[dispute.priority]}`}
              >
                {dispute.priority} priority
              </span>
            </div>
            <p className="text-neutral-200/70 text-sm">
              {typeLabel(dispute.disputeType)} · {dispute.agreementReference} ·{' '}
              {dispute.propertyName}
            </p>
          </div>
        </div>
        <a
          href="https://t.me/arbitragroup"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-brand-accent/90 hover:text-brand-accent underline underline-offset-4 shrink-0"
        >
          Community: Telegram support
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Gavel className="text-amber-400" size={20} />
              Summary
            </div>
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
              {dispute.description}
            </p>
            {dispute.requestedAmount != null && (
              <div className="pt-4 border-t border-slate-800">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Requested amount
                </p>
                <p className="text-lg font-bold text-white">
                  {dispute.requestedAmount.toLocaleString()} {dispute.currency}
                </p>
              </div>
            )}
            <div className="pt-4 border-t border-slate-800 space-y-3 text-sm">
              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={16} className="shrink-0" />
                Opened{' '}
                {format(new Date(dispute.createdAt), 'MMM d, yyyy · HH:mm')}
              </div>
              <div className="flex items-center gap-2 text-slate-400">
                <Clock size={16} className="shrink-0" />
                Updated{' '}
                {format(new Date(dispute.updatedAt), 'MMM d, yyyy · HH:mm')}
              </div>
              {dispute.assignedToName && (
                <div className="flex items-center gap-2 text-slate-400">
                  <Users size={16} className="shrink-0" />
                  Assigned: {dispute.assignedToName}
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold">
              <Building2 className="text-brand-accent" size={20} />
              Parties
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <User className="text-emerald-400" size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">
                    Claimant ({dispute.claimantRole})
                  </p>
                  <p className="text-white font-medium">
                    {dispute.claimantName}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
                  <User className="text-violet-300" size={18} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">
                    Respondent ({dispute.respondentRole})
                  </p>
                  <p className="text-white font-medium">
                    {dispute.respondentName}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4 text-white font-semibold">
              <AlertCircle className="text-amber-400" size={20} />
              Evidence
            </div>
            <EvidenceGallery items={dispute.evidence} />
          </section>

          <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4 text-white font-semibold">
              <Scale className="text-brand-accent" size={20} />
              Weighted votes
            </div>
            <div className="mb-4 flex flex-wrap gap-3 text-xs">
              <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-emerald-200">
                Landlord weight: {weightedTotals.landlord}
              </span>
              <span className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-1 text-violet-200">
                Tenant weight: {weightedTotals.tenant}
              </span>
            </div>
            {(dispute.votes ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">
                No arbiter votes have been recorded for this case yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {dispute.votes?.map((vote) => (
                  <li
                    key={vote.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-white">
                        {vote.arbiterName}
                      </p>
                      <DecisionBadge decision={vote.favor} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      Weight {vote.weight} ·{' '}
                      {format(new Date(vote.votedAt), 'MMM d, yyyy HH:mm')}
                    </p>
                    {vote.comment && (
                      <p className="mt-2 text-sm text-slate-300">
                        {vote.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {onCastVote && (
              <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Record a weighted vote
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <input
                    aria-label="Arbiter name"
                    value={voteArbiter}
                    onChange={(event) => setVoteArbiter(event.target.value)}
                    placeholder="Arbiter name"
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                  />
                  <input
                    aria-label="Vote weight"
                    type="number"
                    min={1}
                    max={10}
                    value={voteWeight}
                    onChange={(event) =>
                      setVoteWeight(Number(event.target.value))
                    }
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                  />
                  <select
                    aria-label="Vote favor"
                    value={voteFavor}
                    onChange={(event) =>
                      setVoteFavor(event.target.value as 'landlord' | 'tenant')
                    }
                    className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                  >
                    <option value="tenant">Favor tenant</option>
                    <option value="landlord">Favor landlord</option>
                  </select>
                </div>
                <input
                  aria-label="Vote comment"
                  value={voteComment}
                  onChange={(event) => setVoteComment(event.target.value)}
                  placeholder="Optional reasoning"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white"
                />
                {voteError && (
                  <p className="text-xs text-amber-300">{voteError}</p>
                )}
                <button
                  type="button"
                  disabled={isSubmittingVote}
                  onClick={() => void handleVote()}
                  className="inline-flex items-center gap-2 rounded-xl border border-brand-accent/30 bg-brand-accent/15 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-accent/25 disabled:opacity-50"
                >
                  <Scale size={16} />
                  {isSubmittingVote ? 'Saving…' : 'Record vote'}
                </button>
              </div>
            )}
          </section>

          <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-6 text-white font-semibold">
              <Clock className="text-brand-accent" size={20} />
              Timeline
            </div>
            <ol className="relative border-l border-slate-700 ml-3 space-y-6 pl-8">
              {sortedTimeline.map((ev) => {
                const tone = timelineIconType(ev.type);
                return (
                  <li key={ev.id} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1.5 flex h-3 w-3 rounded-full ring-4 ring-slate-900 ${TIMELINE_DOT[tone]}`}
                    />
                    <p className="text-white font-medium">{ev.title}</p>
                    {ev.description && (
                      <p className="text-slate-400 text-sm mt-1">
                        {ev.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-500">
                      <span>
                        {format(new Date(ev.createdAt), 'MMM d, yyyy · HH:mm')}
                      </span>
                      {ev.actorName && (
                        <span>
                          {ev.actorName}
                          {ev.actorRole ? ` · ${ev.actorRole}` : ''}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {dispute.resolutionHistory.length > 0 && (
            <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4 text-white font-semibold">
                <CheckCircle2 className="text-emerald-400" size={20} />
                Resolution history
              </div>
              <ul className="space-y-4">
                {dispute.resolutionHistory.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center gap-2 justify-between">
                      <DecisionBadge decision={r.decision} />
                      <span className="text-xs text-slate-500">
                        {format(new Date(r.decidedAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm whitespace-pre-wrap">
                      {r.notes}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.decidedByName} · {r.decidedByRole}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-4 text-white font-semibold">
              <FileText className="text-amber-400" size={20} />
              Appeals
            </div>
            {(dispute.appeals ?? []).length === 0 ? (
              <p className="text-sm text-slate-400">
                No appeals have been filed for this case.
              </p>
            ) : (
              <ul className="space-y-3">
                {dispute.appeals?.map((appeal) => (
                  <li
                    key={appeal.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase text-slate-400">
                        {appeal.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {format(
                          new Date(appeal.createdAt),
                          'MMM d, yyyy HH:mm',
                        )}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300">{appeal.reason}</p>
                    {appeal.resolution && (
                      <p className="text-sm text-emerald-200">
                        {appeal.resolution}
                      </p>
                    )}
                    {appeal.decidedByName && (
                      <p className="text-xs text-slate-500">
                        {appeal.decidedByName}
                        {appeal.decidedAt
                          ? ` · ${format(new Date(appeal.decidedAt), 'MMM d, yyyy HH:mm')}`
                          : ''}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {onSubmitAppeal && (
              <div className="mt-4 space-y-2 border-t border-slate-800 pt-4">
                <label
                  htmlFor="appeal-reason"
                  className="text-xs font-semibold uppercase tracking-wide text-slate-400"
                >
                  Record an appeal
                </label>
                <textarea
                  id="appeal-reason"
                  value={appealReason}
                  onChange={(event) => setAppealReason(event.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Explain why this decision should be reviewed…"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/50"
                />
                {appealError && (
                  <p className="flex items-center gap-2 text-xs text-amber-300">
                    <AlertTriangle size={14} />
                    {appealError}
                  </p>
                )}
                <button
                  type="button"
                  disabled={isSubmittingAppeal}
                  onClick={() => void handleAppeal()}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
                >
                  <FileText size={16} />
                  {isSubmittingAppeal ? 'Submitting…' : 'Submit appeal'}
                </button>
              </div>
            )}
          </section>

          {canResolve && onSubmitResolution && (
            <section className="bg-gradient-to-br from-slate-900 to-brand-blue-dark/40 border border-brand-accent/20 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4 text-white font-semibold">
                <MessageSquare className="text-brand-accent" size={20} />
                Record decision
              </div>
              <p className="text-sm text-slate-400 mb-4">
                Arbiters and admins can approve or reject the claim. Notes are
                stored on the case and surfaced to parties.
              </p>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder="Resolution notes (required)…"
                className="w-full px-4 py-3 bg-slate-950/60 border border-white/10 rounded-xl text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/50 resize-none text-sm"
              />
              <div className="flex justify-between items-center mt-2 mb-4">
                <span className="text-xs text-slate-500">
                  {resolutionNotes.length}/2000
                </span>
                {localError && (
                  <span className="text-xs text-red-400">{localError}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-3 justify-end">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleSubmit('reject')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white bg-red-600/90 hover:bg-red-600 border border-red-500/40 disabled:opacity-50"
                >
                  <XCircle size={18} />
                  Reject claim
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleSubmit('approve')}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white bg-emerald-600/90 hover:bg-emerald-600 border border-emerald-500/40 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={18} />
                      Approve & resolve
                    </>
                  )}
                </button>
              </div>
            </section>
          )}

          {!canResolve && (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200/90">
              This dispute is closed for new decisions. Review the timeline and
              resolution history above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
