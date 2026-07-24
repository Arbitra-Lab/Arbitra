import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FindOperator } from 'typeorm';
import { AgreementActivationSagaService } from './agreement-activation-saga.service';
import { AgreementActivationSaga } from './agreement-activation-saga.entity';
import {
  ActivationSagaStepName,
  SagaStatus,
  SagaStepStatus,
} from './agreement-activation-saga.types';
import {
  RentAgreement,
  AgreementStatus,
} from '../../rent/entities/rent-contract.entity';
import { AgreementStateService } from '../state-machines/agreement-state-machine.service';
import { AgreementNftService } from '../agreement-nft.service';
import { EscrowIntegrationService } from '../escrow-integration.service';
import { BlockchainSyncService } from '../blockchain-sync.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { LockService } from '../../../common/lock';

/**
 * Minimal in-memory stand-in for a TypeORM Repository, good enough to
 * exercise the saga's create/find/save/resume flow without a real database.
 * Supports the subset of the query API the saga service actually uses:
 * findOne/find with equality and `In(...)` where-clauses, ordered by
 * createdAt, plus create/save.
 */
class FakeRepository<T extends Record<string, any>> {
  private readonly store = new Map<string, T>();
  private counter = 0;

  create(partial: Partial<T>): T {
    return { ...(partial as object) } as T;
  }

  /** Directly inserts a fully-formed entity, bypassing id/timestamp generation. */
  seed(entity: T): T {
    this.store.set((entity as any).id, entity);
    return entity;
  }

  async save(entity: T): Promise<T> {
    const record: any = { ...entity };
    if (!record.id) {
      record.id = `id-${++this.counter}`;
    }
    if (!record.createdAt) {
      record.createdAt = new Date();
    }
    record.updatedAt = new Date();
    this.store.set(record.id, record);
    // Mutate the caller's object too, mirroring how callers in this
    // codebase reassign `saga = await repo.save(saga)`.
    Object.assign(entity as any, record);
    return record;
  }

  async findOne(options: { where: any; order?: any }): Promise<T | null> {
    const results = this.filter(options.where);
    this.applyOrder(results, options.order);
    return results[0] ?? null;
  }

  async find(options: { where: any; order?: any }): Promise<T[]> {
    const results = this.filter(options.where);
    this.applyOrder(results, options.order);
    return results;
  }

  private applyOrder(results: T[], order?: any) {
    if (order?.createdAt === 'DESC') {
      results.sort(
        (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
  }

  private filter(where: any): T[] {
    return Array.from(this.store.values()).filter((entity: any) =>
      Object.entries(where).every(([key, value]) => {
        if (value instanceof FindOperator) {
          if (value.type === 'in') {
            return (value.value as any[]).includes(entity[key]);
          }
          throw new Error(
            `Unsupported FindOperator in fake repo: ${value.type}`,
          );
        }
        return entity[key] === value;
      }),
    );
  }
}

describe('AgreementActivationSagaService', () => {
  let service: AgreementActivationSagaService;
  let sagaRepo: FakeRepository<AgreementActivationSaga>;
  let agreementRepo: FakeRepository<RentAgreement>;
  let nftService: Record<string, jest.Mock>;
  let escrowService: Record<string, jest.Mock>;
  let blockchainSync: Record<string, jest.Mock>;
  let notificationsService: Record<string, jest.Mock>;
  let stateService: Record<string, jest.Mock>;
  let eventEmitter: Record<string, jest.Mock>;

  /** Records the order in which forward/compensating actions actually run. */
  let calls: string[];
  let agreementCounter = 0;

  const seedAgreement = (
    overrides: Partial<RentAgreement> = {},
  ): RentAgreement => {
    agreementCounter += 1;
    const agreement = {
      id: `agr-${agreementCounter}`,
      status: AgreementStatus.SIGNED,
      adminId: 'admin-1',
      userId: 'tenant-1',
      adminStellarPubKey: 'G' + 'A'.repeat(55),
      userStellarPubKey: 'G' + 'B'.repeat(55),
      activationFailureReason: null,
      ...overrides,
    } as RentAgreement;
    agreementRepo.seed(agreement);
    return agreement;
  };

  beforeEach(async () => {
    calls = [];
    agreementCounter = 0;
    sagaRepo = new FakeRepository<AgreementActivationSaga>();
    agreementRepo = new FakeRepository<RentAgreement>();

    nftService = {
      getNftByAgreement: jest.fn().mockResolvedValue(null),
      mintNftForAgreement: jest.fn().mockImplementation(async () => {
        calls.push('mint_nft:execute');
        return { id: 'nft-1', tokenId: 'tok-1', obligationId: 'ob-1' };
      }),
      voidNftForAgreement: jest.fn().mockImplementation(async () => {
        calls.push('mint_nft:compensate');
      }),
    };

    escrowService = {
      getEscrowForAgreement: jest.fn().mockResolvedValue(null),
      createEscrowForAgreement: jest.fn().mockImplementation(async () => {
        calls.push('fund_escrow:execute');
        return { id: 55, status: 'PENDING' };
      }),
      cancelEscrowForAgreement: jest.fn().mockImplementation(async () => {
        calls.push('fund_escrow:compensate');
      }),
    };

    blockchainSync = {
      syncAgreementWithBlockchain: jest.fn().mockImplementation(async () => {
        calls.push('blockchain_sync:execute');
      }),
    };

    notificationsService = {
      notify: jest.fn().mockImplementation(async (_userId, title) => {
        calls.push(
          title === 'Lease activated'
            ? 'notify_parties:execute'
            : 'notify_parties:compensate',
        );
        return {};
      }),
    };

    stateService = {
      validateTransition: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn().mockImplementation((event: string, payload: any) => {
        if (event !== 'agreement.status.changed') return;
        if (payload.newStatus === AgreementStatus.ACTIVE) {
          calls.push('finalize_active:execute');
        } else if (payload.oldStatus === AgreementStatus.ACTIVE) {
          calls.push('finalize_active:compensate');
        } else if (payload.newStatus === AgreementStatus.ACTIVATION_FAILED) {
          calls.push('mark_activation_failed');
        }
      }),
    };

    const lockService = {
      withLock: jest.fn(
        async (_key: string, _ttl: number, fn: () => Promise<unknown>) => fn(),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgreementActivationSagaService,
        {
          provide: getRepositoryToken(AgreementActivationSaga),
          useValue: sagaRepo,
        },
        { provide: getRepositoryToken(RentAgreement), useValue: agreementRepo },
        { provide: AgreementNftService, useValue: nftService },
        { provide: EscrowIntegrationService, useValue: escrowService },
        { provide: BlockchainSyncService, useValue: blockchainSync },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: AgreementStateService, useValue: stateService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: LockService, useValue: lockService },
      ],
    }).compile();

    service = module.get(AgreementActivationSagaService);
  });

  const ALL_STEPS = [
    ActivationSagaStepName.MINT_NFT,
    ActivationSagaStepName.FUND_ESCROW,
    ActivationSagaStepName.BLOCKCHAIN_SYNC,
    ActivationSagaStepName.FINALIZE_ACTIVE,
    ActivationSagaStepName.NOTIFY_PARTIES,
  ];

  describe('successful activation', () => {
    it('runs every step in order exactly once and completes the saga', async () => {
      const agreement = seedAgreement();

      const saga = await service.activate(agreement.id);

      expect(saga.status).toBe(SagaStatus.COMPLETED);
      expect(
        saga.steps.every((s) => s.status === SagaStepStatus.COMPLETED),
      ).toBe(true);
      expect(calls).toEqual([
        'mint_nft:execute',
        'fund_escrow:execute',
        'blockchain_sync:execute',
        'finalize_active:execute',
        'notify_parties:execute', // tenant
        'notify_parties:execute', // admin
      ]);

      const stored = await agreementRepo.findOne({
        where: { id: agreement.id },
      });
      expect(stored!.status).toBe(AgreementStatus.ACTIVE);

      expect(nftService.mintNftForAgreement).toHaveBeenCalledTimes(1);
      expect(escrowService.createEscrowForAgreement).toHaveBeenCalledTimes(1);
      expect(blockchainSync.syncAgreementWithBlockchain).toHaveBeenCalledTimes(
        1,
      );
      expect(notificationsService.notify).toHaveBeenCalledTimes(2); // tenant + admin
    });

    it('is idempotent: re-activating a completed agreement does not re-run steps', async () => {
      const agreement = seedAgreement();

      await service.activate(agreement.id);
      calls = [];
      const second = await service.activate(agreement.id);

      expect(second.status).toBe(SagaStatus.COMPLETED);
      expect(calls).toEqual([]);
      expect(nftService.mintNftForAgreement).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure injection and compensation ordering', () => {
    it.each([
      [ActivationSagaStepName.MINT_NFT, []],
      [ActivationSagaStepName.FUND_ESCROW, ['mint_nft:compensate']],
      [
        ActivationSagaStepName.BLOCKCHAIN_SYNC,
        ['fund_escrow:compensate', 'mint_nft:compensate'],
      ],
      [
        ActivationSagaStepName.FINALIZE_ACTIVE,
        ['fund_escrow:compensate', 'mint_nft:compensate'],
      ],
      [
        ActivationSagaStepName.NOTIFY_PARTIES,
        [
          'finalize_active:compensate',
          'fund_escrow:compensate',
          'mint_nft:compensate',
        ],
      ],
    ])(
      'compensates all prior steps in reverse order when %s fails',
      async (failingStep, expectedCompensationOrder) => {
        const agreement = seedAgreement();
        const failure = new Error(`forced failure at ${failingStep}`);

        switch (failingStep) {
          case ActivationSagaStepName.MINT_NFT:
            nftService.mintNftForAgreement.mockRejectedValueOnce(failure);
            break;
          case ActivationSagaStepName.FUND_ESCROW:
            escrowService.createEscrowForAgreement.mockRejectedValueOnce(
              failure,
            );
            break;
          case ActivationSagaStepName.BLOCKCHAIN_SYNC:
            blockchainSync.syncAgreementWithBlockchain.mockRejectedValueOnce(
              failure,
            );
            break;
          case ActivationSagaStepName.FINALIZE_ACTIVE:
            stateService.validateTransition
              .mockImplementationOnce(() => {}) // createSaga eligibility check
              .mockImplementationOnce(() => {
                throw failure;
              });
            break;
          case ActivationSagaStepName.NOTIFY_PARTIES:
            notificationsService.notify.mockRejectedValueOnce(failure);
            break;
        }

        const saga = await service.activate(agreement.id);

        expect(saga.status).toBe(SagaStatus.COMPENSATED);
        expect(saga.failureReason).toContain(failingStep);

        const failedIndex = ALL_STEPS.indexOf(failingStep);
        const record = (name: ActivationSagaStepName) =>
          saga.steps.find((s) => s.name === name)!;

        // Steps before the failure: completed forward, then compensated.
        for (let i = 0; i < failedIndex; i++) {
          expect(record(ALL_STEPS[i]).status).toBe(SagaStepStatus.COMPENSATED);
        }
        // The failing step itself: marked FAILED, never compensated.
        expect(record(failingStep).status).toBe(SagaStepStatus.FAILED);
        // Steps after the failure never ran.
        for (let i = failedIndex + 1; i < ALL_STEPS.length; i++) {
          expect(record(ALL_STEPS[i]).status).toBe(SagaStepStatus.PENDING);
        }

        // Compensations ran in strict reverse order.
        const compensationCalls = calls.filter((c) =>
          c.endsWith(':compensate'),
        );
        expect(compensationCalls).toEqual(expectedCompensationOrder);

        const stored = await agreementRepo.findOne({
          where: { id: agreement.id },
        });
        expect(stored!.status).toBe(AgreementStatus.ACTIVATION_FAILED);
        expect(stored!.activationFailureReason).toContain(failingStep);
      },
    );

    it('reverts the ACTIVE status transition when a step after finalize_active fails', async () => {
      const agreement = seedAgreement();
      notificationsService.notify.mockRejectedValueOnce(
        new Error('notify boom'),
      );

      await service.activate(agreement.id);

      // finalize_active ran (flipped to ACTIVE), then got compensated back.
      expect(calls).toContain('finalize_active:execute');
      expect(calls).toContain('finalize_active:compensate');
      expect(calls.indexOf('finalize_active:execute')).toBeLessThan(
        calls.indexOf('finalize_active:compensate'),
      );

      const stored = await agreementRepo.findOne({
        where: { id: agreement.id },
      });
      expect(stored!.status).toBe(AgreementStatus.ACTIVATION_FAILED);
    });
  });

  describe('crash recovery', () => {
    it('resumes a saga left mid-flight without re-running already-completed steps', async () => {
      const agreement = seedAgreement();

      // Simulate a process that crashed right after mint_nft committed, but
      // before fund_escrow ran - persisted saga row survives the "restart".
      const crashedSaga = sagaRepo.create({
        agreementId: agreement.id,
        status: SagaStatus.RUNNING,
        previousAgreementStatus: AgreementStatus.SIGNED,
        failureReason: null,
        context: {
          adminId: agreement.adminId,
          userId: agreement.userId,
          adminStellarPubKey: agreement.adminStellarPubKey,
          userStellarPubKey: agreement.userStellarPubKey,
          [ActivationSagaStepName.MINT_NFT]: {
            nftId: 'nft-1',
            tokenId: 'tok-1',
          },
        },
        steps: ALL_STEPS.map((name) => ({
          name,
          status:
            name === ActivationSagaStepName.MINT_NFT
              ? SagaStepStatus.COMPLETED
              : SagaStepStatus.PENDING,
        })),
      });
      await sagaRepo.save(crashedSaga);

      // A brand new service instance stands in for the restarted process;
      // it shares nothing with `service` except the (persisted) fake repos.
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AgreementActivationSagaService,
          {
            provide: getRepositoryToken(AgreementActivationSaga),
            useValue: sagaRepo,
          },
          {
            provide: getRepositoryToken(RentAgreement),
            useValue: agreementRepo,
          },
          { provide: AgreementNftService, useValue: nftService },
          { provide: EscrowIntegrationService, useValue: escrowService },
          { provide: BlockchainSyncService, useValue: blockchainSync },
          { provide: NotificationsService, useValue: notificationsService },
          { provide: AgreementStateService, useValue: stateService },
          { provide: EventEmitter2, useValue: eventEmitter },
          {
            provide: LockService,
            useValue: {
              withLock: jest.fn(
                async (_k: string, _t: number, fn: () => Promise<unknown>) =>
                  fn(),
              ),
            },
          },
        ],
      }).compile();
      const restarted = module.get<AgreementActivationSagaService>(
        AgreementActivationSagaService,
      );

      await restarted.resumeIncompleteSagas();

      // mint_nft must not be re-invoked: it was already marked completed.
      expect(nftService.mintNftForAgreement).not.toHaveBeenCalled();
      expect(calls).toEqual([
        'fund_escrow:execute',
        'blockchain_sync:execute',
        'finalize_active:execute',
        'notify_parties:execute',
        'notify_parties:execute',
      ]);

      const resumed = await service.getSagaForAgreement(agreement.id);
      expect(resumed!.status).toBe(SagaStatus.COMPLETED);

      const stored = await agreementRepo.findOne({
        where: { id: agreement.id },
      });
      expect(stored!.status).toBe(AgreementStatus.ACTIVE);
    });

    it('resumes a saga left mid-compensation and finishes rolling it back', async () => {
      const agreement = seedAgreement();

      // Crashed after mint_nft + fund_escrow completed, blockchain_sync
      // failed, and mint_nft's compensation had already been recorded -
      // only fund_escrow still needs compensating.
      const crashedSaga = sagaRepo.create({
        agreementId: agreement.id,
        status: SagaStatus.COMPENSATING,
        previousAgreementStatus: AgreementStatus.SIGNED,
        failureReason: "Step 'blockchain_sync' failed: boom",
        context: {
          adminId: agreement.adminId,
          userId: agreement.userId,
        },
        steps: [
          {
            name: ActivationSagaStepName.MINT_NFT,
            status: SagaStepStatus.COMPENSATED,
          },
          {
            name: ActivationSagaStepName.FUND_ESCROW,
            status: SagaStepStatus.COMPLETED,
          },
          {
            name: ActivationSagaStepName.BLOCKCHAIN_SYNC,
            status: SagaStepStatus.FAILED,
          },
          {
            name: ActivationSagaStepName.FINALIZE_ACTIVE,
            status: SagaStepStatus.PENDING,
          },
          {
            name: ActivationSagaStepName.NOTIFY_PARTIES,
            status: SagaStepStatus.PENDING,
          },
        ],
      });
      await sagaRepo.save(crashedSaga);

      await service.resumeIncompleteSagas();

      expect(calls).toEqual([
        'fund_escrow:compensate',
        'mark_activation_failed',
      ]);
      expect(nftService.voidNftForAgreement).not.toHaveBeenCalled();

      const resumed = await service.getSagaForAgreement(agreement.id);
      expect(resumed!.status).toBe(SagaStatus.COMPENSATED);

      const stored = await agreementRepo.findOne({
        where: { id: agreement.id },
      });
      expect(stored!.status).toBe(AgreementStatus.ACTIVATION_FAILED);
    });
  });
});
