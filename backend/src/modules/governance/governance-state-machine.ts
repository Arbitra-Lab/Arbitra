/** Pure governance rules for #24, shared by the service, controller and tests. */

export enum ProposalType {
  PARAMETER_CHANGE = 'PARAMETER_CHANGE',
  ARBITER_QUALIFICATION = 'ARBITER_QUALIFICATION',
  EMERGENCY_UPGRADE = 'EMERGENCY_UPGRADE',
  GENERAL = 'GENERAL',
}

export enum ProposalStatus {
  ACTIVE = 'ACTIVE',
  SUCCEEDED = 'SUCCEEDED',
  DEFEATED = 'DEFEATED',
  QUEUED = 'QUEUED',
  EXECUTED = 'EXECUTED',
  CANCELLED = 'CANCELLED',
}

export enum VoteChoice {
  FOR = 'FOR',
  AGAINST = 'AGAINST',
  ABSTAIN = 'ABSTAIN',
}

export interface VoteTally {
  forWeight: number;
  againstWeight: number;
  abstainWeight: number;
  voterCount: number;
}

export const ALLOWED_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  [ProposalStatus.ACTIVE]: [
    ProposalStatus.SUCCEEDED,
    ProposalStatus.DEFEATED,
    ProposalStatus.CANCELLED,
  ],
  [ProposalStatus.SUCCEEDED]: [
    ProposalStatus.EXECUTED,
    ProposalStatus.QUEUED,
    ProposalStatus.CANCELLED,
  ],
  [ProposalStatus.QUEUED]: [ProposalStatus.EXECUTED],
  [ProposalStatus.DEFEATED]: [],
  [ProposalStatus.EXECUTED]: [],
  [ProposalStatus.CANCELLED]: [],
};

export function canTransition(
  from: ProposalStatus,
  to: ProposalStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function calculateVotingPower(input: {
  balance: number;
  lockedBalance?: number;
  delegatedPower?: number;
}): number {
  const unlocked = Math.max(0, Number(input.balance) || 0);
  const locked = Math.max(0, Number(input.lockedBalance) || 0);
  const delegated = Math.max(0, Number(input.delegatedPower) || 0);
  return Math.max(0, unlocked - locked + delegated);
}

/** Quorum uses all votes; threshold uses only decisive (for/against) votes. */
export function decideOutcome(
  tally: VoteTally,
  quorumBps: number,
  thresholdBps: number,
  totalSupply: number,
): ProposalStatus {
  const participation =
    tally.forWeight + tally.againstWeight + tally.abstainWeight;
  const quorum = totalSupply > 0 ? (participation * 10000) / totalSupply : 0;
  const decisive = tally.forWeight + tally.againstWeight;
  const support = decisive > 0 ? (tally.forWeight * 10000) / decisive : 0;

  if (quorum >= quorumBps && support >= thresholdBps) {
    return ProposalStatus.SUCCEEDED;
  }
  return ProposalStatus.DEFEATED;
}

export interface ParameterRule {
  min: number;
  max: number;
}

export const PARAMETER_RULES: Record<string, ParameterRule> = {
  arbitrationFeeBps: { min: 0, max: 1000 },
  disputeTimeoutHours: { min: 1, max: 720 },
  arbiterStakeMinimum: { min: 0, max: 1000000 },
  quorumBps: { min: 100, max: 10000 },
};

export interface ParameterValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateParameterChanges(
  changes: Record<string, number>,
): ParameterValidationResult {
  const errors: string[] = [];
  const entries = Object.entries(changes ?? {});
  if (entries.length === 0) errors.push('At least one parameter is required');

  for (const [key, value] of entries) {
    const rule = PARAMETER_RULES[key];
    if (!rule) {
      errors.push(`Unknown parameter: ${key}`);
      continue;
    }
    if (!Number.isFinite(value) || value < rule.min || value > rule.max) {
      errors.push(`${key} must be between ${rule.min} and ${rule.max}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
