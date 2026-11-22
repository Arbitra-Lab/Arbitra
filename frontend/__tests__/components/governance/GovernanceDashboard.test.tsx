import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const create = vi.fn();
const vote = vi.fn();
const finalize = vi.fn();
const execute = vi.fn();

const activeProposal = {
  id: 'p1',
  type: 'PARAMETER_CHANGE',
  title: 'Adjust arbitration fee',
  description: 'Lower the fee to 2.5%',
  proposerId: 'u1',
  parameters: { arbitrationFeeBps: 250 },
  status: 'ACTIVE',
  quorumBps: 1000,
  thresholdBps: 5000,
  forWeight: 600,
  againstWeight: 400,
  abstainWeight: 0,
  voterCount: 2,
  votingEndsAt: new Date(Date.now() + 86400000).toISOString(),
  executionNotes: null,
};

const succeededProposal = {
  ...activeProposal,
  id: 'p2',
  title: 'Raise timeout',
  status: 'SUCCEEDED',
};

vi.mock('@/lib/query/hooks/use-governance', () => ({
  useGovernanceProposals: () => ({ data: [activeProposal, succeededProposal] }),
  useGovernanceAnalytics: () => ({
    data: {
      proposalsByStatus: { ACTIVE: 1, SUCCEEDED: 1 },
      totalProposals: 2,
      totalVotes: 2,
      totalVotingPower: 1000,
      totalTokenSupply: 2000,
    },
  }),
  useGovernanceBalance: () => ({ data: { balance: 500, lockedBalance: 100 } }),
  useCreateGovernanceProposal: () => ({
    mutateAsync: create,
    isPending: false,
  }),
  useVote: () => ({ mutateAsync: vote, isPending: false }),
  useFinalizeProposal: () => ({ mutateAsync: finalize, isPending: false }),
  useExecuteProposal: () => ({ mutateAsync: execute, isPending: false }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

async function renderDashboard() {
  const { GovernanceDashboard } =
    await import('@/components/governance/GovernanceDashboard');
  return render(<GovernanceDashboard />);
}

describe('GovernanceDashboard (#24)', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({});
    vote.mockReset().mockResolvedValue({});
    finalize.mockReset().mockResolvedValue({});
    execute.mockReset().mockResolvedValue({});
  });

  it('renders analytics, voting power and proposal statuses', async () => {
    await renderDashboard();
    expect(screen.getByTestId('voting-power').textContent).toBe('400');
    expect(screen.getByText('Total proposals')).toBeTruthy();
    expect(screen.getByTestId('status-p1').textContent).toBe('Active');
    expect(screen.getByTestId('status-p2').textContent).toBe('Succeeded');
  });

  it('records a vote on an active proposal', async () => {
    await renderDashboard();
    fireEvent.click(screen.getByTestId('vote-for-p1'));
    expect(vote).toHaveBeenCalledWith({
      id: 'p1',
      payload: { choice: 'FOR' },
    });
  });

  it('does not show vote controls on decided proposals', async () => {
    await renderDashboard();
    expect(screen.queryByTestId('vote-for-p2')).toBeNull();
    expect(screen.getByTestId('finalize-p2')).toBeTruthy();
  });

  it('creates a parameter change proposal with a validated payload', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByTestId('proposal-title'), {
      target: { value: 'New fee' },
    });
    fireEvent.change(screen.getByTestId('proposal-description'), {
      target: { value: 'Set the fee' },
    });
    fireEvent.change(screen.getByTestId('proposal-fee-bps'), {
      target: { value: '250' },
    });
    fireEvent.click(screen.getByTestId('create-proposal'));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PARAMETER_CHANGE',
        parameters: { arbitrationFeeBps: 250 },
      }),
    );
  });

  it('requires a parameter value for parameter changes', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByTestId('proposal-title'), {
      target: { value: 'New fee' },
    });
    fireEvent.change(screen.getByTestId('proposal-description'), {
      target: { value: 'Set the fee' },
    });
    fireEvent.click(screen.getByTestId('create-proposal'));
    expect(create).not.toHaveBeenCalled();
  });
});
