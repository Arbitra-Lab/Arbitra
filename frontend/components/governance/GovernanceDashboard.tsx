'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  useCreateGovernanceProposal,
  useExecuteProposal,
  useFinalizeProposal,
  useGovernanceAnalytics,
  useGovernanceBalance,
  useGovernanceProposals,
  useVote,
  type GovernanceProposalRecord,
} from '@/lib/query/hooks/use-governance';
import {
  STATUS_CLASSES,
  STATUS_LABELS,
  analyticsCards,
  canManage,
  canVoteOn,
  participationPercent,
  supportPercent,
  votingPowerLabel,
} from './governance-presentation';

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white';

function ProposalRow({
  proposal,
  totalSupply,
  onVote,
  onFinalize,
  onExecute,
  busy,
}: {
  proposal: GovernanceProposalRecord;
  totalSupply: number;
  onVote: (id: string, choice: 'FOR' | 'AGAINST' | 'ABSTAIN') => void;
  onFinalize: (id: string) => void;
  onExecute: (id: string) => void;
  busy: boolean;
}) {
  return (
    <li className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white">{proposal.title}</h3>
          <p className="mt-1 text-xs uppercase tracking-wide text-white/50">
            {proposal.type.replace(/_/g, ' ')}
          </p>
        </div>
        <span
          className={`rounded-lg px-2 py-1 text-xs font-medium ${STATUS_CLASSES[proposal.status]}`}
          data-testid={`status-${proposal.id}`}
        >
          {STATUS_LABELS[proposal.status]}
        </span>
      </div>

      <p className="mt-2 text-sm text-white/70">{proposal.description}</p>

      <div className="mt-3 grid gap-2 text-xs text-white/60 sm:grid-cols-3">
        <p>Support: {supportPercent(proposal)}%</p>
        <p>Participation: {participationPercent(proposal, totalSupply)}%</p>
        <p>Votes: {proposal.voterCount}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {canVoteOn(proposal) && (
          <>
            <button
              type="button"
              disabled={busy}
              data-testid={`vote-for-${proposal.id}`}
              onClick={() => onVote(proposal.id, 'FOR')}
              className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-300 disabled:opacity-50"
            >
              For
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid={`vote-against-${proposal.id}`}
              onClick={() => onVote(proposal.id, 'AGAINST')}
              className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm text-red-300 disabled:opacity-50"
            >
              Against
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid={`vote-abstain-${proposal.id}`}
              onClick={() => onVote(proposal.id, 'ABSTAIN')}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 disabled:opacity-50"
            >
              Abstain
            </button>
          </>
        )}
        {canManage(proposal) && (
          <>
            <button
              type="button"
              disabled={busy}
              data-testid={`finalize-${proposal.id}`}
              onClick={() => onFinalize(proposal.id)}
              className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white/80 disabled:opacity-50"
            >
              Finalize
            </button>
            <button
              type="button"
              disabled={busy}
              data-testid={`execute-${proposal.id}`}
              onClick={() => onExecute(proposal.id)}
              className="rounded-lg bg-brand-accent px-3 py-1.5 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              Execute
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** DB-backed governance dashboard for protocol parameters and rules (#24). */
export function GovernanceDashboard() {
  const proposalsQuery = useGovernanceProposals();
  const analyticsQuery = useGovernanceAnalytics();
  const balanceQuery = useGovernanceBalance();
  const create = useCreateGovernanceProposal();
  const vote = useVote();
  const finalize = useFinalizeProposal();
  const execute = useExecuteProposal();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('PARAMETER_CHANGE');
  const [feeBps, setFeeBps] = useState('');

  const proposals = proposalsQuery.data ?? [];
  const analytics = analyticsQuery.data ?? null;
  const totalSupply = analytics?.totalTokenSupply ?? 0;
  const cards = analyticsCards(analytics);

  const runAction = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action();
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    }
  };

  const createProposal = () => {
    if (!title.trim() || !description.trim()) {
      toast.error('Title and description are required');
      return;
    }
    const parameters =
      type === 'PARAMETER_CHANGE' && feeBps !== ''
        ? { arbitrationFeeBps: Number(feeBps) }
        : undefined;
    if (type === 'PARAMETER_CHANGE' && !parameters) {
      toast.error('A parameter value is required');
      return;
    }

    void runAction(
      () =>
        create.mutateAsync({
          type,
          title: title.trim(),
          description: description.trim(),
          ...(parameters ? { parameters } : {}),
        }),
      'Proposal created',
    );
    setTitle('');
    setDescription('');
    setFeeBps('');
  };

  const handleVote = (id: string, choice: 'FOR' | 'AGAINST' | 'ABSTAIN') =>
    void runAction(
      () => vote.mutateAsync({ id, payload: { choice } }),
      'Vote recorded',
    );

  const busy =
    create.isPending ||
    vote.isPending ||
    finalize.isPending ||
    execute.isPending;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Protocol governance</h1>
        <p className="mt-1 text-sm text-white/70">
          Create proposals, vote with your governance tokens, and execute
          approved parameter changes. Your voting power:{' '}
          <strong data-testid="voting-power">
            {votingPowerLabel(balanceQuery.data ?? null)}
          </strong>
        </p>
      </header>

      {cards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <p className="text-xs uppercase tracking-wide text-white/50">
                {card.label}
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{card.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-white">New proposal</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-white/70">Type</span>
            <select
              className={inputClass}
              value={type}
              data-testid="proposal-type"
              onChange={(event) => setType(event.target.value)}
            >
              <option value="PARAMETER_CHANGE">Parameter change</option>
              <option value="ARBITER_QUALIFICATION">
                Arbiter qualification
              </option>
              <option value="EMERGENCY_UPGRADE">Emergency upgrade</option>
              <option value="GENERAL">General</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-white/70">Title</span>
            <input
              className={inputClass}
              value={title}
              data-testid="proposal-title"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-white/70">Description</span>
            <textarea
              className={inputClass}
              value={description}
              data-testid="proposal-description"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          {type === 'PARAMETER_CHANGE' && (
            <label className="block text-sm">
              <span className="text-white/70">Arbitration fee (bps)</span>
              <input
                className={inputClass}
                value={feeBps}
                data-testid="proposal-fee-bps"
                onChange={(event) => setFeeBps(event.target.value)}
                placeholder="250"
              />
            </label>
          )}
        </div>
        <button
          type="button"
          onClick={createProposal}
          disabled={busy}
          data-testid="create-proposal"
          className="mt-4 rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          Create proposal
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Proposals</h2>
        {proposals.length === 0 ? (
          <p className="text-sm text-white/60" data-testid="no-proposals">
            No proposals yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {proposals.map((proposal) => (
              <ProposalRow
                key={proposal.id}
                proposal={proposal}
                totalSupply={totalSupply}
                onVote={handleVote}
                onFinalize={(id) =>
                  void runAction(
                    () => finalize.mutateAsync({ id }),
                    'Proposal finalised',
                  )
                }
                onExecute={(id) =>
                  void runAction(
                    () => execute.mutateAsync({ id }),
                    'Proposal executed',
                  )
                }
                busy={busy}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
