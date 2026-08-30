import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Arbiter } from './entities/arbiter.entity';
import { Dispute, DisputeStatus, DisputeType } from './entities/dispute.entity';

export interface ArbiterCandidate {
  arbiter: Arbiter;
  currentLoad: number;
}

export interface AssignmentContext {
  disputeType: DisputeType;
  /** User IDs of every party to the dispute (landlord, tenant, agent, initiator). */
  partyUserIds: (string | number | null | undefined)[];
  excludeArbiterIds?: number[];
}

const DEFAULT_MAX_ACTIVE_DISPUTES = 5;

// Weighted scoring: load headroom matters most, then subject-matter
// expertise, then track record. Deterministic so the same inputs always
// rank arbiters identically.
const WEIGHT_LOAD = 0.5;
const WEIGHT_EXPERTISE = 0.35;
const WEIGHT_REPUTATION = 0.15;

@Injectable()
export class DisputeAssignmentService {
  constructor(
    @InjectRepository(Arbiter)
    private readonly arbiterRepository: Repository<Arbiter>,
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
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
   * Weighted score in [0, 1]; higher is a better fit. Pure function of the
   * candidate's current state — no I/O — so it's cheap to unit test.
   */
  scoreArbiter(
    arbiter: Arbiter,
    currentLoad: number,
    disputeType: DisputeType,
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
      Math.max(0, Math.min(100, Number(arbiter.reputationScore) || 0)) / 100;

    return (
      WEIGHT_LOAD * loadScore +
      WEIGHT_EXPERTISE * expertiseScore +
      WEIGHT_REPUTATION * reputationScore
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
        score: this.scoreArbiter(arbiter, currentLoad, context.disputeType),
      }))
      .sort((a, b) => b.score - a.score || a.arbiter.id - b.arbiter.id);

    return ranked[0].arbiter;
  }

  /**
   * DB-backed entry point: loads active arbiters and their current load
   * (open/under-review disputes assigned to them), then delegates to the
   * pure selection logic above.
   */
  async assignArbiter(
    dispute: Dispute,
    options: { excludeArbiterIds?: number[] } = {},
  ): Promise<Arbiter | null> {
    const arbiters = await this.arbiterRepository.find({
      where: { active: true },
    });

    if (arbiters.length === 0) return null;

    const loads = await this.getCurrentLoads(arbiters.map((a) => a.id));

    const candidates: ArbiterCandidate[] = arbiters.map((arbiter) => ({
      arbiter,
      currentLoad: loads.get(arbiter.id) ?? 0,
    }));

    const partyUserIds = [
      dispute.agreement?.adminId,
      dispute.agreement?.userId,
      dispute.agreement?.agentId,
      dispute.initiatedBy,
    ];

    return this.selectBestArbiter(candidates, {
      disputeType: dispute.disputeType,
      partyUserIds,
      excludeArbiterIds: options.excludeArbiterIds,
    });
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
