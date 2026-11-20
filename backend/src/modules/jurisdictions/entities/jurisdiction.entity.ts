import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Procedure a dispute must follow before/during arbitration in a given
 * jurisdiction. Mirrors the kind of pre-arbitration requirements that
 * differ by region (e.g. mandatory mediation in some US states).
 */
export enum ArbitrationProcedure {
  DIRECT_ARBITRATION = 'direct_arbitration',
  MEDIATION_FIRST = 'mediation_first',
  COURT_REFERRAL = 'court_referral',
}

@Entity('jurisdictions')
export class Jurisdiction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable identifier, e.g. "US-CA", "US-NY", "GB", "NG-LA". */
  @Column({ unique: true, length: 16 })
  code: string;

  @Column({ length: 100 })
  name: string;

  /** ISO 3166-1 alpha-2 country code, e.g. "US". */
  @Column({ length: 2 })
  country: string;

  /** State/province/region code, nullable for country-wide jurisdictions. */
  @Column({ length: 10, nullable: true })
  region: string | null;

  /** ISO 4217 currency code, e.g. "USD". */
  @Column({ length: 3 })
  currency: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  // ---- Agreement rules ----

  @Column({
    name: 'max_security_deposit_months',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  maxSecurityDepositMonths: number | null;

  @Column({ name: 'min_notice_period_days', type: 'int', nullable: true })
  minNoticePeriodDays: number | null;

  @Column({
    name: 'max_late_fee_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  maxLateFeePercent: number | null;

  @Column({ name: 'min_grace_period_days', type: 'int', nullable: true })
  minGracePeriodDays: number | null;

  // ---- Dispute resolution rules ----

  /** Days after an incident within which a dispute must be filed. */
  @Column({ name: 'dispute_filing_window_days', type: 'int', nullable: true })
  disputeFilingWindowDays: number | null;

  @Column({
    name: 'required_arbitration_procedure',
    type: 'varchar',
    length: 30,
    default: ArbitrationProcedure.DIRECT_ARBITRATION,
  })
  requiredArbitrationProcedure: ArbitrationProcedure;

  /** Suggested minimum arbiter quorum override for this jurisdiction. */
  @Column({ name: 'min_arbiter_quorum', type: 'int', nullable: true })
  minArbiterQuorum: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
