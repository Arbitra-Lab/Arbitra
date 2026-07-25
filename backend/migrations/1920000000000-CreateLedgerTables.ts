import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLedgerTables1920000000000 implements MigrationInterface {
  name = 'CreateLedgerTables1920000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ledger_operations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operation_type VARCHAR(20) NOT NULL,
        payment_id VARCHAR,
        idempotency_key VARCHAR(150),
        currency VARCHAR(3) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ledger_operations_payment_id ON ledger_operations(payment_id);`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_operations_idempotency_key ON ledger_operations(idempotency_key);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ledger_operations_created_at ON ledger_operations(created_at);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        operation_id UUID NOT NULL,
        payment_id VARCHAR,
        account_id VARCHAR NOT NULL,
        direction VARCHAR(10) NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        operation_type VARCHAR(20) NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ledger_entries_operation_id ON ledger_entries(operation_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ledger_entries_payment_id ON ledger_entries(payment_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_id ON ledger_entries(account_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_ledger_entries_created_at ON ledger_entries(created_at);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_entries;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_operations;`);
  }
}
