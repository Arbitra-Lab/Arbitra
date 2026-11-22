import type {
  GovernanceAnalyticsRecord,
  GovernanceBalanceRecord,
  GovernanceProposalRecord,
  ProposalStatus,
} from '@/lib/query/hooks/use-governance';

/** Pure presentation helpers for the governance UI (#24). */

export const STATUS_LABELS: Record<ProposalStatus, string> = {
  ACTIVE: 'Active',
  SUCCEEDED: 'Succeeded',
  DEFEATED: 'Defeated',
  QUEUED: 'Queued',
  EXECUTED: 'Executed',
  CANCELLED: 'Cancelled',
};

export const STATUS_CLASSES: Record<ProposalStatus, string> = {
  ACTIVE: 'bg-sky-500/20 text-sky-300',
  SUCCEEDED: 'bg-emerald-500/20 text-emerald-300',
  DEFEATED: 'bg-red-500/20 text-red-300',
  QUEUED: 'bg-amber-500/20 text-amber-300',
  EXECUTED: 'bg-emerald-500/20 text-emerald-300',
  CANCELLED: 'bg-white/10 text-white/60',
};

export function canVoteOn(
  proposal: GovernanceProposalRecord,
  now: number = Date.now(),
): boolean {
  return (
    proposal.status === 'ACTIVE' &&
    new Date(proposal.votingEndsAt).getTime() > now
  );
}

export function canManage(
  proposal: GovernanceProposalRecord,
  now: number = Date.now(),
): boolean {
  return (
    (proposal.status === 'SUCCEEDED' || proposal.status === 'QUEUED') &&
    !proposal.executionNotes?.includes('Applied by')
  );
}

export function participationPercent(
  proposal: GovernanceProposalRecord,
  totalSupply: number,
): number {
  if (totalSupply <= 0) return 0;
  const total =
    Number(proposal.forWeight) +
    Number(proposal.againstWeight) +
    Number(proposal.abstainWeight);
  return Math.min(100, Math.round((total / totalSupply) * 100));
}

export function supportPercent(proposal: GovernanceProposalRecord): number {
  const decisive = Number(proposal.forWeight) + Number(proposal.againstWeight);
  if (decisive <= 0) return 0;
  return Math.round((Number(proposal.forWeight) / decisive) * 100);
}

export function votingPowerLabel(
  balance: GovernanceBalanceRecord | null,
): string {
  if (!balance) return '0';
  const power = Math.max(
    0,
    Number(balance.balance) - Number(balance.lockedBalance),
  );
  return power.toLocaleString();
}

export function analyticsCards(
  analytics: GovernanceAnalyticsRecord | null,
): Array<{ label: string; value: string }> {
  if (!analytics) return [];
  return [
    { label: 'Total proposals', value: String(analytics.totalProposals) },
    { label: 'Total votes', value: String(analytics.totalVotes) },
    {
      label: 'Voting power used',
      value: Math.round(analytics.totalVotingPower).toLocaleString(),
    },
    {
      label: 'Token supply',
      value: Math.round(analytics.totalTokenSupply).toLocaleString(),
    },
  ];
}
