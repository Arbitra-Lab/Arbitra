import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum FeeAgreementType {
  RENT = 'RENT',
  FREELANCE = 'FREELANCE',
  TRADE_FINANCE = 'TRADE_FINANCE',
  INSURANCE_CLAIM = 'INSURANCE_CLAIM',
  DEFAULT = 'DEFAULT',
}

@Entity('fee_configs')
@Index('idx_fee_configs_active_type', ['isActive', 'agreementType'])
export class FeeConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, default: FeeAgreementType.DEFAULT })
  agreementType: FeeAgreementType;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.02 })
  baseRate: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  flatFee: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  minFee: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  maxFee: string | null;

  @Column({ type: 'jsonb', nullable: true })
  volumeTiers: Array<{
    minVolume: number;
    maxVolume?: number;
    rate: string;
  }> | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
