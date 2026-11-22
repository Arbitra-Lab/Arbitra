import { EscrowChainIndexerService } from './escrow-chain-indexer.service';

describe('EscrowChainIndexerService', () => {
  it('ingests escrow status change events', async () => {
    const reconciliation = { registerHandler: jest.fn(), process: jest.fn().mockResolvedValue({ status: 'applied' }) } as any;
    const escrowRepo = {} as any;
    const svc = new EscrowChainIndexerService(reconciliation, escrowRepo);
    svc.onModuleInit();
    await svc.onStatus({ escrowId: 'e1', status: 'ACTIVE', ledger: 10, txHash: 'h', currentLedger: 11 });
    expect(reconciliation.process).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'escrow.status_changed' }), 11);
  });
});
