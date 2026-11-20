import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  InsuranceClaim,
  InsuranceClaimStatus,
} from './entities/insurance-claim.entity';
import { Dispute, DisputeStatus } from '../disputes/entities/dispute.entity';
import {
  LedgerDirection,
  LedgerOperationType,
} from '../payments/entities/ledger-entry.entity';
import { LedgerService } from '../payments/ledger.service';
import { INSURANCE_POOL_ACCOUNT_ID } from '../payments/insurance-pool.constants';
import { roundMoney } from '../payments/payment.helpers';
import { FileInsuranceClaimDto } from './dto/file-claim.dto';
import { DecideInsuranceClaimDto } from './dto/claim-decision.dto';

export interface InsurancePoolSummary {
  availableBalance: number;
  totalContributed: number;
  totalPaidOut: number;
  pendingClaims: number;
}

@Injectable()
export class InsuranceService {
  constructor(
    @InjectRepository(InsuranceClaim)
    private readonly claimRepository: Repository<InsuranceClaim>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    private readonly ledgerService: LedgerService,
    private readonly dataSource: DataSource,
  ) {}

  async getPoolSummary(): Promise<InsurancePoolSummary> {
    const account = await this.ledgerService.getAccountBalance(
      INSURANCE_POOL_ACCOUNT_ID,
    );
    // Pool contributions post as credits, payouts as debits, so the funds
    // actually available are credits minus debits (not the ledger's
    // debit-normal `.balance`, which is the inverse sign for this account).
    const availableBalance = roundMoney(account.credits - account.debits);

    const [pendingClaims, paidTotalRow] = await Promise.all([
      this.claimRepository.count({
        where: { status: InsuranceClaimStatus.PENDING },
      }),
      this.claimRepository
        .createQueryBuilder('claim')
        .select('COALESCE(SUM(claim.amount), 0)', 'total')
        .where('claim.status = :status', {
          status: InsuranceClaimStatus.PAID,
        })
        .getRawOne<{ total: string }>(),
    ]);

    return {
      availableBalance,
      totalContributed: account.credits,
      totalPaidOut: roundMoney(Number(paidTotalRow?.total ?? 0)),
      pendingClaims,
    };
  }

  async fileClaim(
    dto: FileInsuranceClaimDto,
    claimantUserId: string,
  ): Promise<InsuranceClaim> {
    const dispute = await this.disputeRepository.findOne({
      where: { disputeId: dto.disputeId },
      relations: ['agreement'],
    });
    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (dispute.status !== DisputeStatus.RESOLVED) {
      throw new BadRequestException(
        'Only resolved disputes are eligible for an insurance claim',
      );
    }

    if (!this.isPartyToDispute(dispute, claimantUserId)) {
      throw new ForbiddenException(
        'Only a party to the dispute may file a claim against it',
      );
    }

    const existing = await this.claimRepository.findOne({
      where: { disputeId: dto.disputeId, claimantUserId },
    });
    if (existing) {
      throw new BadRequestException(
        'A claim already exists for this dispute and claimant',
      );
    }

    const requestedAmount = Number(dispute.requestedAmount ?? 0);
    const amount = dto.amount ?? requestedAmount;
    if (!(amount > 0)) {
      throw new BadRequestException('Claim amount must be greater than zero');
    }
    if (requestedAmount > 0 && amount > requestedAmount) {
      throw new BadRequestException(
        "Claim amount cannot exceed the dispute's requested amount",
      );
    }

    const claim = this.claimRepository.create({
      disputeId: dto.disputeId,
      claimantUserId,
      amount: roundMoney(amount),
      reason: dto.reason,
      status: InsuranceClaimStatus.PENDING,
    });
    return this.claimRepository.save(claim);
  }

  async listClaims(filter: {
    status?: InsuranceClaimStatus;
    claimantUserId?: string;
  }): Promise<InsuranceClaim[]> {
    return this.claimRepository.find({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.claimantUserId
          ? { claimantUserId: filter.claimantUserId }
          : {}),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getClaim(
    id: string,
    requester: { id: string; isAdmin: boolean },
  ): Promise<InsuranceClaim> {
    const claim = await this.claimRepository.findOne({ where: { id } });
    if (!claim) {
      throw new NotFoundException('Claim not found');
    }
    if (!requester.isAdmin && claim.claimantUserId !== requester.id) {
      throw new ForbiddenException('You do not have access to this claim');
    }
    return claim;
  }

  /**
   * Approves or rejects a pending claim. Approval pays out of the insurance
   * pool in the same transaction as the decision, so a claim is never left
   * APPROVED without a matching ledger payout (or rejected back to pending
   * on insufficient funds).
   */
  async decideClaim(
    id: string,
    dto: DecideInsuranceClaimDto,
    adminUserId: string,
  ): Promise<InsuranceClaim> {
    return this.dataSource.transaction(async (manager) => {
      const claim = await manager.findOne(InsuranceClaim, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!claim) {
        throw new NotFoundException('Claim not found');
      }

      if (
        dto.idempotencyKey &&
        claim.idempotencyKey === dto.idempotencyKey &&
        claim.status !== InsuranceClaimStatus.PENDING
      ) {
        return claim;
      }

      if (claim.status !== InsuranceClaimStatus.PENDING) {
        throw new BadRequestException('Only pending claims can be decided');
      }

      claim.decisionNotes = dto.notes;
      claim.decidedBy = adminUserId;
      claim.decidedAt = new Date();
      claim.idempotencyKey = dto.idempotencyKey ?? null;

      if (dto.action === 'reject') {
        claim.status = InsuranceClaimStatus.REJECTED;
        return manager.save(InsuranceClaim, claim);
      }

      // Read through LedgerService rather than `manager` here: pool
      // contributions/payouts from other claims are only ever committed
      // (never left pending inside this transaction), so a plain read gives
      // an accurate, simpler balance check.
      const account = await this.ledgerService.getAccountBalance(
        INSURANCE_POOL_ACCOUNT_ID,
      );
      const availableBalance = roundMoney(account.credits - account.debits);

      if (availableBalance < claim.amount) {
        throw new BadRequestException(
          'Insurance pool has insufficient balance to cover this claim',
        );
      }

      claim.status = InsuranceClaimStatus.APPROVED;
      await manager.save(InsuranceClaim, claim);

      const { entries } = await this.ledgerService.recordOperation(manager, {
        operationType: LedgerOperationType.INSURANCE_PAYOUT,
        currency: claim.currency,
        idempotencyKey: `insurance:payout:${claim.id}`,
        lines: [
          {
            accountId: INSURANCE_POOL_ACCOUNT_ID,
            direction: LedgerDirection.DEBIT,
            amount: claim.amount,
            description: `Insurance payout for dispute ${claim.disputeId}`,
          },
          {
            accountId: `customer:${claim.claimantUserId}`,
            direction: LedgerDirection.CREDIT,
            amount: claim.amount,
            description: 'Insurance claim payout',
          },
        ],
      });

      claim.status = InsuranceClaimStatus.PAID;
      claim.paidAt = new Date();
      claim.ledgerOperationId = entries[0]?.operationId ?? null;
      return manager.save(InsuranceClaim, claim);
    });
  }

  private isPartyToDispute(dispute: Dispute, userId: string): boolean {
    if (String(dispute.initiatedBy) === userId) {
      return true;
    }
    const agreement = dispute.agreement;
    if (!agreement) {
      return false;
    }
    return (
      agreement.userId === userId ||
      agreement.adminId === userId ||
      agreement.agentId === userId
    );
  }
}
