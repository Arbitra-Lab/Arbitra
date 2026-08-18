import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  FindOptionsWhere,
  LessThan,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  PropertyInquiry,
  PropertyInquiryStatus,
} from '../inquiries/entities/property-inquiry.entity';
import { AnalyticsInquiryRollupDaily } from './entities/analytics-inquiry-rollup-daily.entity';
import { AnalyticsRollupWatermark } from './entities/analytics-rollup-watermark.entity';

export const INQUIRY_ROLLUP_JOB = 'inquiry_daily';

export interface RollupRunResult {
  processedRows: number;
  recomputedBuckets: number;
  skippedStaleBuckets: number;
  watermark: Date | null;
}

interface BucketKey {
  ownerId: string;
  propertyId: string;
  bucketDate: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Re-fold buckets newer than this many days; older days are treated as frozen.
const LOOKBACK_DAYS = parsePositiveInt(
  process.env.ANALYTICS_ROLLUP_LOOKBACK_DAYS,
  7,
);

// Rewind the watermark by this much to tolerate clock skew and in-flight writes.
const WATERMARK_OVERLAP_MS = 5 * 60 * 1000;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class AnalyticsRollupService {
  private readonly logger = new Logger(AnalyticsRollupService.name);

  constructor(
    @InjectRepository(PropertyInquiry)
    private readonly inquiryRepository: Repository<PropertyInquiry>,
    @InjectRepository(AnalyticsInquiryRollupDaily)
    private readonly rollupRepository: Repository<AnalyticsInquiryRollupDaily>,
    @InjectRepository(AnalyticsRollupWatermark)
    private readonly watermarkRepository: Repository<AnalyticsRollupWatermark>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    this.logger.log('Starting analytics inquiry rollup...');

    try {
      const result = await this.runIncrementalRollup();
      this.logger.log(
        `Analytics inquiry rollup completed: ${result.processedRows} source rows, ` +
          `${result.recomputedBuckets} buckets recomputed, ` +
          `${result.skippedStaleBuckets} stale buckets skipped.`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed during analytics inquiry rollup: ${error.message}`,
      );
    }
  }

  async getWatermark(): Promise<Date | null> {
    const state = await this.watermarkRepository.findOne({
      where: { name: INQUIRY_ROLLUP_JOB },
    });

    return toDate(state?.watermark);
  }

  async runIncrementalRollup(now: Date = new Date()): Promise<RollupRunResult> {
    const state = await this.watermarkRepository.findOne({
      where: { name: INQUIRY_ROLLUP_JOB },
    });
    const watermark = toDate(state?.watermark);
    const isBackfill = watermark === null;

    const changed = await this.findChangedInquiries(watermark);

    const affected = new Map<string, BucketKey>();
    let maxUpdatedAt: Date | null = null;

    changed.forEach((row) => {
      const updatedAt = toDate(row.updatedAt);
      if (updatedAt && (!maxUpdatedAt || updatedAt > maxUpdatedAt)) {
        maxUpdatedAt = updatedAt;
      }

      const createdAt = toDate(row.createdAt);
      if (!createdAt || !row.toUserId || !row.propertyId) {
        return;
      }

      const bucketDate = this.utcDateKey(createdAt);
      affected.set(`${row.toUserId}|${row.propertyId}|${bucketDate}`, {
        ownerId: row.toUserId,
        propertyId: row.propertyId,
        bucketDate,
      });
    });

    const oldestFoldableDate = this.utcDateKey(
      new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS),
    );

    let recomputedBuckets = 0;
    let skippedStaleBuckets = 0;

    for (const key of affected.values()) {
      if (!isBackfill && key.bucketDate < oldestFoldableDate) {
        skippedStaleBuckets += 1;
        continue;
      }

      await this.recomputeBucket(key);
      recomputedBuckets += 1;
    }

    const record =
      state ??
      this.watermarkRepository.create({
        name: INQUIRY_ROLLUP_JOB,
        watermark: null,
        lastRunAt: null,
      });

    if (maxUpdatedAt) {
      record.watermark = maxUpdatedAt;
    }
    record.lastRunAt = now;
    await this.watermarkRepository.save(record);

    return {
      processedRows: changed.length,
      recomputedBuckets,
      skippedStaleBuckets,
      watermark: toDate(record.watermark),
    };
  }

  private async findChangedInquiries(
    watermark: Date | null,
  ): Promise<PropertyInquiry[]> {
    const select: Array<keyof PropertyInquiry> = [
      'id',
      'propertyId',
      'toUserId',
      'status',
      'createdAt',
      'updatedAt',
    ];

    // Null watermark means the job never ran: one-time full backfill.
    if (!watermark) {
      return this.inquiryRepository.find({ select });
    }

    const since = new Date(watermark.getTime() - WATERMARK_OVERLAP_MS);
    const where: FindOptionsWhere<PropertyInquiry> = {
      updatedAt: MoreThan(since),
    };

    return this.inquiryRepository.find({ where, select });
  }

  // Recompute from raw so repeated runs over the same rows are idempotent.
  private async recomputeBucket(key: BucketKey): Promise<void> {
    const dayStart = new Date(`${key.bucketDate}T00:00:00.000Z`);
    const nextDayStart = new Date(dayStart.getTime() + DAY_MS);

    const where: FindOptionsWhere<PropertyInquiry> = {
      toUserId: key.ownerId,
      propertyId: key.propertyId,
      createdAt: And(MoreThanOrEqual(dayStart), LessThan(nextDayStart)),
    };

    const rows = await this.inquiryRepository.find({
      where,
      select: ['id', 'status'],
    });

    const inquiryCount = rows.length;
    const viewedInquiryCount = rows.filter(
      (row) => row.status === PropertyInquiryStatus.VIEWED,
    ).length;

    const existing = await this.rollupRepository.findOne({
      where: {
        ownerId: key.ownerId,
        propertyId: key.propertyId,
        bucketDate: key.bucketDate,
      },
    });

    if (existing) {
      existing.inquiryCount = inquiryCount;
      existing.viewedInquiryCount = viewedInquiryCount;
      await this.rollupRepository.save(existing);
      return;
    }

    await this.rollupRepository.save(
      this.rollupRepository.create({
        ownerId: key.ownerId,
        propertyId: key.propertyId,
        bucketDate: key.bucketDate,
        inquiryCount,
        viewedInquiryCount,
      }),
    );
  }

  private utcDateKey(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
