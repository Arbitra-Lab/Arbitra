import {
  ApplicationStatus,
  calculateReputationScore,
  calculateWeightedVoteWeight,
  canTransitionApplication,
  isApplicationReviewable,
} from '../arbiter-onboarding-state';

describe('arbiter onboarding state machine (#7)', () => {
  it('allows only defined application transitions', () => {
    expect(
      canTransitionApplication(
        ApplicationStatus.PENDING,
        ApplicationStatus.APPROVED,
      ),
    ).toBe(true);
    expect(
      canTransitionApplication(
        ApplicationStatus.PENDING,
        'EXECUTED' as ApplicationStatus,
      ),
    ).toBe(false);
    expect(
      canTransitionApplication(
        ApplicationStatus.APPROVED,
        ApplicationStatus.SUSPENDED,
      ),
    ).toBe(true);
    expect(
      canTransitionApplication(
        ApplicationStatus.REJECTED,
        ApplicationStatus.PENDING,
      ),
    ).toBe(false);
  });

  it('requires KYC before a pending application can be reviewed', () => {
    expect(isApplicationReviewable(ApplicationStatus.PENDING, true)).toBe(true);
    expect(isApplicationReviewable(ApplicationStatus.PENDING, false)).toBe(
      false,
    );
    expect(isApplicationReviewable(ApplicationStatus.APPROVED, true)).toBe(
      false,
    );
  });

  it('calculates reputation between 0 and 100 with a neutral baseline', () => {
    expect(
      calculateReputationScore({
        successfulResolutions: 0,
        totalDisputesResolved: 0,
        totalVotes: 0,
      }),
    ).toBe(50);
    const perfect = calculateReputationScore({
      successfulResolutions: 10,
      totalDisputesResolved: 10,
      totalVotes: 50,
      averageResolutionHours: 10,
    });
    expect(perfect).toBeGreaterThan(90);
    expect(perfect).toBeLessThanOrEqual(100);
    const poor = calculateReputationScore({
      successfulResolutions: 1,
      totalDisputesResolved: 10,
      totalVotes: 0,
      averageResolutionHours: 200,
    });
    expect(poor).toBeLessThan(20);
    expect(
      calculateReputationScore({
        successfulResolutions: 20,
        totalDisputesResolved: 10,
        totalVotes: 5,
      }),
    ).toBeLessThanOrEqual(100);
  });

  it('derives a bounded weighted vote weight from reputation and stake', () => {
    expect(calculateWeightedVoteWeight({ reputationScore: 100 })).toBe(100);
    expect(
      calculateWeightedVoteWeight({ reputationScore: 80, stakeAmount: '1000' }),
    ).toBeGreaterThan(80);
    expect(
      calculateWeightedVoteWeight({ reputationScore: 80, stakeAmount: '1000' }),
    ).toBeLessThanOrEqual(100);
    expect(calculateWeightedVoteWeight({ reputationScore: 500 })).toBe(100);
  });
});
