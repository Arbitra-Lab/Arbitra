import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOperator, MoreThanOrEqual, Repository } from 'typeorm';
import { Arbiter } from '../disputes/entities/arbiter.entity';
import {
  Dispute,
  DisputePriority,
  DisputeStatus,
  DisputeType,
} from '../disputes/entities/dispute.entity';
import { DisputeVote } from '../disputes/entities/dispute-vote.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { RentAgreement } from '../rent/entities/rent-contract.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { DisputeCohortQueryDto } from './dto/dispute-cohort-query.dto';
import {
  AdminAnalyticsQueryDto,
  AnalyticsGroupBy,
  AnalyticsSection,
} from './dto/admin-analytics-query.dto';

interface Range {
  from: Date;
  to: Date;
  days: number;
  groupBy: AnalyticsGroupBy;
}

interface TrendPoint {
  bucket: string;
  count: number;
}

interface Aggregates {
  disputes: Dispute[];
  votes: DisputeVote[];
  agreements: RentAgreement[];
  payments: Payment[];
  users: User[];
  arbiters: Arbiter[];
}

@Injectable()
export class AdminAnalyticsService {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(DisputeVote)
    private readonly voteRepo: Repository<DisputeVote>,
    @InjectRepository(RentAgreement)
    private readonly agreementRepo: Repository<RentAgreement>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Arbiter)
    private readonly arbiterRepo: Repository<Arbiter>,
  ) {}

  async getDashboard(query: AdminAnalyticsQueryDto) {
    const range = this.resolveRange(query);
    const current = await this.loadAggregates(range.from, range.to);
    const sections = query.sections?.length
      ? query.sections
      : Object.values(AnalyticsSection);

    const report: Record<string, unknown> = {
      generatedAt: new Date().toISOString(),
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        days: range.days,
        groupBy: range.groupBy,
      },
    };

    if (sections.includes(AnalyticsSection.USAGE)) {
      report.usage = this.buildUsage(current, range);
    }
    if (sections.includes(AnalyticsSection.REVENUE)) {
      report.revenue = this.buildRevenue(current, range);
    }
    if (sections.includes(AnalyticsSection.ARBITERS)) {
      report.arbiters = this.buildArbiterPerformance(current);
    }
    if (sections.includes(AnalyticsSection.USERS)) {
      report.users = this.buildUserMetrics(current);
    }
    if (sections.includes(AnalyticsSection.DISPUTES)) {
      report.disputes = this.buildDisputeMetrics(current);
    }
    if (sections.includes(AnalyticsSection.HEALTH)) {
      report.health = this.buildPlatformHealth(current);
    }
    if (query.compare) {
      const previousTo = new Date(range.from.getTime() - 1);
      const previousFrom = new Date(
        previousTo.getTime() - range.days * 24 * 60 * 60 * 1000,
      );
      const previous = await this.loadAggregates(previousFrom, previousTo);
      report.comparison = {
        from: previousFrom.toISOString(),
        to: previousTo.toISOString(),
        disputes: previous.disputes.length,
        completedPayments: previous.payments.filter(
          (payment) => payment.status === PaymentStatus.COMPLETED,
        ).length,
        newUsers: previous.users.length,
        weightedVotes: previous.votes.reduce(
          (sum, vote) => sum + this.voteWeight(vote),
          0,
        ),
      };
    }

    return report;
  }

  async exportCsv(query: AdminAnalyticsQueryDto): Promise<string> {
    const report = (await this.getDashboard(query)) as Record<string, any>;
    const rows: string[] = ['section,metric,value,unit'];

    for (const section of Object.values(AnalyticsSection)) {
      const payload = report[section];
      if (!payload || typeof payload !== 'object') continue;

      for (const [metric, value] of Object.entries(
        payload as Record<string, unknown>,
      )) {
        if (typeof value === 'number' || typeof value === 'string') {
          rows.push(this.csvRow(section, metric, value));
        } else if (Array.isArray(value)) {
          value.forEach((entry, index) => {
            if (entry && typeof entry === 'object') {
              rows.push(
                this.csvRow(
                  section,
                  `${metric}[${index}]`,
                  JSON.stringify(entry),
                ),
              );
            }
          });
        } else if (value && typeof value === 'object') {
          for (const [key, nested] of Object.entries(
            value as Record<string, unknown>,
          )) {
            if (typeof nested === 'number' || typeof nested === 'string') {
              rows.push(this.csvRow(section, `${metric}.${key}`, nested));
            }
          }
        }
      }
    }

    return rows.join('\n');
  }

  async getDisputeCohortMetrics(query: DisputeCohortQueryDto) {
    const { from, to } = this.resolveCohortRange(query);
    const where: Record<string, FindOperator<Date> | DisputeType> = {
      createdAt: MoreThanOrEqual(from),
    };
    if (to) where.createdAt = this.between(from, to);
    if (query.category) where.disputeType = query.category;

    const disputes = await this.disputeRepo.find({
      where,
      select: {
        id: true,
        disputeType: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        resolution: true,
        requestedAmount: true,
        metadata: true,
      },
    });

    const cohorts = new Map<string, Dispute[]>();
    for (const dispute of disputes) {
      const key = this.monthKey(dispute.createdAt);
      const bucket = cohorts.get(key) ?? [];
      bucket.push(dispute);
      cohorts.set(key, bucket);
    }

    const rows = [...cohorts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, bucket]) => this.buildCohortRow(month, bucket));

    return {
      from: from.toISOString(),
      to: to ? to.toISOString() : new Date().toISOString(),
      category: query.category ?? null,
      totalDisputes: disputes.length,
      cohorts: rows,
    };
  }

  private async loadAggregates(from: Date, to: Date): Promise<Aggregates> {
    const [disputes, votes, agreements, payments, users, arbiters] =
      await Promise.all([
        this.disputeRepo.find({
          where: { createdAt: this.between(from, to) },
          select: {
            id: true,
            initiatedBy: true,
            assignedArbiterId: true,
            disputeType: true,
            priority: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
            escalationCount: true,
            slaBreachedAt: true,
            votesFavorLandlord: true,
            votesFavorTenant: true,
            metadata: true,
          },
        }),
        this.voteRepo.find({
          where: { createdAt: this.between(from, to) },
          select: {
            id: true,
            arbiterId: true,
            disputeId: true,
            favorLandlord: true,
            voteWeight: true,
            createdAt: true,
          },
        }),
        this.agreementRepo.find({
          where: { createdAt: this.between(from, to) },
          select: { id: true, status: true, createdAt: true },
        }),
        this.paymentRepo.find({
          where: { createdAt: this.between(from, to) },
          select: {
            id: true,
            userId: true,
            agreementId: true,
            amount: true,
            status: true,
            currency: true,
            metadata: true,
            createdAt: true,
          },
        }),
        this.userRepo.find({
          where: { createdAt: this.between(from, to) },
          select: { id: true, role: true, createdAt: true, lastLoginAt: true },
        }),
        this.arbiterRepo.find({
          select: {
            id: true,
            active: true,
            reputationScore: true,
            totalVotes: true,
            totalDisputesResolved: true,
            successfulResolutions: true,
            userId: true,
          },
        }),
      ]);

    return { disputes, votes, agreements, payments, users, arbiters };
  }

  private buildUsage(data: Aggregates, range: Range) {
    return {
      totals: {
        disputes: data.disputes.length,
        agreements: data.agreements.length,
        weightedVotes: data.votes.reduce(
          (sum, vote) => sum + this.voteWeight(vote),
          0,
        ),
        transactions: data.payments.length,
      },
      trends: {
        disputes: this.trend(
          data.disputes.map((entry) => entry.createdAt),
          range,
        ),
        agreements: this.trend(
          data.agreements.map((entry) => entry.createdAt),
          range,
        ),
        transactions: this.trend(
          data.payments.map((entry) => entry.createdAt),
          range,
        ),
      },
    };
  }

  private buildRevenue(data: Aggregates, range: Range) {
    const completed = data.payments.filter(
      (payment) => payment.status === PaymentStatus.COMPLETED,
    );
    const byCategory = new Map<string, { amount: number; count: number }>();
    for (const payment of completed) {
      const category = this.paymentCategory(payment);
      const bucket = byCategory.get(category) ?? { amount: 0, count: 0 };
      bucket.amount += this.toNumber(payment.amount);
      bucket.count += 1;
      byCategory.set(category, bucket);
    }

    return {
      totalAmount: Number(
        completed
          .reduce((sum, payment) => sum + this.toNumber(payment.amount), 0)
          .toFixed(2),
      ),
      transactionCount: completed.length,
      byCategory: [...byCategory.entries()]
        .map(([category, value]) => ({ category, ...value }))
        .sort((left, right) => right.amount - left.amount),
      trend: this.trend(
        completed.map((payment) => payment.createdAt),
        range,
        (paymentAmount) => this.toNumber(paymentAmount),
        completed.map((payment) => payment.amount),
      ),
    };
  }

  private buildArbiterPerformance(data: Aggregates) {
    const votesByArbiter = new Map<number, { count: number; weight: number }>();
    for (const vote of data.votes) {
      const bucket = votesByArbiter.get(vote.arbiterId) ?? {
        count: 0,
        weight: 0,
      };
      bucket.count += 1;
      bucket.weight += this.voteWeight(vote);
      votesByArbiter.set(vote.arbiterId, bucket);
    }

    const top = data.arbiters
      .map((arbiter) => {
        const votes = votesByArbiter.get(arbiter.id) ?? { count: 0, weight: 0 };
        const resolved = this.toNumber(arbiter.totalDisputesResolved);
        const successful = this.toNumber(arbiter.successfulResolutions);
        return {
          arbiterId: arbiter.id,
          active: arbiter.active,
          reputationScore: this.toNumber(arbiter.reputationScore),
          votesInRange: votes.count,
          weightedVotesInRange: votes.weight,
          totalVotes: this.toNumber(arbiter.totalVotes),
          resolvedDisputes: resolved,
          successRate:
            resolved > 0 ? Number((successful / resolved).toFixed(4)) : 0,
        };
      })
      .sort(
        (left, right) => right.weightedVotesInRange - left.weightedVotesInRange,
      )
      .slice(0, 20);

    const active = data.arbiters.filter((arbiter) => arbiter.active).length;

    return {
      total: data.arbiters.length,
      active,
      averageReputation: data.arbiters.length
        ? Number(
            (
              data.arbiters.reduce(
                (sum, arbiter) => sum + this.toNumber(arbiter.reputationScore),
                0,
              ) / data.arbiters.length
            ).toFixed(2),
          )
        : 0,
      top,
    };
  }

  private buildUserMetrics(data: Aggregates) {
    const appearances = new Map<string, number>();
    const touch = (userId: string | number | null | undefined) => {
      if (userId === null || userId === undefined || userId === '') return;
      const key = String(userId);
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    };

    data.disputes.forEach((dispute) => touch(dispute.initiatedBy));
    data.payments.forEach((payment) => touch(payment.userId));

    const byRole = new Map<string, number>();
    for (const user of data.users) {
      const role = String(user.role ?? UserRole.USER);
      byRole.set(role, (byRole.get(role) ?? 0) + 1);
    }

    return {
      newUsers: data.users.length,
      activeUsers: appearances.size,
      retainedUsers: [...appearances.values()].filter((count) => count > 1)
        .length,
      retentionRate: appearances.size
        ? Number(
            (
              [...appearances.values()].filter((count) => count > 1).length /
              appearances.size
            ).toFixed(4),
          )
        : 0,
      byRole: [...byRole.entries()]
        .map(([role, count]) => ({ role, count }))
        .sort((left, right) => right.count - left.count),
      trend: this.trend(
        data.users.map((user) => user.createdAt),
        {
          from: new Date(
            Math.min(
              ...data.users.map((user) => user.createdAt.getTime()),
              Date.now(),
            ),
          ),
          to: new Date(),
          days: 1,
          groupBy: AnalyticsGroupBy.MONTH,
        },
      ),
    };
  }

  private buildDisputeMetrics(data: Aggregates) {
    const terminal = data.disputes.filter((dispute) =>
      [DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(dispute.status),
    );
    const resolutionHours = terminal.flatMap((dispute) =>
      dispute.resolvedAt
        ? [
            (dispute.resolvedAt.getTime() - dispute.createdAt.getTime()) /
              (60 * 60 * 1000),
          ]
        : [],
    );

    return {
      total: data.disputes.length,
      resolutionRate: data.disputes.length
        ? Number((terminal.length / data.disputes.length).toFixed(4))
        : 0,
      medianResolutionHours: this.median(resolutionHours),
      byStatus: this.countBy(data.disputes, (dispute) => dispute.status),
      byType: this.countBy(data.disputes, (dispute) => dispute.disputeType),
      byPriority: this.countBy(
        data.disputes,
        (dispute) => dispute.priority ?? DisputePriority.NORMAL,
      ),
      averageWeightedVotes: data.disputes.length
        ? Number(
            (
              data.votes.reduce((sum, vote) => sum + this.voteWeight(vote), 0) /
              data.disputes.length
            ).toFixed(2),
          )
        : 0,
    };
  }

  private buildPlatformHealth(data: Aggregates) {
    const failedPayments = data.payments.filter((payment) =>
      [PaymentStatus.FAILED, PaymentStatus.REFUNDED].includes(payment.status),
    ).length;
    const slaBreaches = data.disputes.filter(
      (dispute) => dispute.slaBreachedAt,
    ).length;
    const escalations = data.disputes.reduce(
      (sum, dispute) => sum + Number(dispute.escalationCount ?? 0),
      0,
    );
    const activeArbiters = data.arbiters.filter(
      (arbiter) => arbiter.active,
    ).length;

    const warning =
      (data.payments.length > 0 &&
        failedPayments / data.payments.length > 0.1) ||
      (data.disputes.length > 0 && slaBreaches / data.disputes.length > 0.1) ||
      activeArbiters === 0;

    return {
      status: warning ? 'watch' : 'healthy',
      failedPaymentRate: data.payments.length
        ? Number((failedPayments / data.payments.length).toFixed(4))
        : 0,
      slaBreachRate: data.disputes.length
        ? Number((slaBreaches / data.disputes.length).toFixed(4))
        : 0,
      escalationCount: escalations,
      activeArbiters,
    };
  }

  private buildCohortRow(month: string, disputes: Dispute[]) {
    const terminal = disputes.filter((dispute) =>
      [DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(dispute.status),
    );
    const ruling = {
      landlord: terminal.filter((dispute) =>
        Boolean(dispute.votesFavorLandlord > dispute.votesFavorTenant),
      ).length,
      tenant: terminal.filter((dispute) =>
        Boolean(dispute.votesFavorTenant > dispute.votesFavorLandlord),
      ).length,
      inconclusive: terminal.filter(
        (dispute) => dispute.votesFavorLandlord === dispute.votesFavorTenant,
      ).length,
    };
    const refunded = terminal.filter((dispute) =>
      this.isRefunded(dispute),
    ).length;
    const resolutionDays = terminal.flatMap((dispute) =>
      dispute.resolvedAt
        ? [
            (dispute.resolvedAt.getTime() - dispute.createdAt.getTime()) /
              (24 * 60 * 60 * 1000),
          ]
        : [],
    );

    return {
      month,
      total: disputes.length,
      resolved: terminal.length,
      medianResolutionDays: this.median(resolutionDays),
      ruling,
      refundRate: terminal.length
        ? Number((refunded / terminal.length).toFixed(4))
        : 0,
    };
  }

  private resolveRange(query: AdminAnalyticsQueryDto): Range {
    const days = query.days ?? 30;
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
    return {
      from,
      to,
      days,
      groupBy: query.groupBy ?? AnalyticsGroupBy.DAY,
    };
  }

  private resolveCohortRange(query: DisputeCohortQueryDto): {
    from: Date;
    to: Date | null;
  } {
    if (query.startDate || query.endDate) {
      return {
        from: new Date(query.startDate ?? '1970-01-01'),
        to: query.endDate ? new Date(query.endDate) : null,
      };
    }

    const to = new Date();
    const from = new Date(to);
    from.setUTCMonth(from.getUTCMonth() - (query.months ?? 12));
    return { from, to };
  }

  private between(from: Date, to: Date) {
    return Between(from, to);
  }

  private trend(
    dates: Date[],
    range: Range,
    valueFor?: (value: unknown) => number,
    values?: unknown[],
  ): TrendPoint[] {
    const buckets = new Map<string, number>();
    const entries = values ?? dates;

    entries.forEach((entry, index) => {
      const date = dates[index];
      if (!date) return;
      const key = this.bucketKey(date, range.groupBy);
      const value = valueFor ? valueFor(entry) : 1;
      buckets.set(key, (buckets.get(key) ?? 0) + value);
    });

    const seeded = new Map<string, number>();
    const cursor = new Date(range.from);
    while (cursor <= range.to) {
      seeded.set(this.bucketKey(cursor, range.groupBy), 0);
      if (range.groupBy === AnalyticsGroupBy.MONTH) {
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      } else if (range.groupBy === AnalyticsGroupBy.WEEK) {
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      } else {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    for (const [key, value] of buckets) {
      seeded.set(key, Number((seeded.get(key) ?? 0) + value));
    }

    return [...seeded.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([bucket, count]) => ({
        bucket,
        count: Number(count.toFixed(2)),
      }));
  }

  private bucketKey(date: Date, groupBy: AnalyticsGroupBy): string {
    if (groupBy === AnalyticsGroupBy.MONTH) return this.monthKey(date);
    const cursor = new Date(date);
    if (groupBy === AnalyticsGroupBy.WEEK) {
      const day = cursor.getUTCDay() || 7;
      cursor.setUTCDate(cursor.getUTCDate() - day + 1);
    }
    return cursor.toISOString().slice(0, 10);
  }

  private monthKey(date: Date): string {
    return date.toISOString().slice(0, 7);
  }

  private countBy<T>(items: T[], keyFor: (item: T) => string | number) {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = String(keyFor(item));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count);
  }

  private paymentCategory(payment: Payment): string {
    const metadata = (payment.metadata ?? {}) as Record<string, unknown>;
    const candidate = metadata.agreementType ?? metadata.flow ?? metadata.type;
    return typeof candidate === 'string' && candidate.length > 0
      ? candidate
      : 'uncategorized';
  }

  private isRefunded(dispute: Dispute): boolean {
    const metadata = (dispute.metadata ?? {}) as Record<string, unknown>;
    if (
      metadata.refundIssued === true ||
      metadata.refunded === true ||
      typeof metadata.refundAmount === 'number'
    ) {
      return true;
    }
    return /refund (issued|processed|granted|approved)|issued a refund/i.test(
      dispute.resolution ?? '',
    );
  }

  private voteWeight(vote: DisputeVote): number {
    return Math.max(1, Number(vote.voteWeight ?? 1));
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    const result =
      sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
    return Number(result.toFixed(2));
  }

  private csvRow(section: string, metric: string, value: unknown): string {
    return [section, metric, String(value), this.unitFor(metric)]
      .map((cell) => `"${cell.replace(/"/g, '""')}"`)
      .join(',');
  }

  private unitFor(metric: string): string {
    if (metric.includes('Amount')) return 'currency';
    if (metric.includes('Rate')) return 'ratio';
    if (metric.includes('Hours') || metric.includes('Days')) return 'time';
    if (metric.includes('Score')) return 'score';
    return 'count';
  }
}
