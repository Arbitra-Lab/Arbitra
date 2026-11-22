import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArbiterOnboardingService } from '../arbiter-onboarding.service';
import { ApplicationStatus } from '../arbiter-onboarding-state';
import { KycStatus } from '../../kyc/kyc-status.enum';

const userId = '11111111-1111-4111-8111-111111111111';
const reviewerId = '22222222-2222-4222-8222-222222222222';
const address = `G${'A'.repeat(55)}`;

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: 'app-1',
    userId,
    stellarAddress: address,
    qualifications: 'Legal experience',
    specialization: 'Property',
    jurisdictions: ['NG'],
    languages: ['en'],
    stakeAmount: '1000',
    kycReference: 'kyc-1',
    status: ApplicationStatus.PENDING,
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    ...overrides,
  } as any;
}

describe('ArbiterOnboardingService (#7)', () => {
  let service: ArbiterOnboardingService;
  let applications: any[];
  let arbiters: any[];
  let disputes: any[];
  let applicationRepo: any;
  let arbiterRepo: any;
  let disputeRepo: any;
  let kyc: { getKycStatus: jest.Mock };
  let contract: { registerArbiter: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    applications = [];
    arbiters = [];
    disputes = [];
    applicationRepo = {
      createQueryBuilder: jest.fn(() => ({
        where: () => ({
          andWhere: () => ({ getOne: async () => applications[0] ?? null }),
        }),
      })),
      create: jest.fn((data: any) => ({
        ...data,
        id: `app-${applications.length + 1}`,
      })),
      save: jest.fn(async (entity: any) => {
        if (!applications.some((a) => a.id === entity.id))
          applications.push(entity);
        return entity;
      }),
      find: jest.fn(async () => applications),
      findOne: jest.fn(
        async ({ where }: any) =>
          applications.find((a) => a.id === where.id) ?? null,
      ),
    };
    arbiterRepo = {
      findOne: jest.fn(
        async ({ where }: any) =>
          arbiters.find((a) => a.stellarAddress === where.stellarAddress) ??
          null,
      ),
      create: jest.fn((data: any) => ({ ...data })),
      save: jest.fn(async (entity: any) => {
        if (!arbiters.some((a) => a.stellarAddress === entity.stellarAddress)) {
          arbiters.push(entity);
        }
        return entity;
      }),
      find: jest.fn(async () => arbiters),
    };
    disputeRepo = {
      find: jest.fn(async ({ where }: any) =>
        disputes.filter(
          (d) =>
            d.assignedArbiterId === where.assignedArbiterId &&
            d.status === where.status,
        ),
      ),
      count: jest.fn(
        async ({ where }: any) =>
          disputes.filter(
            (d) =>
              d.assignedArbiterId === where.assignedArbiterId &&
              d.status === where.status,
          ).length,
      ),
      createQueryBuilder: jest.fn(() => ({
        where: () => ({ getCount: async () => disputes.length }),
      })),
    };
    kyc = {
      getKycStatus: jest.fn().mockResolvedValue({ status: KycStatus.APPROVED }),
    };
    contract = {
      registerArbiter: jest.fn().mockResolvedValue('tx-hash-1'),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ArbiterOnboardingService(
      applicationRepo,
      arbiterRepo,
      disputeRepo,
      kyc as any,
      contract as any,
      audit as any,
    );
  });

  it('rejects a second pending application from the same user', async () => {
    applications.push(application());
    await expect(
      service.apply(
        { stellarAddress: address, qualifications: 'More' },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a pending application with KYC reference', async () => {
    const created = await service.apply(
      { stellarAddress: address, kycReference: 'kyc-1' },
      userId,
    );
    expect(created.status).toBe(ApplicationStatus.PENDING);
    expect(created.kycReference).toBe('kyc-1');
    expect(created.userId).toBe(userId);
  });

  it('refuses to review an applicant who has not completed KYC', async () => {
    applications.push(application());
    kyc.getKycStatus.mockResolvedValue({ status: KycStatus.PENDING });
    await expect(
      service.review(
        'app-1',
        { status: ApplicationStatus.APPROVED },
        reviewerId,
      ),
    ).rejects.toThrow(/KYC/);
    expect(contract.registerArbiter).not.toHaveBeenCalled();
  });

  it('registers an approved applicant on-chain and activates the arbiter', async () => {
    applications.push(application());
    const result = await service.review(
      'app-1',
      { status: ApplicationStatus.APPROVED, reviewNotes: 'Qualified' },
      reviewerId,
    );
    expect(result.status).toBe(ApplicationStatus.APPROVED);
    expect(result.reviewNotes).toBe('Qualified');
    expect(contract.registerArbiter).toHaveBeenCalledWith(
      address,
      'Legal experience',
      '1000',
      'Property',
    );
    expect(arbiters).toHaveLength(1);
    expect(arbiters[0].active).toBe(true);
    expect(arbiters[0].transactionHash).toBe('tx-hash-1');
    expect(arbiters[0].metadata.kycReference).toBe('kyc-1');
    expect(audit.log).toHaveBeenCalled();
  });

  it('keeps an application pending when on-chain registration fails', async () => {
    applications.push(application());
    contract.registerArbiter.mockRejectedValue(new Error('Soroban offline'));
    await expect(
      service.review(
        'app-1',
        { status: ApplicationStatus.APPROVED },
        reviewerId,
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(applications[0].status).toBe(ApplicationStatus.PENDING);
    expect(arbiters).toHaveLength(0);
  });

  it('rejects an application without touching the chain', async () => {
    applications.push(application());
    const result = await service.review(
      'app-1',
      { status: ApplicationStatus.REJECTED, reviewNotes: 'Insufficient' },
      reviewerId,
    );
    expect(result.status).toBe(ApplicationStatus.REJECTED);
    expect(contract.registerArbiter).not.toHaveBeenCalled();
  });

  it('suspends an approved arbiter and deactivates the local record', async () => {
    applications.push(application({ status: ApplicationStatus.APPROVED }));
    arbiters.push({ stellarAddress: address, active: true });
    const result = await service.suspend('app-1', reviewerId);
    expect(result.status).toBe(ApplicationStatus.SUSPENDED);
    expect(arbiters[0].active).toBe(false);
  });

  it('returns a dashboard with reputation-derived weighted voting', async () => {
    arbiters.push({
      id: 7,
      stellarAddress: address,
      active: true,
      successfulResolutions: 9,
      totalDisputesResolved: 10,
      totalVotes: 40,
      averageResolutionHours: 12,
      metadata: { stakeAmount: '500' },
    });
    disputes.push({ assignedArbiterId: 7, status: 'UNDER_REVIEW' });
    disputes.push({ assignedArbiterId: 7, status: 'RESOLVED' });
    const dashboard = await service.getDashboard(address);
    expect(dashboard.reputationScore).toBeGreaterThan(80);
    expect(dashboard.weightedVoteWeight).toBeGreaterThanOrEqual(
      dashboard.reputationScore,
    );
    expect(dashboard.activeCases).toHaveLength(1);
    expect(dashboard.closedCases).toBe(1);
    expect(dashboard.successRate).toBeCloseTo(0.9);
  });

  it('throws for an unknown arbiter dashboard', async () => {
    await expect(service.getDashboard(address)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('aggregates application and arbiter analytics', async () => {
    applications.push(application());
    arbiters.push({
      stellarAddress: address,
      active: true,
      successfulResolutions: 5,
      totalDisputesResolved: 5,
      totalVotes: 20,
      averageResolutionHours: 24,
    });
    disputes.push({ assignedArbiterId: 7, status: 'RESOLVED' });
    const analytics = await service.getAnalytics();
    expect(analytics.applicationsByStatus.PENDING).toBe(1);
    expect(analytics.activeArbiters).toBe(1);
    expect(analytics.averageReputation).toBeGreaterThan(0);
    expect(analytics.totalCasesAssigned).toBe(1);
  });
});
