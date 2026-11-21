import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Jurisdiction } from './entities/jurisdiction.entity';
import { CreateJurisdictionDto } from './dto/create-jurisdiction.dto';
import { UpdateJurisdictionDto } from './dto/update-jurisdiction.dto';
import {
  BusinessRuleViolationError,
  DuplicateEntryError,
  JurisdictionNotFoundError,
} from '../../common/errors/domain-errors';

/** Agreement terms relevant to jurisdiction rule enforcement. */
export interface JurisdictionAgreementTerms {
  monthlyRent: number;
  securityDeposit: number;
  lateFeePercentage?: number | null;
  gracePeriodDays?: number | null;
  /** Days of notice given before lease end/termination, if known. */
  noticePeriodDays?: number | null;
}

/** Jurisdiction-informed guidance attached to a dispute at creation time. */
export interface JurisdictionDisputeGuidance {
  jurisdictionCode: string;
  requiredArbitrationProcedure: string;
  suggestedArbiterQuorum: number | null;
}

@Injectable()
export class JurisdictionsService {
  constructor(
    @InjectRepository(Jurisdiction)
    private readonly jurisdictionRepository: Repository<Jurisdiction>,
  ) {}

  async create(dto: CreateJurisdictionDto): Promise<Jurisdiction> {
    const existing = await this.jurisdictionRepository.findOne({
      where: { code: dto.code },
    });
    if (existing) {
      throw new DuplicateEntryError(
        `Jurisdiction with code ${dto.code} already exists`,
        { code: dto.code },
      );
    }
    const jurisdiction = this.jurisdictionRepository.create(dto);
    return this.jurisdictionRepository.save(jurisdiction);
  }

  async findAll(onlyActive = false): Promise<Jurisdiction[]> {
    return this.jurisdictionRepository.find({
      where: onlyActive ? { isActive: true } : {},
      order: { code: 'ASC' },
    });
  }

  async findByCode(code: string): Promise<Jurisdiction> {
    const jurisdiction = await this.jurisdictionRepository.findOne({
      where: { code },
    });
    if (!jurisdiction) {
      throw new JurisdictionNotFoundError(code);
    }
    return jurisdiction;
  }

  async update(
    code: string,
    dto: UpdateJurisdictionDto,
  ): Promise<Jurisdiction> {
    const jurisdiction = await this.findByCode(code);
    Object.assign(jurisdiction, dto);
    return this.jurisdictionRepository.save(jurisdiction);
  }

  /** Soft-deletes a jurisdiction so existing agreements/disputes keep a valid reference. */
  async deactivate(code: string): Promise<Jurisdiction> {
    const jurisdiction = await this.findByCode(code);
    jurisdiction.isActive = false;
    return this.jurisdictionRepository.save(jurisdiction);
  }

  /**
   * Validates agreement financial/lease terms against the jurisdiction's
   * rules. Returns the resolved jurisdiction so callers can link it to the
   * agreement. Throws BusinessRuleViolationError listing every violation
   * found, not just the first.
   */
  async validateAgreementTerms(
    code: string,
    terms: JurisdictionAgreementTerms,
  ): Promise<Jurisdiction> {
    const jurisdiction = await this.findByCode(code);
    const violations: string[] = [];

    if (
      jurisdiction.maxSecurityDepositMonths != null &&
      terms.monthlyRent > 0
    ) {
      const maxDeposit =
        terms.monthlyRent * Number(jurisdiction.maxSecurityDepositMonths);
      if (terms.securityDeposit > maxDeposit) {
        violations.push(
          `Security deposit of ${terms.securityDeposit} exceeds the ${jurisdiction.code} ` +
            `maximum of ${jurisdiction.maxSecurityDepositMonths} month(s) rent (${maxDeposit.toFixed(2)})`,
        );
      }
    }

    if (
      jurisdiction.maxLateFeePercent != null &&
      terms.lateFeePercentage != null &&
      terms.lateFeePercentage > Number(jurisdiction.maxLateFeePercent)
    ) {
      violations.push(
        `Late fee of ${terms.lateFeePercentage}% exceeds the ${jurisdiction.code} ` +
          `maximum of ${jurisdiction.maxLateFeePercent}%`,
      );
    }

    if (
      jurisdiction.minGracePeriodDays != null &&
      terms.gracePeriodDays != null &&
      terms.gracePeriodDays < jurisdiction.minGracePeriodDays
    ) {
      violations.push(
        `Grace period of ${terms.gracePeriodDays} day(s) is below the ${jurisdiction.code} ` +
          `minimum of ${jurisdiction.minGracePeriodDays} day(s)`,
      );
    }

    if (
      jurisdiction.minNoticePeriodDays != null &&
      terms.noticePeriodDays != null &&
      terms.noticePeriodDays < jurisdiction.minNoticePeriodDays
    ) {
      violations.push(
        `Notice period of ${terms.noticePeriodDays} day(s) is below the ${jurisdiction.code} ` +
          `minimum of ${jurisdiction.minNoticePeriodDays} day(s)`,
      );
    }

    if (violations.length > 0) {
      throw new BusinessRuleViolationError(
        `Agreement terms violate ${jurisdiction.code} jurisdiction rules: ${violations.join('; ')}`,
        { jurisdictionCode: jurisdiction.code, violations },
      );
    }

    return jurisdiction;
  }

  /**
   * Validates that a dispute is being filed within the jurisdiction's
   * statute-of-limitations-style filing window, relative to the incident
   * date. No-op if the jurisdiction has no configured window.
   */
  async validateDisputeFilingWindow(
    code: string,
    incidentDate: Date,
  ): Promise<void> {
    const jurisdiction = await this.findByCode(code);
    if (jurisdiction.disputeFilingWindowDays == null) return;

    const elapsedDays =
      (Date.now() - incidentDate.getTime()) / (1000 * 60 * 60 * 24);

    if (elapsedDays > jurisdiction.disputeFilingWindowDays) {
      throw new BusinessRuleViolationError(
        `Dispute filing window for ${jurisdiction.code} is ${jurisdiction.disputeFilingWindowDays} ` +
          `day(s) from the incident date; ${Math.floor(elapsedDays)} day(s) have elapsed`,
        {
          jurisdictionCode: jurisdiction.code,
          disputeFilingWindowDays: jurisdiction.disputeFilingWindowDays,
          elapsedDays: Math.floor(elapsedDays),
        },
      );
    }
  }

  async getDisputeGuidance(code: string): Promise<JurisdictionDisputeGuidance> {
    const jurisdiction = await this.findByCode(code);
    return {
      jurisdictionCode: jurisdiction.code,
      requiredArbitrationProcedure: jurisdiction.requiredArbitrationProcedure,
      suggestedArbiterQuorum: jurisdiction.minArbiterQuorum ?? null,
    };
  }
}
