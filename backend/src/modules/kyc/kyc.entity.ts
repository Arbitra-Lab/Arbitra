import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Encrypted } from '../security/decorators/encrypted.decorator';
import { KycStatus } from './kyc-status.enum';

@Entity('kyc')
export class Kyc {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Encrypted({ nullable: false })
  encryptedKycData: Record<string, any>; // SEP-9 fields, encrypted

  @Column({ type: 'int', default: 1 })
  encryptionVersion: number;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.PENDING })
  status: KycStatus;

  @Column({ type: 'text', nullable: true })
  providerReference: string | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'boolean', default: false })
  isExpired: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastReminderSentAt: Date | null;

  @Index()
  @Column({ type: 'boolean', default: false })
  needsReVerification: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
