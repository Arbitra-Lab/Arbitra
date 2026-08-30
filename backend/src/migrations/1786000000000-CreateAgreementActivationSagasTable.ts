import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgreementActivationSagasTable1786000000000 implements MigrationInterface {
  name = 'CreateAgreementActivationSagasTable1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agreement_activation_sagas" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "agreement_id" uuid NOT NULL,
        "status" VARCHAR(30) NOT NULL DEFAULT 'pending',
        "previous_agreement_status" VARCHAR(50),
        "steps" TEXT NOT NULL,
        "context" TEXT,
        "failure_reason" TEXT,
        "completed_at" TIMESTAMP,
        "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agreement_activation_sagas_agreement_id" ON "agreement_activation_sagas" ("agreement_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agreement_activation_sagas_status" ON "agreement_activation_sagas" ("status")`,
    );

    await queryRunner.query(`
      ALTER TABLE "rent_agreements"
        ADD COLUMN IF NOT EXISTS "activation_failure_reason" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "rent_agreements" DROP COLUMN IF EXISTS "activation_failure_reason"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_agreement_activation_sagas_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_agreement_activation_sagas_agreement_id"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "agreement_activation_sagas"`,
    );
  }
}
