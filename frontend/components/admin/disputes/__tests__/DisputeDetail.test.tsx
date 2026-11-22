import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { DisputeDetail } from '../DisputeDetail';
import type { AdminDisputeDetail } from '@/lib/admin-dispute-detail';

const dispute: AdminDisputeDetail = {
  id: 'dis-1',
  disputeId: 'DSP-2026-001',
  agreementReference: 'AGR-2026-001',
  propertyName: 'Test Property',
  claimantName: 'Amina',
  claimantRole: 'user',
  respondentName: 'James',
  respondentRole: 'user',
  disputeType: 'RENT_PAYMENT',
  description: 'Duplicate rent debit.',
  status: 'UNDER_REVIEW',
  priority: 'high',
  currency: 'USDC',
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  evidence: [],
  timeline: [],
  resolutionHistory: [],
  votes: [
    {
      id: 'vote-1',
      arbiterName: 'Efe Okafor',
      weight: 3,
      favor: 'tenant',
      comment: 'Receipts support the tenant.',
      votedAt: '2026-11-02T10:00:00.000Z',
    },
    {
      id: 'vote-2',
      arbiterName: 'Team B',
      weight: 2,
      favor: 'landlord',
      votedAt: '2026-11-02T11:00:00.000Z',
    },
  ],
  appeals: [
    {
      id: 'appeal-1',
      status: 'pending',
      reason: 'Please review the new receipt.',
      createdAt: '2026-11-03T10:00:00.000Z',
    },
  ],
};

describe('DisputeDetail arbitration workspace', () => {
  it('shows weighted vote totals and individual arbiter weights', () => {
    render(<DisputeDetail dispute={dispute} onBack={vi.fn()} />);

    expect(screen.getByText('Landlord weight: 2')).toBeInTheDocument();
    expect(screen.getByText('Tenant weight: 3')).toBeInTheDocument();
    expect(screen.getByText('Efe Okafor')).toBeInTheDocument();
    expect(
      screen.getByText('Receipts support the tenant.'),
    ).toBeInTheDocument();
  });

  it('shows the appeal workflow with existing appeal history', () => {
    render(<DisputeDetail dispute={dispute} onBack={vi.fn()} />);

    expect(screen.getByText('Appeals')).toBeInTheDocument();
    expect(
      screen.getByText('Please review the new receipt.'),
    ).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('records a weighted vote through the callback', async () => {
    const onCastVote = vi.fn().mockResolvedValue(undefined);
    render(
      <DisputeDetail
        dispute={dispute}
        onBack={vi.fn()}
        onCastVote={onCastVote}
      />,
    );

    fireEvent.change(screen.getByLabelText('Arbiter name'), {
      target: { value: 'New Arbiter' },
    });
    fireEvent.change(screen.getByLabelText('Vote weight'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record vote' }));

    expect(onCastVote).toHaveBeenCalledWith({
      arbiterName: 'New Arbiter',
      weight: 4,
      favor: 'tenant',
      comment: undefined,
    });
  });

  it('submits an appeal with a valid reason', async () => {
    const onSubmitAppeal = vi.fn().mockResolvedValue(undefined);
    render(
      <DisputeDetail
        dispute={dispute}
        onBack={vi.fn()}
        onSubmitAppeal={onSubmitAppeal}
      />,
    );

    fireEvent.change(screen.getByLabelText('Record an appeal'), {
      target: { value: 'New evidence was submitted after the decision.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit appeal' }));

    expect(onSubmitAppeal).toHaveBeenCalledWith(
      'New evidence was submitted after the decision.',
    );
  });
});
