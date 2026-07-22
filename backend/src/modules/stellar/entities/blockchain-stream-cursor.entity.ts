import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

const JSON_COLUMN_TYPE =
  process.env.DB_TYPE === 'sqlite' ? 'simple-json' : 'jsonb';
const TIMESTAMP_COLUMN_TYPE =
  process.env.DB_TYPE === 'sqlite' ? 'datetime' : 'timestamptz';

export interface AncestryEntry {
  ledger: number;
  hash: string;
}

/**
 * Per-stream cursor tracking the last confirmed ledger and a bounded window
 * of recent (ledger, hash) pairs used to detect reorgs: an incoming event
 * whose `parentLedgerHash` disagrees with the stored hash for `ledger - 1`
 * means the canonical chain forked underneath us.
 */
@Entity('blockchain_stream_cursors')
export class BlockchainStreamCursor {
  @PrimaryColumn({ name: 'stream_name', type: 'varchar', length: 100 })
  streamName: string;

  @Column({ name: 'last_confirmed_ledger', type: 'integer', default: 0 })
  lastConfirmedLedger: number;

  @Column({
    name: 'last_confirmed_ledger_hash',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  lastConfirmedLedgerHash: string | null;

  @Column({
    type: JSON_COLUMN_TYPE,
    default: () => (process.env.DB_TYPE === 'sqlite' ? "'[]'" : "'[]'::jsonb"),
  })
  ancestry: AncestryEntry[];

  @UpdateDateColumn({ name: 'updated_at', type: TIMESTAMP_COLUMN_TYPE })
  updatedAt: Date;
}
