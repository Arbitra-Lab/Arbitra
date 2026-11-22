import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isAllowed,
  requestAccess,
  setAllowed,
  signTransaction,
} from '@stellar/freighter-api';
import {
  getFreighterPublicKey,
  requestChallenge,
  signChallengeXdr,
  verifySignature,
} from '@/lib/stellar-auth';

vi.mock('@stellar/freighter-api', () => ({
  isAllowed: vi.fn(),
  setAllowed: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

const mockIsAllowed = vi.mocked(isAllowed);
const mockSetAllowed = vi.mocked(setAllowed);
const mockRequestAccess = vi.mocked(requestAccess);
const mockSignTransaction = vi.mocked(signTransaction);

const WALLET = 'GABC123';
const CHALLENGE = 'challenge-xdr';
const SIGNATURE = 'signed-xdr';

describe('stellar-auth: Stellar wallet authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  });

  describe('getFreighterPublicKey', () => {
    it('returns the public key when Freighter access is already granted', async () => {
      mockIsAllowed.mockResolvedValue(true as never);
      mockRequestAccess.mockResolvedValue(WALLET as never);

      await expect(getFreighterPublicKey()).resolves.toBe(WALLET);
      expect(mockSetAllowed).not.toHaveBeenCalled();
      expect(mockRequestAccess).toHaveBeenCalledOnce();
    });

    it('requests access first when Freighter is not yet allowed', async () => {
      mockIsAllowed.mockResolvedValue(false as never);
      mockSetAllowed.mockResolvedValue({} as never);
      mockRequestAccess.mockResolvedValue(WALLET as never);

      await expect(getFreighterPublicKey()).resolves.toBe(WALLET);
      expect(mockSetAllowed).toHaveBeenCalledOnce();
      expect(mockRequestAccess).toHaveBeenCalledOnce();
      expect(mockSetAllowed.mock.invocationCallOrder[0]).toBeLessThan(
        mockRequestAccess.mock.invocationCallOrder[0]!,
      );
    });

    it('throws an actionable error when granting access is rejected', async () => {
      mockIsAllowed.mockResolvedValue(false as never);
      mockSetAllowed.mockRejectedValue(new Error('user rejected'));

      await expect(getFreighterPublicKey()).rejects.toThrow(
        'Please allow access to Freighter to continue.',
      );
      expect(mockRequestAccess).not.toHaveBeenCalled();
    });

    it('surfaces the Freighter error when requestAccess returns an error object', async () => {
      mockIsAllowed.mockResolvedValue(true as never);
      mockRequestAccess.mockResolvedValue({ error: 'wallet locked' } as never);

      await expect(getFreighterPublicKey()).rejects.toThrow('wallet locked');
    });

    it('throws a generic error for an unrecognised Freighter response', async () => {
      mockIsAllowed.mockResolvedValue(true as never);
      mockRequestAccess.mockResolvedValue(undefined as never);

      await expect(getFreighterPublicKey()).rejects.toThrow(
        'Could not get public key from Freighter',
      );
    });
  });

  describe('requestChallenge', () => {
    it('posts the wallet address and returns the challenge', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({ challenge: CHALLENGE }),
      } as Response);

      await expect(requestChallenge(WALLET)).resolves.toBe(CHALLENGE);
      expect(fetch).toHaveBeenCalledWith('/api/auth/stellar/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: WALLET }),
      });
    });

    it('uses the server error message on a failed challenge request', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'unknown wallet' }),
      } as Response);

      await expect(requestChallenge(WALLET)).rejects.toThrow('unknown wallet');
    });

    it('falls back to a generic message when the error body is not JSON', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response);

      await expect(requestChallenge(WALLET)).rejects.toThrow(
        'Failed to request challenge',
      );
    });
  });

  describe('signChallengeXdr', () => {
    it('signs with the testnet passphrase by default', async () => {
      mockSignTransaction.mockResolvedValue(SIGNATURE as never);

      await expect(signChallengeXdr(CHALLENGE)).resolves.toBe(SIGNATURE);
      expect(mockSignTransaction).toHaveBeenCalledWith(CHALLENGE, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
    });

    it('signs with the public passphrase when configured for MAINNET', async () => {
      process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'PUBLIC';
      mockSignTransaction.mockResolvedValue(SIGNATURE as never);

      await signChallengeXdr(CHALLENGE);
      expect(mockSignTransaction).toHaveBeenCalledWith(CHALLENGE, {
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      });
    });

    it('surfaces the Freighter error object to the caller', async () => {
      mockSignTransaction.mockResolvedValue({
        error: 'user rejected signing',
      } as never);

      await expect(signChallengeXdr(CHALLENGE)).rejects.toThrow(
        'user rejected signing',
      );
    });

    it('rethrows a thrown signing error unchanged', async () => {
      const failure = new Error('wallet disconnected');
      mockSignTransaction.mockRejectedValue(failure);

      await expect(signChallengeXdr(CHALLENGE)).rejects.toBe(failure);
    });
  });

  describe('verifySignature', () => {
    it('posts the signed challenge and returns the auth tokens', async () => {
      const authResponse = {
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
        user: { id: 'u-1', role: 'tenant' },
      };
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => authResponse,
      } as Response);

      await expect(
        verifySignature(WALLET, CHALLENGE, SIGNATURE),
      ).resolves.toEqual(authResponse);
      expect(fetch).toHaveBeenCalledWith('/api/auth/stellar/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: WALLET,
          challenge: CHALLENGE,
          signature: SIGNATURE,
        }),
      });
    });

    it('uses the server error message when verification fails', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'invalid signature' }),
      } as Response);

      await expect(
        verifySignature(WALLET, CHALLENGE, SIGNATURE),
      ).rejects.toThrow('invalid signature');
    });

    it('falls back to a generic verification error', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: async () => ({}),
      } as Response);

      await expect(
        verifySignature(WALLET, CHALLENGE, SIGNATURE),
      ).rejects.toThrow('Signature verification failed');
    });
  });
});
