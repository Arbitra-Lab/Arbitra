import { DisputeSlaService } from '../dispute-sla.service';
import {
  DisputeStage,
  DisputeStatus,
  DisputePriority,
} from '../entities/dispute.entity';
import { DISPUTE_STAGE_SLA } from '../dispute-sla.config';

describe('DisputeSlaService', () => {
  let service: DisputeSlaService;

  beforeEach(() => {
    service = new DisputeSlaService();
  });

  describe('stageForStatus', () => {
    it('maps OPEN to INTAKE', () => {
      expect(service.stageForStatus(DisputeStatus.OPEN)).toBe(
        DisputeStage.INTAKE,
      );
    });

    it('maps UNDER_REVIEW to ARBITRATION', () => {
      expect(service.stageForStatus(DisputeStatus.UNDER_REVIEW)).toBe(
        DisputeStage.ARBITRATION,
      );
    });

    it('returns null for terminal statuses', () => {
      expect(service.stageForStatus(DisputeStatus.RESOLVED)).toBeNull();
      expect(service.stageForStatus(DisputeStatus.REJECTED)).toBeNull();
      expect(service.stageForStatus(DisputeStatus.WITHDRAWN)).toBeNull();
    });
  });

  describe('computeStageDueDate', () => {
    it('adds the INTAKE window (24h) to the reference time', () => {
      const from = new Date('2026-01-01T00:00:00.000Z');
      const due = service.computeStageDueDate(DisputeStage.INTAKE, from);
      expect(due.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    });

    it('adds the ARBITRATION window (72h) to the reference time', () => {
      const from = new Date('2026-01-01T00:00:00.000Z');
      const due = service.computeStageDueDate(DisputeStage.ARBITRATION, from);
      expect(due.toISOString()).toBe('2026-01-04T00:00:00.000Z');
    });

    it('defaults the reference time to now when omitted', () => {
      const before = Date.now();
      const due = service.computeStageDueDate(DisputeStage.INTAKE);
      const after = Date.now();
      const window = DISPUTE_STAGE_SLA[DisputeStage.INTAKE].hours * 3600_000;
      expect(due.getTime()).toBeGreaterThanOrEqual(before + window);
      expect(due.getTime()).toBeLessThanOrEqual(after + window);
    });
  });

  describe('getSlaStatus', () => {
    const stage = DisputeStage.INTAKE; // 24h window, 25% at-risk threshold (6h)

    it('is "n/a" when there is no due date or stage', () => {
      expect(service.getSlaStatus(null, null)).toEqual({
        status: 'n/a',
        msRemaining: null,
      });
      expect(service.getSlaStatus(new Date(), null).status).toBe('n/a');
    });

    it('is "on_track" well before the due date', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const dueAt = new Date('2026-01-02T00:00:00.000Z'); // 24h away
      const result = service.getSlaStatus(dueAt, stage, now);
      expect(result.status).toBe('on_track');
      expect(result.msRemaining).toBe(24 * 3600_000);
    });

    it('is "at_risk" once inside the risk threshold window', () => {
      const now = new Date('2026-01-01T19:00:00.000Z'); // 5h remaining, threshold is 6h
      const dueAt = new Date('2026-01-02T00:00:00.000Z');
      const result = service.getSlaStatus(dueAt, stage, now);
      expect(result.status).toBe('at_risk');
      expect(result.msRemaining).toBe(5 * 3600_000);
    });

    it('is "on_track" exactly at the risk threshold boundary + 1ms', () => {
      const dueAt = new Date('2026-01-02T00:00:00.000Z');
      const now = new Date(dueAt.getTime() - 6 * 3600_000 - 1);
      expect(service.getSlaStatus(dueAt, stage, now).status).toBe('on_track');
    });

    it('is "at_risk" exactly at the risk threshold boundary', () => {
      const dueAt = new Date('2026-01-02T00:00:00.000Z');
      const now = new Date(dueAt.getTime() - 6 * 3600_000);
      expect(service.getSlaStatus(dueAt, stage, now).status).toBe('at_risk');
    });

    it('is "breached" once the due date has passed', () => {
      const now = new Date('2026-01-02T00:00:01.000Z');
      const dueAt = new Date('2026-01-02T00:00:00.000Z');
      const result = service.getSlaStatus(dueAt, stage, now);
      expect(result.status).toBe('breached');
      expect(result.msRemaining).toBeLessThan(0);
    });

    it('is "breached" exactly at the due date (msRemaining === 0)', () => {
      const dueAt = new Date('2026-01-02T00:00:00.000Z');
      const result = service.getSlaStatus(dueAt, stage, dueAt);
      expect(result.status).toBe('breached');
      expect(result.msRemaining).toBe(0);
    });
  });

  describe('raisePriority', () => {
    it('escalates one level at a time', () => {
      expect(service.raisePriority(DisputePriority.LOW)).toBe(
        DisputePriority.NORMAL,
      );
      expect(service.raisePriority(DisputePriority.NORMAL)).toBe(
        DisputePriority.HIGH,
      );
      expect(service.raisePriority(DisputePriority.HIGH)).toBe(
        DisputePriority.URGENT,
      );
    });

    it('caps at URGENT', () => {
      expect(service.raisePriority(DisputePriority.URGENT)).toBe(
        DisputePriority.URGENT,
      );
    });
  });
});
