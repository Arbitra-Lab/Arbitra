import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

const JSON_COLUMN_TYPE =
  process.env.DB_TYPE === 'sqlite' ? 'simple-json' : 'jsonb';
const TIMESTAMP_COLUMN_TYPE =
  process.env.DB_TYPE === 'sqlite' ? 'datetime' : 'timestamptz';

export type BlockchainEventStatus = 'applied' | 'rolled_back';

/**
 * Idempotency + audit record for a single applied ledger event. The unique
 * `dedup_key` (stream + ledger + tx hash + event index) is what guarantees
 * "replay the same event any number of times, apply the side effect once".
 */
@Entity('blockchain_event_idempotency')
export class BlockchainEventIdempotency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stream_name', type: 'varchar', length: 100 })
  @Index()
  streamName: string;

  @Column({ type: 'integer' })
  @Index()
  ledger: number;

  @Column({ name: 'tx_hash', type: 'varchar', length: 64 })
  txHash: string;

  @Column({ name: 'event_index', type: 'integer' })
  eventIndex: number;

  @Column({ name: 'dedup_key', type: 'varchar', length: 200, unique: true })
  dedupKey: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ name: 'ledger_hash', type: 'varchar', length: 64 })
  ledgerHash: string;

  @Column({ name: 'parent_ledger_hash', type: 'varchar', length: 64 })
  parentLedgerHash: string;

  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  payload: Record<string, unknown> | null;

  @Column({
    type: 'simple-enum',
    enum: ['applied', 'rolled_back'],
    default: 'applied',
  })
  status: BlockchainEventStatus;

  @Column({ name: 'compensation_data', type: JSON_COLUMN_TYPE, nullable: true })
  compensationData: Record<string, unknown> | null;

  @Column({ name: 'applied_at', type: TIMESTAMP_COLUMN_TYPE })
  appliedAt: Date;

  @Column({
    name: 'rolled_back_at',
    type: TIMESTAMP_COLUMN_TYPE,
    nullable: true,
  })
  rolledBackAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt: Date;
}
