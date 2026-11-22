import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum FeeCollectionStatus {
  COLLECTED = 'COLLECTED',
  DISTRIBUTED = 'DISTRIBUTED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

@Entity('fee_collections')
@Index('idx_fee_collections_payment_id', ['paymentId'])
@Index('idx_fee_collections_agreement_type', ['agreementType'])
export class FeeCollection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  paymentId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  agreementId: string | null;

  @Column({ type: 'varchar', length: 50 })
  agreementType: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  grossAmount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  feeAmount: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  refundedAmount: string;

  @Column({ length: 3, default: 'NGN' })
  currency: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: FeeCollectionStatus.COLLECTED,
  })
  status: FeeCollectionStatus;

  @Column({ type: 'jsonb', nullable: true })
  breakdown: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
