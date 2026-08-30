import './setup-env';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AnalyticsDataSource,
  AnalyticsService,
} from '../src/modules/analytics/analytics.service';
import { AnalyticsRollupService } from '../src/modules/analytics/analytics-rollup.service';
import { AnalyticsInquiryRollupDaily } from '../src/modules/analytics/entities/analytics-inquiry-rollup-daily.entity';
import { AnalyticsRollupWatermark } from '../src/modules/analytics/entities/analytics-rollup-watermark.entity';
import {
  Property,
  ListingStatus,
} from '../src/modules/properties/entities/property.entity';
import {
  PropertyInquiry,
  PropertyInquiryStatus,
} from '../src/modules/inquiries/entities/property-inquiry.entity';

describe('Analytics Data Pipeline Integration', () => {
  let service: AnalyticsService;

  const mockPropertyRepository = { find: jest.fn() };
  const mockInquiryRepository = { find: jest.fn() };
  const mockRollupRepository = { find: jest.fn() };

  // Null watermark keeps every assertion below on the raw path.
  const mockRollupService = { getWatermark: jest.fn() };

  const OWNER_ID = 'landlord-001';

  const makeProperty = (overrides: Partial<Property> = {}): Property =>
    ({
      id: 'prop-001',
      ownerId: OWNER_ID,
      title: 'Test Property',
      city: 'Lagos',
      status: ListingStatus.PUBLISHED,
      viewCount: 100,
      favoriteCount: 20,
      createdAt: new Date('2026-01-01'),
      ...overrides,
    }) as Property;

  const makeInquiry = (
    overrides: Partial<PropertyInquiry> = {},
  ): PropertyInquiry =>
    ({
      id: 'inq-001',
      propertyId: 'prop-001',
      toUserId: OWNER_ID,
      status: PropertyInquiryStatus.PENDING,
      createdAt: new Date(),
      ...overrides,
    }) as PropertyInquiry;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(Property),
          useValue: mockPropertyRepository,
        },
        {
          provide: getRepositoryToken(PropertyInquiry),
          useValue: mockInquiryRepository,
        },
        {
          provide: getRepositoryToken(AnalyticsInquiryRollupDaily),
          useValue: mockRollupRepository,
        },
        {
          provide: AnalyticsRollupService,
          useValue: mockRollupService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
    mockRollupRepository.find.mockResolvedValue([]);
    mockRollupService.getWatermark.mockResolvedValue(null);
  });

  describe('Event tracking and collection', () => {
    it('returns a dashboard with correct summary totals', async () => {
      const properties = [
        makeProperty({ id: 'prop-001', viewCount: 80, favoriteCount: 10 }),
        makeProperty({
          id: 'prop-002',
          viewCount: 60,
          favoriteCount: 15,
          status: ListingStatus.PUBLISHED,
        }),
      ];
      const inquiries = [
        makeInquiry({ propertyId: 'prop-001' }),
        makeInquiry({ propertyId: 'prop-001', id: 'inq-002' }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue(inquiries);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.summary.totalProperties).toBe(2);
      expect(result.summary.totalViews).toBe(140);
      expect(result.summary.totalFavorites).toBe(25);
      expect(result.summary.totalInquiries).toBe(2);
    });

    it('counts only published properties in publishedProperties', async () => {
      const properties = [
        makeProperty({ id: 'prop-001', status: ListingStatus.PUBLISHED }),
        makeProperty({ id: 'prop-002', status: ListingStatus.DRAFT }),
        makeProperty({ id: 'prop-003', status: ListingStatus.PUBLISHED }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.summary.publishedProperties).toBe(2);
    });
  });

  describe('Data aggregation', () => {
    it('calculates average views per property correctly', async () => {
      const properties = [
        makeProperty({ id: 'prop-001', viewCount: 100 }),
        makeProperty({ id: 'prop-002', viewCount: 50 }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.performance.averageViewsPerProperty).toBe(75);
    });

    it('groups properties by city in cityTrends', async () => {
      const properties = [
        makeProperty({ id: 'prop-001', city: 'Lagos', viewCount: 100 }),
        makeProperty({ id: 'prop-002', city: 'Lagos', viewCount: 50 }),
        makeProperty({ id: 'prop-003', city: 'Abuja', viewCount: 200 }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      const cities = result.marketTrends.cityTrends.map(
        (c: { city: string }) => c.city,
      );
      expect(cities).toContain('Lagos');
      expect(cities).toContain('Abuja');

      const abuja = result.marketTrends.cityTrends.find(
        (c: { city: string }) => c.city === 'Abuja',
      );
      expect(abuja?.totalViews).toBe(200);

      const lagos = result.marketTrends.cityTrends.find(
        (c: { city: string }) => c.city === 'Lagos',
      );
      expect(lagos?.totalViews).toBe(150);
    });

    it('builds listing status distribution across all statuses', async () => {
      const properties = [
        makeProperty({ status: ListingStatus.PUBLISHED }),
        makeProperty({ status: ListingStatus.PUBLISHED }),
        makeProperty({ status: ListingStatus.DRAFT }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      const dist = result.marketTrends.listingStatusDistribution;
      const published = dist.find(
        (d: { status: ListingStatus }) => d.status === ListingStatus.PUBLISHED,
      );
      expect(published?.count).toBe(2);
    });
  });

  describe('Report generation', () => {
    it('includes a generatedAt timestamp in the response', async () => {
      mockPropertyRepository.find.mockResolvedValue([]);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.generatedAt).toBeDefined();
      expect(typeof result.generatedAt).toBe('string');
    });

    it('includes range metadata with requested day count', async () => {
      mockPropertyRepository.find.mockResolvedValue([]);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 14);

      expect(result.range.days).toBe(14);
      expect(result.range.startDate).toBeDefined();
      expect(result.range.endDate).toBeDefined();
    });

    it('returns top performing properties sorted by engagement score', async () => {
      const properties = [
        makeProperty({ id: 'prop-001', viewCount: 10, favoriteCount: 1 }),
        makeProperty({ id: 'prop-002', viewCount: 500, favoriteCount: 80 }),
      ];
      const inquiries = [
        makeInquiry({ propertyId: 'prop-002', id: 'inq-001' }),
        makeInquiry({ propertyId: 'prop-002', id: 'inq-002' }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue(inquiries);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.topPerformingProperties[0].propertyId).toBe('prop-002');
    });
  });

  describe('Metric calculations', () => {
    it('calculates conversion rate as percentage of views to inquiries', async () => {
      const properties = [makeProperty({ id: 'prop-001', viewCount: 200 })];
      const inquiries = [
        makeInquiry({ id: 'inq-001' }),
        makeInquiry({ id: 'inq-002' }),
      ];
      mockPropertyRepository.find.mockResolvedValue(properties);
      mockInquiryRepository.find.mockResolvedValue(inquiries);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.summary.conversionRate).toBe(1);
    });

    it('returns zero metrics safely when there are no properties', async () => {
      mockPropertyRepository.find.mockResolvedValue([]);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 30);

      expect(result.summary.totalProperties).toBe(0);
      expect(result.summary.totalViews).toBe(0);
      expect(result.summary.conversionRate).toBe(0);
      expect(result.performance.averageViewsPerProperty).toBe(0);
    });

    it('clamps days parameter to a valid range', async () => {
      mockPropertyRepository.find.mockResolvedValue([]);
      mockInquiryRepository.find.mockResolvedValue([]);

      const resultOver = await service.getLandlordDashboard(OWNER_ID, 999);
      expect(resultOver.range.days).toBe(365);

      const resultUnder = await service.getLandlordDashboard(OWNER_ID, 0);
      expect(resultUnder.range.days).toBe(1);
    });

    it('builds an inquiry trend with one bucket per requested day', async () => {
      mockPropertyRepository.find.mockResolvedValue([]);
      mockInquiryRepository.find.mockResolvedValue([]);

      const result = await service.getLandlordDashboard(OWNER_ID, 7);

      expect(result.marketTrends.inquiryTrend).toHaveLength(7);
    });
  });
});

/**
 * The rollup path has to be an exact substitute for the raw scan: every
 * inquiry counted once, whether it was folded into a daily bucket or landed
 * after the last job run. These cases drive the real AnalyticsRollupService
 * and the real AnalyticsService against a genuine (in-memory sqlite)
 * DataSource for the inquiry and rollup tables. Properties stay mocked — the
 * real `Property` entity has Postgres-only enum columns that sqlite's schema
 * sync rejects.
 */
describe('Analytics incremental rollups — end-to-end exactness', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const MINUTE_MS = 60 * 1000;

  const OWNER_ID = randomUUID();
  const OTHER_OWNER_ID = randomUUID();
  const TENANT_ID = randomUUID();
  const PROPERTY_A = randomUUID();
  const PROPERTY_B = randomUUID();
  const PROPERTY_OTHER = randomUUID();

  let sqlite: DataSource;
  let inquiryRepository: Repository<PropertyInquiry>;
  let rollupRepository: Repository<AnalyticsInquiryRollupDaily>;
  let rollupService: AnalyticsRollupService;
  let analyticsService: AnalyticsService;

  const properties = [
    {
      id: PROPERTY_A,
      ownerId: OWNER_ID,
      title: 'Lekki One',
      city: 'Lagos',
      status: ListingStatus.PUBLISHED,
      viewCount: 240,
      favoriteCount: 30,
      createdAt: new Date('2026-01-01'),
    },
    {
      id: PROPERTY_B,
      ownerId: OWNER_ID,
      title: 'Wuse Two',
      city: 'Abuja',
      status: ListingStatus.DRAFT,
      viewCount: 60,
      favoriteCount: 4,
      createdAt: new Date('2026-01-02'),
    },
    {
      id: PROPERTY_OTHER,
      ownerId: OTHER_OWNER_ID,
      title: 'Someone Else',
      city: 'Kano',
      status: ListingStatus.PUBLISHED,
      viewCount: 10,
      favoriteCount: 1,
      createdAt: new Date('2026-01-03'),
    },
  ] as Property[];

  const propertyRepository = {
    find: jest.fn(async (options: { where: { ownerId: string } }) =>
      properties.filter(
        (property) => property.ownerId === options.where.ownerId,
      ),
    ),
  };

  // Midday UTC keeps every fixture clear of a bucket boundary.
  const middayUtc = (daysAgo: number, minutes = 0): Date => {
    const now = new Date();
    const midday = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      12,
    );

    return new Date(midday - daysAgo * DAY_MS + minutes * MINUTE_MS);
  };

  const dayKey = (daysAgo: number) =>
    middayUtc(daysAgo).toISOString().slice(0, 10);

  // CreateDateColumn/UpdateDateColumn default to now, so backdate with an
  // explicit update and read the row back to confirm what was stored.
  const seedInquiry = async (attrs: {
    propertyId: string;
    createdAt: Date;
    updatedAt?: Date;
    ownerId?: string;
    status?: PropertyInquiryStatus;
  }): Promise<PropertyInquiry> => {
    const saved = await inquiryRepository.save(
      inquiryRepository.create({
        propertyId: attrs.propertyId,
        fromUserId: TENANT_ID,
        toUserId: attrs.ownerId ?? OWNER_ID,
        message: 'Is this still available?',
        status: attrs.status ?? PropertyInquiryStatus.PENDING,
      }),
    );

    await inquiryRepository.update(saved.id, {
      createdAt: attrs.createdAt,
      updatedAt: attrs.updatedAt ?? attrs.createdAt,
    });

    return inquiryRepository.findOneByOrFail({ id: saved.id });
  };

  // Five inquiries for the owner across four days, plus one for a stranger.
  // Only the day-1 row carries the max updatedAt, so the 5-minute watermark
  // overlap re-reads exactly one row on the next run.
  const seedBaseline = async () => {
    await seedInquiry({
      propertyId: PROPERTY_A,
      createdAt: middayUtc(5),
      status: PropertyInquiryStatus.VIEWED,
    });
    await seedInquiry({ propertyId: PROPERTY_A, createdAt: middayUtc(5, 30) });
    await seedInquiry({
      propertyId: PROPERTY_B,
      createdAt: middayUtc(3),
      status: PropertyInquiryStatus.VIEWED,
    });
    await seedInquiry({ propertyId: PROPERTY_A, createdAt: middayUtc(2) });
    await seedInquiry({ propertyId: PROPERTY_B, createdAt: middayUtc(1) });
    await seedInquiry({
      propertyId: PROPERTY_OTHER,
      ownerId: OTHER_OWNER_ID,
      createdAt: middayUtc(2),
    });
  };

  const dashboardCore = async (source: AnalyticsDataSource) => {
    const dashboard = await analyticsService.getLandlordDashboard(
      OWNER_ID,
      30,
      source,
    );

    return {
      summary: dashboard.summary,
      performance: dashboard.performance,
      inquiryTrend: dashboard.marketTrends.inquiryTrend,
      topPerformingProperties: dashboard.topPerformingProperties,
      cityTrends: dashboard.marketTrends.cityTrends,
    };
  };

  beforeAll(async () => {
    sqlite = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        PropertyInquiry,
        AnalyticsInquiryRollupDaily,
        AnalyticsRollupWatermark,
      ],
      synchronize: true,
      dropSchema: true,
    });
    await sqlite.initialize();
  });

  afterAll(async () => {
    await sqlite.destroy();
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    inquiryRepository = sqlite.getRepository(PropertyInquiry);
    rollupRepository = sqlite.getRepository(AnalyticsInquiryRollupDaily);
    const watermarkRepository = sqlite.getRepository(AnalyticsRollupWatermark);

    await inquiryRepository.clear();
    await rollupRepository.clear();
    await watermarkRepository.clear();

    rollupService = new AnalyticsRollupService(
      inquiryRepository,
      rollupRepository,
      watermarkRepository,
    );
    analyticsService = new AnalyticsService(
      propertyRepository as any,
      inquiryRepository,
      rollupRepository,
      rollupService,
    );

    await seedBaseline();
  });

  it('serves the same aggregates from rollups as from raw after a backfill', async () => {
    const run = await rollupService.runIncrementalRollup();

    expect(run.processedRows).toBe(6);
    expect(run.recomputedBuckets).toBe(5);
    expect(run.skippedStaleBuckets).toBe(0);

    const rollupServed = await dashboardCore('rollup');
    const rawServed = await dashboardCore('raw');

    expect(rollupServed).toEqual(rawServed);
    expect(rollupServed.summary.totalInquiries).toBe(5);
    expect(rollupServed.performance.inquiryResponseRate).toBe(40);

    const rollupMeta = await analyticsService.getLandlordDashboard(
      OWNER_ID,
      30,
      'rollup',
    );
    expect(rollupMeta.meta.dataSource).toBe('rollup');
  });

  it('corrects an already materialized day when a late inquiry arrives', async () => {
    await rollupService.runIncrementalRollup();

    const before = await rollupRepository.findOneByOrFail({
      ownerId: OWNER_ID,
      propertyId: PROPERTY_B,
      bucketDate: dayKey(3),
    });
    expect(before.inquiryCount).toBe(1);

    const backdated = middayUtc(3, 45);
    const late = await seedInquiry({
      propertyId: PROPERTY_B,
      createdAt: backdated,
      updatedAt: new Date(),
      status: PropertyInquiryStatus.VIEWED,
    });
    expect(late.createdAt).toEqual(backdated);

    const rerun = await rollupService.runIncrementalRollup();
    expect(rerun.skippedStaleBuckets).toBe(0);

    const after = await rollupRepository.findOneByOrFail({
      ownerId: OWNER_ID,
      propertyId: PROPERTY_B,
      bucketDate: dayKey(3),
    });
    expect(after.inquiryCount).toBe(2);
    expect(after.viewedInquiryCount).toBe(2);

    const rollupServed = await dashboardCore('rollup');
    const rawServed = await dashboardCore('raw');

    expect(rollupServed).toEqual(rawServed);
    expect(rollupServed.summary.totalInquiries).toBe(6);
  });

  it('reads only the changed rows on the second run', async () => {
    const first = await rollupService.runIncrementalRollup();
    expect(first.processedRows).toBe(6);

    await seedInquiry({ propertyId: PROPERTY_A, createdAt: new Date() });
    await seedInquiry({
      propertyId: PROPERTY_B,
      createdAt: new Date(),
      status: PropertyInquiryStatus.VIEWED,
    });

    const second = await rollupService.runIncrementalRollup();

    // 2 new rows, plus the single row inside the 5-minute watermark overlap.
    expect(second.processedRows).toBe(3);
    expect(second.processedRows).toBeLessThan(first.processedRows);
    expect(second.recomputedBuckets).toBe(3);

    expect(await dashboardCore('rollup')).toEqual(await dashboardCore('raw'));
  });

  it('counts inquiries newer than the watermark without another job run', async () => {
    await rollupService.runIncrementalRollup();
    const watermark = await rollupService.getWatermark();
    expect(watermark).not.toBeNull();

    const fresh = await seedInquiry({
      propertyId: PROPERTY_A,
      createdAt: new Date(),
      status: PropertyInquiryStatus.VIEWED,
    });
    expect(fresh.createdAt.getTime()).toBeGreaterThan(
      watermark?.getTime() ?? 0,
    );

    const rollupServed = await dashboardCore('rollup');
    const rawServed = await dashboardCore('raw');

    expect(rollupServed).toEqual(rawServed);
    expect(rollupServed.summary.totalInquiries).toBe(6);
    expect(await rollupService.getWatermark()).toEqual(watermark);
  });
});
