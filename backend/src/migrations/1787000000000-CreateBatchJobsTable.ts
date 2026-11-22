import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateBatchJobsTable1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "batch_jobs_type_enum" AS ENUM ('USER_IMPORT', 'PROPERTY_IMPORT')`);
    await queryRunner.query(
      `CREATE TYPE "batch_jobs_status_enum" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.createTable(
      new Table({
        name: 'batch_jobs',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'type', type: 'batch_jobs_type_enum' },
          { name: 'status', type: 'batch_jobs_status_enum', default: "'QUEUED'" },
          { name: 'idempotency_key', type: 'varchar', length: '128', isUnique: true },
          { name: 'file_name', type: 'varchar', length: '255' },
          { name: 'total_rows', type: 'int', default: 0 },
          { name: 'processed_rows', type: 'int', default: 0 },
          { name: 'success_count', type: 'int', default: 0 },
          { name: 'failure_count', type: 'int', default: 0 },
          { name: 'errors', type: 'jsonb', default: "'[]'" },
          { name: 'created_by', type: 'uuid', isNullable: true },
          { name: 'started_at', type: 'timestamptz', isNullable: true },
          { name: 'completed_at', type: 'timestamptz', isNullable: true },
          { name: 'result_summary', type: 'jsonb', isNullable: true },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'batch_jobs',
      new TableIndex({ name: 'IDX_batch_jobs_created_by', columnNames: ['created_by'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('batch_jobs');
    await queryRunner.query(`DROP TYPE "batch_jobs_status_enum"`);
    await queryRunner.query(`DROP TYPE "batch_jobs_type_enum"`);
  }
}
