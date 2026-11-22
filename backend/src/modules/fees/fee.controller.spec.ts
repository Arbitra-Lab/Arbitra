import { FeeController } from './fee.controller';

describe('FeeController', () => {
  it('delegates calculate', async () => {
    const feeService = {
      calculateFee: jest.fn().mockResolvedValue({ feeAmount: 1 }),
    } as any;
    const controller = new FeeController(feeService);
    const res = await controller.calculate('100', undefined, undefined, 'NGN');
    expect(feeService.calculateFee).toHaveBeenCalled();
    expect(res.feeAmount).toBe(1);
  });
});
