import type { ArbiterApplicationPayload } from '@/lib/query/hooks/use-arbiter-onboarding';

export interface ArbiterApplicationFormState {
  stellarAddress: string;
  qualifications: string;
  specialization: string;
  jurisdictions: string;
  languages: string;
  stakeAmount: string;
  kycReference: string;
}

export const INITIAL_ARBITER_APPLICATION: ArbiterApplicationFormState = {
  stellarAddress: '',
  qualifications: '',
  specialization: '',
  jurisdictions: '',
  languages: '',
  stakeAmount: '',
  kycReference: '',
};

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/i;
const STAKE = /^\d+(\.\d{1,7})?$/;

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Validate the arbiter application form into the backend DTO shape (#7). */
export function toArbiterApplicationPayload(
  form: ArbiterApplicationFormState,
): ArbiterApplicationPayload {
  if (!PUBLIC_KEY.test(form.stellarAddress.trim())) {
    throw new Error('A valid Stellar public key is required');
  }
  if (!form.qualifications.trim()) {
    throw new Error('Qualifications are required');
  }
  if (form.stakeAmount && !STAKE.test(form.stakeAmount)) {
    throw new Error('Stake amount must be a non-negative number');
  }

  return {
    stellarAddress: form.stellarAddress.trim(),
    qualifications: form.qualifications.trim(),
    specialization: form.specialization.trim() || undefined,
    jurisdictions: splitList(form.jurisdictions),
    languages: splitList(form.languages),
    stakeAmount: form.stakeAmount || undefined,
    kycReference: form.kycReference.trim() || undefined,
  };
}

export function successRatePercent(rate: number): number {
  return Math.round(Math.max(0, Math.min(1, rate)) * 100);
}

export function reputationLabel(score: number): string {
  if (score >= 90) return 'Excellent';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Needs improvement';
}
