import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mutateAsync = vi.fn();

vi.mock('@/lib/query/hooks/use-arbiter-onboarding', () => ({
  useApplyAsArbiter: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

async function renderForm() {
  const { ArbiterApplicationForm } =
    await import('@/components/arbiters/ArbiterApplicationForm');
  return render(<ArbiterApplicationForm />);
}

const key = `G${'B'.repeat(55)}`;

describe('ArbiterApplicationForm (#7)', () => {
  beforeEach(() => {
    mutateAsync
      .mockReset()
      .mockResolvedValue({ id: 'app-1', status: 'PENDING' });
  });

  it('renders the KYC-linked application form', async () => {
    await renderForm();
    expect(screen.getByTestId('arbiter-address')).toBeTruthy();
    expect(screen.getByTestId('arbiter-kyc-reference')).toBeTruthy();
    expect(screen.getByTestId('submit-arbiter-application')).toBeTruthy();
  });

  it('submits a validated application payload', async () => {
    await renderForm();
    fireEvent.change(screen.getByTestId('arbiter-address'), {
      target: { value: key },
    });
    fireEvent.change(screen.getByTestId('arbiter-qualifications'), {
      target: { value: 'Legal experience' },
    });
    fireEvent.change(screen.getByTestId('arbiter-jurisdictions'), {
      target: { value: 'NG, US' },
    });
    fireEvent.click(screen.getByTestId('submit-arbiter-application'));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        stellarAddress: key,
        jurisdictions: ['NG', 'US'],
      }),
    );
  });

  it('does not submit an invalid application', async () => {
    await renderForm();
    fireEvent.click(screen.getByTestId('submit-arbiter-application'));
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
