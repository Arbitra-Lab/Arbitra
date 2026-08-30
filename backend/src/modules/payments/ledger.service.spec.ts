import { DataSource } from 'typeorm';
import { UnprocessableEntityException } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import {
  LedgerDirection,
  LedgerEntry,
  LedgerOperation,
  LedgerOperationType,
} from './entities/ledger-entry.entity';

/**
 * Exercises LedgerService against a real (in-memory sqlite) TypeORM
 * connection rather than mocked repositories — the balancing/idempotency
 * invariants live in SQL-backed query logic (grouping, unique constraints)
 * that a repository mock can't meaningfully verify.
 */
describe('LedgerService', () => {
  let dataSource: DataSource;
  let service: LedgerService;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [LedgerOperation, LedgerEntry],
      synchronize: true,
      dropSchema: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.getRepository(LedgerEntry).clear();
    await dataSource.getRepository(LedgerOperation).clear();
    service = new LedgerService(
      dataSource.getRepository(LedgerOperation),
      dataSource.getRepository(LedgerEntry),
    );
  });

  describe('recordOperation — balancing invariants', () => {
    it('persists a balanced capture as matching debit/credit rows in one operation', async () => {
      const result = await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.CAPTURE,
          paymentId: 'pay-1',
          currency: 'NGN',
          idempotencyKey: 'capture:pay-1',
          lines: [
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.DEBIT,
              amount: 100,
            },
            {
              accountId: 'customer:user-1',
              direction: LedgerDirection.CREDIT,
              amount: 98,
            },
            {
              accountId: 'fees:revenue',
              direction: LedgerDirection.CREDIT,
              amount: 2,
            },
          ],
        }),
      );

      expect(result.replay).toBe(false);
      expect(result.entries).toHaveLength(3);

      const totalDebits = result.entries
        .filter((e) => e.direction === LedgerDirection.DEBIT)
        .reduce((sum, e) => sum + Number(e.amount), 0);
      const totalCredits = result.entries
        .filter((e) => e.direction === LedgerDirection.CREDIT)
        .reduce((sum, e) => sum + Number(e.amount), 0);
      expect(totalDebits).toBe(totalCredits);

      const allRows = await dataSource.getRepository(LedgerEntry).find();
      expect(allRows).toHaveLength(3);
      expect(new Set(allRows.map((r) => r.operationId)).size).toBe(1);
    });

    it('rejects an operation whose lines do not balance', async () => {
      await expect(
        dataSource.transaction((manager) =>
          service.recordOperation(manager, {
            operationType: LedgerOperationType.CAPTURE,
            paymentId: 'pay-2',
            currency: 'NGN',
            lines: [
              {
                accountId: 'gateway:clearing',
                direction: LedgerDirection.DEBIT,
                amount: 100,
              },
              {
                accountId: 'customer:user-2',
                direction: LedgerDirection.CREDIT,
                amount: 90,
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      const rows = await dataSource.getRepository(LedgerEntry).find();
      expect(rows).toHaveLength(0);
    });

    it('rejects non-positive line amounts', async () => {
      await expect(
        dataSource.transaction((manager) =>
          service.recordOperation(manager, {
            operationType: LedgerOperationType.REFUND,
            paymentId: 'pay-3',
            currency: 'NGN',
            lines: [
              {
                accountId: 'customer:user-3',
                direction: LedgerDirection.DEBIT,
                amount: 0,
              },
              {
                accountId: 'gateway:clearing',
                direction: LedgerDirection.CREDIT,
                amount: 0,
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('tolerates sub-cent floating point noise but not real drift', async () => {
      const result = await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.CAPTURE,
          paymentId: 'pay-float',
          currency: 'NGN',
          lines: [
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.DEBIT,
              amount: 0.1 + 0.2, // 0.30000000000000004 in raw float math
            },
            {
              accountId: 'customer:user-float',
              direction: LedgerDirection.CREDIT,
              amount: 0.3,
            },
          ],
        }),
      );

      expect(result.replay).toBe(false);
    });
  });

  describe('recordOperation — idempotency', () => {
    it('replays the original entries instead of duplicating on a retried idempotency key', async () => {
      const params = {
        operationType: LedgerOperationType.CAPTURE,
        paymentId: 'pay-4',
        currency: 'NGN',
        idempotencyKey: 'capture:pay-4',
        lines: [
          {
            accountId: 'gateway:clearing',
            direction: LedgerDirection.DEBIT,
            amount: 50,
          },
          {
            accountId: 'customer:user-4',
            direction: LedgerDirection.CREDIT,
            amount: 50,
          },
        ],
      };

      const first = await dataSource.transaction((manager) =>
        service.recordOperation(manager, params),
      );
      const second = await dataSource.transaction((manager) =>
        service.recordOperation(manager, params),
      );

      expect(first.replay).toBe(false);
      expect(second.replay).toBe(true);
      expect(second.entries.map((e) => e.id).sort()).toEqual(
        first.entries.map((e) => e.id).sort(),
      );

      const allRows = await dataSource.getRepository(LedgerEntry).find();
      expect(allRows).toHaveLength(2);
      const allOps = await dataSource.getRepository(LedgerOperation).find();
      expect(allOps).toHaveLength(1);
    });

    it('rejects a second, different operation reusing the same idempotency key at the DB level', async () => {
      const idempotencyKey = 'refund:pay-5';
      await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.REFUND,
          paymentId: 'pay-5',
          currency: 'NGN',
          idempotencyKey,
          lines: [
            {
              accountId: 'customer:user-5',
              direction: LedgerDirection.DEBIT,
              amount: 10,
            },
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.CREDIT,
              amount: 10,
            },
          ],
        }),
      );

      // A raw insert reusing the same idempotency key (bypassing the
      // service's own lookup) proves the DB-level unique constraint is the
      // backstop, not just the application-level check.
      await expect(
        dataSource.getRepository(LedgerOperation).insert({
          operationType: LedgerOperationType.REFUND,
          paymentId: 'pay-5',
          currency: 'NGN',
          idempotencyKey,
        }),
      ).rejects.toThrow();

      const allOps = await dataSource.getRepository(LedgerOperation).find();
      expect(allOps).toHaveLength(1);
    });
  });

  describe('getAccountBalance / getPaymentNetRefunded', () => {
    it('computes a per-account balance from posted entries', async () => {
      await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.CAPTURE,
          paymentId: 'pay-6',
          currency: 'NGN',
          lines: [
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.DEBIT,
              amount: 200,
            },
            {
              accountId: 'customer:user-6',
              direction: LedgerDirection.CREDIT,
              amount: 200,
            },
          ],
        }),
      );

      const balance = await service.getAccountBalance('customer:user-6');
      expect(balance.credits).toBe(200);
      expect(balance.debits).toBe(0);
      expect(balance.balance).toBe(-200);
    });

    it('nets captures against refunds for a payment', async () => {
      await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.REFUND,
          paymentId: 'pay-7',
          currency: 'NGN',
          lines: [
            {
              accountId: 'customer:user-7',
              direction: LedgerDirection.DEBIT,
              amount: 30,
            },
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.CREDIT,
              amount: 30,
            },
          ],
        }),
      );

      const refunded = await service.getPaymentNetRefunded('pay-7');
      expect(refunded).toBe(30);
    });
  });

  describe('reconcile — global and per-operation proof', () => {
    it('reports a balanced ledger with zero global drift after several operations', async () => {
      await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.CAPTURE,
          paymentId: 'pay-8',
          currency: 'NGN',
          lines: [
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.DEBIT,
              amount: 100,
            },
            {
              accountId: 'customer:user-8',
              direction: LedgerDirection.CREDIT,
              amount: 98,
            },
            {
              accountId: 'fees:revenue',
              direction: LedgerDirection.CREDIT,
              amount: 2,
            },
          ],
        }),
      );
      await dataSource.transaction((manager) =>
        service.recordOperation(manager, {
          operationType: LedgerOperationType.REFUND,
          paymentId: 'pay-8',
          currency: 'NGN',
          lines: [
            {
              accountId: 'customer:user-8',
              direction: LedgerDirection.DEBIT,
              amount: 40,
            },
            {
              accountId: 'gateway:clearing',
              direction: LedgerDirection.CREDIT,
              amount: 40,
            },
          ],
        }),
      );

      const report = await service.reconcile();

      expect(report.global.totalDebits).toBe(report.global.totalCredits);
      expect(report.global.drift).toBe(0);
      expect(report.global.balanced).toBe(true);
      expect(report.unbalancedOperations).toEqual([]);
      expect(report.balanced).toBe(true);

      const customerAccount = report.accounts.find(
        (a) => a.accountId === 'customer:user-8',
      );
      // captured 98 credited, then 40 debited back out on refund
      expect(customerAccount?.balance).toBe(-58);
    });

    it('flags an operation whose entries were written unbalanced outside recordOperation', async () => {
      // Bypass the guarded API to simulate a bug/legacy write reaching the
      // table directly, and confirm reconcile() catches the drift.
      await dataSource.transaction(async (manager) => {
        const op = await manager.save(LedgerOperation, {
          operationType: LedgerOperationType.FEE,
          paymentId: 'pay-9',
          currency: 'NGN',
        });
        await manager.save(LedgerEntry, [
          {
            operationId: op.id,
            paymentId: 'pay-9',
            accountId: 'fees:revenue',
            direction: LedgerDirection.CREDIT,
            amount: 5,
            currency: 'NGN',
            operationType: LedgerOperationType.FEE,
          },
          // Missing the offsetting debit — an unbalanced write.
        ]);
      });

      const report = await service.reconcile();

      expect(report.balanced).toBe(false);
      expect(report.unbalancedOperations).toHaveLength(1);
      expect(report.unbalancedOperations[0].drift).toBe(-5);
    });
  });
});
