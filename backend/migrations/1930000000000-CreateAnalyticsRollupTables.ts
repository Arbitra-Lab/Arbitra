import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnalyticsRollupTables1930000000000 implements MigrationInterface {
  name = 'CreateAnalyticsRollupTables1930000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analytics_inquiry_rollups_daily (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id UUID NOT NULL,
        property_id UUID NOT NULL,
        bucket_date DATE NOT NULL,
        inquiry_count INTEGER NOT NULL DEFAULT 0,
        viewed_inquiry_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_inquiry_rollups_daily_owner_property_bucket ON analytics_inquiry_rollups_daily(owner_id, property_id, bucket_date);`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_analytics_inquiry_rollups_daily_owner_bucket ON analytics_inquiry_rollups_daily(owner_id, bucket_date);`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analytics_rollup_watermarks (
        name VARCHAR(64) PRIMARY KEY,
        watermark TIMESTAMP,
        last_run_at TIMESTAMP
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS analytics_rollup_watermarks;`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS analytics_inquiry_rollups_daily;`,
    );
  }
}
