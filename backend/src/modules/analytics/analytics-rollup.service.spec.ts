import { randomUUID } from 'crypto';
import { FindOperator, FindOptionsWhere } from 'typeorm';
import {
  PropertyInquiry,
  PropertyInquiryStatus,
} from '../inquiries/entities/property-inquiry.entity';
import {
  AnalyticsRollupService,
  INQUIRY_ROLLUP_JOB,
} from './analytics-rollup.service';
import { AnalyticsInquiryRollupDaily } from './entities/analytics-inquiry-rollup-daily.entity';
import { AnalyticsRollupWatermark } from './entities/analytics-rollup-watermark.entity';

const NOW = new Date('2026-08-17T12:00:00.000Z');
const OVERLAP_MS = 5 * 60 * 1000;
const OWNER_ID = 'owner-001';
const OTHER_OWNER_ID = 'owner-002';

function matchesOperator(value: unknown, operator: FindOperator<any>): boolean {
  switch (operator.type) {
    case 'and':
      return (operator.value as FindOperator<any>[]).every((child) =>
        matchesOperator(value, child),
      );
    case 'moreThan':
      return (value as any) > operator.value;
    case 'moreThanOrEqual':
      return (value as any) >= operator.value;
    case 'lessThan':
      return (value as any) < operator.value;
    default:
      throw new Error(
        `unsupported find operator in fake repo: ${operator.type}`,
      );
  }
}

function matchesWhere<T>(row: T, where?: FindOptionsWhere<T>): boolean {
  if (!where) {
    return true;
  }

  return Object.entries(where).every(([key, condition]) => {
    const value = (row as Record<string, unknown>)[key];

    return condition instanceof FindOperator
      ? matchesOperator(value, condition)
      : value === condition;
  });
}

function makeInquiryRepository(rows: PropertyInquiry[]) {
  return {
    find: jest.fn(
      async (options: { where?: FindOptionsWhere<PropertyInquiry> } = {}) =>
        rows.filter((row) => matchesWhere(row, options.where)),
    ),
  };
}

function makeRollupRepository(rows: AnalyticsInquiryRollupDaily[] = []) {
  return {
    rows,
    create: jest.fn(
      (data: Partial<AnalyticsInquiryRollupDaily>) =>
        ({ ...data }) as AnalyticsInquiryRollupDaily,
    ),
    findOne: jest.fn(
      async (options: {
        where: FindOptionsWhere<AnalyticsInquiryRollupDaily>;
      }) => rows.find((row) => matchesWhere(row, options.where)) ?? null,
    ),
    save: jest.fn(async (row: AnalyticsInquiryRollupDaily) => {
      if (!rows.includes(row)) {
        rows.push(row);
      }
      return row;
    }),
  };
}

function makeWatermarkRepository(watermark: Date | null) {
  const state = {
    row:
      watermark === null
        ? null
        : ({
            name: INQUIRY_ROLLUP_JOB,
            watermark,
            lastRunAt: null,
          } as AnalyticsRollupWatermark),
  };

  return {
    state,
    findOne: jest.fn(async () => state.row),
    create: jest.fn(
      (data: Partial<AnalyticsRollupWatermark>) =>
        ({ ...data }) as AnalyticsRollupWatermark,
    ),
    save: jest.fn(async (row: AnalyticsRollupWatermark) => {
      state.row = row;
      return row;
    }),
  };
}

function makeInquiry(overrides: Partial<PropertyInquiry>): PropertyInquiry {
  return {
    id: randomUUID(),
    propertyId: 'property-1',
    toUserId: OWNER_ID,
    status: PropertyInquiryStatus.PENDING,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as PropertyInquiry;
}

function makeBucket(
  overrides: Partial<AnalyticsInquiryRollupDaily>,
): AnalyticsInquiryRollupDaily {
  return {
    id: randomUUID(),
    ownerId: OWNER_ID,
    propertyId: 'property-1',
    inquiryCount: 0,
    viewedInquiryCount: 0,
    ...overrides,
  } as AnalyticsInquiryRollupDaily;
}

function findBucket(
  rows: AnalyticsInquiryRollupDaily[],
  propertyId: string,
  bucketDate: string,
  ownerId = OWNER_ID,
) {
  return rows.find(
    (row) =>
      row.ownerId === ownerId &&
      row.propertyId === propertyId &&
      row.bucketDate === bucketDate,
  );
}

describe('AnalyticsRollupService', () => {
  const build = (
    inquiries: PropertyInquiry[],
    watermark: Date | null,
    buckets: AnalyticsInquiryRollupDaily[] = [],
  ) => {
    const inquiryRepository = makeInquiryRepository(inquiries);
    const rollupRepository = makeRollupRepository(buckets);
    const watermarkRepository = makeWatermarkRepository(watermark);
    const service = new AnalyticsRollupService(
      inquiryRepository as any,
      rollupRepository as any,
      watermarkRepository as any,
    );

    return {
      service,
      inquiryRepository,
      rollupRepository,
      watermarkRepository,
    };
  };

  it('returns null from getWatermark before the job has ever run', async () => {
    const { service } = build([], null);

    await expect(service.getWatermark()).resolves.toBeNull();
  });

  it('folds every inquiry into its UTC bucket on the initial backfill', async () => {
    const inquiries = [
      makeInquiry({
        createdAt: new Date('2026-08-16T09:00:00.000Z'),
        updatedAt: new Date('2026-08-16T09:00:00.000Z'),
        status: PropertyInquiryStatus.VIEWED,
      }),
      makeInquiry({
        createdAt: new Date('2026-08-16T21:00:00.000Z'),
        updatedAt: new Date('2026-08-16T21:00:00.000Z'),
      }),
      makeInquiry({
        propertyId: 'property-2',
        createdAt: new Date('2026-08-14T12:00:00.000Z'),
        updatedAt: new Date('2026-08-14T12:00:00.000Z'),
        status: PropertyInquiryStatus.VIEWED,
      }),
      makeInquiry({
        toUserId: OTHER_OWNER_ID,
        propertyId: 'property-9',
        createdAt: new Date('2026-08-16T12:00:00.000Z'),
        updatedAt: new Date('2026-08-16T12:00:00.000Z'),
      }),
    ];
    const { service, rollupRepository } = build(inquiries, null);

    const result = await service.runIncrementalRollup(NOW);

    expect(result.processedRows).toBe(4);
    expect(result.recomputedBuckets).toBe(3);
    expect(result.skippedStaleBuckets).toBe(0);
    expect(result.watermark).toEqual(new Date('2026-08-16T21:00:00.000Z'));

    expect(rollupRepository.rows).toHaveLength(3);
    expect(
      findBucket(rollupRepository.rows, 'property-1', '2026-08-16'),
    ).toMatchObject({ inquiryCount: 2, viewedInquiryCount: 1 });
    expect(
      findBucket(rollupRepository.rows, 'property-2', '2026-08-14'),
    ).toMatchObject({ inquiryCount: 1, viewedInquiryCount: 1 });
    expect(
      findBucket(
        rollupRepository.rows,
        'property-9',
        '2026-08-16',
        OTHER_OWNER_ID,
      ),
    ).toMatchObject({ inquiryCount: 1, viewedInquiryCount: 0 });
  });

  it('scans only rows past the overlapped watermark and recomputes just their buckets', async () => {
    const watermark = new Date('2026-08-16T00:00:00.000Z');
    const inquiries = [
      makeInquiry({
        propertyId: 'property-2',
        createdAt: new Date('2026-08-12T12:00:00.000Z'),
        updatedAt: new Date('2026-08-12T12:00:00.000Z'),
      }),
      makeInquiry({
        createdAt: new Date('2026-08-16T12:00:00.000Z'),
        updatedAt: new Date('2026-08-17T09:00:00.000Z'),
      }),
    ];
    const { service, inquiryRepository, rollupRepository } = build(
      inquiries,
      watermark,
    );

    const result = await service.runIncrementalRollup(NOW);

    const sourceWhere = inquiryRepository.find.mock.calls[0][0]
      ?.where as FindOptionsWhere<PropertyInquiry>;
    const updatedAt = sourceWhere.updatedAt as FindOperator<Date>;
    expect(updatedAt).toBeInstanceOf(FindOperator);
    expect(updatedAt.type).toBe('moreThan');
    expect(updatedAt.value).toEqual(new Date(watermark.getTime() - OVERLAP_MS));

    expect(result.processedRows).toBe(1);
    expect(result.recomputedBuckets).toBe(1);
    expect(rollupRepository.rows).toHaveLength(1);
    expect(
      findBucket(rollupRepository.rows, 'property-1', '2026-08-16'),
    ).toMatchObject({ inquiryCount: 1 });
    expect(
      findBucket(rollupRepository.rows, 'property-2', '2026-08-12'),
    ).toBeUndefined();
  });

  it('recomputes an already materialized bucket when a late row lands in it', async () => {
    const buckets = [
      makeBucket({
        bucketDate: '2026-08-14',
        inquiryCount: 1,
        viewedInquiryCount: 0,
      }),
    ];
    const inquiries = [
      makeInquiry({
        createdAt: new Date('2026-08-14T09:00:00.000Z'),
        updatedAt: new Date('2026-08-14T09:00:00.000Z'),
      }),
      makeInquiry({
        createdAt: new Date('2026-08-14T18:00:00.000Z'),
        updatedAt: new Date('2026-08-17T10:00:00.000Z'),
        status: PropertyInquiryStatus.VIEWED,
      }),
    ];
    const { service, rollupRepository } = build(
      inquiries,
      new Date('2026-08-17T06:00:00.000Z'),
      buckets,
    );

    const result = await service.runIncrementalRollup(NOW);

    expect(result.recomputedBuckets).toBe(1);
    expect(result.skippedStaleBuckets).toBe(0);
    expect(rollupRepository.rows).toHaveLength(1);
    expect(rollupRepository.rows[0]).toMatchObject({
      bucketDate: '2026-08-14',
      inquiryCount: 2,
      viewedInquiryCount: 1,
    });
  });

  it('skips buckets older than the lookback window instead of writing them', async () => {
    const inquiries = [
      makeInquiry({
        propertyId: 'property-2',
        createdAt: new Date('2026-07-01T12:00:00.000Z'),
        updatedAt: new Date('2026-08-17T10:00:00.000Z'),
      }),
      makeInquiry({
        createdAt: new Date('2026-08-16T12:00:00.000Z'),
        updatedAt: new Date('2026-08-17T10:30:00.000Z'),
      }),
    ];
    const { service, rollupRepository } = build(
      inquiries,
      new Date('2026-08-17T06:00:00.000Z'),
    );

    const result = await service.runIncrementalRollup(NOW);

    expect(result.processedRows).toBe(2);
    expect(result.skippedStaleBuckets).toBe(1);
    expect(result.recomputedBuckets).toBe(1);
    expect(rollupRepository.rows).toHaveLength(1);
    expect(rollupRepository.rows[0].bucketDate).toBe('2026-08-16');
    expect(
      findBucket(rollupRepository.rows, 'property-2', '2026-07-01'),
    ).toBeUndefined();
  });

  it('leaves bucket counts unchanged when the same rows are folded twice', async () => {
    const inquiries = [
      makeInquiry({
        createdAt: new Date('2026-08-16T09:00:00.000Z'),
        updatedAt: new Date('2026-08-16T09:00:00.000Z'),
        status: PropertyInquiryStatus.VIEWED,
      }),
      makeInquiry({
        createdAt: new Date('2026-08-16T21:00:00.000Z'),
        updatedAt: new Date('2026-08-16T21:00:00.000Z'),
      }),
    ];
    const { service, rollupRepository } = build(inquiries, null);

    const first = await service.runIncrementalRollup(NOW);
    const second = await service.runIncrementalRollup(NOW);

    expect(second.watermark).toEqual(first.watermark);
    expect(rollupRepository.rows).toHaveLength(1);
    expect(rollupRepository.rows[0]).toMatchObject({
      bucketDate: '2026-08-16',
      inquiryCount: 2,
      viewedInquiryCount: 1,
    });
  });

  it('keeps the watermark and touches no bucket when nothing changed', async () => {
    const inquiries = [
      makeInquiry({
        createdAt: new Date('2026-08-10T12:00:00.000Z'),
        updatedAt: new Date('2026-08-10T12:00:00.000Z'),
      }),
    ];
    const { service, rollupRepository, watermarkRepository } = build(
      inquiries,
      NOW,
    );

    const result = await service.runIncrementalRollup(NOW);

    expect(result.processedRows).toBe(0);
    expect(result.recomputedBuckets).toBe(0);
    expect(result.watermark).toEqual(NOW);
    expect(rollupRepository.save).not.toHaveBeenCalled();
    expect(watermarkRepository.state.row?.lastRunAt).toEqual(NOW);
  });
});
