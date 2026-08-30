import { AnalyticsRollupService } from './analytics-rollup.service';
import { DisputeStatus, DisputeType } from '../disputes/entities/dispute.entity';

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function makeDispute(
  overrides: Partial<{
    id: number;
    disputeType: DisputeType;
    status: DisputeStatus;
    requestedAmount: number;
    createdAt: Date;
    resolvedAt: Date | null;
    votesFavorLandlord: number;
    votesFavorTenant: number;
    blockchainOutcome: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    disputeType: overrides.disputeType ?? DisputeType.RENT_PAYMENT,
    status: overrides.status ?? DisputeStatus.RESOLVED,
    requestedAmount: overrides.requestedAmount ?? 0,
    createdAt: overrides.createdAt ?? new Date('2026-03-01T00:00:00.000Z'),
    resolvedAt:
      overrides.resolvedAt !== undefined
        ? overrides.resolvedAt
        : new Date('2026-03-10T00:00:00.000Z'),
    votesFavorLandlord: overrides.votesFavorLandlord ?? 0,
    votesFavorTenant: overrides.votesFavorTenant ?? 0,
    blockchainOutcome: overrides.blockchainOutcome ?? null,
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AnalyticsRollupService', () => {
  let disputeRepository: { createQueryBuilder: jest.Mock };
  let qb: {
    select: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    getMany: jest.Mock;
  };
  let service: AnalyticsRollupService;

  beforeEach(() => {
    qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    };

    disputeRepository = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    };

    service = new AnalyticsRollupService(disputeRepository as any);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Basic shape ─────────────────────────────────────────────────────────────

  it('returns the expected top-level shape', async () => {
    qb.getMany.mockResolvedValue([]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    expect(report).toHaveProperty('generatedAt');
    expect(report).toHaveProperty('range.startDate');
    expect(report).toHaveProperty('range.endDate');
    expect(report).toHaveProperty('cohorts');
    expect(report).toHaveProperty('totals');
    expect(Array.isArray(report.cohorts)).toBe(true);
  });

  it('seeds empty ALL-category buckets for every month in the range', async () => {
    qb.getMany.mockResolvedValue([]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });

    const allBuckets = report.cohorts.filter((c) => c.category === 'ALL');
    expect(allBuckets.map((b) => b.month)).toEqual(
      expect.arrayContaining(['2026-01', '2026-02', '2026-03']),
    );
    allBuckets.forEach((b) => {
      expect(b.totalCount).toBe(0);
      expect(b.resolvedCount).toBe(0);
      expect(b.medianResolutionHours).toBeNull();
    });
  });

  // ── Aggregation correctness ─────────────────────────────────────────────────

  it('counts total and resolved disputes correctly per month bucket', async () => {
    qb.getMany.mockResolvedValue([
      // Two resolved disputes in March
      makeDispute({ id: 1, status: DisputeStatus.RESOLVED }),
      makeDispute({ id: 2, status: DisputeStatus.RESOLVED }),
      // One open dispute in March
      makeDispute({
        id: 3,
        status: DisputeStatus.OPEN,
        resolvedAt: null,
      }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    expect(marchAll).toBeDefined();
    expect(marchAll!.totalCount).toBe(3);
    expect(marchAll!.resolvedCount).toBe(2);
  });

  it('calculates median resolution time correctly', async () => {
    // Dispute 1: resolved in 24 h
    // Dispute 2: resolved in 48 h
    // Median should be 36 h
    qb.getMany.mockResolvedValue([
      makeDispute({
        id: 1,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        resolvedAt: new Date('2026-03-02T00:00:00.000Z'), // 24 h
      }),
      makeDispute({
        id: 2,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        resolvedAt: new Date('2026-03-03T00:00:00.000Z'), // 48 h
      }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    expect(marchAll!.medianResolutionHours).toBe(36);
  });

  it('computes median from an odd-length set correctly', async () => {
    // Resolutions: 10 h, 20 h, 60 h → sorted → median = 20
    qb.getMany.mockResolvedValue([
      makeDispute({
        id: 1,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        resolvedAt: new Date('2026-03-01T10:00:00.000Z'),
      }),
      makeDispute({
        id: 2,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        resolvedAt: new Date('2026-03-01T20:00:00.000Z'),
      }),
      makeDispute({
        id: 3,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        resolvedAt: new Date('2026-03-03T12:00:00.000Z'), // 60 h
      }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    expect(marchAll!.medianResolutionHours).toBe(20);
  });

  // ── Ruling distribution ─────────────────────────────────────────────────────

  it('attributes rulings via vote tallies when no blockchainOutcome', async () => {
    qb.getMany.mockResolvedValue([
      makeDispute({ id: 1, votesFavorLandlord: 3, votesFavorTenant: 1 }), // landlord
      makeDispute({ id: 2, votesFavorLandlord: 1, votesFavorTenant: 4 }), // tenant
      makeDispute({ id: 3, votesFavorLandlord: 2, votesFavorTenant: 2 }), // inconclusive
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    expect(marchAll!.rulingDistribution.landlordFavour).toBe(1);
    expect(marchAll!.rulingDistribution.tenantFavour).toBe(1);
    expect(marchAll!.rulingDistribution.inconclusive).toBe(1);
  });

  it('prefers blockchainOutcome over vote tallies', async () => {
    qb.getMany.mockResolvedValue([
      // votes say landlord but outcome string says tenant
      makeDispute({
        id: 1,
        votesFavorLandlord: 5,
        votesFavorTenant: 0,
        blockchainOutcome: 'resolved_in_favour_of_tenant',
      }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    expect(marchAll!.rulingDistribution.tenantFavour).toBe(1);
    expect(marchAll!.rulingDistribution.landlordFavour).toBe(0);
  });

  // ── Refund rate ─────────────────────────────────────────────────────────────

  it('calculates refund rate as percentage of resolved disputes with requestedAmount > 0', async () => {
    qb.getMany.mockResolvedValue([
      makeDispute({ id: 1, requestedAmount: 500 }),   // has amount
      makeDispute({ id: 2, requestedAmount: 1200 }),  // has amount
      makeDispute({ id: 3, requestedAmount: 0 }),     // no amount
      makeDispute({ id: 4, requestedAmount: null as any }), // null
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    // 2 of 4 resolved disputes had requestedAmount > 0 → 50%
    expect(marchAll!.refundRate).toBe(50);
  });

  it('returns refundRate of 0 when no resolved disputes', async () => {
    qb.getMany.mockResolvedValue([
      makeDispute({ id: 1, status: DisputeStatus.OPEN, resolvedAt: null }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const marchAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );
    expect(marchAll!.refundRate).toBe(0);
  });

  // ── Category bucketing ──────────────────────────────────────────────────────

  it('splits disputes into per-category buckets in addition to ALL', async () => {
    qb.getMany.mockResolvedValue([
      makeDispute({ id: 1, disputeType: DisputeType.RENT_PAYMENT }),
      makeDispute({ id: 2, disputeType: DisputeType.RENT_PAYMENT }),
      makeDispute({ id: 3, disputeType: DisputeType.PROPERTY_DAMAGE }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    const rentBucket = report.cohorts.find(
      (c) =>
        c.month === '2026-03' && c.category === DisputeType.RENT_PAYMENT,
    );
    const damageBucket = report.cohorts.find(
      (c) =>
        c.month === '2026-03' && c.category === DisputeType.PROPERTY_DAMAGE,
    );
    const allBucket = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );

    expect(rentBucket!.totalCount).toBe(2);
    expect(damageBucket!.totalCount).toBe(1);
    expect(allBucket!.totalCount).toBe(3);
  });

  // ── Multi-month bucketing ────────────────────────────────────────────────────

  it('places disputes into the correct month based on createdAt', async () => {
    qb.getMany.mockResolvedValue([
      makeDispute({
        id: 1,
        createdAt: new Date('2026-01-15T00:00:00.000Z'),
        resolvedAt: new Date('2026-01-20T00:00:00.000Z'),
      }),
      makeDispute({
        id: 2,
        createdAt: new Date('2026-02-10T00:00:00.000Z'),
        resolvedAt: new Date('2026-02-12T00:00:00.000Z'),
      }),
      makeDispute({
        id: 3,
        createdAt: new Date('2026-02-20T00:00:00.000Z'),
        resolvedAt: new Date('2026-02-25T00:00:00.000Z'),
      }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });

    const janAll = report.cohorts.find(
      (c) => c.month === '2026-01' && c.category === 'ALL',
    );
    const febAll = report.cohorts.find(
      (c) => c.month === '2026-02' && c.category === 'ALL',
    );
    const marAll = report.cohorts.find(
      (c) => c.month === '2026-03' && c.category === 'ALL',
    );

    expect(janAll!.totalCount).toBe(1);
    expect(febAll!.totalCount).toBe(2);
    expect(marAll!.totalCount).toBe(0); // seeded empty bucket
  });

  // ── Totals ──────────────────────────────────────────────────────────────────

  it('aggregates totals correctly across all months', async () => {
    qb.getMany.mockResolvedValue([
      makeDispute({ id: 1, status: DisputeStatus.RESOLVED, votesFavorLandlord: 3, votesFavorTenant: 1 }),
      makeDispute({ id: 2, status: DisputeStatus.RESOLVED, votesFavorLandlord: 1, votesFavorTenant: 3 }),
      makeDispute({ id: 3, status: DisputeStatus.OPEN, resolvedAt: null }),
    ]);

    const report = await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });

    expect(report.totals.totalDisputes).toBe(3);
    expect(report.totals.resolvedDisputes).toBe(2);
    expect(report.totals.rulingDistribution.landlordFavour).toBe(1);
    expect(report.totals.rulingDistribution.tenantFavour).toBe(1);
  });

  // ── Backfill flag ───────────────────────────────────────────────────────────

  it('does not apply a date WHERE clause when backfill is true', async () => {
    qb.getMany.mockResolvedValue([]);

    await service.computeDisputeCohortReport({ backfill: true });

    // where() should NOT have been called (no date filter for backfill)
    expect(qb.where).not.toHaveBeenCalled();
  });

  it('applies a date WHERE clause when backfill is false', async () => {
    qb.getMany.mockResolvedValue([]);

    await service.computeDisputeCohortReport({
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });

    expect(qb.where).toHaveBeenCalledTimes(1);
  });

  // ── Category filter ─────────────────────────────────────────────────────────

  it('applies andWhere for category when provided', async () => {
    qb.getMany.mockResolvedValue([]);

    await service.computeDisputeCohortReport({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      category: DisputeType.MAINTENANCE,
    });

    expect(qb.andWhere).toHaveBeenCalledWith(
      'dispute.disputeType = :category',
      { category: DisputeType.MAINTENANCE },
    );
  });

  // ── nightly() helper ────────────────────────────────────────────────────────

  it('nightly() calls computeDisputeCohortReport with a one-month range', async () => {
    qb.getMany.mockResolvedValue([]);

    const spy = jest.spyOn(service, 'computeDisputeCohortReport');
    await service.nightly();

    expect(spy).toHaveBeenCalledTimes(1);
    const callArg = spy.mock.calls[0][0]!;
    expect(callArg.startDate).toBeDefined();
    expect(callArg.endDate).toBeDefined();
    // Start of range must be before end of range
    expect(new Date(callArg.startDate!).getTime()).toBeLessThan(
      new Date(callArg.endDate!).getTime(),
    );
  });
});
