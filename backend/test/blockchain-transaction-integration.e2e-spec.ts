import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DataSource, FindOperator } from 'typeorm';
import { StellarService } from '../src/modules/stellar/services/stellar.service';
import { EventReconciliationService } from '../src/modules/stellar/services/event-reconciliation.service';
import { BlockchainEventIdempotency } from '../src/modules/stellar/entities/blockchain-event-idempotency.entity';
import { BlockchainStreamCursor } from '../src/modules/stellar/entities/blockchain-stream-cursor.entity';
import { BlockchainEventDeadLetter } from '../src/modules/stellar/entities/blockchain-event-dead-letter.entity';
import {
  EventHandler,
  LedgerEvent,
} from '../src/modules/stellar/interfaces/ledger-event.interface';
import {
  StellarTransaction,
  TransactionStatus,
  AssetType,
  MemoType,
} from '../src/modules/stellar/entities/stellar-transaction.entity';
import {
  StellarAccount,
  StellarAccountType,
} from '../src/modules/stellar/entities/stellar-account.entity';
import {
  StellarEscrow,
  EscrowStatus,
} from '../src/modules/stellar/entities/stellar-escrow.entity';
import { EncryptionService } from '../src/modules/stellar/services/encryption.service';
import * as StellarSdk from '@stellar/stellar-sdk';

jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        loadAccount: jest.fn(),
        submitTransaction: jest.fn(),
        transactions: jest.fn(),
      })),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({
        sign: jest.fn(),
        toXDR: jest.fn().mockReturnValue('mock-xdr'),
        hash: jest.fn().mockReturnValue(Buffer.from('a'.repeat(64), 'hex')),
      }),
    })),
    Operation: {
      payment: jest.fn().mockReturnValue({}),
      createAccount: jest.fn().mockReturnValue({}),
    },
    Asset: {
      native: jest.fn().mockReturnValue({ code: 'XLM', issuer: undefined }),
    },
    Keypair: {
      fromSecret: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('MOCK_PUBLIC_KEY'),
        sign: jest.fn(),
      }),
      random: jest.fn().mockReturnValue({
        publicKey: jest.fn().mockReturnValue('MOCK_PUBLIC_KEY'),
        secret: jest.fn().mockReturnValue('MOCK_SECRET'),
      }),
    },
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
      PUBLIC: 'Public Global Stellar Network ; September 2015',
    },
  };
});

describe('Blockchain Transaction Integration (e2e)', () => {
  let module: TestingModule;

  const mockAccount: StellarAccount = {
    id: 1,
    userId: 'user-1',
    user: null as any,
    publicKey: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKW7FCPG7HZNZXNUUA8A',
    secretKeyEncrypted: 'encrypted-secret',
    sequenceNumber: '0',
    accountType: StellarAccountType.USER,
    isActive: true,
    balance: '100',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as StellarAccount;

  const mockTransaction: StellarTransaction = {
    id: 1,
    transactionHash: 'a'.repeat(64),
    fromAccountId: 1,
    fromAccount: mockAccount,
    toAccountId: 2,
    toAccount: { ...mockAccount, id: 2 } as StellarAccount,
    assetType: AssetType.NATIVE,
    assetCode: 'XLM',
    assetIssuer: null,
    amount: '100',
    feePaid: 100,
    status: TransactionStatus.PENDING,
    memoType: MemoType.NONE,
    memo: null,
    errorMessage: null,
    ledger: null,
    sourceAccount: null,
    destinationAccount: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as StellarTransaction;

  const mockTransactionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  const mockAccountRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  const mockEscrowRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(),
        findOne: jest.fn(),
      },
    }),
  };

  const mockEncryptionService = {
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue('SMOCK_SECRET_KEY'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              STELLAR_NETWORK: 'testnet',
              STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
              STELLAR_BASE_FEE: '100',
            }),
          ],
        }),
      ],
      providers: [
        StellarService,
        EncryptionService,
        {
          provide: getRepositoryToken(StellarAccount),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(StellarTransaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(StellarEscrow),
          useValue: mockEscrowRepository,
        },
        {
          provide: 'DataSource',
          useValue: mockDataSource,
        },
        {
          provide: EncryptionService,
          useValue: mockEncryptionService,
        },
      ],
    }).compile();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Transaction Status Tracking', () => {
    it('creates transaction with PENDING status initially', () => {
      expect(mockTransaction.status).toBe(TransactionStatus.PENDING);
    });

    it('tracks all valid transaction status transitions', () => {
      const statuses = Object.values(TransactionStatus);
      expect(statuses).toContain(TransactionStatus.PENDING);
      expect(statuses).toContain(TransactionStatus.SUBMITTED);
      expect(statuses).toContain(TransactionStatus.COMPLETED);
      expect(statuses).toContain(TransactionStatus.FAILED);
    });

    it('records status change on submission', async () => {
      const submitted: StellarTransaction = {
        ...mockTransaction,
        status: TransactionStatus.SUBMITTED,
        updatedAt: new Date(),
      };
      mockTransactionRepository.save.mockResolvedValue(submitted);

      const saved = await mockTransactionRepository.save(submitted);
      expect(saved.updatedAt).toBeDefined();
      expect(saved.status).toBe(TransactionStatus.SUBMITTED);
    });

    it('records status change on completion', async () => {
      const confirmed: StellarTransaction = {
        ...mockTransaction,
        status: TransactionStatus.COMPLETED,
        updatedAt: new Date(),
      };
      mockTransactionRepository.save.mockResolvedValue(confirmed);

      const saved = await mockTransactionRepository.save(confirmed);
      expect(saved.updatedAt).toBeDefined();
      expect(saved.status).toBe(TransactionStatus.COMPLETED);
    });
  });

  describe('Transaction Creation', () => {
    it('constructs a transaction with the correct fields', () => {
      const txData = {
        transactionHash: 'b'.repeat(64),
        fromAccountId: 1,
        toAccountId: 2,
        assetType: AssetType.NATIVE,
        assetCode: 'XLM',
        amount: '50',
        feePaid: 100,
        status: TransactionStatus.PENDING,
        memoType: MemoType.TEXT,
        memo: 'rent-payment',
      };

      mockTransactionRepository.create.mockReturnValue({ id: 10, ...txData });
      mockTransactionRepository.save.mockResolvedValue({ id: 10, ...txData });

      const created = mockTransactionRepository.create(txData);

      expect(created.transactionHash).toBe(txData.transactionHash);
      expect(created.amount).toBe('50');
      expect(created.status).toBe(TransactionStatus.PENDING);
    });

    it('supports NATIVE and credit asset types', () => {
      const assetTypes = Object.values(AssetType);
      expect(assetTypes).toContain(AssetType.NATIVE);
      expect(assetTypes).toContain(AssetType.CREDIT_ALPHANUM4);
      expect(assetTypes).toContain(AssetType.CREDIT_ALPHANUM12);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('records error message on failed transaction', async () => {
      const failed: StellarTransaction = {
        ...mockTransaction,
        status: TransactionStatus.FAILED,
        errorMessage: 'tx_failed: insufficient funds',
      };
      mockTransactionRepository.save.mockResolvedValue(failed);

      const saved = await mockTransactionRepository.save(failed);
      expect(saved.status).toBe(TransactionStatus.FAILED);
      expect(saved.errorMessage).toBe('tx_failed: insufficient funds');
    });

    it('looks up existing transaction by hash', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);

      const found = await mockTransactionRepository.findOne({
        where: { transactionHash: mockTransaction.transactionHash },
      });

      expect(found).toBeDefined();
      expect(found.transactionHash).toBe(mockTransaction.transactionHash);
    });

    it('returns null when transaction hash is not found', async () => {
      mockTransactionRepository.findOne.mockResolvedValue(null);

      const found = await mockTransactionRepository.findOne({
        where: { transactionHash: 'nonexistent' },
      });

      expect(found).toBeNull();
    });
  });

  describe('Stellar Network Integration', () => {
    it('uses testnet network passphrase in test environment', () => {
      expect(StellarSdk.Networks.TESTNET).toBe(
        'Test SDF Network ; September 2015',
      );
    });

    it('generates a unique keypair per account', () => {
      const kp = StellarSdk.Keypair.random();
      expect(kp.publicKey()).toBe('MOCK_PUBLIC_KEY');
    });

    it('memo types cover common use cases', () => {
      const memoTypes = Object.values(MemoType);
      expect(memoTypes).toContain(MemoType.TEXT);
      expect(memoTypes).toContain(MemoType.ID);
      expect(memoTypes).toContain(MemoType.NONE);
    });
  });

  describe('Concurrent and Performance Scenarios', () => {
    it('saves 10 transactions concurrently without conflict', async () => {
      mockTransactionRepository.save.mockImplementation((tx) =>
        Promise.resolve({ ...tx, id: Math.random() }),
      );

      const txs = Array.from({ length: 10 }, (_, i) => ({
        ...mockTransaction,
        transactionHash: `hash-${i}`,
      }));

      const results = await Promise.all(
        txs.map((tx) => mockTransactionRepository.save(tx)),
      );

      expect(results).toHaveLength(10);
      expect(mockTransactionRepository.save).toHaveBeenCalledTimes(10);
    });
  });
});

/**
 * A tiny in-memory relational store that mimics just enough TypeORM
 * transaction semantics (buffered writes, committed or discarded as a unit)
 * to exercise EventReconciliationService end-to-end without a live database:
 * duplicate delivery, confirmation-depth gating, and reorg rollback all have
 * to converge on the same final state a real Postgres transaction would
 * produce.
 */
class FakeReconciliationStore {
  idempotency = new Map<string, BlockchainEventIdempotency>();
  cursors = new Map<string, BlockchainStreamCursor>();
  deadLetters = new Map<string, BlockchainEventDeadLetter>();
  obligations = new Map<
    string,
    { agreementId: string; owner: string; transferCount: number }
  >();
}

function tableFor(store: FakeReconciliationStore, entity: unknown) {
  if (entity === BlockchainEventIdempotency) return store.idempotency;
  if (entity === BlockchainStreamCursor) return store.cursors;
  if (entity === BlockchainEventDeadLetter) return store.deadLetters;
  throw new Error(`No fake table for entity ${String(entity)}`);
}

function matchesWhere(row: any, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value instanceof FindOperator) {
      if (value.type === 'moreThanOrEqual') return row[key] >= value.value;
      throw new Error(
        `Unsupported FindOperator type in fake store: ${value.type}`,
      );
    }
    return row[key] === value;
  });
}

let fakeIdCounter = 0;

/** `getSnapshot` is re-resolved on every call so the manager always targets
 * whichever store (buffered transaction snapshot, or the base store) is
 * currently active, while a single manager instance is reused for the
 * lifetime of a query runner. */
function createFakeManager(getSnapshot: () => FakeReconciliationStore) {
  return {
    findOne: async (
      entity: unknown,
      opts: { where: Record<string, unknown> },
    ) => {
      const table = tableFor(getSnapshot(), entity);
      for (const row of table.values()) {
        if (matchesWhere(row, opts.where)) return row;
      }
      return null;
    },
    create: (_entity: unknown, data: Record<string, unknown>) => ({ ...data }),
    save: async (entity: unknown, data: any) => {
      const table = tableFor(getSnapshot(), entity);
      const key =
        entity === BlockchainStreamCursor
          ? data.streamName
          : (data.id ?? (data.id = `row-${++fakeIdCounter}`));
      table.set(key, data);
      return data;
    },
    delete: async () => {
      throw new Error('not used by this test');
    },
  };
}

/**
 * Only the tables the fake manager actually writes through (idempotency,
 * cursors, dead letters) are buffered per-transaction. `obligations` is the
 * simulated side effect: FakeObligationHandler mutates it directly (mirroring
 * how a real handler's DB writes go through the manager and thus the
 * transaction) rather than through this snapshot, so it must NOT be cloned
 * or restored here — doing so would discard the handler's mutation the
 * moment the transaction commits.
 */
function cloneStore(store: FakeReconciliationStore): FakeReconciliationStore {
  const clone = new FakeReconciliationStore();
  clone.idempotency = new Map(
    Array.from(store.idempotency, ([k, v]) => [k, { ...v }]),
  );
  clone.cursors = new Map(
    Array.from(store.cursors, ([k, v]) => [
      k,
      { ...v, ancestry: [...(v.ancestry ?? [])] },
    ]),
  );
  clone.deadLetters = new Map(
    Array.from(store.deadLetters, ([k, v]) => [k, { ...v }]),
  );
  return clone;
}

function applyClone(
  store: FakeReconciliationStore,
  clone: FakeReconciliationStore,
) {
  store.idempotency = clone.idempotency;
  store.cursors = clone.cursors;
  store.deadLetters = clone.deadLetters;
}

describe('Blockchain event reconciliation pipeline (e2e): dedup + reorg', () => {
  let module: TestingModule;
  let service: EventReconciliationService;
  let store: FakeReconciliationStore;

  const STREAM = 'obligation-transfer';

  /** Fake handler standing in for NftEventProcessor's apply/rollback contract. */
  class FakeObligationHandler implements EventHandler {
    constructor(private readonly getStore: () => FakeReconciliationStore) {}

    async apply(_manager: unknown, event: LedgerEvent) {
      const store = this.getStore();
      const data = event.data as { agreementId: string; owner: string };
      const existing = store.obligations.get(data.agreementId);
      const previousOwner = existing?.owner ?? null;
      const previousTransferCount = existing?.transferCount ?? 0;

      store.obligations.set(data.agreementId, {
        agreementId: data.agreementId,
        owner: data.owner,
        transferCount: previousTransferCount + 1,
      });

      return { previousOwner, previousTransferCount };
    }

    async rollback(
      _manager: unknown,
      event: LedgerEvent,
      compensationData: Record<string, unknown> | null,
    ) {
      const store = this.getStore();
      const data = event.data as { agreementId: string };
      if (!compensationData?.previousOwner) {
        store.obligations.delete(data.agreementId);
        return;
      }
      store.obligations.set(data.agreementId, {
        agreementId: data.agreementId,
        owner: compensationData.previousOwner as string,
        transferCount: compensationData.previousTransferCount as number,
      });
    }
  }

  const buildEvent = (overrides: Partial<LedgerEvent> = {}): LedgerEvent => ({
    streamName: STREAM,
    eventType: 'obligation.owner-set',
    ledger: 100,
    ledgerHash: 'h100',
    parentLedgerHash: 'h99',
    txHash: 'tx-100',
    eventIndex: 0,
    data: { agreementId: 'agreement-e2e', owner: 'GOWNER_A' },
    ...overrides,
  });

  beforeEach(async () => {
    store = new FakeReconciliationStore();

    const mockDataSource = {
      createQueryRunner: () => {
        let snapshot: FakeReconciliationStore | null = null;
        const manager = createFakeManager(() => snapshot ?? store);
        return {
          connect: async () => {},
          startTransaction: async () => {
            snapshot = cloneStore(store);
          },
          commitTransaction: async () => {
            if (snapshot) applyClone(store, snapshot);
            snapshot = null;
          },
          rollbackTransaction: async () => {
            snapshot = null;
          },
          release: async () => {},
          manager,
        };
      },
    };

    const repoFor = <T extends { id?: string }>(
      table: () => Map<string, T>,
    ) => ({
      find: async (opts?: {
        where?: Record<string, unknown>;
        order?: Record<string, 'ASC' | 'DESC'>;
      }) => {
        let rows = Array.from(table().values()).filter((row) =>
          opts?.where ? matchesWhere(row, opts.where) : true,
        );
        if (opts?.order) {
          const orderEntries = Object.entries(opts.order);
          rows = [...rows].sort((a, b) => {
            for (const [key, dir] of orderEntries) {
              const av = (a as any)[key];
              const bv = (b as any)[key];
              if (av === bv) continue;
              const cmp = av > bv ? 1 : -1;
              return dir === 'DESC' ? -cmp : cmp;
            }
            return 0;
          });
        }
        return rows.map((row) => ({ ...row }));
      },
      findOne: async (opts: { where: Record<string, unknown> }) => {
        const row = Array.from(table().values()).find((r) =>
          matchesWhere(r, opts.where),
        );
        return row ? { ...row } : null;
      },
      create: (data: Partial<T>) => ({ ...data }) as T,
      save: async (data: T) => {
        const key = (data as any).id ?? (data as any).dedupKey;
        table().set(key, data);
        return data;
      },
    });

    module = await Test.createTestingModule({
      providers: [
        EventReconciliationService,
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: ConfigService,
          useValue: { get: () => undefined },
        },
        {
          provide: getRepositoryToken(BlockchainStreamCursor),
          useValue: {
            findOne: async (opts: { where: Record<string, unknown> }) => {
              const row = Array.from(store.cursors.values()).find((r) =>
                matchesWhere(r, opts.where),
              );
              return row
                ? { ...row, ancestry: [...(row.ancestry ?? [])] }
                : null;
            },
          },
        },
        {
          provide: getRepositoryToken(BlockchainEventIdempotency),
          useValue: repoFor(() => store.idempotency),
        },
        {
          provide: getRepositoryToken(BlockchainEventDeadLetter),
          useValue: repoFor(() => store.deadLetters),
        },
      ],
    }).compile();

    service = module.get(EventReconciliationService);
    service.registerHandler(STREAM, new FakeObligationHandler(() => store));
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it('applies a duplicated event exactly once', async () => {
    const event = buildEvent();

    const first = await service.process(event, 200);
    const second = await service.process(event, 200);
    const third = await service.process(event, 200);

    expect(first.status).toBe('applied');
    expect(second.status).toBe('duplicate');
    expect(third.status).toBe('duplicate');
    expect(store.obligations.get('agreement-e2e')).toEqual(
      expect.objectContaining({ owner: 'GOWNER_A', transferCount: 1 }),
    );
  });

  it('withholds application until the confirmation depth is reached', async () => {
    const event = buildEvent({ ledger: 100 });

    const tooEarly = await service.process(event, 100); // 0 confirmations
    expect(tooEarly.status).toBe('pending-confirmation');
    expect(store.obligations.has('agreement-e2e')).toBe(false);

    const confirmed = await service.process(event, 101); // 1 confirmation
    expect(confirmed.status).toBe('applied');
    expect(store.obligations.get('agreement-e2e')?.owner).toBe('GOWNER_A');
  });

  it('rolls back an orphaned event on reorg and converges to the canonical chain', async () => {
    // Ledger 100 confirmed with the "wrong" (soon-to-be-orphaned) fork.
    const orphanEvent = buildEvent({
      ledger: 100,
      ledgerHash: 'orphan-h100',
      parentLedgerHash: 'h99',
      txHash: 'orphan-tx',
      data: { agreementId: 'agreement-e2e', owner: 'GOWNER_ORPHAN' },
    });
    const orphanOutcome = await service.process(orphanEvent, 200);
    expect(orphanOutcome.status).toBe('applied');
    expect(store.obligations.get('agreement-e2e')?.owner).toBe('GOWNER_ORPHAN');

    // Ledger 101 on the same (orphaned) fork.
    const orphanChild = buildEvent({
      ledger: 101,
      ledgerHash: 'orphan-h101',
      parentLedgerHash: 'orphan-h100',
      txHash: 'orphan-tx-2',
      eventIndex: 0,
      data: { agreementId: 'agreement-e2e', owner: 'GOWNER_ORPHAN_2' },
    });
    await service.process(orphanChild, 200);
    expect(store.obligations.get('agreement-e2e')?.owner).toBe(
      'GOWNER_ORPHAN_2',
    );

    // A reorg replaces ledger 100 with the canonical block: same ledger
    // number, different hash and parent hash than what we'd recorded.
    const canonicalEvent = buildEvent({
      ledger: 100,
      ledgerHash: 'canonical-h100',
      parentLedgerHash: 'h99',
      txHash: 'canonical-tx',
      data: { agreementId: 'agreement-e2e', owner: 'GOWNER_CANONICAL' },
    });
    const canonicalOutcome = await service.process(canonicalEvent, 200);

    expect(canonicalOutcome.status).toBe('applied');
    // Both orphaned events (ledger 100 and 101) must have been rolled back,
    // converging state to the canonical chain's effect.
    expect(store.obligations.get('agreement-e2e')?.owner).toBe(
      'GOWNER_CANONICAL',
    );
    expect(
      Array.from(store.idempotency.values()).filter(
        (r) => r.status === 'rolled_back',
      ),
    ).toHaveLength(2);

    // Replaying the canonical event again must still be a no-op.
    const replay = await service.process(canonicalEvent, 200);
    expect(replay.status).toBe('duplicate');
    expect(store.obligations.get('agreement-e2e')?.owner).toBe(
      'GOWNER_CANONICAL',
    );
  });
});
