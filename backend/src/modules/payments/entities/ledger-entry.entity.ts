import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum LedgerDirection {
  DEBIT = 'debit',
  CREDIT = 'credit',
}

export enum LedgerOperationType {
  CAPTURE = 'capture',
  REFUND = 'refund',
  FEE = 'fee',
}

/**
 * One balanced financial event (a capture or a refund). Groups the debit/credit
 * LedgerEntry rows it produced and carries the client-supplied idempotency key,
 * so retries of the same operation can be detected before any entries are written.
 */
@Entity('ledger_operations')
@Index('idx_ledger_operations_payment_id', ['paymentId'])
@Index('uq_ledger_operations_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
export class LedgerOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  operationType: LedgerOperationType;

  @Column({ nullable: true, type: 'varchar' })
  paymentId: string | null;

  @Column({ length: 150, nullable: true, type: 'varchar' })
  idempotencyKey: string | null;

  @Column({ length: 3 })
  currency: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Append-only double-entry row. Rows are never updated or deleted — corrections
 * are made by posting a new, opposite-signed LedgerOperation, preserving a full
 * audit trail of every payment/refund/fee movement.
 */
@Entity('ledger_entries')
@Index('idx_ledger_entries_operation_id', ['operationId'])
@Index('idx_ledger_entries_payment_id', ['paymentId'])
@Index('idx_ledger_entries_account_id', ['accountId'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  operationId: string;

  @Column({ nullable: true, type: 'varchar' })
  paymentId: string | null;

  /**
   * Logical account this line posts to, e.g. `gateway:clearing`,
   * `fees:revenue`, or `customer:<userId>` for a customer's refundable balance.
   */
  @Column()
  accountId: string;

  @Column({ type: 'varchar', length: 10 })
  direction: LedgerDirection;

  @Column('decimal', { precision: 18, scale: 2 })
  amount: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 20 })
  operationType: LedgerOperationType;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
