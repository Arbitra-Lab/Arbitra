import { Test, TestingModule } from '@nestjs/testing';
import {
  NftEventProcessor,
  NFT_OBLIGATION_STREAM,
} from '../services/nft-event-processor.service';
import { EventReconciliationService } from '../services/event-reconciliation.service';
import { RentObligationNft } from '../../agreements/entities/rent-obligation-nft.entity';

describe('NftEventProcessor', () => {
  let processor: NftEventProcessor;

  const mockManager = {
    findOne: jest.fn(),
    create: jest.fn((_entity, data) => ({ ...data })),
    save: jest.fn((_entity, data) => Promise.resolve(data)),
    delete: jest.fn(),
  } as any;

  const mockEventReconciliationService = {
    registerHandler: jest.fn(),
    process: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockManager.create.mockImplementation((_entity, data) => ({ ...data }));
    mockManager.save.mockImplementation((_entity, data) =>
      Promise.resolve(data),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NftEventProcessor,
        {
          provide: EventReconciliationService,
          useValue: mockEventReconciliationService,
        },
      ],
    }).compile();

    processor = module.get<NftEventProcessor>(NftEventProcessor);
  });

  it('registers itself with the reconciliation pipeline for the nft-obligation stream', () => {
    processor.onModuleInit();

    expect(mockEventReconciliationService.registerHandler).toHaveBeenCalledWith(
      NFT_OBLIGATION_STREAM,
      processor,
    );
  });

  describe('apply / rollback: obligation.minted', () => {
    it('creates a new NFT record and returns compensation data to undo it', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      const compensation = await processor.apply(mockManager, {
        streamName: NFT_OBLIGATION_STREAM,
        eventType: 'obligation.minted',
        ledger: 10,
        ledgerHash: 'h10',
        parentLedgerHash: 'h9',
        txHash: 'tx-mint',
        eventIndex: 0,
        data: {
          agreementId: 'agreement-1',
          admin: 'GADMIN',
          mintedAt: 1_700_000_000,
          txHash: 'tx-mint',
        },
      });

      expect(mockManager.save).toHaveBeenCalledWith(
        RentObligationNft,
        expect.objectContaining({
          agreementId: 'agreement-1',
          currentOwner: 'GADMIN',
        }),
      );
      expect(compensation).toEqual({
        created: true,
        agreementId: 'agreement-1',
      });
    });

    it('skips creating a duplicate NFT and returns created: false', async () => {
      mockManager.findOne.mockResolvedValueOnce({ agreementId: 'agreement-1' });

      const compensation = await processor.apply(mockManager, {
        streamName: NFT_OBLIGATION_STREAM,
        eventType: 'obligation.minted',
        ledger: 10,
        ledgerHash: 'h10',
        parentLedgerHash: 'h9',
        txHash: 'tx-mint',
        eventIndex: 0,
        data: {
          agreementId: 'agreement-1',
          admin: 'GADMIN',
          mintedAt: 1_700_000_000,
          txHash: 'tx-mint',
        },
      });

      expect(mockManager.save).not.toHaveBeenCalled();
      expect(compensation).toEqual({
        created: false,
        agreementId: 'agreement-1',
      });
    });

    it('rolls back a mint by deleting the created NFT record', async () => {
      await processor.rollback(
        mockManager,
        {
          streamName: NFT_OBLIGATION_STREAM,
          eventType: 'obligation.minted',
          ledger: 10,
          ledgerHash: 'h10',
          parentLedgerHash: 'h9',
          txHash: 'tx-mint',
          eventIndex: 0,
          data: {},
        },
        { created: true, agreementId: 'agreement-1' },
      );

      expect(mockManager.delete).toHaveBeenCalledWith(RentObligationNft, {
        agreementId: 'agreement-1',
      });
    });

    it('does not delete anything on rollback when the mint was a no-op duplicate', async () => {
      await processor.rollback(
        mockManager,
        {
          streamName: NFT_OBLIGATION_STREAM,
          eventType: 'obligation.minted',
          ledger: 10,
          ledgerHash: 'h10',
          parentLedgerHash: 'h9',
          txHash: 'tx-mint',
          eventIndex: 0,
          data: {},
        },
        { created: false, agreementId: 'agreement-1' },
      );

      expect(mockManager.delete).not.toHaveBeenCalled();
    });
  });

  describe('apply / rollback: obligation.transferred', () => {
    it('updates ownership and captures the previous state as compensation data', async () => {
      mockManager.findOne.mockResolvedValueOnce({
        agreementId: 'agreement-1',
        currentOwner: 'GLANDLORD',
        transferCount: 0,
        lastTransferTxHash: undefined,
        lastTransferredAt: undefined,
      });

      const compensation = await processor.apply(mockManager, {
        streamName: NFT_OBLIGATION_STREAM,
        eventType: 'obligation.transferred',
        ledger: 11,
        ledgerHash: 'h11',
        parentLedgerHash: 'h10',
        txHash: 'tx-transfer',
        eventIndex: 0,
        data: {
          agreementId: 'agreement-1',
          from: 'GLANDLORD',
          to: 'GTENANT',
          txHash: 'tx-transfer',
        },
      });

      expect(mockManager.save).toHaveBeenCalledWith(
        RentObligationNft,
        expect.objectContaining({ currentOwner: 'GTENANT', transferCount: 1 }),
      );
      expect(compensation).toEqual(
        expect.objectContaining({
          agreementId: 'agreement-1',
          previousOwner: 'GLANDLORD',
          previousTransferCount: 0,
        }),
      );
    });

    it('throws (for dead-lettering) when transferring an NFT that does not exist', async () => {
      mockManager.findOne.mockResolvedValueOnce(null);

      await expect(
        processor.apply(mockManager, {
          streamName: NFT_OBLIGATION_STREAM,
          eventType: 'obligation.transferred',
          ledger: 11,
          ledgerHash: 'h11',
          parentLedgerHash: 'h10',
          txHash: 'tx-transfer',
          eventIndex: 0,
          data: {
            agreementId: 'missing-agreement',
            from: 'GLANDLORD',
            to: 'GTENANT',
            txHash: 'tx-transfer',
          },
        }),
      ).rejects.toThrow(/NFT not found/);
    });

    it('rolls back a transfer by restoring the previous owner', async () => {
      mockManager.findOne.mockResolvedValueOnce({
        agreementId: 'agreement-1',
        currentOwner: 'GTENANT',
        transferCount: 1,
      });

      await processor.rollback(
        mockManager,
        {
          streamName: NFT_OBLIGATION_STREAM,
          eventType: 'obligation.transferred',
          ledger: 11,
          ledgerHash: 'h11',
          parentLedgerHash: 'h10',
          txHash: 'tx-transfer',
          eventIndex: 0,
          data: {},
        },
        {
          agreementId: 'agreement-1',
          previousOwner: 'GLANDLORD',
          previousTransferCount: 0,
          previousTransferTxHash: undefined,
          previousTransferredAt: undefined,
        },
      );

      expect(mockManager.save).toHaveBeenCalledWith(
        RentObligationNft,
        expect.objectContaining({
          currentOwner: 'GLANDLORD',
          transferCount: 0,
        }),
      );
    });
  });

  describe('event listeners', () => {
    it('delegates minted events to the reconciliation pipeline with the correct ledger event shape', async () => {
      mockEventReconciliationService.process.mockResolvedValueOnce({
        status: 'applied',
        dedupKey: 'key',
      });

      await processor.handleObligationMinted({
        agreementId: 'agreement-1',
        admin: 'GADMIN',
        mintedAt: 1_700_000_000,
        txHash: 'tx-mint',
        ledger: 10,
        ledgerHash: 'h10',
        parentLedgerHash: 'h9',
        eventIndex: 0,
        currentLedger: 20,
      });

      expect(mockEventReconciliationService.process).toHaveBeenCalledWith(
        expect.objectContaining({
          streamName: NFT_OBLIGATION_STREAM,
          eventType: 'obligation.minted',
          ledger: 10,
          txHash: 'tx-mint',
          eventIndex: 0,
        }),
        20,
      );
    });
  });
});
