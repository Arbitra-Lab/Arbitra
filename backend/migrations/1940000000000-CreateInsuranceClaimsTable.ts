import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInsuranceClaimsTable1940000000000
  implements MigrationInterface
{
  name = 'CreateInsuranceClaimsTable1940000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS insurance_claims (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        dispute_id VARCHAR NOT NULL,
        claimant_user_id VARCHAR NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'NGN',
        reason TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        decision_notes TEXT,
        decided_by VARCHAR,
        decided_at TIMESTAMP,
        paid_at TIMESTAMP,
        ledger_operation_id VARCHAR,
        idempotency_key VARCHAR(150),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_insurance_claims_dispute_id ON insurance_claims(dispute_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_insurance_claims_claimant_user_id ON insurance_claims(claimant_user_id);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_insurance_claims_status ON insurance_claims(status);`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_claims_dispute_claimant ON insurance_claims(dispute_id, claimant_user_id);`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS insurance_claims;`);
  }
}
