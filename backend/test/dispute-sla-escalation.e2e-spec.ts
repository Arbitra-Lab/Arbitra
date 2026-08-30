/**
 * e2e: dispute SLA escalation reconciler.
 *
 * Drives a dispute whose stage SLA has already breached through the real
 * DisputeSlaReconcilerService (backed by the real DisputeSlaService,
 * DisputeAssignmentService and DisputeNotificationService) and asserts the
 * escalation — priority raise, auditable DisputeEvent, notification — fires
 * exactly once per breach, even across repeated reconciliation runs.
 */
process.env.NODE_ENV = 'test';

import { DisputeSlaReconcilerService } from '../src/modules/disputes/dispute-sla-reconciler.service';
import { DisputeSlaService } from '../src/modules/disputes/dispute-sla.service';
import { DisputeAssignmentService } from '../src/modules/disputes/dispute-assignment.service';
import { DisputeNotificationService } from '../src/modules/disputes/dispute-notification.service';
import {
  Dispute,
  DisputeStatus,
  DisputeStage,
  DisputePriority,
  DisputeType,
} from '../src/modules/disputes/entities/dispute.entity';
import {
  DisputeEvent,
  DisputeEventType,
} from '../src/modules/disputes/entities/dispute-event.entity';

describe('Dispute SLA escalation (e2e)', () => {
  let dispute: Dispute;
  let recordedEvents: DisputeEvent[];
  let reconciler: DisputeSlaReconcilerService;
  let notifySpy: jest.SpyInstance;

  beforeEach(() => {
    recordedEvents = [];

    dispute = {
      id: 1,
      disputeId: 'dispute-e2e-1',
      agreementId: 1,
      agreement: {
        id: '1',
        adminId: 'landlord-1',
        userId: 'tenant-1',
        agentId: null,
      },
      initiatedBy: 'tenant-1',
      disputeType: DisputeType.RENT_PAYMENT,
      status: DisputeStatus.OPEN,
      stage: DisputeStage.INTAKE,
      stageDueAt: new Date(Date.now() - 60_000), // already 1 minute overdue
      priority: DisputePriority.NORMAL,
      escalationCount: 0,
      lastEscalatedDueAt: null,
      slaBreachedAt: null,
      assignedArbiterId: null,
      assignedArbiter: null,
    } as unknown as Dispute;

    const disputeRepository = {
      find: jest.fn().mockImplementation(async () => [dispute]),
      save: jest.fn().mockImplementation(async (updated: Dispute) => {
        Object.assign(dispute, updated);
        return dispute;
      }),
    };

    const eventRepository = {
      create: jest.fn().mockImplementation((data) => data as DisputeEvent),
      save: jest.fn().mockImplementation(async (event: DisputeEvent) => {
        recordedEvents.push(event);
        return event;
      }),
    };

    // No arbiters registered: assignArbiter short-circuits to null without
    // needing to fake the query-builder load-counting path.
    const arbiterRepository = { find: jest.fn().mockResolvedValue([]) };
    const assignmentDisputeRepository = {};

    const slaService = new DisputeSlaService();
    const assignmentService = new DisputeAssignmentService(
      arbiterRepository as any,
      assignmentDisputeRepository as any,
    );
    const notificationService = new DisputeNotificationService();
    notifySpy = jest
      .spyOn(notificationService, 'notifySlaEscalation')
      .mockResolvedValue(undefined);

    reconciler = new DisputeSlaReconcilerService(
      disputeRepository as any,
      eventRepository as any,
      slaService,
      assignmentService,
      notificationService,
    );
  });

  it('escalates an overdue dispute exactly once across repeated reconciliation runs', async () => {
    const first = await reconciler.reconcile();
    expect(first).toEqual({ scanned: 1, escalated: 1 });
    expect(dispute.priority).toBe(DisputePriority.HIGH);
    expect(dispute.escalationCount).toBe(1);
    expect(dispute.slaBreachedAt).not.toBeNull();

    // Reconciler runs again while the dispute remains overdue on the same
    // due date — must be a no-op.
    const second = await reconciler.reconcile();
    expect(second).toEqual({ scanned: 1, escalated: 0 });
    expect(dispute.priority).toBe(DisputePriority.HIGH);
    expect(dispute.escalationCount).toBe(1);

    const third = await reconciler.reconcile();
    expect(third.escalated).toBe(0);

    const escalationEvents = recordedEvents.filter(
      (event) => event.eventType === DisputeEventType.SLA_ESCALATED,
    );
    expect(escalationEvents).toHaveLength(1);
    expect(escalationEvents[0]).toMatchObject({
      disputeId: 'dispute-e2e-1',
      eventData: expect.objectContaining({
        previousPriority: DisputePriority.NORMAL,
        newPriority: DisputePriority.HIGH,
      }),
    });

    expect(notifySpy).toHaveBeenCalledTimes(1);
  });

  it('does not escalate a dispute that is still within its SLA window', async () => {
    dispute.stageDueAt = new Date(Date.now() + 3_600_000);

    const result = await reconciler.reconcile();

    expect(result.escalated).toBe(0);
    expect(dispute.priority).toBe(DisputePriority.NORMAL);
    expect(recordedEvents).toHaveLength(0);
    expect(notifySpy).not.toHaveBeenCalled();
  });

  it('escalates again once the stage advances past its own due date', async () => {
    await reconciler.reconcile();
    expect(dispute.escalationCount).toBe(1);

    dispute.stage = DisputeStage.ARBITRATION;
    dispute.stageDueAt = new Date(Date.now() - 1_000);

    const result = await reconciler.reconcile();

    expect(result.escalated).toBe(1);
    expect(dispute.priority).toBe(DisputePriority.URGENT);
    expect(dispute.escalationCount).toBe(2);

    const escalationEvents = recordedEvents.filter(
      (event) => event.eventType === DisputeEventType.SLA_ESCALATED,
    );
    expect(escalationEvents).toHaveLength(2);
  });
});
