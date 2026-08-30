import { DisputeStage, DisputeStatus } from './entities/dispute.entity';

export interface StageSlaWindow {
  /** Size of the SLA window for this stage, in hours. */
  hours: number;
  /**
   * Fraction of the window (0-1) remaining under which the dispute is
   * considered "at risk" rather than "on track".
   */
  atRiskThresholdRatio: number;
}

/**
 * Per-stage SLA windows. INTAKE covers triage + arbiter assignment;
 * ARBITRATION covers review/voting by the assigned arbiter(s).
 */
export const DISPUTE_STAGE_SLA: Record<DisputeStage, StageSlaWindow> = {
  [DisputeStage.INTAKE]: { hours: 24, atRiskThresholdRatio: 0.25 },
  [DisputeStage.ARBITRATION]: { hours: 72, atRiskThresholdRatio: 0.25 },
};

/** Maps the active (non-terminal) statuses onto their SLA-tracked stage. */
export const DISPUTE_STAGE_BY_STATUS: Partial<
  Record<DisputeStatus, DisputeStage>
> = {
  [DisputeStatus.OPEN]: DisputeStage.INTAKE,
  [DisputeStatus.UNDER_REVIEW]: DisputeStage.ARBITRATION,
};

export const DISPUTE_ESCALATION_PRIORITY_ORDER = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
] as const;
