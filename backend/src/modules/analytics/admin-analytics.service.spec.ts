import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
import { AdminAnalyticsService } from './admin-analytics.service';
import { AnalyticsSection } from './dto/admin-analytics-query.dto';

describe('AdminAnalyticsService', () => {
  let service: AdminAnalyticsService;
  let repositories: Record<string, { find: jest.Mock }>;

  const now = new Date('2026-11-20T12:00:00.000Z');
  const earlier = new Date('2026-11-18T12:00:00.000Z');

  const dispute = (overrides: Partial<Dispute> = {}): Dispute =>
    ({
      id: 1,
      initiatedBy: 10,
      assignedArbiterId: 1,
      disputeType: DisputeType.RENT_PAYMENT,
      priority: DisputePriority.HIGH,
      status: DisputeStatus.RESOLVED,
      createdAt: earlier,
      resolvedAt: now,
      escalationCount: 0,
      slaBreachedAt: null,
      votesFavorLandlord: 2,
      votesFavorTenant: 1,
      metadata: null,
      ...overrides,
    }) as Dispute;

  const payment = (overrides: Partial<Payment> = {}): Payment =>
    ({
      id: 'pay-1',
      userId: '10',
      agreementId: 'agr-1',
      amount: 100,
      status: PaymentStatus.COMPLETED,
      currency: 'NGN',
      metadata: { flow: 'rent' },
      createdAt: earlier,
      ...overrides,
    }) as Payment;

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(now);
    repositories = {
      disputes: { find: jest.fn() },
      votes: { find: jest.fn() },
      agreements: { find: jest.fn() },
      payments: { find: jest.fn() },
      users: { find: jest.fn() },
      arbiters: { find: jest.fn() },
    };

    repositories.disputes.find.mockResolvedValue([dispute()]);
    repositories.votes.find.mockResolvedValue([
      { id: 1, arbiterId: 1, voteWeight: 3, favorLandlord: true },
    ]);
    repositories.agreements.find.mockResolvedValue([
      { id: 'agr-1', status: 'active', createdAt: earlier },
    ]);
    repositories.payments.find.mockResolvedValue([payment()]);
    repositories.users.find.mockResolvedValue([
      { id: '10', role: UserRole.USER, createdAt: earlier },
    ]);
    repositories.arbiters.find.mockResolvedValue([
      {
        id: 1,
        active: true,
        reputationScore: 95,
        totalVotes: 10,
        totalDisputesResolved: 8,
        successfulResolutions: 6,
      },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: repositories.disputes,
        },
        {
          provide: getRepositoryToken(DisputeVote),
          useValue: repositories.votes,
        },
        {
          provide: getRepositoryToken(RentAgreement),
          useValue: repositories.agreements,
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: repositories.payments,
        },
        { provide: getRepositoryToken(User), useValue: repositories.users },
        {
          provide: getRepositoryToken(Arbiter),
          useValue: repositories.arbiters,
        },
      ],
    }).compile();

    service = module.get(AdminAnalyticsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns only the configured dashboard sections', async () => {
    const report = (await service.getDashboard({
      days: 7,
      sections: [AnalyticsSection.USAGE, AnalyticsSection.HEALTH],
    })) as Record<string, any>;

    expect(Object.keys(report)).toEqual(
      expect.arrayContaining(['generatedAt', 'range', 'usage', 'health']),
    );
    expect(report.revenue).toBeUndefined();
    expect(report.disputes).toBeUndefined();
    expect(report.usage.totals).toMatchObject({
      disputes: 1,
      agreements: 1,
      weightedVotes: 3,
      transactions: 1,
    });
  });

  it('aggregates revenue by payment flow and uses weighted arbiter votes', async () => {
    repositories.payments.find.mockResolvedValue([
      payment({ id: 'pay-1', amount: 100, metadata: { flow: 'rent' } }),
      payment({
        id: 'pay-2',
        amount: 50,
        metadata: { flow: 'security_deposit' },
      }),
      payment({
        id: 'pay-3',
        amount: 20,
        status: PaymentStatus.FAILED,
        metadata: { flow: 'rent' },
      }),
    ]);

    const report = (await service.getDashboard({
      days: 7,
      sections: [AnalyticsSection.REVENUE, AnalyticsSection.ARBITERS],
    })) as Record<string, any>;

    expect(report.revenue.totalAmount).toBe(150);
    expect(report.revenue.byCategory).toEqual([
      { category: 'rent', amount: 100, count: 1 },
      { category: 'security_deposit', amount: 50, count: 1 },
    ]);
    expect(report.arbiters.top[0]).toMatchObject({
      weightedVotesInRange: 3,
      successRate: 0.75,
    });
  });

  it('computes dispute efficiency and flags unhealthy platform state', async () => {
    repositories.disputes.find.mockResolvedValue([
      dispute({ status: DisputeStatus.RESOLVED }),
      dispute({
        id: 2,
        status: DisputeStatus.OPEN,
        resolvedAt: undefined,
        slaBreachedAt: now,
        escalationCount: 2,
      }),
    ]);
    repositories.payments.find.mockResolvedValue([
      payment({ status: PaymentStatus.COMPLETED }),
      payment({ id: 'pay-2', status: PaymentStatus.FAILED }),
    ]);
    repositories.arbiters.find.mockResolvedValue([]);

    const report = (await service.getDashboard({
      days: 7,
      sections: [AnalyticsSection.DISPUTES, AnalyticsSection.HEALTH],
    })) as Record<string, any>;

    expect(report.disputes).toMatchObject({
      total: 2,
      resolutionRate: 0.5,
      averageWeightedVotes: 1.5,
    });
    expect(report.health).toMatchObject({
      status: 'watch',
      failedPaymentRate: 0.5,
      slaBreachRate: 0.5,
      escalationCount: 2,
      activeArbiters: 0,
    });
  });

  it('exports selected metrics as CSV rows with units', async () => {
    const csv = await service.exportCsv({
      days: 7,
      sections: [AnalyticsSection.DISPUTES],
    });

    expect(csv).toContain('section,metric,value,unit');
    expect(csv).toContain('"disputes","resolutionRate","1","ratio"');
    expect(csv).toContain('"disputes","total","1","count"');
  });

  it('groups dispute cohorts by month with ruling and refund metrics', async () => {
    repositories.disputes.find.mockResolvedValue([
      dispute({
        resolution: 'Refund issued to tenant',
        votesFavorLandlord: 1,
        votesFavorTenant: 4,
      }),
      dispute({
        id: 2,
        resolution: 'No refund',
        votesFavorLandlord: 2,
        votesFavorTenant: 2,
      }),
    ]);

    const result = await service.getDisputeCohortMetrics({ months: 3 });

    expect(result.totalDisputes).toBe(2);
    expect(result.cohorts).toHaveLength(1);
    expect(result.cohorts[0]).toMatchObject({
      month: '2026-11',
      total: 2,
      medianResolutionDays: 2,
      ruling: { landlord: 0, tenant: 1, inconclusive: 1 },
      refundRate: 0.5,
    });
  });
});
