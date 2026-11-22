import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStellarEscrow,
  processStellarRentPayment,
} from '@/lib/contracts/soroban-client';

const post = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => post(...args) },
}));

describe('escrow workflow: Stellar payments through the backend', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('creates an escrow deposit with the agreement id and amount', async () => {
    post.mockResolvedValue({ data: { id: 'escrow-1', status: 'funded' } });

    const result = await createStellarEscrow({
      agreementId: 'agr-1',
      amount: 40000,
    });

    expect(post).toHaveBeenCalledWith('/payments/stellar/escrow', {
      agreementId: 'agr-1',
      amount: 40000,
    });
    expect(result).toEqual({ id: 'escrow-1', status: 'funded' });
  });

  it('forwards the optional memo when processing rent', async () => {
    post.mockResolvedValue({ data: { hash: 'tx-1' } });

    const result = await processStellarRentPayment({
      agreementId: 'agr-1',
      amount: 25000,
      memo: 'rent-november',
    });

    expect(post).toHaveBeenCalledWith('/payments/stellar/rent', {
      agreementId: 'agr-1',
      amount: 25000,
      memo: 'rent-november',
    });
    expect(result).toEqual({ hash: 'tx-1' });
  });

  it('supports the full escrow-then-rent sequence in order', async () => {
    post
      .mockResolvedValueOnce({ data: { id: 'escrow-1' } })
      .mockResolvedValueOnce({ data: { hash: 'tx-rent' } });

    await createStellarEscrow({ agreementId: 'agr-1', amount: 40000 });
    await processStellarRentPayment({ agreementId: 'agr-1', amount: 25000 });

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]![0]).toBe('/payments/stellar/escrow');
    expect(post.mock.calls[1]![0]).toBe('/payments/stellar/rent');
  });

  it('propagates a failed escrow deposit to the caller', async () => {
    const failure = new Error('insufficient balance');
    post.mockRejectedValue(failure);

    await expect(
      createStellarEscrow({ agreementId: 'agr-1', amount: 40000 }),
    ).rejects.toBe(failure);
  });

  it('does not swallow a failed rent payment', async () => {
    post.mockRejectedValue(new Error('relayer down'));

    await expect(
      processStellarRentPayment({ agreementId: 'agr-1', amount: 25000 }),
    ).rejects.toThrow('relayer down');
  });
});
