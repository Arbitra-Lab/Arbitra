import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApplicationStatus } from '../arbiter-onboarding-state';

/** Arbiter applications awaiting qualification and KYC verification (#7). */
@Entity('arbiter_applications')
@Index('IDX_arbiter_applications_status', ['status'])
@Index('IDX_arbiter_applications_user', ['userId'])
export class ArbiterApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'stellar_address', type: 'varchar', length: 100 })
  stellarAddress: string;

  @Column({ type: 'text', nullable: true })
  qualifications: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  specialization: string | null;

  @Column({ name: 'jurisdictions', type: 'jsonb', nullable: true })
  jurisdictions: string[] | null;

  @Column({ name: 'languages', type: 'jsonb', nullable: true })
  languages: string[] | null;

  @Column({ name: 'stake_amount', type: 'varchar', length: 40, nullable: true })
  stakeAmount: string | null;

  /** Reference to the existing KYC record used during verification. */
  @Column({
    name: 'kyc_reference',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  kycReference: string | null;

  @Column({ type: 'varchar', length: 30, default: ApplicationStatus.PENDING })
  status: ApplicationStatus;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
