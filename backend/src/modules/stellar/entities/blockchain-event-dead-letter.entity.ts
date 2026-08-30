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

export type DeadLetterEventStatus = 'pending' | 'replayed' | 'resolved';

/**
 * Events whose side effect failed to apply land here with structured error
 * context instead of being silently dropped, so they can be inspected and
 * replayed (manually via the admin endpoint, or automatically via the
 * scheduled sweep) once the underlying cause is fixed.
 */
@Entity('blockchain_event_dead_letters')
export class BlockchainEventDeadLetter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'stream_name', type: 'varchar', length: 100 })
  @Index()
  streamName: string;

  @Column({ name: 'dedup_key', type: 'varchar', length: 200 })
  @Index()
  dedupKey: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;

  @Column({ type: 'integer' })
  ledger: number;

  @Column({ name: 'tx_hash', type: 'varchar', length: 64 })
  txHash: string;

  @Column({ name: 'event_index', type: 'integer' })
  eventIndex: number;

  @Column({ type: JSON_COLUMN_TYPE, nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text' })
  errorMessage: string;

  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack: string | null;

  @Column({ type: 'integer', default: 1 })
  attempts: number;

  @Column({
    type: 'simple-enum',
    enum: ['pending', 'replayed', 'resolved'],
    default: 'pending',
  })
  @Index()
  status: DeadLetterEventStatus;

  @Column({ name: 'last_attempt_at', type: TIMESTAMP_COLUMN_TYPE })
  lastAttemptAt: Date;

  @CreateDateColumn({ name: 'created_at', type: TIMESTAMP_COLUMN_TYPE })
  createdAt: Date;
}
