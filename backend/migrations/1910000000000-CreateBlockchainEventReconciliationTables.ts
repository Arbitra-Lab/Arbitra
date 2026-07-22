import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlockchainEventReconciliationTables1910000000000
  implements MigrationInterface
{
  name = 'CreateBlockchainEventReconciliationTables1910000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS blockchain_event_idempotency (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_name VARCHAR(100) NOT NULL,
        ledger INTEGER NOT NULL,
        tx_hash VARCHAR(64) NOT NULL,
        event_index INTEGER NOT NULL,
        dedup_key VARCHAR(200) NOT NULL UNIQUE,
        event_type VARCHAR(100) NOT NULL,
        ledger_hash VARCHAR(64) NOT NULL,
        parent_ledger_hash VARCHAR(64) NOT NULL,
        payload JSONB,
        status VARCHAR(20) NOT NULL DEFAULT 'applied',
        compensation_data JSONB,
        applied_at TIMESTAMPTZ NOT NULL,
        rolled_back_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_blockchain_event_idempotency_stream ON blockchain_event_idempotency(stream_name);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_blockchain_event_idempotency_ledger ON blockchain_event_idempotency(ledger);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_blockchain_event_idempotency_stream_status_ledger ON blockchain_event_idempotency(stream_name, status, ledger);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS blockchain_stream_cursors (
        stream_name VARCHAR(100) PRIMARY KEY,
        last_confirmed_ledger INTEGER NOT NULL DEFAULT 0,
        last_confirmed_ledger_hash VARCHAR(64),
        ancestry JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS blockchain_event_dead_letters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stream_name VARCHAR(100) NOT NULL,
        dedup_key VARCHAR(200) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        ledger INTEGER NOT NULL,
        tx_hash VARCHAR(64) NOT NULL,
        event_index INTEGER NOT NULL,
        payload JSONB,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        attempts INTEGER NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        last_attempt_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_blockchain_event_dead_letters_stream ON blockchain_event_dead_letters(stream_name);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_blockchain_event_dead_letters_dedup_key ON blockchain_event_dead_letters(dedup_key);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_blockchain_event_dead_letters_status ON blockchain_event_dead_letters(status);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_blockchain_event_dead_letters_status;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_blockchain_event_dead_letters_dedup_key;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_blockchain_event_dead_letters_stream;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS blockchain_event_dead_letters;`);

    await queryRunner.query(`DROP TABLE IF EXISTS blockchain_stream_cursors;`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_blockchain_event_idempotency_stream_status_ledger;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_blockchain_event_idempotency_ledger;`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_blockchain_event_idempotency_stream;`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS blockchain_event_idempotency;`);
  }
}
