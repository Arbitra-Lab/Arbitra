import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingMfaStatus1950000000000 implements MigrationInterface {
  name = 'AddPendingMfaStatus1950000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."mfa_devices_type_enum" ADD VALUE IF NOT EXISTS 'sms'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."mfa_devices_status_enum" ADD VALUE IF NOT EXISTS 'pending'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "mfa_devices" SET "status" = 'disabled' WHERE "status" = 'pending'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."mfa_devices_status_enum" RENAME TO "mfa_devices_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."mfa_devices_status_enum" AS ENUM('active', 'disabled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_devices" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_devices" ALTER COLUMN "status" TYPE "public"."mfa_devices_status_enum" USING "status"::text::"public"."mfa_devices_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_devices" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(`DROP TYPE "public"."mfa_devices_status_enum_old"`);
    await queryRunner.query(
      `UPDATE "mfa_devices" SET "type" = 'totp' WHERE "type" = 'sms'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."mfa_devices_type_enum" RENAME TO "mfa_devices_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."mfa_devices_type_enum" AS ENUM('totp', 'backup_code')`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_devices" ALTER COLUMN "type" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_devices" ALTER COLUMN "type" TYPE "public"."mfa_devices_type_enum" USING "type"::text::"public"."mfa_devices_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "mfa_devices" ALTER COLUMN "type" SET DEFAULT 'totp'`,
    );
    await queryRunner.query(`DROP TYPE "public"."mfa_devices_type_enum_old"`);
  }
}
