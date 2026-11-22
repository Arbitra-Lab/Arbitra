import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GovernanceParameter,
  GovernanceProposal,
  GovernanceTokenBalance,
  GovernanceTokenDistribution,
  GovernanceVote,
} from './entities/governance.entity';
import {
  calculateVotingPower,
  canTransition,
  decideOutcome,
  ProposalStatus,
  ProposalType,
  validateParameterChanges,
  VoteChoice,
  VoteTally,
} from './governance-state-machine';
import {
  CastVoteDto,
  CreateProposalDto,
  DistributeTokensDto,
} from './dto/governance.dto';

export interface GovernanceAnalytics {
  proposalsByStatus: Record<string, number>;
  totalProposals: number;
  totalVotes: number;
  totalVotingPower: number;
  totalTokenSupply: number;
}

@Injectable()
export class GovernanceService {
  constructor(
    @InjectRepository(GovernanceProposal)
    private readonly proposalRepository: Repository<GovernanceProposal>,
    @InjectRepository(GovernanceVote)
    private readonly voteRepository: Repository<GovernanceVote>,
    @InjectRepository(GovernanceTokenBalance)
    private readonly balanceRepository: Repository<GovernanceTokenBalance>,
    @InjectRepository(GovernanceTokenDistribution)
    private readonly distributionRepository: Repository<GovernanceTokenDistribution>,
    @InjectRepository(GovernanceParameter)
    private readonly parameterRepository: Repository<GovernanceParameter>,
  ) {}

  async createProposal(
    dto: CreateProposalDto,
    proposerId: string,
  ): Promise<GovernanceProposal> {
    if (dto.type === ProposalType.PARAMETER_CHANGE) {
      const validation = validateParameterChanges(dto.parameters ?? {});
      if (!validation.valid) {
        throw new BadRequestException(validation.errors.join('; '));
      }
    }

    const power = await this.getVotingPower(proposerId);
    if (power < 100) {
      throw new BadRequestException('Proposers need at least 100 voting power');
    }

    const proposal = this.proposalRepository.create({
      type: dto.type,
      title: dto.title,
      description: dto.description,
      parameters: dto.parameters ?? null,
      proposerId,
      status: ProposalStatus.ACTIVE,
      quorumBps: dto.quorumBps ?? 1000,
      thresholdBps: dto.thresholdBps ?? 5000,
      forWeight: 0,
      againstWeight: 0,
      abstainWeight: 0,
      voterCount: 0,
      votingEndsAt: new Date(
        Date.now() + (dto.durationDays ?? 7) * 24 * 60 * 60 * 1000,
      ),
    });
    return this.proposalRepository.save(proposal);
  }

  /**
   * Cast or replace a vote. The weight is snapshotted per proposal, and the
   * running tally is updated incrementally by the exact delta so changing a
   * vote never double-counts (#24).
   */
  async castVote(
    proposalId: string,
    voterId: string,
    dto: CastVoteDto,
  ): Promise<GovernanceVote> {
    const proposal = await this.findProposal(proposalId);
    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new BadRequestException('Proposal is not open for voting');
    }
    if (new Date(proposal.votingEndsAt).getTime() <= Date.now()) {
      throw new BadRequestException('Voting period has ended');
    }

    const weight = await this.getVotingPower(voterId);
    if (weight <= 0) {
      throw new BadRequestException('Voter has no voting power');
    }

    const existing = await this.voteRepository.findOne({
      where: { proposalId, voterId },
    });
    const previousChoice = existing?.choice;
    const previousWeight = Number(existing?.weightSnapshot ?? 0);

    await this.applyTallyDelta(proposalId, previousChoice, -previousWeight);
    await this.applyTallyDelta(proposalId, dto.choice, weight);
    if (!existing) {
      await this.proposalRepository.increment(
        { id: proposalId },
        'voterCount',
        1,
      );
    }

    const vote =
      existing ?? this.voteRepository.create({ proposalId, voterId });
    vote.choice = dto.choice;
    vote.weightSnapshot = weight;
    return this.voteRepository.save(vote);
  }

  /** Close voting, decide the outcome and execute parameter changes. */
  async finalizeProposal(
    proposalId: string,
    actorId: string,
  ): Promise<GovernanceProposal> {
    const proposal = await this.findProposal(proposalId);
    if (proposal.status !== ProposalStatus.ACTIVE) {
      throw new BadRequestException('Proposal is not active');
    }
    if (new Date(proposal.votingEndsAt).getTime() > Date.now()) {
      throw new BadRequestException('Voting period is still open');
    }

    const totalSupply = await this.getTotalSupply();
    const tally: VoteTally = {
      forWeight: Number(proposal.forWeight),
      againstWeight: Number(proposal.againstWeight),
      abstainWeight: Number(proposal.abstainWeight),
      voterCount: proposal.voterCount,
    };
    const outcome = decideOutcome(
      tally,
      proposal.quorumBps,
      proposal.thresholdBps,
      totalSupply,
    );

    if (!canTransition(proposal.status, outcome)) {
      throw new BadRequestException('Invalid governance state transition');
    }
    proposal.status = outcome;

    if (outcome === ProposalStatus.SUCCEEDED) {
      if (proposal.type === ProposalType.PARAMETER_CHANGE) {
        await this.applyParameterChanges(proposal);
        proposal.status = ProposalStatus.EXECUTED;
        proposal.executedAt = new Date();
        proposal.executionNotes = `Applied by ${actorId}`;
      } else if (proposal.type === ProposalType.EMERGENCY_UPGRADE) {
        // On-chain protocol upgrades require operator/infra access; the
        // proposal is queued, never falsely marked executed.
        proposal.status = ProposalStatus.QUEUED;
        proposal.executionNotes =
          'Approved. On-chain upgrade execution requires protocol operator.';
      }
    }

    return this.proposalRepository.save(proposal);
  }

  /** Execute a queued/approved parameter change against the DB parameter store. */
  async executeProposal(
    proposalId: string,
    actorId: string,
  ): Promise<GovernanceProposal> {
    const proposal = await this.findProposal(proposalId);
    if (
      proposal.status !== ProposalStatus.SUCCEEDED &&
      proposal.status !== ProposalStatus.QUEUED
    ) {
      throw new BadRequestException('Proposal is not ready for execution');
    }
    if (proposal.type === ProposalType.EMERGENCY_UPGRADE) {
      throw new BadRequestException(
        'Emergency on-chain upgrades require protocol operator execution',
      );
    }
    await this.applyParameterChanges(proposal);
    proposal.status = ProposalStatus.EXECUTED;
    proposal.executedAt = new Date();
    proposal.executionNotes = `Applied by ${actorId}`;
    return this.proposalRepository.save(proposal);
  }

  async cancelProposal(
    proposalId: string,
    actorId: string,
  ): Promise<GovernanceProposal> {
    const proposal = await this.findProposal(proposalId);
    if (!canTransition(proposal.status, ProposalStatus.CANCELLED)) {
      throw new BadRequestException('Proposal cannot be cancelled');
    }
    proposal.status = ProposalStatus.CANCELLED;
    proposal.executionNotes = `Cancelled by ${actorId}`;
    return this.proposalRepository.save(proposal);
  }

  async listProposals(): Promise<GovernanceProposal[]> {
    return this.proposalRepository.find({ order: { createdAt: 'DESC' } });
  }

  async getProposal(proposalId: string): Promise<GovernanceProposal> {
    return this.findProposal(proposalId);
  }

  async distributeTokens(
    dto: DistributeTokensDto,
    actorId: string,
  ): Promise<GovernanceTokenDistribution> {
    const existing = await this.distributionRepository.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) return existing;

    let balance = await this.balanceRepository.findOne({
      where: { userId: dto.userId },
    });
    if (!balance) {
      balance = this.balanceRepository.create({
        userId: dto.userId,
        balance: 0,
        lockedBalance: 0,
      });
    }
    balance.balance = Number(balance.balance) + dto.amount;
    await this.balanceRepository.save(balance);

    const distribution = this.distributionRepository.create({
      userId: dto.userId,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey,
      source: `${dto.source}:${actorId}`,
    });
    return this.distributionRepository.save(distribution);
  }

  async getBalance(userId: string): Promise<GovernanceTokenBalance | null> {
    return this.balanceRepository.findOne({ where: { userId } });
  }

  async getAnalytics(): Promise<GovernanceAnalytics> {
    const proposals = await this.proposalRepository.find();
    const proposalsByStatus: Record<string, number> = {};
    for (const proposal of proposals) {
      proposalsByStatus[proposal.status] =
        (proposalsByStatus[proposal.status] ?? 0) + 1;
    }
    return {
      proposalsByStatus,
      totalProposals: proposals.length,
      totalVotes: proposals.reduce((sum, p) => sum + p.voterCount, 0),
      totalVotingPower: proposals.reduce(
        (sum, p) =>
          sum +
          Number(p.forWeight) +
          Number(p.againstWeight) +
          Number(p.abstainWeight),
        0,
      ),
      totalTokenSupply: await this.getTotalSupply(),
    };
  }

  private async applyTallyDelta(
    proposalId: string,
    choice: VoteChoice | undefined,
    delta: number,
  ): Promise<void> {
    if (!choice || delta === 0) return;
    const field =
      choice === VoteChoice.FOR
        ? 'forWeight'
        : choice === VoteChoice.AGAINST
          ? 'againstWeight'
          : 'abstainWeight';
    await this.proposalRepository.increment({ id: proposalId }, field, delta);
  }

  private async applyParameterChanges(
    proposal: GovernanceProposal,
  ): Promise<void> {
    const validation = validateParameterChanges(proposal.parameters ?? {});
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join('; '));
    }
    for (const [key, value] of Object.entries(proposal.parameters ?? {})) {
      let parameter = await this.parameterRepository.findOne({
        where: { key },
      });
      if (!parameter) {
        parameter = this.parameterRepository.create({ key, value });
      } else {
        parameter.value = value;
      }
      await this.parameterRepository.save(parameter);
    }
  }

  private async getVotingPower(userId: string): Promise<number> {
    const balance = await this.balanceRepository.findOne({
      where: { userId },
    });
    if (!balance) return 0;
    return calculateVotingPower({
      balance: Number(balance.balance),
      lockedBalance: Number(balance.lockedBalance),
    });
  }

  private async getTotalSupply(): Promise<number> {
    const row = await this.balanceRepository
      .createQueryBuilder('balance')
      .select('COALESCE(SUM(balance.balance), 0)', 'total')
      .getRawOne<{ total: string }>();
    return Number(row?.total ?? 0);
  }

  private async findProposal(proposalId: string): Promise<GovernanceProposal> {
    const proposal = await this.proposalRepository.findOne({
      where: { id: proposalId },
    });
    if (!proposal) throw new NotFoundException('Governance proposal not found');
    return proposal;
  }
}
