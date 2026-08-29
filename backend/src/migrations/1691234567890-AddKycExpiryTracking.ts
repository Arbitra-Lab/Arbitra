import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddKycExpiryTracking1691234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'kyc',
      new TableColumn({
        name: 'expires_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Date when KYC verification expires',
      }),
    );

    await queryRunner.addColumn(
      'kyc',
      new TableColumn({
        name: 'is_expired',
        type: 'boolean',
        default: false,
        comment: 'Whether KYC verification has expired',
      }),
    );

    await queryRunner.addColumn(
      'kyc',
      new TableColumn({
        name: 'last_reminder_sent_at',
        type: 'timestamp',
        isNullable: true,
        comment: 'Last time expiry reminder was sent to user',
      }),
    );

    await queryRunner.addColumn(
      'kyc',
      new TableColumn({
        name: 'needs_re_verification',
        type: 'boolean',
        default: false,
        comment: 'Whether KYC re-verification is required',
      }),
    );

    // Create index on expires_at for efficient expiry queries
    await queryRunner.query(
      `CREATE INDEX idx_kyc_expires_at ON kyc(expires_at) WHERE is_expired = false`,
    );

    // Create index on needs_re_verification for querying records needing action
    await queryRunner.query(
      `CREATE INDEX idx_kyc_needs_re_verification ON kyc(needs_re_verification)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_kyc_expires_at`);
    await queryRunner.query(`DROP INDEX idx_kyc_needs_re_verification`);

    await queryRunner.dropColumn('kyc', 'needs_re_verification');
    await queryRunner.dropColumn('kyc', 'last_reminder_sent_at');
    await queryRunner.dropColumn('kyc', 'is_expired');
    await queryRunner.dropColumn('kyc', 'expires_at');
  }
}
