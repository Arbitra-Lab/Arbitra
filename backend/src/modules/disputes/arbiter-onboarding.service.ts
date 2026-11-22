import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/entities/audit-log.entity';
import { KycService } from '../kyc/kyc.service';
import { KycStatus } from '../kyc/kyc-status.enum';
import { DisputeContractEnhancedService } from '../stellar/services/dispute-contract-enhanced.service';
import { Arbiter } from './entities/arbiter.entity';
import { ArbiterApplication } from './entities/arbiter-application.entity';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import {
  ApplicationStatus,
  calculateReputationScore,
  calculateWeightedVoteWeight,
  canTransitionApplication,
  isApplicationReviewable,
} from './arbiter-onboarding-state';
import {
  ApplyAsArbiterDto,
  ReviewApplicationDto,
} from './dto/arbiter-onboarding.dto';

export interface ArbiterDashboard {
  arbiter: Arbiter;
  reputationScore: number;
  weightedVoteWeight: number;
  activeCases: Dispute[];
  closedCases: number;
  successRate: number;
}

export interface ArbiterAnalytics {
  applicationsByStatus: Record<string, number>;
  activeArbiters: number;
  averageReputation: number;
  totalCasesAssigned: number;
}

/**
 * Arbiter application, verification and reputation workflow (#7). KYC checks
 * reuse the existing KYC module and on-chain registration reuses the existing
 * dispute contract service, so no verification step is faked locally.
 */
@Injectable()
export class ArbiterOnboardingService {
  private readonly logger = new Logger(ArbiterOnboardingService.name);

  constructor(
    @InjectRepository(ArbiterApplication)
    private readonly applicationRepository: Repository<ArbiterApplication>,
    @InjectRepository(Arbiter)
    private readonly arbiterRepository: Repository<Arbiter>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    private readonly kycService: KycService,
    private readonly disputeContractService: DisputeContractEnhancedService,
    private readonly auditService: AuditService,
  ) {}

  /** Submit an application. KYC is linked by the applicant's user id. */
  async apply(
    dto: ApplyAsArbiterDto,
    userId: string,
  ): Promise<ArbiterApplication> {
    const existing = await this.applicationRepository
      .createQueryBuilder('application')
      .where('application.user_id = :userId', { userId })
      .andWhere('application.status = :status', {
        status: ApplicationStatus.PENDING,
      })
      .getOne();
    if (existing) {
      throw new BadRequestException(
        'You already have a pending arbiter application',
      );
    }

    const application = this.applicationRepository.create({
      userId,
      stellarAddress: dto.stellarAddress,
      qualifications: dto.qualifications ?? null,
      specialization: dto.specialization ?? null,
      jurisdictions: dto.jurisdictions ?? null,
      languages: dto.languages ?? null,
      stakeAmount: dto.stakeAmount ?? null,
      kycReference: dto.kycReference ?? null,
      status: ApplicationStatus.PENDING,
    });
    return this.applicationRepository.save(application);
  }

  async listApplications(): Promise<ArbiterApplication[]> {
    return this.applicationRepository.find({ order: { createdAt: 'DESC' } });
  }

  async getApplication(id: string): Promise<ArbiterApplication> {
    const application = await this.applicationRepository.findOne({
      where: { id },
    });
    if (!application) {
      throw new NotFoundException('Arbiter application not found');
    }
    return application;
  }

  /**
   * Approve or reject an application. Approval requires an APPROVED KYC record
   * and successful on-chain registration; failures are surfaced, never hidden.
   */
  async review(
    id: string,
    dto: ReviewApplicationDto,
    reviewerId: string,
  ): Promise<ArbiterApplication> {
    const application = await this.getApplication(id);

    const kyc = await this.kycService.getKycStatus(application.userId);
    const kycApproved = kyc?.status === KycStatus.APPROVED;
    if (!isApplicationReviewable(application.status, kycApproved)) {
      throw new BadRequestException(
        application.status !== ApplicationStatus.PENDING
          ? 'Application is no longer pending'
          : 'Applicant must complete KYC before review',
      );
    }
    if (!canTransitionApplication(application.status, dto.status)) {
      throw new BadRequestException(
        `Cannot move application from ${application.status} to ${dto.status}`,
      );
    }

    let transactionHash: string | null = null;
    if (dto.status === ApplicationStatus.APPROVED) {
      try {
        transactionHash = await this.disputeContractService.registerArbiter(
          application.stellarAddress,
          application.qualifications ?? '',
          application.stakeAmount ?? '0',
          application.specialization ?? undefined,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`On-chain arbiter registration failed: ${message}`);
        throw new ServiceUnavailableException(
          'Arbiter registration could not be completed on-chain; the application stays pending',
        );
      }

      let arbiter = await this.arbiterRepository.findOne({
        where: { stellarAddress: application.stellarAddress },
      });
      if (!arbiter) {
        arbiter = this.arbiterRepository.create({
          stellarAddress: application.stellarAddress,
          userId: Number(application.userId) || null,
          active: true,
        });
      }
      arbiter.active = true;
      arbiter.transactionHash = transactionHash;
      arbiter.jurisdictions = application.jurisdictions;
      arbiter.languages = application.languages;
      arbiter.metadata = {
        qualifications: application.qualifications ?? undefined,
        specialization: application.specialization ?? undefined,
        stakeAmount: application.stakeAmount ?? undefined,
        kycReference: application.kycReference ?? undefined,
      };
      await this.arbiterRepository.save(arbiter);
    }

    application.status = dto.status;
    application.reviewNotes = dto.reviewNotes ?? transactionHash ?? null;
    application.reviewedBy = reviewerId;
    application.reviewedAt = new Date();
    await this.applicationRepository.save(application);

    await this.auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'arbiter_application',
      entityId: application.id,
      performedBy: reviewerId,
      newValues: { status: dto.status, transactionHash },
    });

    return application;
  }

  async suspend(id: string, reviewerId: string): Promise<ArbiterApplication> {
    const application = await this.getApplication(id);
    if (
      !canTransitionApplication(application.status, ApplicationStatus.SUSPENDED)
    ) {
      throw new BadRequestException('Only approved arbiters can be suspended');
    }
    application.status = ApplicationStatus.SUSPENDED;
    application.reviewedBy = reviewerId;
    application.reviewedAt = new Date();
    await this.applicationRepository.save(application);

    const arbiter = await this.arbiterRepository.findOne({
      where: { stellarAddress: application.stellarAddress },
    });
    if (arbiter) {
      arbiter.active = false;
      await this.arbiterRepository.save(arbiter);
    }
    return application;
  }

  /** Case assignment dashboard with reputation-derived weighted voting. */
  async getDashboard(stellarAddress: string): Promise<ArbiterDashboard> {
    const arbiter = await this.arbiterRepository.findOne({
      where: { stellarAddress },
    });
    if (!arbiter) throw new NotFoundException('Arbiter not found');

    const reputationScore = calculateReputationScore({
      successfulResolutions: arbiter.successfulResolutions,
      totalDisputesResolved: arbiter.totalDisputesResolved,
      totalVotes: arbiter.totalVotes,
      averageResolutionHours: arbiter.averageResolutionHours,
    });
    const [activeCases, closedCases] = await Promise.all([
      this.disputeRepository.find({
        where: {
          assignedArbiterId: arbiter.id,
          status: DisputeStatus.UNDER_REVIEW,
        },
        order: { createdAt: 'DESC' },
      }),
      this.disputeRepository.count({
        where: {
          assignedArbiterId: arbiter.id,
          status: DisputeStatus.RESOLVED,
        },
      }),
    ]);

    return {
      arbiter,
      reputationScore,
      weightedVoteWeight: calculateWeightedVoteWeight({
        reputationScore,
        stakeAmount: arbiter.metadata?.stakeAmount,
      }),
      activeCases,
      closedCases,
      successRate:
        arbiter.totalDisputesResolved > 0
          ? arbiter.successfulResolutions / arbiter.totalDisputesResolved
          : 0,
    };
  }

  async getAnalytics(): Promise<ArbiterAnalytics> {
    const applications = await this.applicationRepository.find();
    const applicationsByStatus: Record<string, number> = {};
    for (const application of applications) {
      applicationsByStatus[application.status] =
        (applicationsByStatus[application.status] ?? 0) + 1;
    }
    const arbiters = await this.arbiterRepository.find({
      where: { active: true },
    });
    const totalCasesAssigned = await this.disputeRepository
      .createQueryBuilder('dispute')
      .where('dispute.assigned_arbiter_id IS NOT NULL')
      .getCount();

    return {
      applicationsByStatus,
      activeArbiters: arbiters.length,
      averageReputation:
        arbiters.length === 0
          ? 0
          : Math.round(
              (arbiters.reduce(
                (sum, arbiter) =>
                  sum +
                  calculateReputationScore({
                    successfulResolutions: arbiter.successfulResolutions,
                    totalDisputesResolved: arbiter.totalDisputesResolved,
                    totalVotes: arbiter.totalVotes,
                    averageResolutionHours: arbiter.averageResolutionHours,
                  }),
                0,
              ) /
                arbiters.length) *
                100,
            ) / 100,
      totalCasesAssigned,
    };
  }
}
