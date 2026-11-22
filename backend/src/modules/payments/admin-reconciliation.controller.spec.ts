import { Test } from '@nestjs/testing';
import { AdminReconciliationController } from './admin-reconciliation.controller';
import { PaymentService } from './payment.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

describe('AdminReconciliationController', () => {
  it('lists transactions for admin', async () => {
    const paymentService = {
      getAdminReconciliationTransactions: jest
        .fn()
        .mockResolvedValue({ data: [], meta: { total: 0 } }),
      exportAdminReconciliationCsv: jest.fn().mockResolvedValue('id\n1'),
      markTransactionReconciled: jest
        .fn()
        .mockResolvedValue({ id: '1', manualReconciliationStatus: 'verified' }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminReconciliationController],
      providers: [{ provide: PaymentService, useValue: paymentService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = moduleRef.get(AdminReconciliationController);
    const req = { user: { id: 'admin', role: 'admin' } } as any;
    await controller.listTransactions({ page: 1, limit: 20 } as any, req);
    expect(
      paymentService.getAdminReconciliationTransactions,
    ).toHaveBeenCalled();
    await controller.reconcileTransaction(
      'p1',
      { status: 'verified' } as any,
      req,
    );
    expect(paymentService.markTransactionReconciled).toHaveBeenCalledWith(
      'p1',
      { status: 'verified' },
      'admin',
    );
  });
});
