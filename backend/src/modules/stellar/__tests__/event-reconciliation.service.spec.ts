import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventReconciliationService } from '../services/event-reconciliation.service';
import { BlockchainEventIdempotency } from '../entities/blockchain-event-idempotency.entity';
import { BlockchainStreamCursor } from '../entities/blockchain-stream-cursor.entity';
import { BlockchainEventDeadLetter } from '../entities/blockchain-event-dead-letter.entity';
import {
  EventHandler,
  LedgerEvent,
} from '../interfaces/ledger-event.interface';

describe('EventReconciliationService', () => {
  let service: EventReconciliationService;

  const mockManager = {
    findOne: jest.fn(),
    create: jest.fn((_entity, data) => ({ ...data })),
    save: jest.fn((_entity, data) => Promise.resolve(data)),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  const mockCursorRepository = {
    findOne: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn(),
  };

  const mockIdempotencyRepository = {
    find: jest.fn(),
  };

  const mockDeadLetterRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((data) => data),
    save: jest.fn((data) => Promise.resolve(data)),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(undefined),
  };

  const buildEvent = (overrides: Partial<LedgerEvent> = {}): LedgerEvent => ({
    streamName: 'test-stream',
    eventType: 'test.event',
    ledger: 100,
    ledgerHash: 'hash-100',
    parentLedgerHash: 'hash-99',
    txHash: 'tx-1',
    eventIndex: 0,
    data: { foo: 'bar' },
    ...overrides,
  });

  let handler: jest.Mocked<EventHandler>;

  /**
   * Confirmation depth is read once, in the constructor, so it must be
   * configured before the module is compiled. Tests that need a non-default
   * depth build their own service instance via this helper instead of
   * mutating the config mock after construction (which would be a no-op).
   */
  const buildService = async (
    confirmationDepth?: string,
  ): Promise<EventReconciliationService> => {
    mockConfigService.get.mockReturnValue(confirmationDepth);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventReconciliationService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: getRepositoryToken(BlockchainStreamCursor),
          useValue: mockCursorRepository,
        },
        {
          provide: getRepositoryToken(BlockchainEventIdempotency),
          useValue: mockIdempotencyRepository,
        },
        {
          provide: getRepositoryToken(BlockchainEventDeadLetter),
          useValue: mockDeadLetterRepository,
        },
      ],
    }).compile();

    return module.get<EventReconciliationService>(EventReconciliationService);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockManager.create.mockImplementation((_entity, data) => ({ ...data }));
    mockManager.save.mockImplementation((_entity, data) =>
      Promise.resolve(data),
    );
    mockCursorRepository.create.mockImplementation((data) => data);

    service = await buildService(undefined);

    handler = {
      apply: jest.fn().mockResolvedValue({ created: true }),
      rollback: jest.fn().mockResolvedValue(undefined),
    };
    service.registerHandler('test-stream', handler);

    mockCursorRepository.findOne.mockResolvedValue(null);
    mockManager.findOne.mockResolvedValue(null);
  });

  describe('confirmation gating', () => {
    it('does not apply an event that has not reached the confirmation depth', async () => {
      const depthThreeService = await buildService('3');
      depthThreeService.registerHandler('test-stream', handler);
      const event = buildEvent({ ledger: 100 });

      const outcome = await depthThreeService.process(event, 101); // depth 2 < 3

      expect(outcome.status).toBe('pending-confirmation');
      expect(handler.apply).not.toHaveBeenCalled();
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
    });

    it('applies an event once it clears the confirmation depth', async () => {
      const depthThreeService = await buildService('3');
      depthThreeService.registerHandler('test-stream', handler);
      const event = buildEvent({ ledger: 100 });

      const outcome = await depthThreeService.process(event, 103); // depth 3 >= 3

      expect(outcome.status).toBe('applied');
      expect(handler.apply).toHaveBeenCalledTimes(1);
    });

    it('throws when no handler is registered for the stream', async () => {
      const event = buildEvent({ streamName: 'unknown-stream' });

      await expect(service.process(event, 200)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('idempotent dedup', () => {
    it('applies the side effect exactly once when the same event is replayed repeatedly', async () => {
      const event = buildEvent();

      // A single mockManager backs both the idempotency-record lookup and
      // the cursor lookup (inside advanceCursor), so the fake must dispatch
      // on the entity being queried rather than assume call order.
      let idempotencyRecord: { dedupKey: string } | null = null;
      mockManager.findOne.mockImplementation(async (entity: unknown) => {
        if (entity === BlockchainEventIdempotency) return idempotencyRecord;
        return null;
      });
      mockManager.save.mockImplementation((entity: unknown, data: any) => {
        if (entity === BlockchainEventIdempotency) {
          idempotencyRecord = data;
        }
        return Promise.resolve(data);
      });

      const first = await service.process(event, 200);
      const second = await service.process(event, 200);
      const third = await service.process(event, 200);

      expect(first.status).toBe('applied');
      expect(second.status).toBe('duplicate');
      expect(third.status).toBe('duplicate');
      expect(handler.apply).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(3);
    });

    it('treats a DB unique-constraint violation as a duplicate instead of a failure', async () => {
      const event = buildEvent();
      mockManager.findOne.mockResolvedValueOnce(null);
      mockManager.save.mockImplementationOnce(() => {
        const error = new Error(
          'duplicate key value violates unique constraint',
        );
        (error as unknown as { code: string }).code = '23505';
        throw error;
      });

      const outcome = await service.process(event, 200);

      expect(outcome.status).toBe('duplicate');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockDeadLetterRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('dead-letter on failure', () => {
    it('records structured error context and rolls back the transaction when the handler throws', async () => {
      const event = buildEvent();
      mockManager.findOne.mockResolvedValueOnce(null);
      handler.apply.mockRejectedValueOnce(
        new Error('boom: side effect failed'),
      );
      mockDeadLetterRepository.findOne.mockResolvedValueOnce(null);

      const outcome = await service.process(event, 200);

      expect(outcome.status).toBe('failed');
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockDeadLetterRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          streamName: 'test-stream',
          dedupKey: 'test-stream:100:tx-1:0',
          errorMessage: expect.stringContaining('boom'),
        }),
      );
    });
  });

  describe('reorg rollback', () => {
    it('rolls back orphaned events and converges to the canonical chain on a fork', async () => {
      // Cursor already saw ledger 99 with hash "canonical-99"
      mockCursorRepository.findOne.mockResolvedValueOnce({
        streamName: 'test-stream',
        lastConfirmedLedger: 100,
        lastConfirmedLedgerHash: 'canonical-100',
        ancestry: [
          { ledger: 98, hash: 'canonical-98' },
          { ledger: 99, hash: 'canonical-99' },
          { ledger: 100, hash: 'canonical-100' },
        ],
      });

      const orphanedRecord = {
        streamName: 'test-stream',
        eventType: 'test.event',
        ledger: 100,
        ledgerHash: 'canonical-100',
        parentLedgerHash: 'canonical-99',
        txHash: 'orphan-tx',
        eventIndex: 0,
        status: 'applied',
        compensationData: { created: true },
      };
      mockIdempotencyRepository.find.mockResolvedValueOnce([orphanedRecord]);

      // Reorg-rollback tx reads cursor again inside the transaction.
      mockManager.findOne
        .mockResolvedValueOnce({
          streamName: 'test-stream',
          lastConfirmedLedger: 100,
          lastConfirmedLedgerHash: 'canonical-100',
          ancestry: [
            { ledger: 98, hash: 'canonical-98' },
            { ledger: 99, hash: 'canonical-99' },
            { ledger: 100, hash: 'canonical-100' },
          ],
        })
        // Apply-tx idempotency lookup for the new canonical event.
        .mockResolvedValueOnce(null);

      const forkEvent = buildEvent({
        ledger: 100,
        ledgerHash: 'fork-100',
        parentLedgerHash: 'fork-99', // disagrees with stored canonical-99
        txHash: 'fork-tx',
      });

      const outcome = await service.process(forkEvent, 200);

      expect(outcome.status).toBe('applied');
      expect(handler.rollback).toHaveBeenCalledTimes(1);
      expect(handler.rollback).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ txHash: 'orphan-tx' }),
        { created: true },
      );
      expect(handler.apply).toHaveBeenCalledTimes(1);
      expect(handler.apply).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ txHash: 'fork-tx' }),
      );

      // Orphaned record marked rolled back.
      expect(mockManager.save).toHaveBeenCalledWith(
        BlockchainEventIdempotency,
        expect.objectContaining({ status: 'rolled_back' }),
      );
    });

    it('does not roll back when ancestry hashes agree with the incoming event', async () => {
      mockCursorRepository.findOne.mockResolvedValueOnce({
        streamName: 'test-stream',
        lastConfirmedLedger: 100,
        lastConfirmedLedgerHash: 'canonical-100',
        ancestry: [{ ledger: 99, hash: 'canonical-99' }],
      });

      const event = buildEvent({
        ledger: 100,
        parentLedgerHash: 'canonical-99',
      });

      const outcome = await service.process(event, 200);

      expect(outcome.status).toBe('applied');
      expect(handler.rollback).not.toHaveBeenCalled();
      expect(mockIdempotencyRepository.find).not.toHaveBeenCalled();
    });
  });
});
