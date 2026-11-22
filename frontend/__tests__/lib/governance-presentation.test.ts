import { describe, expect, it } from 'vitest';
import {
  analyticsCards,
  canManage,
  canVoteOn,
  participationPercent,
  STATUS_LABELS,
  supportPercent,
  votingPowerLabel,
} from '@/components/governance/governance-presentation';
import type { GovernanceProposalRecord } from '@/lib/query/hooks/use-governance';

const now = Date.UTC(2026, 10, 22);

function proposal(
  overrides: Partial<GovernanceProposalRecord> = {},
): GovernanceProposalRecord {
  return {
    id: 'p1',
    type: 'PARAMETER_CHANGE',
    title: 'Fee change',
    description: 'Lower fees',
    proposerId: 'u1',
    parameters: { arbitrationFeeBps: 250 },
    status: 'ACTIVE',
    quorumBps: 1000,
    thresholdBps: 5000,
    forWeight: 600,
    againstWeight: 400,
    abstainWeight: 0,
    voterCount: 2,
    votingEndsAt: new Date(now + 60000).toISOString(),
    executionNotes: null,
    ...overrides,
  };
}

describe('governance presentation (#24)', () => {
  it('maps every status to a readable label', () => {
    expect(Object.keys(STATUS_LABELS)).toHaveLength(6);
    expect(STATUS_LABELS.QUEUED).toBe('Queued');
  });

  it('only allows voting on active, unexpired proposals', () => {
    expect(canVoteOn(proposal(), now)).toBe(true);
    expect(canVoteOn(proposal({ status: 'EXECUTED' }), now)).toBe(false);
    expect(
      canVoteOn(
        proposal({ votingEndsAt: new Date(now - 1000).toISOString() }),
        now,
      ),
    ).toBe(false);
  });

  it('only offers management when a proposal is decided but not applied', () => {
    expect(canManage(proposal({ status: 'SUCCEEDED' }))).toBe(true);
    expect(canManage(proposal({ status: 'QUEUED' }))).toBe(true);
    expect(canManage(proposal({ status: 'EXECUTED' }))).toBe(false);
    expect(
      canManage(
        proposal({ status: 'SUCCEEDED', executionNotes: 'Applied by admin' }),
      ),
    ).toBe(false);
  });

  it('computes participation and support safely', () => {
    expect(participationPercent(proposal(), 1000)).toBe(100);
    expect(participationPercent(proposal(), 0)).toBe(0);
    expect(supportPercent(proposal())).toBe(60);
    expect(supportPercent(proposal({ forWeight: 0, againstWeight: 0 }))).toBe(
      0,
    );
  });

  it('formats voting power and analytics cards', () => {
    expect(votingPowerLabel(null)).toBe('0');
    expect(votingPowerLabel({ balance: 500, lockedBalance: 200 })).toBe('300');
    expect(votingPowerLabel({ balance: 100, lockedBalance: 200 })).toBe('0');
    const cards = analyticsCards({
      proposalsByStatus: { ACTIVE: 1 },
      totalProposals: 1,
      totalVotes: 3,
      totalVotingPower: 1000.4,
      totalTokenSupply: 2000,
    });
    expect(cards.map((card) => card.label)).toContain('Token supply');
    expect(cards.find((card) => card.label === 'Total votes')?.value).toBe('3');
  });
});
