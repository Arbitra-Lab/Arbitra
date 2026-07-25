import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookDeliveryReliabilityFields1786500000000 implements MigrationInterface {
  name = 'AddWebhookDeliveryReliabilityFields1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "payload_hash" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "nonce" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "status" character varying NOT NULL DEFAULT 'pending'`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "dead_lettered_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `UPDATE "webhook_deliveries" SET "status" = 'delivered' WHERE "successful" = true AND "status" = 'pending'`,
    );
    await queryRunner.query(
      `UPDATE "webhook_deliveries" SET "status" = 'retrying' WHERE "successful" = false AND "next_retry_at" IS NOT NULL AND "status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_webhook_deliveries_status_next_retry" ON "webhook_deliveries" ("status", "next_retry_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_webhook_deliveries_status_next_retry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "dead_lettered_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "nonce"`,
    );
    await queryRunner.query(
      `ALTER TABLE "webhook_deliveries" DROP COLUMN IF EXISTS "payload_hash"`,
    );
  }
}
