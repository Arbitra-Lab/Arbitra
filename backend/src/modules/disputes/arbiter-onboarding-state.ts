/** Pure rules for arbiter onboarding, reputation and weighted voting (#7). */

export enum ApplicationStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  SUSPENDED = 'SUSPENDED',
}

export const ALLOWED_APPLICATION_TRANSITIONS: Record<
  ApplicationStatus,
  ApplicationStatus[]
> = {
  [ApplicationStatus.PENDING]: [
    ApplicationStatus.APPROVED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.APPROVED]: [ApplicationStatus.SUSPENDED],
  [ApplicationStatus.SUSPENDED]: [ApplicationStatus.APPROVED],
  [ApplicationStatus.REJECTED]: [],
};

export function canTransitionApplication(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return ALLOWED_APPLICATION_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface ReputationInput {
  successfulResolutions: number;
  totalDisputesResolved: number;
  totalVotes: number;
  averageResolutionHours?: number | null;
}

/**
 * Reputation in the 0-100 range. Resolution success rate carries most of the
 * weight, with participation and timeliness as smaller factors. An arbiter
 * with no history starts at a neutral 50 rather than an undeserved 100.
 */
export function calculateReputationScore(input: ReputationInput): number {
  const resolved = Math.max(0, Number(input.totalDisputesResolved) || 0);
  const successful = Math.max(
    0,
    Math.min(resolved, Number(input.successfulResolutions) || 0),
  );
  const votes = Math.max(0, Number(input.totalVotes) || 0);

  if (resolved === 0 && votes === 0) return 50;

  const successRate = resolved > 0 ? successful / resolved : 0.5;
  const participation = Math.min(1, votes / 50);
  const hours = input.averageResolutionHours;
  const timeliness =
    hours == null
      ? 0.5
      : Math.max(0, Math.min(1, (72 - Math.max(0, hours)) / 72));

  const score = successRate * 60 + participation * 25 + timeliness * 15;
  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/** Weighted arbiter vote weight: reputation dominates, stake is a small bonus. */
export function calculateWeightedVoteWeight(input: {
  reputationScore: number;
  stakeAmount?: string | number | null;
}): number {
  const reputation = Math.max(
    0,
    Math.min(100, Number(input.reputationScore) || 0),
  );
  const stake = Math.max(0, Number(input.stakeAmount) || 0);
  const stakeBonus = Math.min(20, Math.log10(1 + stake) * 5);
  return Math.round(Math.min(100, reputation + stakeBonus) * 100) / 100;
}

export function isApplicationReviewable(
  status: ApplicationStatus,
  kycApproved: boolean,
): boolean {
  return status === ApplicationStatus.PENDING && kycApproved;
}
