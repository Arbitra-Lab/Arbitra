import { MigrationInterface, QueryRunner } from 'typeorm';

/** Versioning, approval, marketplace and analytics support for #13. */
export class CreateAgreementTemplateSystem1787000000000 implements MigrationInterface {
  name = 'CreateAgreementTemplateSystem1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "template_usages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "template_id" uuid NOT NULL,
        "template_version" integer NOT NULL DEFAULT 1,
        "user_id" uuid,
        "agreement_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_template_usages_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_template_usages_template" ON "template_usages" ("template_id")`,
    );

    const columns: Array<[string, string]> = [
      ['slug', `character varying NOT NULL DEFAULT 'legacy'`],
      ['language', `character varying NOT NULL DEFAULT 'en'`],
      ['category', `character varying NOT NULL DEFAULT 'rental'`],
      ['version', `integer NOT NULL DEFAULT 1`],
      ['status', `character varying NOT NULL DEFAULT 'DRAFT'`],
      ['is_public', `boolean NOT NULL DEFAULT false`],
      ['usage_count', `integer NOT NULL DEFAULT 0`],
      ['approved_by', `uuid`],
      ['approved_at', `TIMESTAMP`],
      ['rejection_reason', `text`],
      ['tags', `jsonb NOT NULL DEFAULT '[]'::jsonb`],
    ];

    for (const [column, definition] of columns) {
      await queryRunner.query(
        `ALTER TABLE "agreement_templates" ADD COLUMN IF NOT EXISTS "${column}" ${definition}`,
      );
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agreement_templates_slug_version" ON "agreement_templates" ("slug", "version")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_agreement_templates_status_language" ON "agreement_templates" ("status", "language")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_agreement_templates_status_language"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_agreement_templates_slug_version"`,
    );
    for (const column of [
      'slug',
      'language',
      'category',
      'version',
      'status',
      'is_public',
      'usage_count',
      'approved_by',
      'approved_at',
      'rejection_reason',
      'tags',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "agreement_templates" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(`DROP TABLE IF EXISTS "template_usages"`);
  }
}
