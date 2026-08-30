import { Injectable } from '@nestjs/common';
import {
  DisputeStage,
  DisputeStatus,
  DisputePriority,
} from './entities/dispute.entity';
import {
  DISPUTE_STAGE_SLA,
  DISPUTE_STAGE_BY_STATUS,
  DISPUTE_ESCALATION_PRIORITY_ORDER,
} from './dispute-sla.config';

export type DisputeSlaState = 'on_track' | 'at_risk' | 'breached' | 'n/a';

export interface DisputeSlaStatusResult {
  status: DisputeSlaState;
  /** Milliseconds remaining until the due date (negative once breached). */
  msRemaining: number | null;
}

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class DisputeSlaService {
  /**
   * Stage a given (active) dispute status is SLA-tracked under, or null for
   * terminal statuses that carry no SLA.
   */
  stageForStatus(status: DisputeStatus): DisputeStage | null {
    return DISPUTE_STAGE_BY_STATUS[status] ?? null;
  }

  /**
   * Due timestamp for a stage, measured from `from` (defaults to now).
   */
  computeStageDueDate(stage: DisputeStage, from: Date = new Date()): Date {
    const window = DISPUTE_STAGE_SLA[stage];
    return new Date(from.getTime() + window.hours * HOUR_MS);
  }

  /**
   * Classifies a dispute's SLA state given its stage due date.
   */
  getSlaStatus(
    dueAt: Date | null,
    stage: DisputeStage | null,
    now: Date = new Date(),
  ): DisputeSlaStatusResult {
    if (!dueAt || !stage) {
      return { status: 'n/a', msRemaining: null };
    }

    const msRemaining = dueAt.getTime() - now.getTime();
    if (msRemaining <= 0) {
      return { status: 'breached', msRemaining };
    }

    const window = DISPUTE_STAGE_SLA[stage];
    const totalWindowMs = window.hours * HOUR_MS;
    const atRiskThresholdMs = totalWindowMs * window.atRiskThresholdRatio;

    if (msRemaining <= atRiskThresholdMs) {
      return { status: 'at_risk', msRemaining };
    }

    return { status: 'on_track', msRemaining };
  }

  /** Raises priority by one level, capped at URGENT. */
  raisePriority(current: DisputePriority): DisputePriority {
    const order = DISPUTE_ESCALATION_PRIORITY_ORDER;
    const idx = order.indexOf(current as (typeof order)[number]);
    const nextIdx = idx === -1 ? 0 : Math.min(idx + 1, order.length - 1);
    return order[nextIdx] as DisputePriority;
  }
}
