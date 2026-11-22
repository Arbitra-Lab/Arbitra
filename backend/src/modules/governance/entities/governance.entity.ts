import {
  Entity,
  PrimaryGeneratedColumn,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  ProposalStatus,
  ProposalType,
  VoteChoice,
} from '../governance-state-machine';

@Entity('governance_proposals')
@Index('IDX_governance_proposals_status', ['status'])
@Index('IDX_governance_proposals_type', ['type'])
export class GovernanceProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  type: ProposalType;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'proposer_id', type: 'uuid' })
  proposerId: string;

  @Column({ type: 'jsonb', nullable: true })
  parameters: Record<string, number> | null;

  @Column({ type: 'varchar', length: 30, default: ProposalStatus.ACTIVE })
  status: ProposalStatus;

  @Column({ name: 'quorum_bps', type: 'int', default: 1000 })
  quorumBps: number;

  @Column({ name: 'threshold_bps', type: 'int', default: 5000 })
  thresholdBps: number;

  @Column({
    name: 'for_weight',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  forWeight: number;

  @Column({
    name: 'against_weight',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  againstWeight: number;

  @Column({
    name: 'abstain_weight',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  abstainWeight: number;

  @Column({ name: 'voter_count', type: 'int', default: 0 })
  voterCount: number;

  @Column({ name: 'voting_ends_at', type: 'timestamp' })
  votingEndsAt: Date;

  @Column({ name: 'executed_at', type: 'timestamp', nullable: true })
  executedAt: Date | null;

  @Column({ name: 'execution_notes', type: 'text', nullable: true })
  executionNotes: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('governance_votes')
@Index('IDX_governance_votes_proposal', ['proposalId'])
@Index('IDX_governance_votes_proposal_voter', ['proposalId', 'voterId'], {
  unique: true,
})
export class GovernanceVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'proposal_id', type: 'uuid' })
  proposalId: string;

  @Column({ name: 'voter_id', type: 'uuid' })
  voterId: string;

  @Column({ type: 'varchar', length: 20 })
  choice: VoteChoice;

  /** Voting power snapshot at the time of the vote (#24). */
  @Column({ name: 'weight_snapshot', type: 'decimal', precision: 20, scale: 2 })
  weightSnapshot: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('governance_token_balances')
@Index('IDX_governance_token_balances_user', ['userId'], { unique: true })
export class GovernanceTokenBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  balance: number;

  @Column({
    name: 'locked_balance',
    type: 'decimal',
    precision: 20,
    scale: 2,
    default: 0,
  })
  lockedBalance: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('governance_token_distributions')
@Index('IDX_governance_token_distributions_idempotency', ['idempotencyKey'], {
  unique: true,
})
export class GovernanceTokenDistribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'decimal', precision: 20, scale: 2 })
  amount: number;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 120 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 80 })
  source: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('governance_parameters')
export class GovernanceParameter {
  @PrimaryColumn({ type: 'varchar', length: 80 })
  key: string;

  @Column({ type: 'jsonb' })
  value: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
