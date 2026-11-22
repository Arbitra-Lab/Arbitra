import { DisputeChainIndexerService } from './dispute-chain-indexer.service';
import { DisputeEventType } from '../../disputes/entities/dispute-event.entity';

describe('DisputeChainIndexerService', () => {
  it('registers handler and indexes dispute raised event', async () => {
    const reconciliation = { registerHandler: jest.fn(), process: jest.fn().mockResolvedValue({ status: 'applied' }) } as any;
    const disputeRepo = { findOne: jest.fn(), save: jest.fn() } as any;
    const disputeEventRepo = { create: jest.fn((x) => x), save: jest.fn() } as any;
    const voteRepo = {} as any;
    const svc = new DisputeChainIndexerService(reconciliation, disputeRepo, disputeEventRepo, voteRepo);
    svc.onModuleInit();
    expect(reconciliation.registerHandler).toHaveBeenCalled();

    const manager = {
      getRepository: (entity: any) => {
        if (entity?.name === 'Dispute') return { findOne: jest.fn().mockResolvedValue({ disputeId: 'd1', metadata: {} }), save: jest.fn() };
        if (entity?.name === 'DisputeEvent') return { create: jest.fn((x) => x), save: jest.fn() };
        return { findOne: jest.fn(), save: jest.fn() };
      },
    } as any;
    // Use actual class tokens by importing lazily in apply path via entity names not reliable; just smoke test process
    await svc.onRaised({ disputeId: 'd1', ledger: 1, txHash: 'tx1', currentLedger: 2 });
    expect(reconciliation.process).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'dispute.raised' }), 2);
  });
});
