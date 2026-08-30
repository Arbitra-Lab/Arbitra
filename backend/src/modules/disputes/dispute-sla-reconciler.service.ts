import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import {
  DisputeEvent,
  DisputeEventType,
} from './entities/dispute-event.entity';
import { DisputeSlaService } from './dispute-sla.service';
import { DisputeAssignmentService } from './dispute-assignment.service';
import { DisputeNotificationService } from './dispute-notification.service';

export interface DisputeSlaReconciliationResult {
  scanned: number;
  escalated: number;
}

@Injectable()
export class DisputeSlaReconcilerService {
  private readonly logger = new Logger(DisputeSlaReconcilerService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    @InjectRepository(DisputeEvent)
    private readonly eventRepository: Repository<DisputeEvent>,
    private readonly slaService: DisputeSlaService,
    private readonly assignmentService: DisputeAssignmentService,
    private readonly notificationService: DisputeNotificationService,
  ) {}

  @Cron('*/5 * * * *', { name: 'dispute-sla-reconciler' })
  async runReconciliation(): Promise<DisputeSlaReconciliationResult> {
    return this.reconcile();
  }

  /**
   * Scans every active (non-terminal) dispute for a breached stage SLA and
   * escalates it. Escalation is idempotent per breach: a dispute is only
   * ever escalated once for a given `stageDueAt` value, so repeated runs
   * while it remains overdue are no-ops until the stage (and its due date)
   * changes.
   */
  async reconcile(): Promise<DisputeSlaReconciliationResult> {
    const now = new Date();

    const active = await this.disputeRepository.find({
      where: { status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]) },
      relations: ['agreement', 'assignedArbiter'],
    });

    let escalated = 0;
    for (const dispute of active) {
      try {
        if (await this.maybeEscalate(dispute, now)) {
          escalated++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to escalate dispute ${dispute.disputeId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (escalated > 0) {
      this.logger.log(
        `SLA reconciliation: scanned ${active.length}, escalated ${escalated}`,
      );
    }

    return { scanned: active.length, escalated };
  }

  private async maybeEscalate(dispute: Dispute, now: Date): Promise<boolean> {
    if (!dispute.stageDueAt || dispute.stageDueAt.getTime() > now.getTime()) {
      return false;
    }

    const alreadyEscalatedForThisDueDate =
      dispute.lastEscalatedDueAt &&
      dispute.lastEscalatedDueAt.getTime() === dispute.stageDueAt.getTime();
    if (alreadyEscalatedForThisDueDate) {
      return false;
    }

    const previousPriority = dispute.priority;
    const newPriority = this.slaService.raisePriority(previousPriority);
    const previousArbiterId = dispute.assignedArbiterId;

    const newArbiter = await this.assignmentService.assignArbiter(dispute, {
      excludeArbiterIds: previousArbiterId ? [previousArbiterId] : [],
    });

    const dueAt = dispute.stageDueAt;

    dispute.priority = newPriority;
    dispute.escalationCount = (dispute.escalationCount ?? 0) + 1;
    dispute.lastEscalatedDueAt = dueAt;
    dispute.slaBreachedAt = dispute.slaBreachedAt ?? now;
    if (newArbiter) {
      dispute.assignedArbiterId = newArbiter.id;
      dispute.assignedArbiter = newArbiter;
    }

    await this.disputeRepository.save(dispute);

    await this.recordEvent(dispute, DisputeEventType.SLA_ESCALATED, {
      stage: dispute.stage,
      previousPriority,
      newPriority,
      previousArbiterId,
      newArbiterId: newArbiter?.id ?? previousArbiterId ?? null,
      dueAt,
      breachedAt: now,
    });

    await this.notificationService.notifySlaEscalation({
      dispute,
      previousPriority,
      newPriority,
      previousArbiterId,
      newArbiter,
      dueAt,
    });

    return true;
  }

  private async recordEvent(
    dispute: Dispute,
    eventType: DisputeEventType,
    eventData: Record<string, any>,
  ): Promise<void> {
    const event = this.eventRepository.create({
      disputeId: dispute.disputeId,
      eventType,
      eventData,
      timestamp: new Date(),
      triggeredBy: 'system:sla-reconciler',
    });

    await this.eventRepository.save(event);
  }
}
