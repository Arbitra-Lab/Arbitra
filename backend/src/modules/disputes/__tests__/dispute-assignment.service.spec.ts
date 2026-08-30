import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { DisputeAssignmentService } from '../dispute-assignment.service';
import { Arbiter } from '../entities/arbiter.entity';
import { Dispute, DisputeType } from '../entities/dispute.entity';

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

  beforeEach(async () => {
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
  });
});
