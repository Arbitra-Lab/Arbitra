import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDisputeSlaFields1785500000000 implements MigrationInterface {
  name = 'AddDisputeSlaFields1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ========== disputes: SLA tracking, priority, arbiter assignment ==========
    await queryRunner.query(`
      ALTER TABLE "disputes"
        ADD COLUMN IF NOT EXISTS "stage" VARCHAR(20),
        ADD COLUMN IF NOT EXISTS "stage_due_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
        ADD COLUMN IF NOT EXISTS "assigned_arbiter_id" INTEGER,
        ADD COLUMN IF NOT EXISTS "escalation_count" INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "last_escalated_due_at" TIMESTAMP,
        ADD COLUMN IF NOT EXISTS "sla_breached_at" TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE "disputes"
        ADD CONSTRAINT "FK_disputes_assigned_arbiter_id"
        FOREIGN KEY ("assigned_arbiter_id") REFERENCES "arbiters"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_disputes_stage_due_at" ON "disputes" ("stage_due_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_disputes_assigned_arbiter_id" ON "disputes" ("assigned_arbiter_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_disputes_priority" ON "disputes" ("priority")`,
    );

    // Backfill stage + due date for existing active disputes so they become
    // SLA-tracked immediately rather than waiting for their next transition.
    await queryRunner.query(`
      UPDATE "disputes"
      SET "stage" = 'INTAKE', "stage_due_at" = "created_at" + INTERVAL '24 hours'
      WHERE "status" = 'OPEN' AND "stage" IS NULL
    `);
    await queryRunner.query(`
      UPDATE "disputes"
      SET "stage" = 'ARBITRATION', "stage_due_at" = "updated_at" + INTERVAL '72 hours'
      WHERE "status" = 'UNDER_REVIEW' AND "stage" IS NULL
    `);

    // ========== arbiters: expertise/conflict metadata for weighted assignment ==========
    await queryRunner.query(`
      ALTER TABLE "arbiters"
        ADD COLUMN IF NOT EXISTS "expertise_tags" JSONB,
        ADD COLUMN IF NOT EXISTS "conflict_user_ids" JSONB,
        ADD COLUMN IF NOT EXISTS "max_active_disputes" INTEGER NOT NULL DEFAULT 5
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "arbiters"
        DROP COLUMN IF EXISTS "max_active_disputes",
        DROP COLUMN IF EXISTS "conflict_user_ids",
        DROP COLUMN IF EXISTS "expertise_tags"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_disputes_priority"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_disputes_assigned_arbiter_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_disputes_stage_due_at"`);

    await queryRunner.query(
      `ALTER TABLE "disputes" DROP CONSTRAINT IF EXISTS "FK_disputes_assigned_arbiter_id"`,
    );

    await queryRunner.query(`
      ALTER TABLE "disputes"
        DROP COLUMN IF EXISTS "sla_breached_at",
        DROP COLUMN IF EXISTS "last_escalated_due_at",
        DROP COLUMN IF EXISTS "escalation_count",
        DROP COLUMN IF EXISTS "assigned_arbiter_id",
        DROP COLUMN IF EXISTS "priority",
        DROP COLUMN IF EXISTS "stage_due_at",
        DROP COLUMN IF EXISTS "stage"
    `);
  }
}
