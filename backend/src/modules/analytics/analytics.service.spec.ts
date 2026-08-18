import { ListingStatus } from '../properties/entities/property.entity';
import { PropertyInquiryStatus } from '../inquiries/entities/property-inquiry.entity';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const propertyRepository = {
    find: jest.fn(),
  };

  const inquiryRepository = {
    find: jest.fn(),
  };

  const rollupRepository = {
    find: jest.fn(),
  };

  // Null watermark keeps every existing assertion on the raw path.
  const rollupService = {
    getWatermark: jest.fn(),
  };

  let service: AnalyticsService;

  beforeEach(() => {
    jest.clearAllMocks();
    rollupRepository.find.mockResolvedValue([]);
    rollupService.getWatermark.mockResolvedValue(null);
    service = new AnalyticsService(
      propertyRepository as any,
      inquiryRepository as any,
      rollupRepository as any,
      rollupService as any,
    );
  });

  it('builds landlord analytics summary and conversion metrics', async () => {
    propertyRepository.find.mockResolvedValue([
      {
        id: 'property-1',
        title: 'Lekki One',
        city: 'Lagos',
        status: ListingStatus.PUBLISHED,
        viewCount: 120,
        favoriteCount: 25,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      {
        id: 'property-2',
        title: 'Lekki Two',
        city: 'Lagos',
        status: ListingStatus.DRAFT,
        viewCount: 30,
        favoriteCount: 6,
        createdAt: new Date('2026-03-04T00:00:00.000Z'),
      },
    ]);

    inquiryRepository.find.mockResolvedValue([
      {
        id: 'inq-1',
        propertyId: 'property-1',
        status: PropertyInquiryStatus.VIEWED,
        createdAt: new Date(),
      },
      {
        id: 'inq-2',
        propertyId: 'property-1',
        status: PropertyInquiryStatus.PENDING,
        createdAt: new Date(),
      },
      {
        id: 'inq-3',
        propertyId: 'property-2',
        status: PropertyInquiryStatus.VIEWED,
        createdAt: new Date(),
      },
    ]);

    const result = await service.getLandlordDashboard('landlord-1', 30);

    expect(result.summary.totalProperties).toBe(2);
    expect(result.summary.publishedProperties).toBe(1);
    expect(result.summary.totalViews).toBe(150);
    expect(result.summary.totalFavorites).toBe(31);
    expect(result.summary.totalInquiries).toBe(3);
    expect(result.summary.conversionRate).toBe(2);
    expect(result.performance.inquiryResponseRate).toBe(66.67);
    expect(result.topPerformingProperties).toHaveLength(2);
    expect(result.marketTrends.inquiryTrend).toHaveLength(30);
    expect(result.marketTrends.cityTrends[0].city).toBe('Lagos');
  });

  it('returns safe zero values when no properties exist', async () => {
    propertyRepository.find.mockResolvedValue([]);
    inquiryRepository.find.mockResolvedValue([]);

    const result = await service.getLandlordDashboard('landlord-2', 15);

    expect(result.summary.totalProperties).toBe(0);
    expect(result.summary.totalViews).toBe(0);
    expect(result.summary.totalInquiries).toBe(0);
    expect(result.summary.conversionRate).toBe(0);
    expect(result.performance.averageViewsPerProperty).toBe(0);
    expect(result.marketTrends.cityTrends).toEqual([]);
    expect(result.marketTrends.inquiryTrend).toHaveLength(15);
  });

  describe('serving source decision', () => {
    const WATERMARK = new Date('2026-08-17T06:00:00.000Z');
    const today = new Date().toISOString().slice(0, 10);

    beforeEach(() => {
      propertyRepository.find.mockResolvedValue([
        {
          id: 'property-1',
          title: 'Lekki One',
          city: 'Lagos',
          status: ListingStatus.PUBLISHED,
          viewCount: 100,
          favoriteCount: 10,
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        },
        {
          id: 'property-2',
          title: 'Lekki Two',
          city: 'Lagos',
          status: ListingStatus.PUBLISHED,
          viewCount: 20,
          favoriteCount: 2,
          createdAt: new Date('2026-03-04T00:00:00.000Z'),
        },
      ]);
    });

    it('falls back to raw when the job has never run', async () => {
      inquiryRepository.find.mockResolvedValue([
        {
          id: 'inq-1',
          propertyId: 'property-1',
          status: PropertyInquiryStatus.VIEWED,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getLandlordDashboard(
        'landlord-1',
        30,
        'auto',
      );

      expect(result.meta.dataSource).toBe('raw');
      expect(result.meta.watermark).toBeNull();
      expect(result.summary.totalInquiries).toBe(1);
      expect(rollupRepository.find).not.toHaveBeenCalled();
    });

    it('stays on raw when the caller asks for it even with a watermark', async () => {
      rollupService.getWatermark.mockResolvedValue(WATERMARK);
      rollupRepository.find.mockResolvedValue([
        {
          propertyId: 'property-1',
          bucketDate: today,
          inquiryCount: 99,
          viewedInquiryCount: 99,
        },
      ]);
      inquiryRepository.find.mockResolvedValue([
        {
          id: 'inq-1',
          propertyId: 'property-1',
          status: PropertyInquiryStatus.VIEWED,
          createdAt: new Date(),
        },
        {
          id: 'inq-2',
          propertyId: 'property-2',
          status: PropertyInquiryStatus.PENDING,
          createdAt: new Date(),
        },
      ]);

      const result = await service.getLandlordDashboard(
        'landlord-1',
        30,
        'raw',
      );

      expect(result.meta.dataSource).toBe('raw');
      expect(result.meta.watermark).toBe(WATERMARK.toISOString());
      expect(result.summary.totalInquiries).toBe(2);
      expect(rollupRepository.find).not.toHaveBeenCalled();
    });

    it.each(['auto', 'rollup'] as const)(
      'serves %s from buckets plus the post-watermark tail',
      async (source) => {
        rollupService.getWatermark.mockResolvedValue(WATERMARK);
        rollupRepository.find.mockResolvedValue([
          {
            propertyId: 'property-1',
            bucketDate: today,
            inquiryCount: 4,
            viewedInquiryCount: 2,
          },
          {
            propertyId: 'property-2',
            bucketDate: today,
            inquiryCount: 1,
            viewedInquiryCount: 0,
          },
        ]);
        inquiryRepository.find.mockResolvedValue([
          {
            id: 'tail-1',
            propertyId: 'property-1',
            status: PropertyInquiryStatus.VIEWED,
            createdAt: new Date(),
          },
        ]);

        const result = await service.getLandlordDashboard(
          'landlord-1',
          30,
          source,
        );

        expect(result.meta.dataSource).toBe('rollup');
        expect(result.meta.watermark).toBe(WATERMARK.toISOString());
        expect(result.summary.totalInquiries).toBe(6);
        expect(result.performance.inquiryResponseRate).toBe(50);
        expect(result.topPerformingProperties[0]).toMatchObject({
          propertyId: 'property-1',
          inquiryCount: 5,
        });
        expect(
          result.marketTrends.inquiryTrend.find((day) => day.date === today)
            ?.inquiries,
        ).toBe(6);
      },
    );
  });
});
