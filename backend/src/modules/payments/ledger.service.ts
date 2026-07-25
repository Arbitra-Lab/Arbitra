import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import {
  LedgerDirection,
  LedgerEntry,
  LedgerOperation,
  LedgerOperationType,
} from './entities/ledger-entry.entity';
import { roundMoney } from './payment.helpers';

export interface LedgerLineInput {
  accountId: string;
  direction: LedgerDirection;
  amount: number;
  description?: string;
}

export interface RecordLedgerOperationParams {
  operationType: LedgerOperationType;
  paymentId?: string | null;
  currency: string;
  idempotencyKey?: string | null;
  lines: LedgerLineInput[];
}

export interface RecordLedgerOperationResult {
  entries: LedgerEntry[];
  /** true when an operation with this idempotencyKey already existed and no new rows were written. */
  replay: boolean;
}

export interface AccountBalance {
  accountId: string;
  debits: number;
  credits: number;
  balance: number;
}

export interface ReconciliationReport {
  balanced: boolean;
  global: {
    totalDebits: number;
    totalCredits: number;
    drift: number;
    balanced: boolean;
  };
  accounts: AccountBalance[];
  unbalancedOperations: Array<{
    operationId: string;
    totalDebits: number;
    totalCredits: number;
    drift: number;
  }>;
}

const UNIQUE_VIOLATION_MESSAGE = /unique constraint|UNIQUE constraint failed/i;

@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerOperation)
    private readonly operationRepository: Repository<LedgerOperation>,
    @InjectRepository(LedgerEntry)
    private readonly entryRepository: Repository<LedgerEntry>,
  ) {}

  /**
   * Persists a balanced set of debit/credit lines as one LedgerOperation +
   * its LedgerEntry rows, using the caller's transactional EntityManager so
   * the ledger write lands in the same DB transaction as the payment mutation
   * it accompanies. Idempotent on `idempotencyKey`: a retry with the same key
   * returns the entries already written instead of creating duplicates.
   */
  async recordOperation(
    manager: EntityManager,
    params: RecordLedgerOperationParams,
  ): Promise<RecordLedgerOperationResult> {
    if (params.idempotencyKey) {
      const existing = await manager.findOne(LedgerOperation, {
        where: { idempotencyKey: params.idempotencyKey },
      });
      if (existing) {
        const entries = await manager.find(LedgerEntry, {
          where: { operationId: existing.id },
        });
        return { entries, replay: true };
      }
    }

    this.assertBalanced(params.lines);

    const operation = manager.create(LedgerOperation, {
      operationType: params.operationType,
      paymentId: params.paymentId ?? null,
      idempotencyKey: params.idempotencyKey ?? null,
      currency: params.currency,
    });

    let savedOperation: LedgerOperation;
    try {
      savedOperation = await manager.save(LedgerOperation, operation);
    } catch (error) {
      if (params.idempotencyKey && this.isUniqueViolation(error)) {
        const existing = await manager.findOneOrFail(LedgerOperation, {
          where: { idempotencyKey: params.idempotencyKey },
        });
        const entries = await manager.find(LedgerEntry, {
          where: { operationId: existing.id },
        });
        return { entries, replay: true };
      }
      throw error;
    }

    const entries = params.lines.map((line) =>
      manager.create(LedgerEntry, {
        operationId: savedOperation.id,
        paymentId: params.paymentId ?? null,
        accountId: line.accountId,
        direction: line.direction,
        amount: roundMoney(line.amount),
        currency: params.currency,
        operationType: params.operationType,
        description: line.description ?? null,
      }),
    );

    const saved = await manager.save(LedgerEntry, entries);
    return { entries: saved, replay: false };
  }

  private assertBalanced(lines: LedgerLineInput[]): void {
    if (lines.length === 0) {
      throw new UnprocessableEntityException(
        'Ledger operation must contain at least one line',
      );
    }
    if (lines.some((line) => !(line.amount > 0))) {
      throw new UnprocessableEntityException(
        'Ledger line amounts must be positive',
      );
    }

    const totalDebits = roundMoney(
      lines
        .filter((line) => line.direction === LedgerDirection.DEBIT)
        .reduce((sum, line) => sum + line.amount, 0),
    );
    const totalCredits = roundMoney(
      lines
        .filter((line) => line.direction === LedgerDirection.CREDIT)
        .reduce((sum, line) => sum + line.amount, 0),
    );

    if (Math.abs(totalDebits - totalCredits) > 0.005) {
      throw new UnprocessableEntityException(
        `Unbalanced ledger operation: debits=${totalDebits} credits=${totalCredits}`,
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    const err = error as {
      code?: string;
      driverError?: { code?: string };
      message?: string;
    };
    return (
      err?.code === '23505' ||
      err?.driverError?.code === '23505' ||
      (typeof err?.message === 'string' &&
        UNIQUE_VIOLATION_MESSAGE.test(err.message))
    );
  }

  async getAccountBalance(accountId: string): Promise<AccountBalance> {
    const rows = await this.entryRepository
      .createQueryBuilder('entry')
      .select('entry.direction', 'direction')
      .addSelect('SUM(entry.amount)', 'total')
      .where('entry.accountId = :accountId', { accountId })
      .groupBy('entry.direction')
      .getRawMany<{ direction: LedgerDirection; total: string }>();

    return this.toAccountBalance(accountId, rows);
  }

  /** Total refunded for a payment, derived purely from the ledger's refund debit lines. */
  async getPaymentNetRefunded(paymentId: string): Promise<number> {
    const rows = await this.entryRepository
      .createQueryBuilder('entry')
      .select('SUM(entry.amount)', 'total')
      .where('entry.paymentId = :paymentId', { paymentId })
      .andWhere('entry.operationType = :operationType', {
        operationType: LedgerOperationType.REFUND,
      })
      .andWhere('entry.direction = :direction', {
        direction: LedgerDirection.DEBIT,
      })
      .getRawOne<{ total: string | null }>();

    return roundMoney(Number(rows?.total ?? 0));
  }

  /**
   * Recomputes balances directly from the append-only ledger_entries table —
   * proving (not merely asserting) that the global books net to zero, and
   * flagging any operation whose posted lines don't balance.
   */
  async reconcile(): Promise<ReconciliationReport> {
    const accountRows = await this.entryRepository
      .createQueryBuilder('entry')
      .select('entry.accountId', 'accountId')
      .addSelect('entry.direction', 'direction')
      .addSelect('SUM(entry.amount)', 'total')
      .groupBy('entry.accountId')
      .addGroupBy('entry.direction')
      .getRawMany<{
        accountId: string;
        direction: LedgerDirection;
        total: string;
      }>();

    const byAccount = new Map<string, { debits: number; credits: number }>();
    for (const row of accountRows) {
      const bucket = byAccount.get(row.accountId) ?? { debits: 0, credits: 0 };
      if (row.direction === LedgerDirection.DEBIT) {
        bucket.debits = roundMoney(bucket.debits + Number(row.total));
      } else {
        bucket.credits = roundMoney(bucket.credits + Number(row.total));
      }
      byAccount.set(row.accountId, bucket);
    }

    const accounts: AccountBalance[] = [...byAccount.entries()].map(
      ([accountId, { debits, credits }]) => ({
        accountId,
        debits,
        credits,
        balance: roundMoney(debits - credits),
      }),
    );

    const totalDebits = roundMoney(
      accounts.reduce((sum, account) => sum + account.debits, 0),
    );
    const totalCredits = roundMoney(
      accounts.reduce((sum, account) => sum + account.credits, 0),
    );
    const drift = roundMoney(totalDebits - totalCredits);

    const operationRows = await this.entryRepository
      .createQueryBuilder('entry')
      .select('entry.operationId', 'operationId')
      .addSelect('entry.direction', 'direction')
      .addSelect('SUM(entry.amount)', 'total')
      .groupBy('entry.operationId')
      .addGroupBy('entry.direction')
      .getRawMany<{
        operationId: string;
        direction: LedgerDirection;
        total: string;
      }>();

    const byOperation = new Map<string, { debits: number; credits: number }>();
    for (const row of operationRows) {
      const bucket = byOperation.get(row.operationId) ?? {
        debits: 0,
        credits: 0,
      };
      if (row.direction === LedgerDirection.DEBIT) {
        bucket.debits = roundMoney(bucket.debits + Number(row.total));
      } else {
        bucket.credits = roundMoney(bucket.credits + Number(row.total));
      }
      byOperation.set(row.operationId, bucket);
    }

    const unbalancedOperations = [...byOperation.entries()]
      .map(([operationId, { debits, credits }]) => ({
        operationId,
        totalDebits: debits,
        totalCredits: credits,
        drift: roundMoney(debits - credits),
      }))
      .filter((entry) => Math.abs(entry.drift) > 0.005);

    return {
      balanced: drift === 0 && unbalancedOperations.length === 0,
      global: {
        totalDebits,
        totalCredits,
        drift,
        balanced: drift === 0,
      },
      accounts,
      unbalancedOperations,
    };
  }

  private toAccountBalance(
    accountId: string,
    rows: Array<{ direction: LedgerDirection; total: string }>,
  ): AccountBalance {
    let debits = 0;
    let credits = 0;
    for (const row of rows) {
      if (row.direction === LedgerDirection.DEBIT) {
        debits = roundMoney(debits + Number(row.total));
      } else {
        credits = roundMoney(credits + Number(row.total));
      }
    }
    return {
      accountId,
      debits,
      credits,
      balance: roundMoney(debits - credits),
    };
  }
}
