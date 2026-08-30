import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ReviewModerationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('guest_reviews')
@Index(['bookingId', 'hostId'], { unique: true })
@Index(['guestId'])
@Index(['hostId'])
@Index(['moderationStatus'])
export class GuestReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', type: 'varchar' })
  bookingId: string;

  @Column({ name: 'guest_id', type: 'varchar' })
  guestId: string;

  @Column({ name: 'host_id', type: 'varchar' })
  hostId: string;

  @Column({ type: 'int', default: 5 })
  cleanliness: number;

  @Column({ type: 'int', default: 5 })
  communication: number;

  @Column({ name: 'respect_for_rules', type: 'int', default: 5 })
  respectForRules: number;

  @Column({ type: 'text' })
  comment: string;

  @Column({ name: 'would_host_again', type: 'boolean', default: false })
  wouldHostAgain: boolean;

  @Column({
    name: 'moderation_status',
    type: 'enum',
    enum: ReviewModerationStatus,
    default: ReviewModerationStatus.PENDING,
  })
  moderationStatus: ReviewModerationStatus;

  @Column({ name: 'moderation_confidence', type: 'float', nullable: true })
  moderationConfidence: number;

  @Column({ name: 'moderation_reason', type: 'text', nullable: true })
  moderationReason: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
