import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum InsuranceClaimStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAID = 'paid',
}

/**
 * A claim against the protocol insurance pool, filed by a party to a
 * resolved dispute who believes they were left short by how the dispute
 * paid out. One claim per (dispute, claimant); approval pays out of
 * `insurance:pool` via the shared ledger (see InsuranceService).
 */
@Entity('insurance_claims')
@Index('idx_insurance_claims_dispute_id', ['disputeId'])
@Index('idx_insurance_claims_claimant_user_id', ['claimantUserId'])
@Index('idx_insurance_claims_status', ['status'])
@Index('uq_insurance_claims_dispute_claimant', ['disputeId', 'claimantUserId'], {
  unique: true,
})
export class InsuranceClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dispute_id' })
  disputeId: string;

  @Column({ name: 'claimant_user_id' })
  claimantUserId: string;

  @Column('decimal', { precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: InsuranceClaimStatus.PENDING,
  })
  status: InsuranceClaimStatus;

  @Column({ name: 'decision_notes', type: 'text', nullable: true })
  decisionNotes: string | null;

  @Column({ name: 'decided_by', type: 'varchar', nullable: true })
  decidedBy: string | null;

  @Column({ name: 'decided_at', type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'ledger_operation_id', type: 'varchar', nullable: true })
  ledgerOperationId: string | null;

  @Column({ length: 150, nullable: true, type: 'varchar' })
  idempotencyKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
