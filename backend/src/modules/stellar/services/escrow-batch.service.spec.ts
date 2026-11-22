import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../../audit/audit.service';
import { StellarService } from './stellar.service';
import { EscrowBatchService } from './escrow-batch.service';

describe('EscrowBatchService', () => {
  let service: EscrowBatchService;
  let stellarService: {
    createEscrow: jest.Mock;
    releaseEscrow: jest.Mock;
    refundEscrow: jest.Mock;
  };
  let auditService: { log: jest.Mock };

  const createItem = (source: string) => ({
    sourcePublicKey: source,
    destinationPublicKey:
      'DB6QKQBRXKXQOVXOJ4D5V5ZP3HJPQGDQQVQQQQQQQQQQQQQQQQQQQQQQQ',
    amount: '10',
  });

  beforeEach(async () => {
    stellarService = {
      createEscrow: jest.fn(),
      releaseEscrow: jest.fn(),
      refundEscrow: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowBatchService,
        { provide: StellarService, useValue: stellarService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(EscrowBatchService);
  });

  it('runs items with bounded concurrency and reports progress', async () => {
    let active = 0;
    let peak = 0;
    stellarService.createEscrow.mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { id: 1 };
    });

    const batch = await service.createBatch(
      [createItem('SA'), createItem('SB'), createItem('SC')],
      'user-1',
      { concurrency: 2 },
    );

    expect(peak).toBe(2);
    expect(batch.status).toBe('completed');
    expect(batch.processed).toBe(3);
    expect(batch.succeeded).toBe(3);
    expect(batch.items).toHaveLength(3);
    expect(batch.feeEstimateStroops).toBe((BigInt(100) * BigInt(3)).toString());
    expect(batch.feeEstimateXlm).toBe(0.00003);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: batch.id,
        performedBy: 'user-1',
        metadata: expect.objectContaining({ total: 3, succeeded: 3 }),
      }),
    );
  });

  it('keeps successful items when one item fails', async () => {
    stellarService.createEscrow
      .mockResolvedValueOnce({ id: 1 })
      .mockRejectedValueOnce(new Error('insufficient balance'))
      .mockResolvedValueOnce({ id: 3 });

    const batch = await service.createBatch([
      createItem('SA'),
      createItem('SB'),
      createItem('SC'),
    ]);

    expect(batch.status).toBe('completed_with_failures');
    expect(batch.succeeded).toBe(2);
    expect(batch.failed).toBe(1);
    expect(batch.items[1]).toMatchObject({
      status: 'failed',
      error: 'insufficient balance',
    });
    expect(stellarService.refundEscrow).not.toHaveBeenCalled();
  });

  it('rolls back created escrows when stopOnFirstFailure is set', async () => {
    stellarService.createEscrow
      .mockResolvedValueOnce({ id: 10 })
      .mockRejectedValueOnce(new Error('rpc unavailable'));
    stellarService.refundEscrow.mockResolvedValue({ id: 10 });

    const batch = await service.createBatch(
      [createItem('SA'), createItem('SB'), createItem('SC')],
      'user-1',
      { concurrency: 1, stopOnFirstFailure: true },
    );

    expect(batch.status).toBe('rolled_back');
    expect(batch.cancelled).toBe(1);
    expect(batch.rolledBack).toBe(1);
    expect(stellarService.createEscrow).toHaveBeenCalledTimes(2);
    expect(stellarService.refundEscrow).toHaveBeenCalledWith({
      escrowId: 10,
      reason: expect.stringContaining(batch.id),
    });
  });

  it('retries only failed create items with the original payload', async () => {
    stellarService.createEscrow
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue({ id: 99 });

    const original = await service.createBatch([createItem('SA')]);
    const retry = await service.retryFailed(original.id, 'user-1');

    expect(stellarService.createEscrow).toHaveBeenCalledTimes(2);
    expect(stellarService.createEscrow).toHaveBeenLastCalledWith(
      createItem('SA'),
    );
    expect(retry.status).toBe('completed');
    expect(retry.succeeded).toBe(1);
    expect(retry.items[0].sourceIndex).toBe(0);
  });

  it('returns 404 for an unknown batch', () => {
    expect(() => service.getBatch('missing')).toThrow(
      'Batch missing was not found',
    );
  });
});
