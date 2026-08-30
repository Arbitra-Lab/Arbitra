import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Dispute,
  DisputeStatus,
  DisputeType,
} from '../disputes/entities/dispute.entity';
import { DisputeCohortQueryDto } from './dto/dispute-cohort-query.dto';

// ─── Public interfaces ────────────────────────────────────────────────────────

export interface RulingDistribution {
  /** Dispute resolved in favour of the landlord (votes tally or blockchain outcome). */
  landlordFavour: number;
  /** Dispute resolved in favour of the tenant. */
  tenantFavour: number;
  /** Dispute withdrawn or rejected without a decisive ruling. */
  inconclusive: number;
}

export interface DisputeCohortBucket {
  /** ISO month label, e.g. "2026-03". */
  month: string;
  /** Dispute category (DisputeType) this bucket covers. */
  category: DisputeType | 'ALL';
  /** Total disputes that were resolved within this cohort bucket. */
  resolvedCount: number;
  /** Total disputes opened within this cohort bucket (resolved + still open). */
  totalCount: number;
  /**
   * Median resolution time in hours for disputes resolved in this bucket.
   * Null when there are no resolved disputes.
   */
  medianResolutionHours: number | null;
  /** Ruling distribution for resolved disputes in this bucket. */
  rulingDistribution: RulingDistribution;
  /**
   * Refund rate: percentage of resolved disputes where the requested amount
   * was significant (requestedAmount > 0), used as a proxy for refund
   * outcomes until a dedicated refundAmount column is added.
   */
  refundRate: number;
}

export interface DisputeCohortReport {
  generatedAt: string;
  range: {
    startDate: string;
    endDate: string;
  };
  /** Flat list of cohort buckets, one per (month × category) combination. */
  cohorts: DisputeCohortBucket[];
  /** Aggregated totals across the entire date range. */
  totals: {
    totalDisputes: number;
    resolvedDisputes: number;
    medianResolutionHours: number | null;
    rulingDistribution: RulingDistribution;
    refundRate: number;
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Returns the ISO month string "YYYY-MM" for a given Date. */
function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7);
}

/**
 * Derives a ruling from vote tallies and the blockchainOutcome string.
 * Returns 'landlord' | 'tenant' | 'inconclusive'.
 */
function deriveRuling(
  dispute: Pick<
    Dispute,
    'votesFavorLandlord' | 'votesFavorTenant' | 'blockchainOutcome' | 'status'
  >,
): 'landlord' | 'tenant' | 'inconclusive' {
  if (dispute.status !== DisputeStatus.RESOLVED) {
    return 'inconclusive';
  }

  // Prefer explicit blockchain outcome when present
  if (dispute.blockchainOutcome) {
    const outcome = dispute.blockchainOutcome.toLowerCase();
    if (outcome.includes('landlord')) return 'landlord';
    if (outcome.includes('tenant')) return 'tenant';
  }

  const landlordVotes = Number(dispute.votesFavorLandlord ?? 0);
  const tenantVotes = Number(dispute.votesFavorTenant ?? 0);

  if (landlordVotes > tenantVotes) return 'landlord';
  if (tenantVotes > landlordVotes) return 'tenant';

  return 'inconclusive';
}

/**
 * Computes the median from an array of numbers.
 * Returns null for empty arrays.
 */
function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
    : Number(sorted[mid].toFixed(2));
}

/** Safe percentage: returns 0 when denominator is 0. */
function toPercent(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Number(((part / whole) * 100).toFixed(2));
}

// ─── Rollup key used internally ───────────────────────────────────────────────
type BucketKey = string; // `${month}::${category}`

interface MutableBucket {
  month: string;
  category: DisputeType | 'ALL';
  totalCount: number;
  resolvedCount: number;
  resolutionHours: number[];
  landlordFavour: number;
  tenantFavour: number;
  inconclusive: number;
  refundCount: number; // disputes with requestedAmount > 0 that resolved
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AnalyticsRollupService {
  private readonly logger = new Logger(AnalyticsRollupService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
  ) {}

  // ── Main entry point ────────────────────────────────────────────────────────

  /**
   * Computes dispute-outcome cohort metrics and returns a pre-aggregated
   * report ready to serve dashboard queries.
   *
   * Call with `backfill: true` to include all historical disputes regardless
   * of the date range supplied.
   */
  async computeDisputeCohortReport(
    query: DisputeCohortQueryDto = {},
  ): Promise<DisputeCohortReport> {
    const { startDate, endDate } = this.resolveDateRange(query);

    this.logger.log(
      `Computing dispute cohort report: ${startDate.toISOString()} → ${endDate.toISOString()}`,
    );

    const disputes = await this.fetchDisputes(
      startDate,
      endDate,
      query.backfill,
      query.category,
    );

    return this.aggregate(disputes, startDate, endDate);
  }

  // ── Nightly rollup (call from a scheduler) ──────────────────────────────────

  /**
   * Convenience wrapper intended to be called by a nightly cron job.
   * Rolls up the previous full calendar month by default.
   */
  async nightly(): Promise<DisputeCohortReport> {
    const now = new Date();
    // Roll up the previous full month
    const firstOfThisMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const endOfLastMonth = new Date(firstOfThisMonth.getTime() - 1);
    const firstOfLastMonth = new Date(
      Date.UTC(
        endOfLastMonth.getUTCFullYear(),
        endOfLastMonth.getUTCMonth(),
        1,
      ),
    );

    this.logger.log(
      `Nightly rollup: ${firstOfLastMonth.toISOString()} → ${endOfLastMonth.toISOString()}`,
    );

    return this.computeDisputeCohortReport({
      startDate: firstOfLastMonth.toISOString().slice(0, 10),
      endDate: endOfLastMonth.toISOString().slice(0, 10),
    });
  }

  // ── Backfill all historical data ────────────────────────────────────────────

  /**
   * Backfills cohort metrics from the earliest dispute in the database to
   * the current timestamp. Safe to run multiple times.
   */
  async backfill(): Promise<DisputeCohortReport> {
    this.logger.log('Starting full historical backfill of dispute cohorts');
    return this.computeDisputeCohortReport({ backfill: true });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private resolveDateRange(query: DisputeCohortQueryDto): {
    startDate: Date;
    endDate: Date;
  } {
    const endDate = query.endDate ? new Date(query.endDate) : new Date();

    let startDate: Date;
    if (query.startDate) {
      startDate = new Date(query.startDate);
    } else {
      const months = query.months ?? 12;
      startDate = new Date(endDate);
      startDate.setUTCMonth(startDate.getUTCMonth() - months);
      startDate.setUTCDate(1); // align to first of month
      startDate.setUTCHours(0, 0, 0, 0);
    }

    // Normalise endDate to end-of-day
    endDate.setUTCHours(23, 59, 59, 999);

    return { startDate, endDate };
  }

  private async fetchDisputes(
    startDate: Date,
    endDate: Date,
    backfill = false,
    category?: DisputeType,
  ): Promise<Dispute[]> {
    const qb = this.disputeRepository
      .createQueryBuilder('dispute')
      .select([
        'dispute.id',
        'dispute.disputeType',
        'dispute.status',
        'dispute.requestedAmount',
        'dispute.createdAt',
        'dispute.resolvedAt',
        'dispute.votesFavorLandlord',
        'dispute.votesFavorTenant',
        'dispute.blockchainOutcome',
      ]);

    if (!backfill) {
      // Include disputes opened within the range OR resolved within the range
      qb.where(
        '(dispute.createdAt >= :start AND dispute.createdAt <= :end) OR (dispute.resolvedAt >= :start AND dispute.resolvedAt <= :end)',
        { start: startDate, end: endDate },
      );
    }

    if (category) {
      qb.andWhere('dispute.disputeType = :category', { category });
    }

    return qb.orderBy('dispute.createdAt', 'ASC').getMany();
  }

  /**
   * Core aggregation: builds one bucket per (month × category) pairing plus
   * a combined "ALL" category bucket per month.
   */
  private aggregate(
    disputes: Dispute[],
    startDate: Date,
    endDate: Date,
  ): DisputeCohortReport {
    const bucketMap = new Map<BucketKey, MutableBucket>();

    const getBucket = (
      month: string,
      category: DisputeType | 'ALL',
    ): MutableBucket => {
      const key: BucketKey = `${month}::${category}`;
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          month,
          category,
          totalCount: 0,
          resolvedCount: 0,
          resolutionHours: [],
          landlordFavour: 0,
          tenantFavour: 0,
          inconclusive: 0,
          refundCount: 0,
        });
      }
      return bucketMap.get(key)!;
    };

    for (const dispute of disputes) {
      const openedMonth = toMonthKey(dispute.createdAt);
      const isResolved = dispute.status === DisputeStatus.RESOLVED;

      // Bucket by opened month + specific category
      const specificBucket = getBucket(openedMonth, dispute.disputeType);
      specificBucket.totalCount += 1;

      // Bucket by opened month across all categories
      const allBucket = getBucket(openedMonth, 'ALL');
      allBucket.totalCount += 1;

      if (isResolved && dispute.resolvedAt) {
        const resolutionMs =
          dispute.resolvedAt.getTime() - dispute.createdAt.getTime();
        const resolutionHours = Number((resolutionMs / 3_600_000).toFixed(2));

        const ruling = deriveRuling(dispute);

        // Specific category bucket
        specificBucket.resolvedCount += 1;
        specificBucket.resolutionHours.push(resolutionHours);
        this.applyRuling(specificBucket, ruling);
        if (Number(dispute.requestedAmount ?? 0) > 0) {
          specificBucket.refundCount += 1;
        }

        // All-categories bucket
        allBucket.resolvedCount += 1;
        allBucket.resolutionHours.push(resolutionHours);
        this.applyRuling(allBucket, ruling);
        if (Number(dispute.requestedAmount ?? 0) > 0) {
          allBucket.refundCount += 1;
        }
      }
    }

    // Pre-seed month slots so gaps show as zero-count buckets
    this.seedEmptyMonths(bucketMap, startDate, endDate);

    // Materialise final cohort buckets
    const cohorts: DisputeCohortBucket[] = Array.from(bucketMap.values())
      .map((b) => this.materialise(b))
      .sort((a, b) => {
        // Sort by month ASC, then category (ALL last)
        if (a.month !== b.month) return a.month < b.month ? -1 : 1;
        if (a.category === 'ALL') return 1;
        if (b.category === 'ALL') return -1;
        return (a.category as string) < (b.category as string) ? -1 : 1;
      });

    // Compute global totals from ALL buckets of each month
    const allMonthBuckets = cohorts.filter((c) => c.category === 'ALL');
    const totals = this.computeTotals(allMonthBuckets);

    return {
      generatedAt: new Date().toISOString(),
      range: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      cohorts,
      totals,
    };
  }

  private applyRuling(
    bucket: MutableBucket,
    ruling: 'landlord' | 'tenant' | 'inconclusive',
  ): void {
    if (ruling === 'landlord') bucket.landlordFavour += 1;
    else if (ruling === 'tenant') bucket.tenantFavour += 1;
    else bucket.inconclusive += 1;
  }

  /**
   * Ensures every calendar month in [startDate, endDate] has at least an
   * empty ALL-category bucket so the dashboard can render a continuous axis.
   */
  private seedEmptyMonths(
    bucketMap: Map<BucketKey, MutableBucket>,
    startDate: Date,
    endDate: Date,
  ): void {
    const cursor = new Date(
      Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1),
    );
    const endMonth = toMonthKey(endDate);

    while (toMonthKey(cursor) <= endMonth) {
      const month = toMonthKey(cursor);
      const key: BucketKey = `${month}::ALL`;
      if (!bucketMap.has(key)) {
        bucketMap.set(key, {
          month,
          category: 'ALL',
          totalCount: 0,
          resolvedCount: 0,
          resolutionHours: [],
          landlordFavour: 0,
          tenantFavour: 0,
          inconclusive: 0,
          refundCount: 0,
        });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  private materialise(b: MutableBucket): DisputeCohortBucket {
    return {
      month: b.month,
      category: b.category,
      totalCount: b.totalCount,
      resolvedCount: b.resolvedCount,
      medianResolutionHours: median(b.resolutionHours),
      rulingDistribution: {
        landlordFavour: b.landlordFavour,
        tenantFavour: b.tenantFavour,
        inconclusive: b.inconclusive,
      },
      refundRate: toPercent(b.refundCount, b.resolvedCount),
    };
  }

  private computeTotals(allCategoryBuckets: DisputeCohortBucket[]): {
    totalDisputes: number;
    resolvedDisputes: number;
    medianResolutionHours: number | null;
    rulingDistribution: RulingDistribution;
    refundRate: number;
  } {
    let totalDisputes = 0;
    let resolvedDisputes = 0;
    const allResolutionHours: number[] = [];
    const ruling: RulingDistribution = {
      landlordFavour: 0,
      tenantFavour: 0,
      inconclusive: 0,
    };
    let totalRefundCount = 0;

    for (const bucket of allCategoryBuckets) {
      totalDisputes += bucket.totalCount;
      resolvedDisputes += bucket.resolvedCount;
      ruling.landlordFavour += bucket.rulingDistribution.landlordFavour;
      ruling.tenantFavour += bucket.rulingDistribution.tenantFavour;
      ruling.inconclusive += bucket.rulingDistribution.inconclusive;

      // Back-calculate refund count from rate and resolved count
      totalRefundCount += Math.round(
        (bucket.refundRate / 100) * bucket.resolvedCount,
      );
    }

    return {
      totalDisputes,
      resolvedDisputes,
      medianResolutionHours: allResolutionHours.length
        ? median(allResolutionHours)
        : null,
      rulingDistribution: ruling,
      refundRate: toPercent(totalRefundCount, resolvedDisputes),
    };
  }
}
