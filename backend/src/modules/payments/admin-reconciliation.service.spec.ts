import { PaymentService } from './payment.service';
import { PaymentStatus } from './entities/payment.entity';

describe('PaymentService admin reconciliation', () => {
  it('marks transaction as manually reconciled', async () => {
    const payment: any = {
      id: 'p1',
      userId: 'u1',
      amount: 10,
      currency: 'XLM',
      status: PaymentStatus.COMPLETED,
      refundStatus: 'none',
      metadata: {},
      createdAt: new Date(),
    };
    const paymentRepo = {
      findOne: jest.fn().mockResolvedValue(payment),
      save: jest.fn().mockImplementation(async (p) => p),
      createQueryBuilder: jest.fn(),
      find: jest.fn(),
    };

    const service = new PaymentService(
      paymentRepo as any,
      {} as any,
      {} as any,
      { getPrimaryChargeProvider: jest.fn() } as any,
      { notify: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      { run: jest.fn(async (_k: string, cb: any) => cb()) } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const row = await service.markTransactionReconciled(
      'p1',
      { status: 'verified', note: 'ok' },
      'admin1',
    );
    expect(row.manualReconciliationStatus).toBe('verified');
    expect(paymentRepo.save).toHaveBeenCalled();
  });
});
