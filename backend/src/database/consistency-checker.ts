/**
 * Data consistency checker: verify database integrity after migrations or periodically.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register src/database/consistency-checker.ts
 */

import { AppDataSource } from './data-source';

/** Critical tables that must exist after migrations. */
const CRITICAL_TABLES = [
  'migrations',
  'users',
  'properties',
  'rent_agreements',
  'payments',
];

const REQUIRED_FOREIGN_KEYS = [
  {
    name: 'payments_user_id',
    table: 'payments',
    column: 'user_id',
    referencedTable: 'users',
    referencedColumn: 'id',
  },
  {
    name: 'payments_agreement_id',
    table: 'payments',
    column: 'agreement_id',
    referencedTable: 'rent_agreements',
    referencedColumn: 'id',
  },
  {
    name: 'payments_payment_method_id',
    table: 'payments',
    column: 'payment_method_id',
    referencedTable: 'payment_methods',
    referencedColumn: 'id',
  },
] as const;

const REQUIRED_UNIQUE_INDEXES = [
  {
    name: 'rent_agreements_agreement_number',
    table: 'rent_agreements',
    columns: ['agreement_number'],
    predicate: null,
  },
  {
    name: 'payments_user_id_idempotency_key',
    table: 'payments',
    columns: ['user_id', 'idempotency_key'],
    predicate: 'idempotency_key IS NOT NULL',
  },
] as const;

export interface ConsistencyResult {
  ok: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
  error?: string;
}

/** Minimal interface allows the checker to run against a mock in tests. */
export interface ConsistencyDataSource {
  initialize(): Promise<unknown>;
  destroy(): Promise<unknown>;
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

type QueryRow = Record<string, unknown>;

function rowsFrom(result: unknown): QueryRow[] {
  return Array.isArray(result) ? (result as QueryRow[]) : [];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizedPredicate(predicate: unknown): string | null {
  if (typeof predicate !== 'string') return null;
  return predicate
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/[()\s]/g, '');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Run all consistency checks. Individual database failures are returned as
 * failed checks rather than being converted into successful default values.
 * The schema argument is intended for isolated test schemas; production CLI
 * usage continues to check the public schema.
 */
export async function runConsistencyChecks(
  dataSource: ConsistencyDataSource = AppDataSource,
  schema = 'public',
): Promise<ConsistencyResult> {
  const checks: ConsistencyResult['checks'] = [];
  const quotedSchema = quoteIdentifier(schema);
  const addCheck = (name: string, passed: boolean, detail?: string): void => {
    checks.push({ name, passed, ...(detail ? { detail } : {}) });
  };

  try {
    await dataSource.initialize();
  } catch (error) {
    return {
      ok: false,
      checks,
      error: `DataSource init failed: ${errorMessage(error)}`,
    };
  }

  try {
    for (const table of CRITICAL_TABLES) {
      try {
        const result = await dataSource.query(
          `SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = $2`,
          [schema, table],
        );
        const exists = rowsFrom(result).length > 0;
        addCheck(
          `table_exists_${table}`,
          exists,
          exists ? undefined : `Table ${table} not found`,
        );
      } catch (error) {
        addCheck(`table_exists_${table}`, false, errorMessage(error));
      }
    }

    try {
      const result = await dataSource.query(
        `SELECT COUNT(1)::text AS count FROM ${quotedSchema}."migrations"`,
      );
      const count = Number(rowsFrom(result)[0]?.count);
      const validCount = Number.isSafeInteger(count) && count > 0;
      addCheck(
        'migrations_applied',
        validCount,
        validCount
          ? `${count} migration(s) recorded`
          : `Invalid migration count: ${String(rowsFrom(result)[0]?.count)}`,
      );
    } catch (error) {
      addCheck('migrations_applied', false, errorMessage(error));
    }

    for (const foreignKey of REQUIRED_FOREIGN_KEYS) {
      const checkName = `foreign_key_${foreignKey.name}`;
      try {
        const result = await dataSource.query(
          `SELECT constraint_info.convalidated AS validated
           FROM pg_constraint AS constraint_info
           JOIN pg_class AS source_table
             ON source_table.oid = constraint_info.conrelid
           JOIN pg_namespace AS source_schema
             ON source_schema.oid = source_table.relnamespace
           JOIN pg_class AS target_table
             ON target_table.oid = constraint_info.confrelid
           JOIN pg_namespace AS target_schema
             ON target_schema.oid = target_table.relnamespace
           JOIN LATERAL unnest(constraint_info.conkey)
             WITH ORDINALITY AS source_key(attnum, position) ON TRUE
           JOIN pg_attribute AS source_column
             ON source_column.attrelid = source_table.oid
            AND source_column.attnum = source_key.attnum
           JOIN LATERAL unnest(constraint_info.confkey)
             WITH ORDINALITY AS target_key(attnum, position)
             ON target_key.position = source_key.position
           JOIN pg_attribute AS target_column
             ON target_column.attrelid = target_table.oid
            AND target_column.attnum = target_key.attnum
           WHERE constraint_info.contype = 'f'
             AND source_schema.nspname = $1
             AND target_schema.nspname = $1
             AND source_table.relname = $2
             AND source_column.attname = $3
             AND target_table.relname = $4
             AND target_column.attname = $5
             AND cardinality(constraint_info.conkey) = 1`,
          [
            schema,
            foreignKey.table,
            foreignKey.column,
            foreignKey.referencedTable,
            foreignKey.referencedColumn,
          ],
        );
        const constraintRows = rowsFrom(result);
        const validated = constraintRows.some((row) => row.validated === true);
        if (!validated) {
          addCheck(
            checkName,
            false,
            constraintRows.length
              ? 'Foreign key exists but is not validated'
              : `Missing foreign key: ${foreignKey.table}.${foreignKey.column} -> ${foreignKey.referencedTable}.${foreignKey.referencedColumn}`,
          );
          continue;
        }

        const orphans = await dataSource.query(
          `SELECT COUNT(*)::text AS count
           FROM ${quotedSchema}."${foreignKey.table}" AS child
           LEFT JOIN ${quotedSchema}."${foreignKey.referencedTable}" AS parent
             ON child."${foreignKey.column}" = parent."${foreignKey.referencedColumn}"
           WHERE child."${foreignKey.column}" IS NOT NULL
             AND parent."${foreignKey.referencedColumn}" IS NULL`,
        );
        const orphanCount = Number(rowsFrom(orphans)[0]?.count);
        const clean = Number.isSafeInteger(orphanCount) && orphanCount === 0;
        addCheck(
          checkName,
          clean,
          clean
            ? undefined
            : `Found ${String(rowsFrom(orphans)[0]?.count)} orphan row(s)`,
        );
      } catch (error) {
        addCheck(checkName, false, errorMessage(error));
      }
    }

    let indexes: QueryRow[] = [];
    let indexesLoaded = false;
    try {
      const result = await dataSource.query(
        `SELECT table_info.relname AS table_name,
                index_info.indisunique AS is_unique,
                index_info.indisvalid AS is_valid,
                index_info.indisready AS is_ready,
                index_info.indislive AS is_live,
                ARRAY(
                  SELECT attribute.attname
                  FROM unnest(index_info.indkey) WITH ORDINALITY AS key(attnum, position)
                  JOIN pg_attribute AS attribute
                    ON attribute.attrelid = table_info.oid
                   AND attribute.attnum = key.attnum
                  WHERE key.position <= index_info.indnkeyatts
                  ORDER BY key.position
                ) AS columns,
                pg_get_expr(index_info.indpred, index_info.indrelid) AS predicate
         FROM pg_index AS index_info
         JOIN pg_class AS table_info ON table_info.oid = index_info.indrelid
         JOIN pg_namespace AS table_schema ON table_schema.oid = table_info.relnamespace
         WHERE table_schema.nspname = $1
           AND table_info.relname IN ('payments', 'rent_agreements')`,
        [schema],
      );
      indexes = rowsFrom(result);
      indexesLoaded = true;
    } catch (error) {
      for (const uniqueIndex of REQUIRED_UNIQUE_INDEXES) {
        addCheck(
          `unique_index_${uniqueIndex.name}`,
          false,
          errorMessage(error),
        );
      }
    }

    if (indexesLoaded) {
      for (const uniqueIndex of REQUIRED_UNIQUE_INDEXES) {
        const found = indexes.some((index) => {
          const columns = Array.isArray(index.columns)
            ? (index.columns as unknown[]).map(String)
            : [];
          const sameColumns =
            columns.length === uniqueIndex.columns.length &&
            columns.every((column, i) => column === uniqueIndex.columns[i]);
          const actualPredicate = normalizedPredicate(index.predicate);
          const expectedPredicate = normalizedPredicate(uniqueIndex.predicate);
          return (
            index.table_name === uniqueIndex.table &&
            index.is_unique === true &&
            index.is_valid === true &&
            index.is_ready === true &&
            index.is_live === true &&
            sameColumns &&
            actualPredicate === expectedPredicate
          );
        });
        addCheck(
          `unique_index_${uniqueIndex.name}`,
          found,
          found
            ? undefined
            : `Missing valid unique index on ${uniqueIndex.table} (${uniqueIndex.columns.join(', ')})${uniqueIndex.predicate ? ` WHERE ${uniqueIndex.predicate}` : ''}`,
        );
      }
    }

    try {
      const result = await dataSource.query(
        `SELECT COUNT(*)::text AS count
         FROM ${quotedSchema}."payments" AS payment
         JOIN ${quotedSchema}."rent_agreements" AS agreement
           ON agreement.id = payment.agreement_id
         WHERE payment.agreement_id IS NOT NULL
           AND agreement.user_id IS NOT NULL
           AND payment.user_id IS DISTINCT FROM agreement.user_id`,
      );
      const mismatchCount = Number(rowsFrom(result)[0]?.count);
      const consistent =
        Number.isSafeInteger(mismatchCount) && mismatchCount === 0;
      addCheck(
        'payment_agreement_user_consistency',
        consistent,
        consistent
          ? undefined
          : `Found ${String(rowsFrom(result)[0]?.count)} payment(s) whose user differs from the agreement user`,
      );
    } catch (error) {
      addCheck(
        'payment_agreement_user_consistency',
        false,
        errorMessage(error),
      );
    }

    try {
      const result = await dataSource.query(
        `SELECT COUNT(*)::text AS count
         FROM ${quotedSchema}."payments"
         WHERE amount <= 0`,
      );
      const invalidCount = Number(rowsFrom(result)[0]?.count);
      const positiveAmounts =
        Number.isSafeInteger(invalidCount) && invalidCount === 0;
      addCheck(
        'payment_amounts_positive',
        positiveAmounts,
        positiveAmounts
          ? undefined
          : `Found ${String(rowsFrom(result)[0]?.count)} payment(s) with a non-positive amount`,
      );
    } catch (error) {
      addCheck('payment_amounts_positive', false, errorMessage(error));
    }

    try {
      const result = await dataSource.query(
        `WITH settled_payment_totals AS (
           SELECT payment.agreement_id,
                  SUM(
                    CASE
                      WHEN LOWER(payment.status) = 'refunded' THEN 0
                      ELSE GREATEST(
                        payment.amount - COALESCE(payment.refund_amount, 0),
                        0
                      )
                    END
                  ) AS paid_total
           FROM ${quotedSchema}."payments" AS payment
           WHERE payment.agreement_id IS NOT NULL
             AND LOWER(payment.status) IN (
               'completed', 'partial_refund', 'refunded', 'verified'
             )
           GROUP BY payment.agreement_id
         ),
         agreement_payment_limits AS (
           SELECT agreement.id,
                  totals.paid_total,
                  agreement.start_date,
                  agreement.end_date,
                  COALESCE(agreement.security_deposit, 0)
                    + COALESCE(agreement.monthly_rent, 0)
                      * (
                        (
                          EXTRACT(YEAR FROM agreement.end_date)
                          - EXTRACT(YEAR FROM agreement.start_date)
                        ) * 12
                        + EXTRACT(MONTH FROM agreement.end_date)
                        - EXTRACT(MONTH FROM agreement.start_date)
                        + 1
                      )
                    + CASE
                        WHEN LOWER(agreement.status) = 'terminated'
                          THEN COALESCE(agreement.early_termination_fee, 0)
                        ELSE 0
                      END AS payment_limit
           FROM ${quotedSchema}."rent_agreements" AS agreement
           JOIN settled_payment_totals AS totals
             ON totals.agreement_id = agreement.id
         )
         SELECT COUNT(*) FILTER (
                  WHERE start_date IS NOT NULL
                    AND end_date IS NOT NULL
                    AND paid_total > payment_limit
                )::text AS over_limit_count,
                COUNT(*) FILTER (
                  WHERE start_date IS NULL OR end_date IS NULL
                )::text AS unknown_term_count
         FROM agreement_payment_limits`,
      );
      const counts = rowsFrom(result)[0] ?? {};
      const overLimitCount = Number(counts.over_limit_count);
      const unknownTermCount = Number(counts.unknown_term_count);
      const withinLimit =
        Number.isSafeInteger(overLimitCount) &&
        overLimitCount === 0 &&
        Number.isSafeInteger(unknownTermCount) &&
        unknownTermCount === 0;
      addCheck(
        'payment_agreement_contract_total',
        withinLimit,
        withinLimit
          ? undefined
          : `Found ${String(counts.over_limit_count)} agreement(s) over the contract total and ${String(counts.unknown_term_count)} with settled payments but unknown lease dates`,
      );
    } catch (error) {
      addCheck('payment_agreement_contract_total', false, errorMessage(error));
    }
  } finally {
    try {
      await dataSource.destroy();
    } catch (error) {
      addCheck('datasource_destroy', false, errorMessage(error));
    }
  }

  return { ok: checks.every((check) => check.passed), checks };
}

async function main(): Promise<void> {
  const result = await runConsistencyChecks();
  for (const check of result.checks) {
    console.log(
      `${check.passed ? '✓' : '✗'} ${check.name}${check.detail ? `: ${check.detail}` : ''}`,
    );
  }
  if (result.error) console.error(result.error);
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  void main();
}
