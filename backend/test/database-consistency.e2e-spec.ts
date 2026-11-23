import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { runConsistencyChecks } from '../src/database/consistency-checker';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function configuredDatabaseName(): string {
  const options = AppDataSource.options as {
    database?: unknown;
    url?: unknown;
  };
  if (typeof options.database === 'string') return options.database;
  if (typeof options.url === 'string') {
    return decodeURIComponent(
      new URL(options.url).pathname.replace(/^\/+/, ''),
    );
  }
  return '';
}

describe('Database consistency checker (PostgreSQL e2e)', () => {
  const schema = `consistency_e2e_${process.pid}_${Date.now()}`;
  const quotedSchema = quoteIdentifier(schema);
  let setupDataSource: DataSource;
  let schemaCreated = false;

  beforeAll(async () => {
    if (configuredDatabaseName() !== 'arbitra_test') {
      throw new Error(
        'Refusing to create a test schema outside the arbitra_test database',
      );
    }

    setupDataSource = new DataSource({
      ...AppDataSource.options,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });
    await setupDataSource.initialize();
    await setupDataSource.query(`CREATE SCHEMA ${quotedSchema}`);
    schemaCreated = true;

    const schemaTables = [
      `CREATE TABLE ${quotedSchema}."migrations" (
        id SERIAL PRIMARY KEY,
        timestamp bigint NOT NULL,
        name varchar NOT NULL
      )`,
      `CREATE TABLE ${quotedSchema}."users" (
        id uuid PRIMARY KEY
      )`,
      `CREATE TABLE ${quotedSchema}."properties" (
        id uuid PRIMARY KEY
      )`,
      `CREATE TABLE ${quotedSchema}."rent_agreements" (
        id uuid PRIMARY KEY,
        user_id uuid,
        agreement_number varchar UNIQUE,
        monthly_rent numeric(12, 2) NOT NULL,
        security_deposit numeric(12, 2) NOT NULL,
        start_date timestamp,
        end_date timestamp,
        status varchar NOT NULL DEFAULT 'active',
        early_termination_fee numeric(12, 2)
      )`,
      `CREATE TABLE ${quotedSchema}."payment_methods" (
        id serial PRIMARY KEY
      )`,
      `CREATE TABLE ${quotedSchema}."payments" (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES ${quotedSchema}."users"(id),
        agreement_id uuid REFERENCES ${quotedSchema}."rent_agreements"(id),
        payment_method_id integer REFERENCES ${quotedSchema}."payment_methods"(id),
        amount numeric(12, 2) NOT NULL,
        refund_amount numeric(12, 2) NOT NULL DEFAULT 0,
        status varchar NOT NULL DEFAULT 'completed',
        idempotency_key varchar
      )`,
      `CREATE UNIQUE INDEX "uq_payments_user_id_idempotency_key"
        ON ${quotedSchema}."payments" (user_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL`,
    ];
    for (const statement of schemaTables) {
      await setupDataSource.query(statement);
    }

    await setupDataSource.query(
      `INSERT INTO ${quotedSchema}."migrations" (timestamp, name)
       VALUES (1, 'e2e-consistency-schema')`,
    );
    await setupDataSource.query(
      `INSERT INTO ${quotedSchema}."users" (id)
       VALUES ('00000000-0000-4000-8000-000000000001')`,
    );
    await setupDataSource.query(
      `INSERT INTO ${quotedSchema}."rent_agreements"
         (id, user_id, agreement_number, monthly_rent, security_deposit, start_date, end_date)
       VALUES (
         '00000000-0000-4000-8000-000000000002',
         '00000000-0000-4000-8000-000000000001',
         'E2E-CONSISTENCY-1',
         100,
         100,
         '2026-01-15',
         '2026-03-15'
       )`,
    );
    await setupDataSource.query(
      `INSERT INTO ${quotedSchema}."payments"
         (id, user_id, agreement_id, amount, idempotency_key)
       VALUES
         (
           '00000000-0000-4000-8000-000000000003',
           '00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000002',
           100,
           'e2e-payment-1'
         ),
         (
           '00000000-0000-4000-8000-000000000004',
           '00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000002',
           100,
           'e2e-payment-2'
         ),
         (
           '00000000-0000-4000-8000-000000000005',
           '00000000-0000-4000-8000-000000000001',
           '00000000-0000-4000-8000-000000000002',
           100,
           'e2e-payment-3'
         )`,
    );
  }, 30000);

  afterAll(async () => {
    if (!setupDataSource?.isInitialized) return;
    try {
      if (schemaCreated) {
        await setupDataSource.query(`DROP SCHEMA ${quotedSchema} CASCADE`);
      }
    } finally {
      await setupDataSource.destroy();
    }
  }, 30000);

  it('checks valid multi-month totals and rejects an over-limit PostgreSQL total', async () => {
    const checkerDataSource = new DataSource({
      ...AppDataSource.options,
      entities: [],
      migrations: [],
      synchronize: false,
      logging: false,
    });

    const result = await runConsistencyChecks(checkerDataSource, schema);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'payment_agreement_contract_total',
          passed: true,
        }),
      ]),
    );

    await setupDataSource.query(
      `INSERT INTO ${quotedSchema}."payments"
         (id, user_id, agreement_id, amount, idempotency_key)
       VALUES (
         '00000000-0000-4000-8000-000000000006',
         '00000000-0000-4000-8000-000000000001',
         '00000000-0000-4000-8000-000000000002',
         101,
         'e2e-payment-over-limit'
       )`,
    );
    const overLimitResult = await runConsistencyChecks(
      new DataSource({
        ...AppDataSource.options,
        entities: [],
        migrations: [],
        synchronize: false,
        logging: false,
      }),
      schema,
    );

    expect(overLimitResult.ok).toBe(false);
    expect(overLimitResult.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_agreement_contract_total',
        passed: false,
        detail: expect.stringContaining(
          '1 agreement(s) over the contract total',
        ),
      }),
    );
  }, 30000);
});
