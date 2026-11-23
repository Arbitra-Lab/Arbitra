import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import * as StellarSdk from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { BlockchainEventDeadLetter } from '../src/modules/stellar/entities/blockchain-event-dead-letter.entity';
import { BlockchainEventIdempotency } from '../src/modules/stellar/entities/blockchain-event-idempotency.entity';
import { BlockchainStreamCursor } from '../src/modules/stellar/entities/blockchain-stream-cursor.entity';
import { EscrowCondition } from '../src/modules/stellar/entities/escrow-condition.entity';
import { EscrowSignature } from '../src/modules/stellar/entities/escrow-signature.entity';
import {
  StellarAccount,
  StellarAccountType,
} from '../src/modules/stellar/entities/stellar-account.entity';
import {
  EscrowStatus,
  StellarEscrow,
} from '../src/modules/stellar/entities/stellar-escrow.entity';
import { AssetType } from '../src/modules/stellar/entities/stellar-transaction.entity';
import { DisputeContractService } from '../src/modules/stellar/services/dispute-contract.service';
import { EscrowChainIndexerService } from '../src/modules/stellar/services/escrow-chain-indexer.service';
import { EscrowContractService } from '../src/modules/stellar/services/escrow-contract.service';
import { EventReconciliationService } from '../src/modules/stellar/services/event-reconciliation.service';
import { PaymentProcessingService } from '../src/modules/stellar/services/payment-processing.service';

const NETWORK_PASSPHRASE = 'Standalone Network ; February 2017';

describe('Soroban contracts against local network (e2e)', () => {
  let app: INestApplication;
  let escrowService: EscrowContractService;
  let disputeService: DisputeContractService;
  let paymentService: PaymentProcessingService;
  let indexer: EscrowChainIndexerService;
  let escrowRepository: Repository<StellarEscrow>;
  let accountRepository: Repository<StellarAccount>;
  let admin: StellarSdk.Keypair;
  let depositor: StellarSdk.Keypair;
  let beneficiary: StellarSdk.Keypair;
  let arbiter: StellarSdk.Keypair;
  let ledger = Math.floor(Date.now() / 1000);
  const accountIds: number[] = [];
  const blockchainEscrowIds: string[] = [];

  const requiredEnv = [
    'SOROBAN_RPC_URL',
    'STELLAR_ADMIN_SECRET_KEY',
    'ESCROW_CONTRACT_ID',
    'DISPUTE_CONTRACT_ID',
    'PAYMENT_PROCESSING_CONTRACT_ID',
    'NATIVE_TOKEN_CONTRACT_ID',
    'STELLAR_FRIENDBOT_URL',
  ];

  beforeAll(async () => {
    for (const name of requiredEnv) {
      if (!process.env[name]) {
        throw new Error(
          `${name} must be set to run Soroban contract e2e tests`,
        );
      }
    }

    process.env.STELLAR_NETWORK_PASSPHRASE = NETWORK_PASSPHRASE;
    process.env.SOROBAN_RPC_ALLOW_HTTP = 'true';
    admin = StellarSdk.Keypair.fromSecret(
      process.env.STELLAR_ADMIN_SECRET_KEY!,
    );
    depositor = StellarSdk.Keypair.random();
    beneficiary = StellarSdk.Keypair.random();
    arbiter = StellarSdk.Keypair.random();

    await Promise.all([depositor, beneficiary, arbiter].map(fundAccount));

    const config = new ConfigService(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT || 5433),
          username: process.env.DB_USERNAME || 'postgres_cax',
          password: process.env.DB_PASSWORD || 'password',
          database: process.env.DB_NAME || 'arbitra_test',
          entities: [`${process.cwd()}/src/**/*.entity{.ts,.js}`],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([
          StellarAccount,
          StellarEscrow,
          EscrowSignature,
          EscrowCondition,
          BlockchainStreamCursor,
          BlockchainEventIdempotency,
          BlockchainEventDeadLetter,
        ]),
      ],
      providers: [
        { provide: ConfigService, useValue: config },
        EscrowContractService,
        DisputeContractService,
        PaymentProcessingService,
        EventReconciliationService,
        EscrowChainIndexerService,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    escrowService = moduleFixture.get(EscrowContractService);
    disputeService = moduleFixture.get(DisputeContractService);
    paymentService = moduleFixture.get(PaymentProcessingService);
    indexer = moduleFixture.get(EscrowChainIndexerService);
    escrowRepository = moduleFixture.get(getRepositoryToken(StellarEscrow));
    accountRepository = moduleFixture.get(getRepositoryToken(StellarAccount));
  }, 120_000);

  afterAll(async () => {
    if (escrowRepository) {
      for (const blockchainEscrowId of blockchainEscrowIds) {
        await escrowRepository.delete({ blockchainEscrowId });
      }
    }
    if (accountRepository && accountIds.length) {
      await accountRepository.delete(accountIds);
    }
    await app?.close();
  });

  it('funds and releases a Soroban escrow, then reconciles its state to PostgreSQL', async () => {
    await paymentService.setPlatformFeeCollector(admin.publicKey());
    await expect(paymentService.getPaymentCount()).resolves.toBe(0);

    const { escrowId, fundingTxHash } = await createFundedEscrow();
    const funded = await escrowService.getEscrow(escrowId);
    if (!funded) throw new Error(`Created escrow ${escrowId} was not found`);
    expect(funded.status).toBe('Funded');

    const databaseEscrow = await createDatabaseEscrow(escrowId);
    const fundedSync = await indexer.onStatus({
      escrowId,
      status: EscrowStatus.FUNDED,
      onChainStatus: funded.status,
      ledger: ++ledger,
      ledgerHash: `soroban-e2e-${ledger}`,
      parentLedgerHash: `soroban-e2e-${ledger - 1}`,
      txHash: fundingTxHash,
      eventIndex: 0,
      currentLedger: ledger + 1,
    });
    expect(fundedSync.status).toBe('applied');
    await expect(
      escrowRepository.findOneByOrFail({ id: databaseEscrow.id }),
    ).resolves.toMatchObject({ status: EscrowStatus.FUNDED });

    await escrowService.approveRelease(
      escrowId,
      depositor.publicKey(),
      beneficiary.publicKey(),
      depositor,
    );
    const releaseTxHash = await escrowService.approveRelease(
      escrowId,
      beneficiary.publicKey(),
      beneficiary.publicKey(),
      beneficiary,
    );

    const released = await escrowService.getEscrow(escrowId);
    if (!released) throw new Error(`Released escrow ${escrowId} was not found`);
    expect(released.status).toBe('Released');
    const releasedSync = await indexer.onStatus({
      escrowId,
      status: EscrowStatus.RELEASED,
      onChainStatus: released.status,
      ledger: ++ledger,
      ledgerHash: `soroban-e2e-${ledger}`,
      parentLedgerHash: `soroban-e2e-${ledger - 1}`,
      txHash: releaseTxHash,
      eventIndex: 0,
      currentLedger: ledger + 1,
    });
    expect(releasedSync.status).toBe('applied');
    await expect(
      escrowRepository.findOneByOrFail({ id: databaseEscrow.id }),
    ).resolves.toMatchObject({ status: EscrowStatus.RELEASED });
  }, 120_000);

  it('records an arbiter vote for a funded escrow dispute and reconciles the dispute state', async () => {
    const { escrowId } = await createFundedEscrow();
    await createDatabaseEscrow(escrowId);

    await disputeService.addArbiter(arbiter.publicKey());
    await disputeService.raiseDispute(
      depositor.secret(),
      escrowId,
      'e2e dispute evidence',
    );
    await disputeService.voteOnDispute(arbiter.secret(), escrowId, true);

    await expect(
      disputeService.getVote(escrowId, arbiter.publicKey()),
    ).resolves.toMatchObject({
      arbiter: arbiter.publicKey(),
      caseId: escrowId,
      favorClaimant: true,
    });
    await expect(disputeService.getDispute(escrowId)).resolves.toMatchObject({
      votesFavorClaimant: 1,
      votesFavorRespondent: 0,
      resolved: false,
    });

    const disputeTxHash = await escrowService.raiseDispute(
      escrowId,
      depositor.publicKey(),
      'e2e dispute evidence',
      depositor,
    );
    const disputed = await escrowService.getEscrow(escrowId);
    if (!disputed) throw new Error(`Disputed escrow ${escrowId} was not found`);
    expect(disputed.status).toBe('Disputed');

    const disputedSync = await indexer.onStatus({
      escrowId,
      status: EscrowStatus.DISPUTED,
      onChainStatus: disputed.status,
      ledger: ++ledger,
      ledgerHash: `soroban-e2e-${ledger}`,
      parentLedgerHash: `soroban-e2e-${ledger - 1}`,
      txHash: disputeTxHash,
      eventIndex: 0,
      currentLedger: ledger + 1,
    });
    expect(disputedSync.status).toBe('applied');
    await expect(
      escrowRepository.findOneByOrFail({
        blockchainEscrowId: escrowId,
      }),
    ).resolves.toMatchObject({
      status: EscrowStatus.DISPUTED,
      onChainStatus: 'Disputed',
    });
  }, 120_000);

  async function createFundedEscrow(): Promise<{
    escrowId: string;
    fundingTxHash: string;
  }> {
    const escrowId = await escrowService.createEscrow({
      depositor: depositor.publicKey(),
      beneficiary: beneficiary.publicKey(),
      arbiter: arbiter.publicKey(),
      amount: '10000000',
      token: process.env.NATIVE_TOKEN_CONTRACT_ID!,
    });
    blockchainEscrowIds.push(escrowId);
    const fundingTxHash = await escrowService.fundEscrow(
      escrowId,
      depositor.publicKey(),
      depositor,
    );
    return { escrowId, fundingTxHash };
  }

  async function createDatabaseEscrow(
    blockchainEscrowId: string,
  ): Promise<StellarEscrow> {
    const [escrowAccount, sourceAccount, destinationAccount] =
      await Promise.all([
        createDatabaseAccount(StellarAccountType.ESCROW),
        createDatabaseAccount(StellarAccountType.USER),
        createDatabaseAccount(StellarAccountType.USER),
      ]);
    const escrow = await escrowRepository.save(
      escrowRepository.create({
        escrowAccountId: escrowAccount.id,
        sourceAccountId: sourceAccount.id,
        destinationAccountId: destinationAccount.id,
        amount: '1.0000000',
        assetType: AssetType.NATIVE,
        assetCode: null,
        assetIssuer: null,
        sequenceNumber: '0',
        status: EscrowStatus.PENDING,
        releaseConditions: null,
        expirationDate: null,
        releasedAt: null,
        refundedAt: null,
        releaseTransactionHash: null,
        refundTransactionHash: null,
        rentAgreementId: null,
        blockchainEscrowId,
        onChainStatus: 'Pending',
        escrowContractAddress: process.env.ESCROW_CONTRACT_ID!,
        arbiterAddress: arbiter.publicKey(),
        disputeId: null,
        disputeReason: null,
        blockchainSyncedAt: null,
        approvalCount: 0,
        escrowMetadata: {},
        isMultiSig: false,
        requiredSignatures: 1,
        releaseTime: null,
        isTimeLocked: false,
        linkedDisputeId: null,
        disputeIntegrated: false,
      }),
    );
    return escrow;
  }

  async function createDatabaseAccount(
    accountType: StellarAccountType,
  ): Promise<StellarAccount> {
    const account = await accountRepository.save(
      accountRepository.create({
        userId: null,
        publicKey: StellarSdk.Keypair.random().publicKey(),
        secretKeyEncrypted: 'e2e-only',
        sequenceNumber: '0',
        accountType,
        isActive: true,
        balance: '0',
      }),
    );
    accountIds.push(account.id);
    return account;
  }

  async function fundAccount(keypair: StellarSdk.Keypair): Promise<void> {
    const response = await fetch(
      `${process.env.STELLAR_FRIENDBOT_URL}?addr=${encodeURIComponent(keypair.publicKey())}`,
    );
    if (!response.ok) {
      throw new Error(
        `Local Friendbot failed to fund ${keypair.publicKey()}: ${response.status} ${await response.text()}`,
      );
    }
  }
});
