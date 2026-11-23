import {
  runConsistencyChecks,
  type ConsistencyDataSource,
} from './consistency-checker';

type MockOptions = {
  initializeError?: Error;
  destroyError?: Error;
  migrationResult?: unknown;
  migrationError?: Error;
  foreignKeyResult?: unknown;
  orphanResult?: unknown;
  indexResult?: unknown;
  indexError?: Error;
  paymentAgreementResult?: unknown;
  paymentAgreementError?: Error;
  paymentAmountResult?: unknown;
  paymentAmountError?: Error;
  contractTotalResult?: unknown;
  contractTotalError?: Error;
};

const indexes = [
  {
    table_name: 'rent_agreements',
    is_unique: true,
    is_valid: true,
    is_ready: true,
    is_live: true,
    columns: ['agreement_number'],
    predicate: null,
  },
  {
    table_name: 'payments',
    is_unique: true,
    is_valid: true,
    is_ready: true,
    is_live: true,
    columns: ['user_id', 'idempotency_key'],
    predicate: '(idempotency_key IS NOT NULL)',
  },
];

function createDataSource(options: MockOptions = {}) {
  const dataSource: ConsistencyDataSource & {
    initialize: jest.Mock;
    destroy: jest.Mock;
    query: jest.Mock;
  } = {
    initialize: jest.fn(async () => {
      if (options.initializeError) throw options.initializeError;
    }),
    destroy: jest.fn(async () => {
      if (options.destroyError) throw options.destroyError;
    }),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.tables')) return [{ '?column?': 1 }];
      if (sql.includes('"migrations"')) {
        if (options.migrationError) throw options.migrationError;
        return options.migrationResult ?? [{ count: '3' }];
      }
      if (sql.includes('pg_constraint AS constraint_info')) {
        return options.foreignKeyResult ?? [{ validated: true }];
      }
      if (sql.includes('AS child')) {
        return options.orphanResult ?? [{ count: '0' }];
      }
      if (sql.includes('FROM pg_index AS index_info')) {
        if (options.indexError) throw options.indexError;
        return options.indexResult ?? indexes;
      }
      if (sql.includes('IS DISTINCT FROM')) {
        if (options.paymentAgreementError) throw options.paymentAgreementError;
        return options.paymentAgreementResult ?? [{ count: '0' }];
      }
      if (sql.includes('WHERE amount <= 0')) {
        if (options.paymentAmountError) throw options.paymentAmountError;
        return options.paymentAmountResult ?? [{ count: '0' }];
      }
      if (sql.includes('WITH settled_payment_totals')) {
        if (options.contractTotalError) throw options.contractTotalError;
        return (
          options.contractTotalResult ?? [
            { over_limit_count: '0', unknown_term_count: '0' },
          ]
        );
      }
      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
  return dataSource;
}

describe('runConsistencyChecks', () => {
  it('checks required tables, foreign keys, unique indexes, and payment invariants', async () => {
    const dataSource = createDataSource();

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(true);
    expect(result.checks.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'table_exists_payments',
        'migrations_applied',
        'foreign_key_payments_user_id',
        'foreign_key_payments_agreement_id',
        'foreign_key_payments_payment_method_id',
        'unique_index_rent_agreements_agreement_number',
        'unique_index_payments_user_id_idempotency_key',
        'payment_agreement_user_consistency',
        'payment_amounts_positive',
        'payment_agreement_contract_total',
      ]),
    );
    expect(dataSource.initialize).toHaveBeenCalledTimes(1);
    expect(dataSource.destroy).toHaveBeenCalledTimes(1);
  });

  it('fails and reports a missing foreign key', async () => {
    const dataSource = createDataSource({
      foreignKeyResult: [],
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(
      result.checks.find(({ name }) => name === 'foreign_key_payments_user_id'),
    ).toMatchObject({
      passed: false,
      detail: expect.stringContaining('Missing foreign key'),
    });
  });

  it('fails when a validated foreign key has orphaned records', async () => {
    const dataSource = createDataSource({
      orphanResult: [{ count: '2' }],
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(
      result.checks.find(({ name }) => name === 'foreign_key_payments_user_id'),
    ).toMatchObject({
      passed: false,
      detail: 'Found 2 orphan row(s)',
    });
  });

  it('surfaces migration query errors instead of treating them as zero migrations', async () => {
    const dataSource = createDataSource({
      migrationError: new Error('migration table unavailable'),
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual({
      name: 'migrations_applied',
      passed: false,
      detail: 'migration table unavailable',
    });
  });

  it('fails when a required unique index is absent or invalid', async () => {
    const dataSource = createDataSource({
      indexResult: [indexes[0], { ...indexes[1], is_valid: false }],
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'unique_index_payments_user_id_idempotency_key',
        passed: false,
      }),
    );
  });

  it('fails payment-agreement invariant violations', async () => {
    const dataSource = createDataSource({
      paymentAgreementResult: [{ count: '1' }],
      paymentAmountResult: [{ count: '2' }],
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_agreement_user_consistency',
        passed: false,
        detail: expect.stringContaining('1 payment(s)'),
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_amounts_positive',
        passed: false,
        detail: expect.stringContaining('2 payment(s)'),
      }),
    );
  });

  it('fails when settled agreement payments exceed the contract total', async () => {
    const dataSource = createDataSource({
      contractTotalResult: [{ over_limit_count: '1', unknown_term_count: '0' }],
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_agreement_contract_total',
        passed: false,
        detail: expect.stringContaining(
          '1 agreement(s) over the contract total',
        ),
      }),
    );
  });

  it('surfaces payment invariant and unique-index query failures', async () => {
    const dataSource = createDataSource({
      indexError: new Error('index catalog unavailable'),
      paymentAgreementError: new Error('agreement query unavailable'),
      paymentAmountError: new Error('amount query unavailable'),
      contractTotalError: new Error('contract-total query unavailable'),
    });

    const result = await runConsistencyChecks(dataSource);

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'unique_index_payments_user_id_idempotency_key',
        passed: false,
        detail: 'index catalog unavailable',
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_agreement_user_consistency',
        passed: false,
        detail: 'agreement query unavailable',
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_amounts_positive',
        passed: false,
        detail: 'amount query unavailable',
      }),
    );
    expect(result.checks).toContainEqual(
      expect.objectContaining({
        name: 'payment_agreement_contract_total',
        passed: false,
        detail: 'contract-total query unavailable',
      }),
    );
  });

  it('reports initialization and cleanup failures', async () => {
    const initializeFailure = createDataSource({
      initializeError: new Error('connection refused'),
    });
    const initResult = await runConsistencyChecks(initializeFailure);
    expect(initResult).toMatchObject({
      ok: false,
      error: 'DataSource init failed: connection refused',
    });
    expect(initializeFailure.destroy).not.toHaveBeenCalled();

    const destroyFailure = createDataSource({
      destroyError: new Error('close failed'),
    });
    const destroyResult = await runConsistencyChecks(destroyFailure);
    expect(destroyResult.ok).toBe(false);
    expect(destroyResult.checks).toContainEqual({
      name: 'datasource_destroy',
      passed: false,
      detail: 'close failed',
    });
  });
});
