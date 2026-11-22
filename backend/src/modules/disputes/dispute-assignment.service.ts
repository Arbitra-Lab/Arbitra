import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Arbiter } from './entities/arbiter.entity';
import {
  Dispute,
  DisputePriority,
  DisputeStatus,
  DisputeType,
} from './entities/dispute.entity';
import {
  AuditAction,
  AuditLevel,
  AuditStatus,
} from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';

export interface ArbiterCandidate {
  arbiter: Arbiter;
  currentLoad: number;
}

export interface AssignmentContext {
  disputeType: DisputeType;
  /** User IDs of every party to the dispute (landlord, tenant, agent, initiator). */
  partyUserIds: (string | number | null | undefined)[];
  excludeArbiterIds?: number[];
  /** Optional routing preferences; absent values are treated as neutral. */
  jurisdiction?: string | null;
  language?: string | null;
  /** Normalised [0, 1] case complexity. Defaults to 0.5. */
  complexity?: number;
}

export interface ComplexityInput {
  disputeType: DisputeType;
  requestedAmount?: number | null;
  evidenceCount?: number;
  descriptionLength?: number;
  priority?: DisputePriority | null;
}

const DEFAULT_MAX_ACTIVE_DISPUTES = 5;

// Weights sum to 1 at neutral complexity (0.5). Complexity shifts weight away
// from raw load headroom towards proven performance for harder cases.
const WEIGHT_LOAD = 0.3;
const WEIGHT_EXPERTISE = 0.25;
const WEIGHT_REPUTATION = 0.15;
const WEIGHT_PERFORMANCE = 0.15;
const WEIGHT_LOCALIZATION = 0.15;

const COMPLEX_TYPE_SCORE: Record<DisputeType, number> = {
  [DisputeType.RENT_PAYMENT]: 0.4,
  [DisputeType.SECURITY_DEPOSIT]: 0.5,
  [DisputeType.PROPERTY_DAMAGE]: 0.8,
  [DisputeType.MAINTENANCE]: 0.3,
  [DisputeType.TERMINATION]: 0.7,
  [DisputeType.OTHER]: 0.5,
};

const PRIORITY_SCORE: Record<DisputePriority, number> = {
  [DisputePriority.LOW]: 0.2,
  [DisputePriority.NORMAL]: 0.5,
  [DisputePriority.HIGH]: 0.8,
  [DisputePriority.URGENT]: 1,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

@Injectable()
export class DisputeAssignmentService {
  constructor(
    @InjectRepository(Arbiter)
    private readonly arbiterRepository: Repository<Arbiter>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * True if the arbiter must be excluded from a dispute involving these
   * parties: either a declared conflict, or the arbiter *is* one of the
   * parties.
   */
  hasConflictOfInterest(
    arbiter: Arbiter,
    partyUserIds: (string | number | null | undefined)[],
  ): boolean {
    const parties = new Set(
      partyUserIds.filter((id) => id !== null && id !== undefined).map(String),
    );

    if (arbiter.userId !== null && parties.has(String(arbiter.userId))) {
      return true;
    }

    const declaredConflicts = arbiter.conflictUserIds ?? [];
    return declaredConflicts.some((id) => parties.has(String(id)));
  }

  /**
   * Deterministic complexity score in [0, 1] derived from case metadata.
   * Pure so it can be tested and reused for audit metadata (#23).
   */
  scoreCaseComplexity(input: ComplexityInput): number {
    const amount = Math.max(0, Number(input.requestedAmount) || 0);
    const amountScore = clamp01(Math.log10(amount + 1) / 5);
    const evidenceScore = clamp01((input.evidenceCount ?? 0) / 10);
    const descriptionScore = clamp01((input.descriptionLength ?? 0) / 2000);
    const typeScore = COMPLEX_TYPE_SCORE[input.disputeType] ?? 0.5;
    const priorityScore = input.priority
      ? (PRIORITY_SCORE[input.priority] ?? 0.5)
      : 0.5;

    return clamp01(
      amountScore * 0.25 +
        evidenceScore * 0.3 +
        descriptionScore * 0.15 +
        typeScore * 0.2 +
        priorityScore * 0.1,
    );
  }

  /**
   * Historical success rate blended with resolution speed. Arbiters with no
   * resolved cases score neutrally (1) rather than being penalised for being
   * new. Always in [0, 1].
   */
  scorePerformance(arbiter: Arbiter): number {
    const resolved = Number(arbiter.totalDisputesResolved) || 0;
    if (resolved <= 0) return 1;

    const successful = Math.max(0, Number(arbiter.successfulResolutions) || 0);
    const successRate = clamp01(successful / resolved);
    const hours = arbiter.averageResolutionHours;
    const speedScore =
      hours === null || hours === undefined
        ? 0.75
        : clamp01(1 - Math.max(0, hours) / 168);

    return clamp01(successRate * 0.6 + speedScore * 0.4);
  }

  /**
   * Jurisdiction and language fit. Missing preferences on either side are
   * neutral (0.5 or 1 when no preference was declared at all), so this never
   * excludes a qualified arbiter merely for lacking optional profile data.
   */
  scoreLocalization(
    arbiter: Arbiter,
    context: Pick<AssignmentContext, 'jurisdiction' | 'language'>,
  ): number {
    const hasJurisdictionPreference = Boolean(context.jurisdiction);
    const hasLanguagePreference = Boolean(context.language);
    if (!hasJurisdictionPreference && !hasLanguagePreference) return 1;

    const scorePreference = (
      values: string[] | null | undefined,
      expected: string | null | undefined,
    ): number => {
      if (!expected) return 1;
      if (!values || values.length === 0) return 0.5;
      const normalised = expected.trim().toLowerCase();
      return values.some((value) => value.trim().toLowerCase() === normalised)
        ? 1
        : 0;
    };

    const jurisdictionScore = scorePreference(
      arbiter.jurisdictions,
      context.jurisdiction,
    );
    const languageScore = scorePreference(arbiter.languages, context.language);

    return clamp01(jurisdictionScore * 0.6 + languageScore * 0.4);
  }

  /**
   * Weighted score in [0, 1]; higher is a better fit. Pure function of the
   * candidate's current state and case context — no I/O.
   */
  scoreArbiter(
    arbiter: Arbiter,
    currentLoad: number,
    disputeType: DisputeType,
    context?: Partial<AssignmentContext>,
  ): number {
    const maxLoad = arbiter.maxActiveDisputes ?? DEFAULT_MAX_ACTIVE_DISPUTES;
    const loadScore = maxLoad > 0 ? Math.max(0, 1 - currentLoad / maxLoad) : 0;

    const tags = arbiter.expertiseTags ?? [];
    const expertiseScore = tags.some(
      (tag) => tag.toUpperCase() === disputeType.toUpperCase(),
    )
      ? 1
      : 0;

    const reputationScore =
      Math.min(100, Math.max(0, Number(arbiter.reputationScore) || 0)) / 100;
    const performanceScore = this.scorePerformance(arbiter);
    const localizationScore = this.scoreLocalization(arbiter, context ?? {});

    const complexity = clamp01(context?.complexity ?? 0.5);
    const performanceWeight = WEIGHT_PERFORMANCE * (0.5 + complexity);
    const loadWeight = WEIGHT_LOAD - (performanceWeight - WEIGHT_PERFORMANCE);

    return clamp01(
      loadWeight * loadScore +
        WEIGHT_EXPERTISE * expertiseScore +
        WEIGHT_REPUTATION * reputationScore +
        performanceWeight * performanceScore +
        WEIGHT_LOCALIZATION * localizationScore,
    );
  }

  /**
   * Ranks eligible candidates and returns the best fit, or null if none are
   * eligible. Excludes conflicted and over-capacity arbiters. Ties break on
   * arbiter id (ascending) for determinism.
   */
  selectBestArbiter(
    candidates: ArbiterCandidate[],
    context: AssignmentContext,
  ): Arbiter | null {
    const excluded = new Set(context.excludeArbiterIds ?? []);

    const eligible = candidates.filter(({ arbiter, currentLoad }) => {
      if (excluded.has(arbiter.id)) return false;
      if (!arbiter.active) return false;
      const maxLoad = arbiter.maxActiveDisputes ?? DEFAULT_MAX_ACTIVE_DISPUTES;
      if (currentLoad >= maxLoad) return false;
      if (this.hasConflictOfInterest(arbiter, context.partyUserIds)) {
        return false;
      }
      return true;
    });

    if (eligible.length === 0) return null;

    const ranked = eligible
      .map(({ arbiter, currentLoad }) => ({
        arbiter,
        score: this.scoreArbiter(
          arbiter,
          currentLoad,
          context.disputeType,
          context,
        ),
      }))
      .sort((a, b) => b.score - a.score || a.arbiter.id - b.arbiter.id);

    return ranked[0].arbiter;
  }

  /**
   * DB-backed entry point: loads active arbiters and their current load
   * (open/under-review disputes assigned to them), then delegates to the
   * pure selection logic above. A successful assignment is written to the
   * audit log with the context that produced it (#23).
   */
  async assignArbiter(
    dispute: Dispute,
    options: { excludeArbiterIds?: number[] } = {},
  ): Promise<Arbiter | null> {
    const arbiters = await this.arbiterRepository.find({
      where: { active: true },
    });

    // An empty pool is still a failed assignment and must be audited.
    const loads = await this.getCurrentLoads(arbiters.map((a) => a.id));

    const candidates: ArbiterCandidate[] = arbiters.map((arbiter) => ({
      arbiter,
      currentLoad: loads.get(arbiter.id) ?? 0,
    }));

    const metadata = dispute.metadata ?? {};
    const jurisdiction =
      (typeof metadata.jurisdiction === 'string'
        ? metadata.jurisdiction
        : undefined) ?? null;
    const language =
      (typeof metadata.language === 'string' ? metadata.language : undefined) ??
      'en';
    const complexity = this.scoreCaseComplexity({
      disputeType: dispute.disputeType,
      requestedAmount: dispute.requestedAmount,
      evidenceCount:
        dispute.evidence?.length ??
        (typeof metadata.evidenceCount === 'number'
          ? metadata.evidenceCount
          : 0),
      descriptionLength: dispute.description?.length ?? 0,
      priority: dispute.priority,
    });

    const context: AssignmentContext = {
      disputeType: dispute.disputeType,
      partyUserIds: [
        dispute.agreement?.adminId,
        dispute.agreement?.userId,
        dispute.agreement?.agentId,
        dispute.initiatedBy,
      ],
      excludeArbiterIds: options.excludeArbiterIds,
      jurisdiction,
      language,
      complexity,
    };

    const selected = this.selectBestArbiter(candidates, context);
    const selectedLoad = selected ? (loads.get(selected.id) ?? 0) : 0;

    await this.auditService.log({
      action: AuditAction.ARBITER_ASSIGNED,
      entityType: 'Dispute',
      entityId: String(dispute.id),
      status: selected ? AuditStatus.SUCCESS : AuditStatus.FAILURE,
      level: selected ? AuditLevel.INFO : AuditLevel.WARN,
      performedBy: 'assignment-service',
      newValues: selected ? { arbiterId: selected.id } : null,
      metadata: {
        candidateCount: candidates.length,
        score: selected
          ? this.scoreArbiter(
              selected,
              selectedLoad,
              dispute.disputeType,
              context,
            )
          : null,
        complexity,
        jurisdiction,
        language,
        disputeType: dispute.disputeType,
      },
    });

    return selected;
  }

  private async getCurrentLoads(
    arbiterIds: number[],
  ): Promise<Map<number, number>> {
    if (arbiterIds.length === 0) return new Map();

    const rows = await this.disputeRepository
      .createQueryBuilder('dispute')
      .select('dispute.assignedArbiterId', 'arbiterId')
      .addSelect('COUNT(*)', 'count')
      .where('dispute.assignedArbiterId IN (:...arbiterIds)', { arbiterIds })
      .andWhere('dispute.status IN (:...statuses)', {
        statuses: [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW],
      })
      .groupBy('dispute.assignedArbiterId')
      .getRawMany<{ arbiterId: number; count: string }>();

    return new Map(
      rows.map((row) => [Number(row.arbiterId), Number(row.count)]),
    );
  }
}
