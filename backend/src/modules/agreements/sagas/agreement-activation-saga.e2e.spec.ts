import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Reflector } from '@nestjs/core';
import * as request from 'supertest';
import { AgreementsController } from '../agreements.controller';
import { AgreementsService } from '../agreements.service';
import { AgreementActivationSagaService } from './agreement-activation-saga.service';
import { AgreementActivationSaga } from './agreement-activation-saga.entity';
import { SagaStatus, SagaStepStatus } from './agreement-activation-saga.types';
import {
  RentAgreement,
  AgreementStatus,
} from '../../rent/entities/rent-contract.entity';
import { Payment } from '../../rent/entities/payment.entity';
import { AuditService } from '../../audit/audit.service';
import { AuditLogInterceptor } from '../../audit/interceptors/audit-log.interceptor';
import { ReviewPromptService } from '../../reviews/review-prompt.service';
import { ArbitraAgreementContractService } from '../../stellar/services/arbitra-agreement-contract.service';
import { TemplateRenderingService } from '../template-rendering.service';
import { PDFGenerationService } from '../pdf-generation.service';
import { AgreementStateService } from '../state-machines/agreement-state-machine.service';
import { AgreementNftService } from '../agreement-nft.service';
import { EscrowIntegrationService } from '../escrow-integration.service';
import { BlockchainSyncService } from '../blockchain-sync.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { LockService } from '../../../common/lock';
import { IdempotencyService } from '../../../common/idempotency';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

/**
 * End-to-end coverage for agreement activation: real HTTP request through
 * AgreementsController -> AgreementsService -> AgreementActivationSagaService
 * -> AgreementStateService (all real), with only the four side-effect
 * boundaries (NFT mint, escrow, blockchain sync, notifications) and
 * persistence faked, since exercising live Stellar contracts / a live
 * Postgres instance isn't part of what this suite verifies. Crash-recovery
 * across a process restart is covered at the orchestrator level in
 * agreement-activation-saga.service.spec.ts; this file proves the two
 * scenarios requirement 5 asks for end-to-end: a full successful activation
 * and a forced-failure rollback, both driven over the wire.
 */

/** Minimal in-memory Repository stand-in; see the unit spec for details. */
class FakeRepository<T extends Record<string, any>> {
  private readonly store = new Map<string, T>();
  private counter = 0;

  create(partial: Partial<T>): T {
    return { ...(partial as object) } as T;
  }

  async save(entity: T): Promise<T> {
    const record: any = { ...entity };
    if (!record.id) record.id = `id-${++this.counter}`;
    if (!record.createdAt) record.createdAt = new Date();
    record.updatedAt = new Date();
    this.store.set(record.id, record);
    Object.assign(entity as any, record);
    return record;
  }

  async findOne(options: { where: any }): Promise<T | null> {
    return (
      Array.from(this.store.values()).find((entity: any) =>
        Object.entries(options.where).every(([k, v]) => entity[k] === v),
      ) ?? null
    );
  }

  async find(options: { where: any }): Promise<T[]> {
    return Array.from(this.store.values()).filter((entity: any) =>
      Object.entries(options.where).every(([k, v]) => entity[k] === v),
    );
  }
}

function createFakeSideEffects() {
  const nftStore = new Map<string, any>();
  const escrowStore = new Map<string, any>();
  let failNextEscrowCreate = false;

  return {
    failNextEscrowCreate: () => {
      failNextEscrowCreate = true;
    },
    nft: {
      getNftByAgreement: jest.fn(
        async (agreementId: string) => nftStore.get(agreementId) ?? null,
      ),
      mintNftForAgreement: jest.fn(
        async (agreementId: string, adminAddress: string) => {
          const nft = {
            id: `nft-${agreementId}`,
            tokenId: `tok-${agreementId}`,
            obligationId: `ob-${agreementId}`,
            currentOwner: adminAddress,
            status: 'active',
          };
          nftStore.set(agreementId, nft);
          return nft;
        },
      ),
      voidNftForAgreement: jest.fn(async (agreementId: string) => {
        const nft = nftStore.get(agreementId);
        if (nft) nft.status = 'voided';
      }),
    },
    escrow: {
      getEscrowForAgreement: jest.fn(
        async (agreementId: string) => escrowStore.get(agreementId) ?? null,
      ),
      createEscrowForAgreement: jest.fn(async (agreementId: string) => {
        if (failNextEscrowCreate) {
          failNextEscrowCreate = false;
          throw new Error('escrow funding failed (forced)');
        }
        const escrow = { id: escrowStore.size + 1, status: 'PENDING' };
        escrowStore.set(agreementId, escrow);
        return escrow;
      }),
      cancelEscrowForAgreement: jest.fn(async (agreementId: string) => {
        const escrow = escrowStore.get(agreementId);
        if (escrow) escrow.status = 'CANCELLED';
      }),
    },
    blockchain: {
      syncAgreementWithBlockchain: jest.fn(async () => undefined),
    },
    notifications: {
      notify: jest.fn(async () => ({})),
    },
    _nftStore: nftStore,
    _escrowStore: escrowStore,
  };
}

describe('Agreement activation (e2e via HTTP)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let agreementRepo: FakeRepository<RentAgreement>;
  let sagaRepo: FakeRepository<AgreementActivationSaga>;
  let fakes: ReturnType<typeof createFakeSideEffects>;
  let agreementCounter = 0;

  beforeEach(async () => {
    agreementRepo = new FakeRepository<RentAgreement>();
    sagaRepo = new FakeRepository<AgreementActivationSaga>();
    fakes = createFakeSideEffects();

    module = await Test.createTestingModule({
      controllers: [AgreementsController],
      providers: [
        AgreementsService,
        AgreementActivationSagaService,
        AgreementStateService,
        Reflector,
        AuditLogInterceptor,
        { provide: getRepositoryToken(RentAgreement), useValue: agreementRepo },
        {
          provide: getRepositoryToken(Payment),
          useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn() },
        },
        {
          provide: getRepositoryToken(AgreementActivationSaga),
          useValue: sagaRepo,
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: ReviewPromptService, useValue: {} },
        { provide: ArbitraAgreementContractService, useValue: {} },
        { provide: BlockchainSyncService, useValue: fakes.blockchain },
        { provide: EscrowIntegrationService, useValue: fakes.escrow },
        { provide: AgreementNftService, useValue: fakes.nft },
        { provide: NotificationsService, useValue: fakes.notifications },
        { provide: TemplateRenderingService, useValue: { render: jest.fn() } },
        {
          provide: PDFGenerationService,
          useValue: { generateAgreement: jest.fn() },
        },
        {
          provide: LockService,
          useValue: {
            withLock: jest.fn(
              async (_k: string, _t: number, fn: () => Promise<unknown>) =>
                fn(),
            ),
          },
        },
        {
          provide: IdempotencyService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
            process: jest.fn(),
          },
        },
        { provide: EventEmitter2, useValue: new EventEmitter2() },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const seedSignedAgreement = async (): Promise<RentAgreement> => {
    agreementCounter += 1;
    const agreement = agreementRepo.create({
      agreementNumber: `E2E-${agreementCounter}`,
      status: AgreementStatus.SIGNED,
      adminId: 'admin-1',
      userId: 'tenant-1',
      adminStellarPubKey: 'G' + 'A'.repeat(55),
      userStellarPubKey: 'G' + 'B'.repeat(55),
    } as Partial<RentAgreement>);
    return agreementRepo.save(agreement);
  };

  it('POST /agreements/:id/activate fully activates the agreement', async () => {
    const agreement = await seedSignedAgreement();

    const response = await request(app.getHttpServer())
      .post(`/agreements/${agreement.id}/activate`)
      .expect(200);

    expect(response.body.status).toBe(SagaStatus.COMPLETED);
    expect(
      response.body.steps.every(
        (s: any) => s.status === SagaStepStatus.COMPLETED,
      ),
    ).toBe(true);

    const stored = await agreementRepo.findOne({ where: { id: agreement.id } });
    expect(stored!.status).toBe(AgreementStatus.ACTIVE);

    expect(fakes.nft.mintNftForAgreement).toHaveBeenCalledTimes(1);
    expect(fakes.escrow.createEscrowForAgreement).toHaveBeenCalledTimes(1);
    expect(fakes.blockchain.syncAgreementWithBlockchain).toHaveBeenCalledTimes(
      1,
    );
    expect(fakes.notifications.notify).toHaveBeenCalledTimes(2);
  });

  it('POST /agreements/:id/activate rolls back and marks activation_failed when escrow funding fails', async () => {
    const agreement = await seedSignedAgreement();
    fakes.failNextEscrowCreate();

    const response = await request(app.getHttpServer())
      .post(`/agreements/${agreement.id}/activate`)
      .expect(200);

    expect(response.body.status).toBe(SagaStatus.COMPENSATED);

    const stepByName = (name: string) =>
      response.body.steps.find((s: any) => s.name === name);
    expect(stepByName('mint_nft').status).toBe(SagaStepStatus.COMPENSATED);
    expect(stepByName('fund_escrow').status).toBe(SagaStepStatus.FAILED);
    expect(stepByName('blockchain_sync').status).toBe(SagaStepStatus.PENDING);
    expect(stepByName('finalize_active').status).toBe(SagaStepStatus.PENDING);
    expect(stepByName('notify_parties').status).toBe(SagaStepStatus.PENDING);

    // No orphaned side effects: the mint was compensated, later steps never ran.
    expect(fakes._nftStore.get(agreement.id).status).toBe('voided');
    expect(fakes.blockchain.syncAgreementWithBlockchain).not.toHaveBeenCalled();
    expect(fakes.notifications.notify).not.toHaveBeenCalled();

    const stored = await agreementRepo.findOne({ where: { id: agreement.id } });
    expect(stored!.status).toBe(AgreementStatus.ACTIVATION_FAILED);
    expect(stored!.activationFailureReason).toContain('fund_escrow');
  });

  it('activation is idempotent over HTTP: re-posting after completion does not re-run steps', async () => {
    const agreement = await seedSignedAgreement();

    await request(app.getHttpServer())
      .post(`/agreements/${agreement.id}/activate`)
      .expect(200);
    const second = await request(app.getHttpServer())
      .post(`/agreements/${agreement.id}/activate`)
      .expect(200);

    expect(second.body.status).toBe(SagaStatus.COMPLETED);
    expect(fakes.nft.mintNftForAgreement).toHaveBeenCalledTimes(1);
    expect(fakes.escrow.createEscrowForAgreement).toHaveBeenCalledTimes(1);
  });
});
