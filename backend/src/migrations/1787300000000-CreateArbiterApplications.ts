import { MigrationInterface, QueryRunner } from 'typeorm';

/** Arbiter application and verification workflow tables for #7. */
export class CreateArbiterApplications1787300000000 implements MigrationInterface {
  name = 'CreateArbiterApplications1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "arbiter_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "stellar_address" character varying(100) NOT NULL,
        "qualifications" text,
        "specialization" character varying(120),
        "jurisdictions" jsonb,
        "languages" jsonb,
        "stake_amount" character varying(40),
        "kyc_reference" character varying(120),
        "status" character varying(30) NOT NULL DEFAULT 'PENDING',
        "review_notes" text,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_arbiter_applications_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_arbiter_applications_status" ON "arbiter_applications" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_arbiter_applications_user" ON "arbiter_applications" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "arbiter_applications"`);
  }
}
