import { FeeService } from './fee.service';
import { FeeAgreementType } from './entities/fee-config.entity';

describe('FeeService', () => {
  function make() {
    const feeConfigRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'cfg1', ...x })),
    };
    const feeCollectionRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'fc1', ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
    };
    const svc = new FeeService(feeConfigRepo as any, feeCollectionRepo as any);
    return { svc, feeConfigRepo, feeCollectionRepo };
  }

  it('calculates default fee with transparency fields', async () => {
    const { svc, feeConfigRepo } = make();
    feeConfigRepo.findOne.mockResolvedValue(null);
    const res = await svc.calculateFee({ amount: 1000, currency: 'NGN' });
    expect(res.feeAmount).toBe(20);
    expect(res.netAmount).toBe(980);
    expect(res.transparent).toBe(true);
  });

  it('applies volume tier and min/max caps', async () => {
    const { svc, feeConfigRepo } = make();
    feeConfigRepo.findOne.mockResolvedValueOnce({
      id: 'c1',
      agreementType: FeeAgreementType.RENT,
      baseRate: '0.03',
      flatFee: '5',
      minFee: '10',
      maxFee: '25',
      volumeTiers: [{ minVolume: 10000, rate: '0.01' }],
      isActive: true,
    });
    const res = await svc.calculateFee({
      amount: 1000,
      agreementType: FeeAgreementType.RENT,
      historicalVolume: 20000,
    });
    expect(res.rate).toBe(0.01);
    expect(res.feeAmount).toBe(15);
  });
});
