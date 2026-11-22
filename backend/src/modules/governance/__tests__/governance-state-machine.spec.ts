import {
  ALLOWED_TRANSITIONS,
  calculateVotingPower,
  canTransition,
  decideOutcome,
  ProposalStatus,
  validateParameterChanges,
} from '../governance-state-machine';

describe('governance state machine (#24)', () => {
  it('allows only explicit status transitions', () => {
    expect(canTransition(ProposalStatus.ACTIVE, ProposalStatus.SUCCEEDED)).toBe(
      true,
    );
    expect(canTransition(ProposalStatus.ACTIVE, ProposalStatus.EXECUTED)).toBe(
      false,
    );
    expect(canTransition(ProposalStatus.DEFEATED, ProposalStatus.ACTIVE)).toBe(
      false,
    );
    expect(ALLOWED_TRANSITIONS[ProposalStatus.QUEUED]).toEqual([
      ProposalStatus.EXECUTED,
    ]);
  });

  it('calculates voting power from unlocked balance and delegation', () => {
    expect(
      calculateVotingPower({
        balance: 100,
        lockedBalance: 30,
        delegatedPower: 10,
      }),
    ).toBe(80);
    expect(calculateVotingPower({ balance: 10, lockedBalance: 50 })).toBe(0);
    expect(calculateVotingPower({ balance: Number.NaN })).toBe(0);
  });

  it('requires both quorum and a majority of decisive votes', () => {
    const tally = {
      forWeight: 600,
      againstWeight: 400,
      abstainWeight: 0,
      voterCount: 2,
    };
    expect(decideOutcome(tally, 1000, 5000, 1000)).toBe(
      ProposalStatus.SUCCEEDED,
    );
    expect(
      decideOutcome(
        { ...tally, forWeight: 60, againstWeight: 40 },
        2000,
        5000,
        1000,
      ),
    ).toBe(ProposalStatus.DEFEATED);
    expect(decideOutcome(tally, 1000, 7000, 1000)).toBe(
      ProposalStatus.DEFEATED,
    );
  });

  it('validates parameter changes against explicit bounds', () => {
    expect(
      validateParameterChanges({
        arbitrationFeeBps: 250,
        disputeTimeoutHours: 24,
      }),
    ).toEqual({ valid: true, errors: [] });
    const result = validateParameterChanges({
      arbitrationFeeBps: 2000,
      unknownKey: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
    expect(validateParameterChanges({}).valid).toBe(false);
  });
});
