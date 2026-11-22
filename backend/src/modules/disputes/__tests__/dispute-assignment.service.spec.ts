import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DisputeAssignmentService } from '../dispute-assignment.service';
import { Arbiter } from '../entities/arbiter.entity';
import {
  Dispute,
  DisputePriority,
  DisputeStatus,
  DisputeType,
} from '../entities/dispute.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/entities/audit-log.entity';

function makeArbiter(overrides: Partial<Arbiter> = {}): Arbiter {
  return {
    id: 1,
    stellarAddress: 'G...',
    userId: null,
    active: true,
    reputationScore: 0,
    expertiseTags: null,
    conflictUserIds: null,
    maxActiveDisputes: 5,
    ...overrides,
  } as Arbiter;
}

describe('DisputeAssignmentService', () => {
  let service: DisputeAssignmentService;
  let auditLog: jest.Mock;

  beforeEach(async () => {
    auditLog = jest.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        DisputeAssignmentService,
        {
          provide: getRepositoryToken(Arbiter),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Dispute),
          useValue: {},
        },
        {
          provide: AuditService,
          useValue: { log: auditLog },
        },
      ],
    }).compile();

    service = module.get(DisputeAssignmentService);
  });

  describe('hasConflictOfInterest', () => {
    it('flags an arbiter who is a party to the dispute', () => {
      const arbiter = makeArbiter({ userId: 42 });
      expect(service.hasConflictOfInterest(arbiter, ['42', 99])).toBe(true);
    });

    it('flags an arbiter with a declared conflict', () => {
      const arbiter = makeArbiter({ userId: 1, conflictUserIds: ['77'] });
      expect(service.hasConflictOfInterest(arbiter, [77])).toBe(true);
    });

    it('does not flag an unrelated arbiter', () => {
      const arbiter = makeArbiter({ userId: 1, conflictUserIds: ['77'] });
      expect(service.hasConflictOfInterest(arbiter, [2, 3])).toBe(false);
    });

    it('ignores null/undefined party ids', () => {
      const arbiter = makeArbiter({ userId: 1 });
      expect(service.hasConflictOfInterest(arbiter, [null, undefined])).toBe(
        false,
      );
    });
  });

  describe('scoreArbiter', () => {
    it('scores an idle, matching-expertise, max-reputation arbiter at 1', () => {
      const arbiter = makeArbiter({
        expertiseTags: ['RENT_PAYMENT'],
        reputationScore: 100,
        maxActiveDisputes: 5,
      });
      expect(
        service.scoreArbiter(arbiter, 0, DisputeType.RENT_PAYMENT),
      ).toBeCloseTo(1);
    });

    it('penalizes higher current load', () => {
      const arbiter = makeArbiter({ maxActiveDisputes: 4 });
      const idle = service.scoreArbiter(arbiter, 0, DisputeType.OTHER);
      const busy = service.scoreArbiter(arbiter, 2, DisputeType.OTHER);
      const full = service.scoreArbiter(arbiter, 4, DisputeType.OTHER);
      expect(idle).toBeGreaterThan(busy);
      expect(busy).toBeGreaterThan(full);
    });

    it('rewards a matching expertise tag over no match', () => {
      const withTag = makeArbiter({ expertiseTags: ['MAINTENANCE'] });
      const withoutTag = makeArbiter({ expertiseTags: ['OTHER'] });
      const scoreWith = service.scoreArbiter(
        withTag,
        0,
        DisputeType.MAINTENANCE,
      );
      const scoreWithout = service.scoreArbiter(
        withoutTag,
        0,
        DisputeType.MAINTENANCE,
      );
      expect(scoreWith).toBeGreaterThan(scoreWithout);
    });

    it('is case-insensitive when matching expertise tags', () => {
      const arbiter = makeArbiter({ expertiseTags: ['maintenance'] });
      const scored = service.scoreArbiter(arbiter, 0, DisputeType.MAINTENANCE);
      const unscored = service.scoreArbiter(
        makeArbiter({ expertiseTags: ['other'] }),
        0,
        DisputeType.MAINTENANCE,
      );
      expect(scored).toBeGreaterThan(unscored);
    });

    it('rewards higher reputation', () => {
      const lowRep = makeArbiter({ reputationScore: 10 });
      const highRep = makeArbiter({ reputationScore: 90 });
      expect(
        service.scoreArbiter(highRep, 0, DisputeType.OTHER),
      ).toBeGreaterThan(service.scoreArbiter(lowRep, 0, DisputeType.OTHER));
    });
  });

  describe('selectBestArbiter', () => {
    it('picks the arbiter with the most load headroom', () => {
      const light = makeArbiter({ id: 1 });
      const heavy = makeArbiter({ id: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: light, currentLoad: 0 },
          { arbiter: heavy, currentLoad: 4 },
        ],
        { disputeType: DisputeType.OTHER, partyUserIds: [] },
      );
      expect(result?.id).toBe(1);
    });

    it('never returns an arbiter with a declared conflict', () => {
      const conflicted = makeArbiter({ id: 1, conflictUserIds: ['10'] });
      const clean = makeArbiter({ id: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: conflicted, currentLoad: 0 },
          { arbiter: clean, currentLoad: 3 },
        ],
        { disputeType: DisputeType.OTHER, partyUserIds: [10] },
      );
      expect(result?.id).toBe(2);
    });

    it('never returns an arbiter who is a party to the dispute', () => {
      const selfConflicted = makeArbiter({ id: 1, userId: 55 });
      const clean = makeArbiter({ id: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: selfConflicted, currentLoad: 0 },
          { arbiter: clean, currentLoad: 4 },
        ],
        { disputeType: DisputeType.OTHER, partyUserIds: [55] },
      );
      expect(result?.id).toBe(2);
    });

    it('excludes inactive arbiters', () => {
      const inactive = makeArbiter({ id: 1, active: false });
      const active = makeArbiter({ id: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: inactive, currentLoad: 0 },
          { arbiter: active, currentLoad: 4 },
        ],
        { disputeType: DisputeType.OTHER, partyUserIds: [] },
      );
      expect(result?.id).toBe(2);
    });

    it('excludes arbiters already at capacity', () => {
      const full = makeArbiter({ id: 1, maxActiveDisputes: 2 });
      const available = makeArbiter({ id: 2, maxActiveDisputes: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: full, currentLoad: 2 },
          { arbiter: available, currentLoad: 1 },
        ],
        { disputeType: DisputeType.OTHER, partyUserIds: [] },
      );
      expect(result?.id).toBe(2);
    });

    it('honors explicit excludeArbiterIds (e.g. previous assignee on escalation)', () => {
      const previous = makeArbiter({ id: 1 });
      const next = makeArbiter({ id: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: previous, currentLoad: 0 },
          { arbiter: next, currentLoad: 0 },
        ],
        {
          disputeType: DisputeType.OTHER,
          partyUserIds: [],
          excludeArbiterIds: [1],
        },
      );
      expect(result?.id).toBe(2);
    });

    it('breaks ties deterministically by ascending arbiter id', () => {
      const a = makeArbiter({ id: 5 });
      const b = makeArbiter({ id: 3 });
      const result = service.selectBestArbiter(
        [
          { arbiter: a, currentLoad: 0 },
          { arbiter: b, currentLoad: 0 },
        ],
        { disputeType: DisputeType.OTHER, partyUserIds: [] },
      );
      expect(result?.id).toBe(3);
    });

    it('returns null when no candidate is eligible', () => {
      const conflicted = makeArbiter({ id: 1, userId: 1 });
      const result = service.selectBestArbiter(
        [{ arbiter: conflicted, currentLoad: 0 }],
        { disputeType: DisputeType.OTHER, partyUserIds: [1] },
      );
      expect(result).toBeNull();
    });

    it('returns null for an empty candidate list', () => {
      const result = service.selectBestArbiter([], {
        disputeType: DisputeType.OTHER,
        partyUserIds: [],
      });
      expect(result).toBeNull();
    });

    it('prefers a jurisdiction and language match over a generic arbiter (#23)', () => {
      const local = makeArbiter({
        id: 1,
        jurisdictions: ['Nigeria'],
        languages: ['en'],
      });
      const foreign = makeArbiter({ id: 2 });
      const result = service.selectBestArbiter(
        [
          { arbiter: local, currentLoad: 1 },
          { arbiter: foreign, currentLoad: 0 },
        ],
        {
          disputeType: DisputeType.OTHER,
          partyUserIds: [],
          jurisdiction: 'Nigeria',
          language: 'en',
        },
      );
      expect(result?.id).toBe(1);
    });

    it('does not exclude an arbiter without profile preferences (#23)', () => {
      const generic = makeArbiter({ id: 1 });
      const result = service.selectBestArbiter(
        [{ arbiter: generic, currentLoad: 0 }],
        {
          disputeType: DisputeType.OTHER,
          partyUserIds: [],
          jurisdiction: 'Kenya',
          language: 'sw',
        },
      );
      expect(result?.id).toBe(1);
    });
  });

  describe('case complexity and performance (#23)', () => {
    it('scores more evidence, larger claims and higher priority as more complex', () => {
      const simple = service.scoreCaseComplexity({
        disputeType: DisputeType.MAINTENANCE,
        requestedAmount: 100,
        evidenceCount: 0,
        descriptionLength: 50,
        priority: DisputePriority.LOW,
      });
      const complex = service.scoreCaseComplexity({
        disputeType: DisputeType.PROPERTY_DAMAGE,
        requestedAmount: 100000,
        evidenceCount: 12,
        descriptionLength: 4000,
        priority: DisputePriority.URGENT,
      });
      expect(complex).toBeGreaterThan(simple);
      expect(complex).toBeLessThanOrEqual(1);
      expect(simple).toBeGreaterThanOrEqual(0);
    });

    it('clamps non-finite and negative complexity inputs', () => {
      const score = service.scoreCaseComplexity({
        disputeType: DisputeType.OTHER,
        requestedAmount: Number.NaN,
        evidenceCount: -5,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('treats arbiters without a track record neutrally', () => {
      expect(service.scorePerformance(makeArbiter())).toBe(1);
    });

    it('rewards successful and fast arbiters over slow unsuccessful ones', () => {
      const good = makeArbiter({
        totalDisputesResolved: 10,
        successfulResolutions: 9,
        averageResolutionHours: 24,
      });
      const poor = makeArbiter({
        totalDisputesResolved: 10,
        successfulResolutions: 2,
        averageResolutionHours: 160,
      });
      expect(service.scorePerformance(good)).toBeGreaterThan(
        service.scorePerformance(poor),
      );
    });

    it('weights performance more heavily on complex cases', () => {
      const good = makeArbiter({
        id: 1,
        totalDisputesResolved: 10,
        successfulResolutions: 10,
        averageResolutionHours: 1,
      });
      const poor = makeArbiter({
        id: 2,
        totalDisputesResolved: 10,
        successfulResolutions: 0,
        averageResolutionHours: 168,
      });
      const simpleGap =
        service.scoreArbiter(good, 1, DisputeType.OTHER, { complexity: 0 }) -
        service.scoreArbiter(poor, 1, DisputeType.OTHER, { complexity: 0 });
      const complexGap =
        service.scoreArbiter(good, 1, DisputeType.OTHER, { complexity: 1 }) -
        service.scoreArbiter(poor, 1, DisputeType.OTHER, { complexity: 1 });
      expect(complexGap).toBeGreaterThan(simpleGap);
    });

    it('scores jurisdiction and language matches deterministically', () => {
      const arbiter = makeArbiter({
        jurisdictions: ['nigeria'],
        languages: ['EN'],
      });
      expect(
        service.scoreLocalization(arbiter, {
          jurisdiction: 'Nigeria',
          language: 'en',
        }),
      ).toBe(1);
      expect(
        service.scoreLocalization(arbiter, {
          jurisdiction: 'Ghana',
          language: 'en',
        }),
      ).toBeCloseTo(0.4);
    });
  });

  describe('assignArbiter audit trail (#23)', () => {
    const dispute = {
      id: 7,
      disputeType: DisputeType.RENT_PAYMENT,
      requestedAmount: 500,
      description: 'short description',
      metadata: { jurisdiction: 'Nigeria', language: 'en' },
      initiatedBy: 3,
      status: DisputeStatus.OPEN,
    } as unknown as Dispute;

    it('logs the selected arbiter and case context after a successful match', async () => {
      const arbiter = makeArbiter({
        id: 4,
        jurisdictions: ['Nigeria'],
        languages: ['en'],
      });
      const arbiterRepo = {
        find: jest.fn().mockResolvedValue([arbiter]),
      };
      const disputeRepo = {
        createQueryBuilder: jest.fn(() => ({
          select: () => ({
            addSelect: () => ({
              where: () => ({
                andWhere: () => ({
                  groupBy: () => ({ getRawMany: async () => [] }),
                }),
              }),
            }),
          }),
        })),
      };
      const module = await Test.createTestingModule({
        providers: [
          DisputeAssignmentService,
          { provide: getRepositoryToken(Arbiter), useValue: arbiterRepo },
          { provide: getRepositoryToken(Dispute), useValue: disputeRepo },
          { provide: AuditService, useValue: { log: auditLog } },
        ],
      }).compile();
      const dbService = module.get(DisputeAssignmentService);

      expect(await dbService.assignArbiter(dispute)).toBe(arbiter);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ARBITER_ASSIGNED,
          entityId: '7',
          newValues: { arbiterId: 4 },
          metadata: expect.objectContaining({
            candidateCount: 1,
            jurisdiction: 'Nigeria',
            language: 'en',
          }),
        }),
      );
    });

    it('logs a failure when no arbiter is eligible', async () => {
      const arbiterRepo = { find: jest.fn().mockResolvedValue([]) };
      const module = await Test.createTestingModule({
        providers: [
          DisputeAssignmentService,
          { provide: getRepositoryToken(Arbiter), useValue: arbiterRepo },
          { provide: getRepositoryToken(Dispute), useValue: {} },
          { provide: AuditService, useValue: { log: auditLog } },
        ],
      }).compile();
      const dbService = module.get(DisputeAssignmentService);

      expect(await dbService.assignArbiter(dispute)).toBeNull();
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILURE' }),
      );
    });
  });
});
