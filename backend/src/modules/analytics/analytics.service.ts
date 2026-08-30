import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, MoreThan, Repository } from 'typeorm';
import {
  Property,
  ListingStatus,
} from '../properties/entities/property.entity';
import {
  PropertyInquiry,
  PropertyInquiryStatus,
} from '../inquiries/entities/property-inquiry.entity';
import { AnalyticsRollupService } from './analytics-rollup.service';
import { AnalyticsInquiryRollupDaily } from './entities/analytics-inquiry-rollup-daily.entity';

export type AnalyticsDataSource = 'auto' | 'raw' | 'rollup';

export interface CityAggregate {
  city: string;
  propertyCount: number;
  totalViews: number;
  totalFavorites: number;
  totalInquiries: number;
  averageViewsPerProperty: number;
}

interface InquiryAggregates {
  totalInquiries: number;
  viewedInquiries: number;
  inquiriesByProperty: Map<string, number>;
  inquiryTrend: Array<{ date: string; inquiries: number }>;
}

type InquirySlice = Pick<
  PropertyInquiry,
  'propertyId' | 'status' | 'createdAt'
>;

const INQUIRY_SELECT: Array<keyof PropertyInquiry> = [
  'id',
  'propertyId',
  'status',
  'createdAt',
];

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Property)
    private readonly propertyRepository: Repository<Property>,
    @InjectRepository(PropertyInquiry)
    private readonly inquiryRepository: Repository<PropertyInquiry>,
    @InjectRepository(AnalyticsInquiryRollupDaily)
    private readonly rollupRepository: Repository<AnalyticsInquiryRollupDaily>,
    private readonly rollupService: AnalyticsRollupService,
  ) {}

  async getLandlordDashboard(
    ownerId: string,
    days = 30,
    source: AnalyticsDataSource = 'auto',
  ) {
    const normalizedDays = this.normalizeDays(days);
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (normalizedDays - 1));

    const properties = await this.propertyRepository.find({
      where: { ownerId },
      select: [
        'id',
        'title',
        'city',
        'status',
        'viewCount',
        'favoriteCount',
        'createdAt',
      ],
    });

    const propertyIds = properties.map((property) => property.id);

    const watermark = await this.rollupService.getWatermark();
    const useRollup =
      (source === 'rollup' || source === 'auto') && watermark !== null;

    const aggregates = useRollup
      ? await this.loadRollupAggregates(
          ownerId,
          propertyIds,
          watermark,
          normalizedDays,
          startDate,
        )
      : await this.loadRawAggregates(
          ownerId,
          propertyIds,
          normalizedDays,
          startDate,
        );

    const {
      totalInquiries,
      viewedInquiries,
      inquiriesByProperty,
      inquiryTrend,
    } = aggregates;

    const totalProperties = properties.length;
    const publishedProperties = properties.filter(
      (property) => property.status === ListingStatus.PUBLISHED,
    ).length;

    const totalViews = properties.reduce(
      (sum, property) => sum + Number(property.viewCount ?? 0),
      0,
    );
    const totalFavorites = properties.reduce(
      (sum, property) => sum + Number(property.favoriteCount ?? 0),
      0,
    );

    const topPerformingProperties = properties
      .map((property) => {
        const inquiryCount = inquiriesByProperty.get(property.id) ?? 0;
        const viewCount = Number(property.viewCount ?? 0);
        const favoriteCount = Number(property.favoriteCount ?? 0);

        return {
          propertyId: property.id,
          title: property.title,
          city: property.city,
          status: property.status,
          viewCount,
          favoriteCount,
          inquiryCount,
          conversionRate: this.toPercent(inquiryCount, viewCount),
          engagementScore: viewCount + favoriteCount * 2 + inquiryCount * 3,
        };
      })
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 5)
      .map((property) => ({
        propertyId: property.propertyId,
        title: property.title,
        city: property.city,
        status: property.status,
        viewCount: property.viewCount,
        favoriteCount: property.favoriteCount,
        inquiryCount: property.inquiryCount,
        conversionRate: property.conversionRate,
      }));

    const listingStatusDistribution = this.buildStatusDistribution(properties);
    const cityTrends = this.buildCityTrends(properties, inquiriesByProperty);

    return {
      generatedAt: endDate.toISOString(),
      range: {
        days: normalizedDays,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      meta: {
        dataSource: useRollup ? ('rollup' as const) : ('raw' as const),
        watermark: watermark ? watermark.toISOString() : null,
      },
      summary: {
        totalProperties,
        publishedProperties,
        totalViews,
        totalFavorites,
        totalInquiries,
        conversionRate: this.toPercent(totalInquiries, totalViews),
      },
      performance: {
        averageViewsPerProperty: this.safeDivide(totalViews, totalProperties),
        averageInquiriesPerProperty: this.safeDivide(
          totalInquiries,
          totalProperties,
        ),
        inquiryResponseRate: this.toPercent(viewedInquiries, totalInquiries),
        favoriteToViewRate: this.toPercent(totalFavorites, totalViews),
      },
      topPerformingProperties,
      marketTrends: {
        inquiryTrend,
        listingStatusDistribution,
        cityTrends,
      },
    };
  }

  private async loadRawAggregates(
    ownerId: string,
    propertyIds: string[],
    days: number,
    startDate: Date,
  ): Promise<InquiryAggregates> {
    const inquiries = propertyIds.length
      ? await this.inquiryRepository.find({
          where: {
            propertyId: In(propertyIds),
            toUserId: ownerId,
          },
          select: INQUIRY_SELECT,
          order: { createdAt: 'ASC' },
        })
      : [];

    const inquiriesByProperty = new Map<string, number>();
    let viewedInquiries = 0;

    inquiries.forEach((inquiry) => {
      if (inquiry.status === PropertyInquiryStatus.VIEWED) {
        viewedInquiries += 1;
      }

      inquiriesByProperty.set(
        inquiry.propertyId,
        (inquiriesByProperty.get(inquiry.propertyId) ?? 0) + 1,
      );
    });

    const trend = this.seedTrendBuckets(days, startDate);
    this.addInquiriesToTrend(trend, inquiries);

    return {
      totalInquiries: inquiries.length,
      viewedInquiries,
      inquiriesByProperty,
      inquiryTrend: this.toTrendArray(trend),
    };
  }

  // Rollup buckets carry everything folded up to the watermark; the tail query
  // adds inquiries that landed after the last rollup run.
  private async loadRollupAggregates(
    ownerId: string,
    propertyIds: string[],
    watermark: Date,
    days: number,
    startDate: Date,
  ): Promise<InquiryAggregates> {
    const buckets = await this.rollupRepository.find({ where: { ownerId } });

    const tailWhere: FindOptionsWhere<PropertyInquiry> = {
      propertyId: In(propertyIds),
      toUserId: ownerId,
      createdAt: MoreThan(watermark),
    };
    const tail = propertyIds.length
      ? await this.inquiryRepository.find({
          where: tailWhere,
          select: INQUIRY_SELECT,
          order: { createdAt: 'ASC' },
        })
      : [];

    const inquiriesByProperty = new Map<string, number>();
    const trend = this.seedTrendBuckets(days, startDate);
    let totalInquiries = 0;
    let viewedInquiries = 0;

    buckets.forEach((bucket) => {
      const inquiryCount = Number(bucket.inquiryCount ?? 0);

      totalInquiries += inquiryCount;
      viewedInquiries += Number(bucket.viewedInquiryCount ?? 0);
      inquiriesByProperty.set(
        bucket.propertyId,
        (inquiriesByProperty.get(bucket.propertyId) ?? 0) + inquiryCount,
      );

      const key = this.toBucketDateKey(bucket.bucketDate);
      if (trend.has(key)) {
        trend.set(key, (trend.get(key) ?? 0) + inquiryCount);
      }
    });

    tail.forEach((inquiry) => {
      totalInquiries += 1;

      if (inquiry.status === PropertyInquiryStatus.VIEWED) {
        viewedInquiries += 1;
      }

      inquiriesByProperty.set(
        inquiry.propertyId,
        (inquiriesByProperty.get(inquiry.propertyId) ?? 0) + 1,
      );
    });

    this.addInquiriesToTrend(trend, tail);

    return {
      totalInquiries,
      viewedInquiries,
      inquiriesByProperty,
      inquiryTrend: this.toTrendArray(trend),
    };
  }

  private normalizeDays(days: number): number {
    if (!Number.isFinite(days)) {
      return 30;
    }

    return Math.min(365, Math.max(1, Math.floor(days)));
  }

  private safeDivide(numerator: number, denominator: number): number {
    if (denominator === 0) {
      return 0;
    }

    return Number((numerator / denominator).toFixed(2));
  }

  private toPercent(part: number, whole: number): number {
    if (whole === 0) {
      return 0;
    }

    return Number(((part / whole) * 100).toFixed(2));
  }

  private seedTrendBuckets(days: number, startDate: Date): Map<string, number> {
    const buckets = new Map<string, number>();

    for (let offset = 0; offset < days; offset += 1) {
      const day = new Date(startDate);
      day.setDate(startDate.getDate() + offset);
      buckets.set(this.toDateKey(day), 0);
    }

    return buckets;
  }

  // Trend buckets are whole UTC days; membership in the seeded range decides
  // inclusion so raw and rollup paths agree on the oldest bucket.
  private addInquiriesToTrend(
    buckets: Map<string, number>,
    inquiries: InquirySlice[],
  ): void {
    inquiries.forEach((inquiry) => {
      const key = this.toDateKey(inquiry.createdAt);
      if (!buckets.has(key)) {
        return;
      }

      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    });
  }

  private toTrendArray(buckets: Map<string, number>) {
    return Array.from(buckets.entries()).map(([date, count]) => ({
      date,
      inquiries: count,
    }));
  }

  private buildStatusDistribution(
    properties: Array<Pick<Property, 'status'>>,
  ): Array<{ status: ListingStatus; count: number; percentage: number }> {
    const total = properties.length;
    const counts = new Map<ListingStatus, number>();

    properties.forEach((property) => {
      const status = property.status;
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .map(([status, count]) => ({
        status,
        count,
        percentage: this.toPercent(count, total),
      }))
      .sort((a, b) => b.count - a.count);
  }

  private buildCityTrends(
    properties: Array<
      Pick<Property, 'id' | 'city' | 'viewCount' | 'favoriteCount'>
    >,
    inquiriesByProperty: Map<string, number>,
  ): CityAggregate[] {
    const cityMap = new Map<
      string,
      Omit<CityAggregate, 'averageViewsPerProperty'>
    >();

    properties.forEach((property) => {
      const city = property.city?.trim() || 'Unspecified';
      const current = cityMap.get(city) ?? {
        city,
        propertyCount: 0,
        totalViews: 0,
        totalFavorites: 0,
        totalInquiries: 0,
      };

      current.propertyCount += 1;
      current.totalViews += Number(property.viewCount ?? 0);
      current.totalFavorites += Number(property.favoriteCount ?? 0);
      current.totalInquiries += inquiriesByProperty.get(property.id) ?? 0;

      cityMap.set(city, current);
    });

    return Array.from(cityMap.values())
      .map((entry) => ({
        ...entry,
        averageViewsPerProperty: this.safeDivide(
          entry.totalViews,
          entry.propertyCount,
        ),
      }))
      .sort((a, b) => b.totalViews - a.totalViews)
      .slice(0, 8);
  }

  private toBucketDateKey(value: string | Date): string {
    return value instanceof Date
      ? this.toDateKey(value)
      : String(value).slice(0, 10);
  }

  private toDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
