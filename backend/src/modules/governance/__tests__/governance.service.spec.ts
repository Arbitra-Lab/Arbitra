import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GovernanceService } from '../governance.service';
import {
  GovernanceParameter,
  GovernanceProposal,
  GovernanceTokenBalance,
  GovernanceTokenDistribution,
  GovernanceVote,
} from '../entities/governance.entity';
import {
  ProposalStatus,
  ProposalType,
  VoteChoice,
} from '../governance-state-machine';

function proposal(
  overrides: Partial<GovernanceProposal> = {},
): GovernanceProposal {
  return {
    id: 'p1',
    type: ProposalType.PARAMETER_CHANGE,
    title: 'Change arbitration fee',
    description: 'Lower the fee',
    proposerId: 'user-1',
    parameters: { arbitrationFeeBps: 250 },
    status: ProposalStatus.ACTIVE,
    quorumBps: 1000,
    thresholdBps: 5000,
    forWeight: 600,
    againstWeight: 400,
    abstainWeight: 0,
    voterCount: 2,
    votingEndsAt: new Date(Date.now() - 1000),
    executedAt: null,
    executionNotes: null,
    ...overrides,
  } as GovernanceProposal;
}

describe('GovernanceService (#24)', () => {
  let service: GovernanceService;
  let proposals: GovernanceProposal[];
  let balances: GovernanceTokenBalance[];
  let votes: GovernanceVote[];
  let distributions: GovernanceTokenDistribution[];
  let parameters: GovernanceParameter[];
  let increments: Array<{ field: string; delta: number }>;
  let proposalRepo: any;
  let balanceRepo: any;
  let voteRepo: any;
  let distributionRepo: any;
  let parameterRepo: any;

  beforeEach(() => {
    proposals = [];
    balances = [
      {
        id: 'b1',
        userId: 'user-1',
        balance: 500,
        lockedBalance: 0,
      } as GovernanceTokenBalance,
    ];
    votes = [];
    distributions = [];
    parameters = [];
    increments = [];

    proposalRepo = {
      create: jest.fn((data: Partial<GovernanceProposal>) => ({
        ...data,
        id: `p-${proposals.length + 1}`,
      })),
      save: jest.fn(async (entity: GovernanceProposal) => {
        if (!proposals.some((p) => p.id === entity.id)) proposals.push(entity);
        return entity;
      }),
      findOne: jest.fn(
        async ({ where }: any) =>
          proposals.find((p) => p.id === where.id) ?? null,
      ),
      find: jest.fn(async () => proposals),
      increment: jest.fn(async (_where: any, field: string, delta: number) => {
        increments.push({ field, delta });
      }),
    };
    balanceRepo = {
      findOne: jest.fn(
        async ({ where }: any) =>
          balances.find((b) => b.userId === where.userId) ?? null,
      ),
      create: jest.fn((data: Partial<GovernanceTokenBalance>) => ({ ...data })),
      save: jest.fn(async (entity: GovernanceTokenBalance) => {
        if (!balances.some((b) => b.userId === entity.userId)) {
          balances.push(entity);
        }
        return entity;
      }),
      createQueryBuilder: jest.fn(() => ({
        select: () => ({
          getRawOne: async () => ({
            total: String(balances.reduce((sum, b) => sum + b.balance, 0)),
          }),
        }),
      })),
    };
    voteRepo = {
      findOne: jest.fn(
        async ({ where }: any) =>
          votes.find(
            (v) =>
              v.proposalId === where.proposalId && v.voterId === where.voterId,
          ) ?? null,
      ),
      create: jest.fn((data: Partial<GovernanceVote>) => ({ ...data })),
      save: jest.fn(async (entity: GovernanceVote) => {
        if (!votes.some((v) => v.id === entity.id)) votes.push(entity);
        return entity;
      }),
    };
    distributionRepo = {
      findOne: jest.fn(
        async ({ where }: any) =>
          distributions.find(
            (d) => d.idempotencyKey === where.idempotencyKey,
          ) ?? null,
      ),
      create: jest.fn((data: Partial<GovernanceTokenDistribution>) => ({
        ...data,
      })),
      save: jest.fn(async (entity: GovernanceTokenDistribution) => {
        distributions.push(entity);
        return entity;
      }),
    };
    parameterRepo = {
      findOne: jest.fn(
        async ({ where }: any) =>
          parameters.find((p) => p.key === where.key) ?? null,
      ),
      create: jest.fn((data: Partial<GovernanceParameter>) => ({ ...data })),
      save: jest.fn(async (entity: GovernanceParameter) => {
        if (!parameters.some((p) => p.key === entity.key))
          parameters.push(entity);
        return entity;
      }),
    };

    service = new GovernanceService(
      proposalRepo,
      voteRepo,
      balanceRepo,
      distributionRepo,
      parameterRepo,
    );
  });

  it('creates proposals only with enough voting power and valid parameters', async () => {
    const created = await service.createProposal(
      {
        type: ProposalType.PARAMETER_CHANGE,
        title: 'Fee',
        description: 'Adjust fee',
        parameters: { arbitrationFeeBps: 250 },
      },
      'user-1',
    );
    expect(created.status).toBe(ProposalStatus.ACTIVE);
    expect(created.quorumBps).toBe(1000);

    await expect(
      service.createProposal(
        {
          type: ProposalType.PARAMETER_CHANGE,
          title: 'Bad',
          description: 'Bad params',
          parameters: { arbitrationFeeBps: 5000 },
        },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createProposal(
        {
          type: ProposalType.GENERAL,
          title: 'Poor',
          description: 'No power',
        },
        'unknown-user',
      ),
    ).rejects.toThrow(/100 voting power/);
  });

  it('snapshots voting power and applies incremental tally deltas', async () => {
    proposals.push(
      proposal({
        votingEndsAt: new Date(Date.now() + 60000),
        forWeight: 0,
        againstWeight: 0,
      }),
    );
    const first = await service.castVote('p1', 'user-1', {
      choice: VoteChoice.FOR,
    });
    expect(first.weightSnapshot).toBe(500);
    expect(increments).toContainEqual({ field: 'forWeight', delta: 500 });

    increments = [];
    await service.castVote('p1', 'user-1', { choice: VoteChoice.AGAINST });
    expect(increments).toEqual([
      { field: 'forWeight', delta: -500 },
      { field: 'againstWeight', delta: 500 },
    ]);
    expect(votes).toHaveLength(1);
  });

  it('rejects votes on closed proposals and powerless voters', async () => {
    proposals.push(proposal());
    await expect(
      service.castVote('p1', 'user-1', { choice: VoteChoice.FOR }),
    ).rejects.toThrow(/ended/);
    await expect(
      service.castVote('missing', 'user-1', { choice: VoteChoice.FOR }),
    ).rejects.toThrow(NotFoundException);
  });

  it('finalises a passing parameter proposal and applies it to the DB', async () => {
    proposals.push(proposal());
    const result = await service.finalizeProposal('p1', 'admin-1');
    expect(result.status).toBe(ProposalStatus.EXECUTED);
    expect(parameters).toEqual([
      expect.objectContaining({ key: 'arbitrationFeeBps', value: 250 }),
    ]);
    expect(result.executionNotes).toContain('admin-1');
  });

  it('queues approved emergency upgrades instead of claiming execution', async () => {
    proposals.push(
      proposal({ type: ProposalType.EMERGENCY_UPGRADE, parameters: null }),
    );
    const result = await service.finalizeProposal('p1', 'admin-1');
    expect(result.status).toBe(ProposalStatus.QUEUED);
    await expect(service.executeProposal('p1', 'admin-1')).rejects.toThrow(
      /protocol operator/,
    );
  });

  it('defeats proposals that miss quorum', async () => {
    proposals.push(proposal({ forWeight: 5, againstWeight: 0 }));
    const result = await service.finalizeProposal('p1', 'admin-1');
    expect(result.status).toBe(ProposalStatus.DEFEATED);
    expect(parameters).toHaveLength(0);
  });

  it('distributes tokens idempotently', async () => {
    const dto = {
      userId: 'user-2',
      amount: 100,
      idempotencyKey: 'genesis-1',
      source: 'genesis',
    };
    await service.distributeTokens(dto, 'admin-1');
    await service.distributeTokens(dto, 'admin-1');
    expect(distributions).toHaveLength(1);
    expect(balances.find((b) => b.userId === 'user-2')?.balance).toBe(100);
  });

  it('reports analytics from persisted state', async () => {
    proposals.push(proposal());
    const analytics = await service.getAnalytics();
    expect(analytics.totalProposals).toBe(1);
    expect(analytics.proposalsByStatus.ACTIVE).toBe(1);
    expect(analytics.totalVotes).toBe(2);
    expect(analytics.totalTokenSupply).toBe(500);
  });
});
