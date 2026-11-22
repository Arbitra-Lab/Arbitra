import { describe, expect, it } from 'vitest';
import {
  INITIAL_ARBITER_APPLICATION,
  reputationLabel,
  successRatePercent,
  toArbiterApplicationPayload,
} from '@/components/arbiters/arbiter-presentation';

const key = `G${'A'.repeat(55)}`;

describe('arbiter application presentation (#7)', () => {
  it('maps a valid form to the backend payload', () => {
    const payload = toArbiterApplicationPayload({
      ...INITIAL_ARBITER_APPLICATION,
      stellarAddress: key,
      qualifications: 'Legal experience',
      specialization: 'Property',
      jurisdictions: 'NG, US',
      languages: 'en, fr',
      stakeAmount: '1000',
      kycReference: 'kyc-1',
    });
    expect(payload.stellarAddress).toBe(key);
    expect(payload.jurisdictions).toEqual(['NG', 'US']);
    expect(payload.languages).toEqual(['en', 'fr']);
    expect(payload.stakeAmount).toBe('1000');
    expect(payload.kycReference).toBe('kyc-1');
  });

  it('rejects invalid keys, missing qualifications and bad stakes', () => {
    expect(() =>
      toArbiterApplicationPayload({
        ...INITIAL_ARBITER_APPLICATION,
        stellarAddress: 'bad',
        qualifications: 'x',
      }),
    ).toThrow(/public key/);
    expect(() =>
      toArbiterApplicationPayload({
        ...INITIAL_ARBITER_APPLICATION,
        stellarAddress: key,
      }),
    ).toThrow(/Qualifications/);
    expect(() =>
      toArbiterApplicationPayload({
        ...INITIAL_ARBITER_APPLICATION,
        stellarAddress: key,
        qualifications: 'x',
        stakeAmount: '-5',
      }),
    ).toThrow(/Stake/);
  });

  it('formats reputation and success-rate labels', () => {
    expect(reputationLabel(95)).toBe('Excellent');
    expect(reputationLabel(75)).toBe('Good');
    expect(reputationLabel(30)).toBe('Needs improvement');
    expect(successRatePercent(0.9)).toBe(90);
    expect(successRatePercent(2)).toBe(100);
  });
});
