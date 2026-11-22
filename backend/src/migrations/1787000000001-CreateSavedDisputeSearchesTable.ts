import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateSavedDisputeSearchesTable1787000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'saved_dispute_searches',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'name', type: 'varchar', length: '120' },
          { name: 'filters', type: 'jsonb' },
          { name: 'created_at', type: 'timestamptz', default: 'now()' },
          { name: 'updated_at', type: 'timestamptz', default: 'now()' },
        ],
      }),
      true,
    );
    await queryRunner.createIndex(
      'saved_dispute_searches',
      new TableIndex({ name: 'IDX_saved_dispute_searches_user_id', columnNames: ['user_id'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('saved_dispute_searches');
  }
}
