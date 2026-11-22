import { MigrationInterface, QueryRunner } from 'typeorm';

/** Arbiter matching preferences and performance history for #23. */
export class AddArbiterMatchingPreferences1787100000000 implements MigrationInterface {
  name = 'AddArbiterMatchingPreferences1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "arbiters" ADD COLUMN IF NOT EXISTS "jurisdictions" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "arbiters" ADD COLUMN IF NOT EXISTS "languages" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "arbiters" ADD COLUMN IF NOT EXISTS "average_resolution_hours" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "arbiters" DROP COLUMN IF EXISTS "average_resolution_hours"`,
    );
    await queryRunner.query(
      `ALTER TABLE "arbiters" DROP COLUMN IF EXISTS "languages"`,
    );
    await queryRunner.query(
      `ALTER TABLE "arbiters" DROP COLUMN IF EXISTS "jurisdictions"`,
    );
  }
}
