import './setup-env';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { BadRequestException } from '@nestjs/common';
import { PaymentService } from '../src/modules/payments/payment.service';
import { LedgerService } from '../src/modules/payments/ledger.service';
import {
  LedgerEntry,
  LedgerOperation,
} from '../src/modules/payments/entities/ledger-entry.entity';
import {
  Payment,
  PaymentStatus,
} from '../src/modules/payments/entities/payment.entity';
import { PaymentMethod } from '../src/modules/payments/entities/payment-method.entity';

/**
 * End-to-end coverage of the double-entry payment ledger: capture, partial
 * refunds, full-refund exhaustion, the over-refund guard, and idempotent
 * retries — driven through the real PaymentService + LedgerService, with a
 * real (in-memory sqlite) DB backing the ledger tables.
 *
 * Payment/PaymentMethod persistence is backed by an in-memory fake instead
 * of the same sqlite connection: the real `User` entity these rows relate to
 * has a Postgres-only `bytea` column, which sqlite's schema sync rejects
 * (the same limitation that makes several other *.integration.spec.ts files
 * in this repo `describe.skip`). The ledger tables have no such relation, so
 * they run against a genuine TypeORM DataSource — real transactions, real
 * unique-constraint-backed idempotency, real SQL aggregation in reconcile().
 */

function makeFakePaymentRepository(store: Map<string, Payment>) {
  return {
    async findOne(options: { where?: Record<string, unknown> }) {
      const where = options?.where ?? {};
      for (const payment of store.values()) {
        if (
          Object.entries(where).every(
            ([key, value]) =>
              (payment as unknown as Record<string, unknown>)[key] === value,
          )
        ) {
          return payment;
        }
      }
      return null;
    },
    create(data: Partial<Payment>): Payment {
      return {
        refundAmount: 0,
        refundStatus: 'none',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      } as Payment;
    },
    async save(entity: Payment): Promise<Payment> {
      if (!entity.id) entity.id = randomUUID();
      entity.updatedAt = new Date();
      store.set(entity.id, entity);
      return entity;
    },
  };
}

function makeTransactionalManager(
  realManager: EntityManager,
  paymentRepo: ReturnType<typeof makeFakePaymentRepository>,
) {
  return {
    findOne: (target: unknown, options: any) =>
      target === Payment
        ? paymentRepo.findOne(options)
        : realManager.findOne(target as any, options),
    create: (target: unknown, data: any) =>
      target === Payment
        ? paymentRepo.create(data)
        : realManager.create(target as any, data),
    save: (target: unknown, data: any) =>
      target === Payment
        ? paymentRepo.save(data)
        : realManager.save(target as any, data),
    find: (target: unknown, options: any) =>
      realManager.find(target as any, options),
    findOneOrFail: (target: unknown, options: any) =>
      realManager.findOneOrFail(target as any, options),
  } as unknown as EntityManager;
}

describe('Payment ledger — end-to-end (capture, partial refunds, full exhaustion)', () => {
  let sqlite: DataSource;
  let ledgerService: LedgerService;
  let paymentService: PaymentService;
  let paymentStore: Map<string, Payment>;
  let mockGateway: { chargePayment: jest.Mock; processRefund: jest.Mock };
  let fakeDataSource: {
    transaction: (
      cb: (m: EntityManager) => Promise<unknown>,
    ) => Promise<unknown>;
  };

  const userId = 'user-e2e-1';
  const paymentMethod: PaymentMethod = {
    id: 1,
    userId,
    paymentType: 'CREDIT_CARD',
    encryptedMetadata: null,
  } as PaymentMethod;

  beforeAll(async () => {
    sqlite = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [LedgerOperation, LedgerEntry],
      synchronize: true,
      dropSchema: true,
    });
    await sqlite.initialize();
  });

  afterAll(async () => {
    await sqlite.destroy();
  });

  beforeEach(async () => {
    await sqlite.getRepository(LedgerEntry).clear();
    await sqlite.getRepository(LedgerOperation).clear();
    paymentStore = new Map();
    const paymentRepo = makeFakePaymentRepository(paymentStore);
    fakeDataSource = {
      transaction: (cb) =>
        sqlite.transaction((realManager) =>
          cb(makeTransactionalManager(realManager, paymentRepo)),
        ),
    };

    ledgerService = new LedgerService(
      sqlite.getRepository(LedgerOperation),
      sqlite.getRepository(LedgerEntry),
    );

    mockGateway = {
      chargePayment: jest.fn().mockImplementation(async () => ({
        success: true,
        chargeId: `ch_${randomUUID()}`,
      })),
      processRefund: jest.fn().mockImplementation(async () => ({
        success: true,
        refundId: `rf_${randomUUID()}`,
      })),
    };

    const paymentMethodRepo = {
      findOne: async ({ where }: { where: { id: number; userId: string } }) =>
        where.id === paymentMethod.id && where.userId === paymentMethod.userId
          ? paymentMethod
          : null,
    };

    const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
    const lock = {
      withLock: (_key: string, _ttl: number, fn: () => Promise<unknown>) =>
        fn(),
    };
    const idempotency = {
      process: (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
    };
    const fraudHooks = {
      onPaymentRecorded: jest.fn().mockResolvedValue(undefined),
    };

    paymentService = new PaymentService(
      paymentRepo as any,
      paymentMethodRepo as any,
      {} as any, // paymentScheduleRepository — unused by these flows
      mockGateway as any,
      notifications as any,
      {} as any, // paymentProcessingService
      {} as any, // stellarService
      lock as any,
      idempotency as any,
      fakeDataSource as any,
      fraudHooks as any,
      ledgerService,
    );
  });

  it('captures a payment with balanced ledger entries', async () => {
    const payment = await paymentService.recordPayment(
      { amount: 100, paymentMethodId: '1' },
      userId,
    );

    expect(payment.status).toBe(PaymentStatus.COMPLETED);
    expect(Number(payment.transactionFee)).toBe(2);
    expect(Number(payment.netAmount)).toBe(98);

    const entries = await sqlite
      .getRepository(LedgerEntry)
      .find({ where: { paymentId: payment.id } });
    expect(entries).toHaveLength(3);

    const customerBalance = await ledgerService.getAccountBalance(
      `customer:${userId}`,
    );
    expect(customerBalance.balance).toBe(-98); // credit-heavy: refundable balance held

    const clearingBalance =
      await ledgerService.getAccountBalance('gateway:clearing');
    expect(clearingBalance.balance).toBe(100); // debit-heavy: cash captured

    const report = await ledgerService.reconcile();
    expect(report.balanced).toBe(true);
    expect(report.global.drift).toBe(0);
  });

  it('walks capture → partial refund → partial refund → full exhaustion → rejected over-refund', async () => {
    const payment = await paymentService.recordPayment(
      { amount: 100, paymentMethodId: '1' },
      userId,
    );
    expect(Number(payment.netAmount)).toBe(98);

    // First partial refund.
    const afterFirst = await paymentService.processRefund(
      payment.id,
      { amount: 30, reason: 'partial 1' },
      userId,
    );
    expect(afterFirst.status).toBe(PaymentStatus.PARTIAL_REFUND);
    expect(Number(afterFirst.refundAmount)).toBe(30);

    // Second partial refund.
    const afterSecond = await paymentService.processRefund(
      payment.id,
      { amount: 40, reason: 'partial 2' },
      userId,
    );
    expect(afterSecond.status).toBe(PaymentStatus.PARTIAL_REFUND);
    expect(Number(afterSecond.refundAmount)).toBe(70);

    // A refund request bigger than what's left (28) must be rejected —
    // the guard must account for the sum of prior partial refunds.
    await expect(
      paymentService.processRefund(
        payment.id,
        { amount: 29, reason: 'too much' },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(Number((await getStoredPayment(payment.id)).refundAmount)).toBe(70);

    // Exhaust exactly the remaining refundable balance (28 = 98 - 70).
    const afterFinal = await paymentService.processRefund(
      payment.id,
      { amount: 28, reason: 'final refund' },
      userId,
    );
    expect(afterFinal.status).toBe(PaymentStatus.REFUNDED);
    expect(Number(afterFinal.refundAmount)).toBe(98);

    // Now fully exhausted — any further refund must be rejected, however small.
    await expect(
      paymentService.processRefund(
        payment.id,
        { amount: 0.01, reason: 'after exhaustion' },
        userId,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The gateway must never have been called for any of the rejected attempts.
    expect(mockGateway.processRefund).toHaveBeenCalledTimes(3);

    const entries = await sqlite
      .getRepository(LedgerEntry)
      .find({ where: { paymentId: payment.id } });
    // 1 capture (3 lines) + 3 successful refunds (2 lines each)
    expect(entries).toHaveLength(3 + 3 * 2);

    const report = await ledgerService.reconcile();
    expect(report.balanced).toBe(true);
    expect(report.unbalancedOperations).toEqual([]);

    const customerBalance = await ledgerService.getAccountBalance(
      `customer:${userId}`,
    );
    expect(customerBalance.balance).toBe(0); // fully refunded: credited 98, debited back 98

    async function getStoredPayment(id: string): Promise<Payment> {
      const p = paymentStore.get(id);
      if (!p) throw new Error('payment missing from store');
      return p;
    }
  });

  it('is idempotent on retried refunds — same key never double-refunds or duplicates ledger rows', async () => {
    const payment = await paymentService.recordPayment(
      { amount: 100, paymentMethodId: '1' },
      userId,
    );

    const dto = {
      amount: 50,
      reason: 'partial',
      idempotencyKey: 'retry-key-1',
    };
    const first = await paymentService.processRefund(payment.id, dto, userId);
    const second = await paymentService.processRefund(payment.id, dto, userId);

    expect(first.refundAmount).toEqual(second.refundAmount);
    expect(Number(second.refundAmount)).toBe(50);
    expect(mockGateway.processRefund).toHaveBeenCalledTimes(1);

    const refundEntries = await sqlite.getRepository(LedgerEntry).find({
      where: { paymentId: payment.id, operationType: 'refund' as any },
    });
    expect(refundEntries).toHaveLength(2); // one refund's worth, not two
  });

  it('is idempotent on retried captures — same key never double-charges or duplicates ledger rows', async () => {
    const dto = {
      amount: 75,
      paymentMethodId: '1',
      idempotencyKey: 'capture-retry-1',
    };

    const first = await paymentService.recordPayment(dto, userId);
    const second = await paymentService.recordPayment(dto, userId);

    expect(second.id).toBe(first.id);
    expect(mockGateway.chargePayment).toHaveBeenCalledTimes(1);

    const captureEntries = await sqlite.getRepository(LedgerEntry).find({
      where: { paymentId: first.id, operationType: 'capture' as any },
    });
    expect(captureEntries).toHaveLength(3);
  });
});
