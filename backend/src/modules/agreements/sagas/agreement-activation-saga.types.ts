/**
 * Overall lifecycle of a saga run. A saga starts PENDING/RUNNING, and ends
 * in exactly one of COMPLETED (all forward steps succeeded) or COMPENSATED
 * (a step failed and every prior step was rolled back). COMPENSATION_FAILED
 * is a transient error state: a compensation itself threw, so the saga is
 * left there for resumeIncompleteSagas() to retry rather than silently
 * losing the failure.
 */
export enum SagaStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPENSATING = 'compensating',
  COMPLETED = 'completed',
  COMPENSATED = 'compensated',
  COMPENSATION_FAILED = 'compensation_failed',
}

export enum SagaStepStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  COMPENSATED = 'compensated',
  COMPENSATION_FAILED = 'compensation_failed',
}

export enum ActivationSagaStepName {
  MINT_NFT = 'mint_nft',
  FUND_ESCROW = 'fund_escrow',
  BLOCKCHAIN_SYNC = 'blockchain_sync',
  FINALIZE_ACTIVE = 'finalize_active',
  NOTIFY_PARTIES = 'notify_parties',
}

export const ACTIVATION_SAGA_STEP_ORDER: ActivationSagaStepName[] = [
  ActivationSagaStepName.MINT_NFT,
  ActivationSagaStepName.FUND_ESCROW,
  ActivationSagaStepName.BLOCKCHAIN_SYNC,
  ActivationSagaStepName.FINALIZE_ACTIVE,
  ActivationSagaStepName.NOTIFY_PARTIES,
];

export interface SagaStepRecord {
  name: ActivationSagaStepName;
  status: SagaStepStatus;
  result?: Record<string, any>;
  error?: string;
  completedAt?: string;
  compensatedAt?: string;
}

/**
 * Accumulated saga data: the fields captured when the saga is created, plus
 * the result of every completed step keyed by step name (so a later step,
 * or a compensation, can read what an earlier one produced).
 */
export interface ActivationSagaContext {
  adminId?: string | null;
  userId?: string | null;
  adminStellarPubKey?: string | null;
  userStellarPubKey?: string | null;
  [stepResultKey: string]: any;
}

export interface ActivationSagaStep {
  name: ActivationSagaStepName;
  /** Forward action. Must be safe to call again for a step already completed elsewhere. */
  execute: (
    context: ActivationSagaContext,
    agreementId: string,
  ) => Promise<Record<string, any> | void>;
  /** Compensating action. Only invoked for steps whose forward action already completed. */
  compensate: (
    context: ActivationSagaContext,
    agreementId: string,
    previousAgreementStatus: string,
  ) => Promise<void>;
}
