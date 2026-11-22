import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mutateAsync = vi.fn();
const resolveAsset = vi.fn();

vi.mock('@/lib/query/hooks/use-generic-escrow', () => ({
  useCreateGenericEscrow: () => ({ mutateAsync, isPending: false }),
  useResolveGenericAsset: () => ({
    mutateAsync: resolveAsset,
    isPending: false,
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

async function renderForm() {
  const { GenericEscrowForm } =
    await import('@/components/escrow/GenericEscrowForm');
  return render(<GenericEscrowForm />);
}

const key = (letter: string) => `G${letter.repeat(55)}`;

function fillCommonFields() {
  fireEvent.change(screen.getByLabelText('Depositor public key'), {
    target: { value: key('A') },
  });
  fireEvent.change(screen.getByLabelText('Beneficiary public key'), {
    target: { value: key('B') },
  });
  fireEvent.change(screen.getByLabelText('Arbiter public key'), {
    target: { value: key('C') },
  });
  fireEvent.change(screen.getByLabelText('Amount'), {
    target: { value: '10.0000000' },
  });
  fireEvent.change(screen.getByLabelText('Token contract id'), {
    target: { value: `C${'A'.repeat(55)}` },
  });
  ['Signer 1', 'Signer 2', 'Signer 3'].forEach((label, index) => {
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: key(String.fromCharCode(65 + index)) },
    });
  });
  fireEvent.change(screen.getByLabelText('Recipient 1'), {
    target: { value: key('Z') },
  });
}

describe('GenericEscrowForm (#6)', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({
      escrowId: 'escrow-1',
      asset: { id: 'native', assetType: 'XLM' },
    });
    resolveAsset.mockReset().mockResolvedValue({
      id: 'native',
      assetType: 'XLM',
      verifiedOnHorizon: true,
    });
  });

  it('renders the agreement-agnostic 2-of-3 form', async () => {
    await renderForm();
    expect(
      screen.getByText(/Works for rentals, freelance, trade/),
    ).toBeTruthy();
    expect(screen.getByLabelText('Agreement type')).toBeTruthy();
    expect(screen.getByLabelText('Signer 3')).toBeTruthy();
    expect(screen.getByTestId('create-generic-escrow')).toBeTruthy();
  });

  it('submits a validated payload and shows the escrow id', async () => {
    await renderForm();
    fillCommonFields();
    fireEvent.click(screen.getByTestId('create-generic-escrow'));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      agreementType: 'rental',
      requiredSignatures: 2,
      amount: '10.0000000',
    });
    expect(await screen.findByText(/Created escrow/)).toBeTruthy();
    expect(screen.getByText('escrow-1')).toBeTruthy();
  });

  it('does not submit an invalid form', async () => {
    await renderForm();
    fireEvent.click(screen.getByTestId('create-generic-escrow'));
    await waitFor(() => expect(mutateAsync).not.toHaveBeenCalled());
  });
});
