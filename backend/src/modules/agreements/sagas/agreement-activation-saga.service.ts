import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  RentAgreement,
  AgreementStatus,
} from '../../rent/entities/rent-contract.entity';
import { AgreementStateService } from '../state-machines/agreement-state-machine.service';
import { AgreementStatusChangedEvent } from '../events/agreement-status-changed.event';
import { AgreementNftService } from '../agreement-nft.service';
import { EscrowIntegrationService } from '../escrow-integration.service';
import { BlockchainSyncService } from '../blockchain-sync.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EscrowStatus } from '../../stellar/entities/stellar-escrow.entity';
import { LockService } from '../../../common/lock';
import { AgreementActivationSaga } from './agreement-activation-saga.entity';
import {
  ACTIVATION_SAGA_STEP_ORDER,
  ActivationSagaContext,
  ActivationSagaStep,
  ActivationSagaStepName,
  SagaStatus,
  SagaStepStatus,
} from './agreement-activation-saga.types';

const IN_FLIGHT_SAGA_STATUSES = [
  SagaStatus.PENDING,
  SagaStatus.RUNNING,
  SagaStatus.COMPENSATING,
  SagaStatus.COMPENSATION_FAILED,
];

/**
 * Orchestrates agreement activation as a saga: NFT mint, escrow funding,
 * blockchain sync, the ACTIVE status transition, and party notifications
 * run in order, each with a compensating action. Saga state is persisted
 * after every step so a crash mid-run can be resumed (or compensated) from
 * exactly where it stopped, instead of re-running from scratch or leaving
 * orphaned side effects.
 */
@Injectable()
export class AgreementActivationSagaService implements OnModuleInit {
  private readonly logger = new Logger(AgreementActivationSagaService.name);

  /**
   * LockService caps TTLs at 30s; a full activation is expected to fit
   * inside that window the same way the rest of this module's @Locked
   * operations do.
   */
  private static readonly LOCK_TTL_MS = 30_000;

  constructor(
    @InjectRepository(AgreementActivationSaga)
    private readonly sagaRepository: Repository<AgreementActivationSaga>,
    @InjectRepository(RentAgreement)
    private readonly agreementRepository: Repository<RentAgreement>,
    private readonly nftService: AgreementNftService,
    private readonly escrowService: EscrowIntegrationService,
    private readonly blockchainSync: BlockchainSyncService,
    private readonly notificationsService: NotificationsService,
    private readonly stateService: AgreementStateService,
    private readonly eventEmitter: EventEmitter2,
    private readonly lockService: LockService,
  ) {}

  onModuleInit(): void {
    // Crash recovery: pick up any saga left RUNNING/COMPENSATING by a
    // previous process that died mid-activation.
    this.resumeIncompleteSagas().catch((err) => {
      this.logger.error(
        `Failed to resume in-flight agreement activation sagas: ${err instanceof Error ? err.message : err}`,
      );
    });
  }

  private get stepDefinitions(): ActivationSagaStep[] {
    return [
      {
        name: ActivationSagaStepName.MINT_NFT,
        execute: this.executeMintNft.bind(this),
        compensate: this.compensateMintNft.bind(this),
      },
      {
        name: ActivationSagaStepName.FUND_ESCROW,
        execute: this.executeFundEscrow.bind(this),
        compensate: this.compensateFundEscrow.bind(this),
      },
      {
        name: ActivationSagaStepName.BLOCKCHAIN_SYNC,
        execute: this.executeBlockchainSync.bind(this),
        compensate: this.compensateBlockchainSync.bind(this),
      },
      {
        name: ActivationSagaStepName.FINALIZE_ACTIVE,
        execute: this.executeFinalizeActive.bind(this),
        compensate: this.compensateFinalizeActive.bind(this),
      },
      {
        name: ActivationSagaStepName.NOTIFY_PARTIES,
        execute: this.executeNotifyParties.bind(this),
        compensate: this.compensateNotifyParties.bind(this),
      },
    ];
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /**
   * Starts (or resumes) the activation saga for an agreement and runs it to
   * completion. Safe to call repeatedly: a completed saga is returned as-is,
   * and an in-flight saga is resumed rather than restarted.
   */
  async activate(agreementId: string): Promise<AgreementActivationSaga> {
    return this.lockService.withLock(
      `agreement-activation-saga:${agreementId}`,
      AgreementActivationSagaService.LOCK_TTL_MS,
      () => this.runForAgreement(agreementId),
    );
  }

  async getSagaForAgreement(
    agreementId: string,
  ): Promise<AgreementActivationSaga | null> {
    return this.sagaRepository.findOne({
      where: { agreementId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Scans for sagas left in a non-terminal state (e.g. by a process that
   * crashed mid-activation) and drives each one to completion. Intended to
   * run on boot; also callable directly to simulate/test crash recovery.
   */
  async resumeIncompleteSagas(): Promise<void> {
    const incomplete = await this.sagaRepository.find({
      where: { status: In(IN_FLIGHT_SAGA_STATUSES) },
    });

    for (const saga of incomplete) {
      try {
        await this.lockService.withLock(
          `agreement-activation-saga:${saga.agreementId}`,
          AgreementActivationSagaService.LOCK_TTL_MS,
          () => this.progress(saga),
        );
      } catch (err) {
        this.logger.error(
          `Failed to resume activation saga ${saga.id} for agreement ${saga.agreementId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // Orchestration
  // ---------------------------------------------------------------------

  private async runForAgreement(
    agreementId: string,
  ): Promise<AgreementActivationSaga> {
    let saga = await this.sagaRepository.findOne({
      where: { agreementId, status: In(IN_FLIGHT_SAGA_STATUSES) },
      order: { createdAt: 'DESC' },
    });

    if (!saga) {
      const completed = await this.sagaRepository.findOne({
        where: { agreementId, status: SagaStatus.COMPLETED },
        order: { createdAt: 'DESC' },
      });
      if (completed) {
        return completed;
      }
      saga = await this.createSaga(agreementId);
    }

    return this.progress(saga);
  }

  private async createSaga(
    agreementId: string,
  ): Promise<AgreementActivationSaga> {
    const agreement = await this.agreementRepository.findOne({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new NotFoundException(`Agreement ${agreementId} not found`);
    }
    // Confirms the agreement is actually eligible to activate before we
    // create a saga row for it.
    this.stateService.validateTransition(
      agreement.status,
      AgreementStatus.ACTIVE,
    );

    const steps = ACTIVATION_SAGA_STEP_ORDER.map((name) => ({
      name,
      status: SagaStepStatus.PENDING,
    }));

    const context: ActivationSagaContext = {
      adminId: agreement.adminId,
      userId: agreement.userId,
      adminStellarPubKey: agreement.adminStellarPubKey,
      userStellarPubKey: agreement.userStellarPubKey,
    };

    const saga = this.sagaRepository.create({
      agreementId,
      status: SagaStatus.RUNNING,
      previousAgreementStatus: agreement.status,
      steps,
      context,
      failureReason: null,
    });

    return this.sagaRepository.save(saga);
  }

  /** Drives a saga forward from whatever state it is persisted in. */
  private async progress(
    saga: AgreementActivationSaga,
  ): Promise<AgreementActivationSaga> {
    if (
      saga.status === SagaStatus.COMPLETED ||
      saga.status === SagaStatus.COMPENSATED
    ) {
      return saga;
    }

    if (saga.status === SagaStatus.PENDING) {
      saga.status = SagaStatus.RUNNING;
      saga = await this.sagaRepository.save(saga);
    }

    if (
      saga.status === SagaStatus.COMPENSATING ||
      saga.status === SagaStatus.COMPENSATION_FAILED
    ) {
      return this.runCompensation(saga);
    }

    return this.runForward(saga);
  }

  private async runForward(
    saga: AgreementActivationSaga,
  ): Promise<AgreementActivationSaga> {
    for (const stepDef of this.stepDefinitions) {
      const record = saga.steps.find((s) => s.name === stepDef.name)!;
      if (record.status === SagaStepStatus.COMPLETED) {
        continue; // Resumed saga: this step already ran, don't double-apply.
      }

      try {
        const result =
          (await stepDef.execute(saga.context, saga.agreementId)) || {};
        record.status = SagaStepStatus.COMPLETED;
        record.result = result;
        record.completedAt = new Date().toISOString();
        record.error = undefined;
        saga.context = { ...saga.context, [stepDef.name]: result };
        saga = await this.sagaRepository.save(saga);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Activation step '${stepDef.name}' failed for agreement ${saga.agreementId}: ${message}`,
        );
        record.status = SagaStepStatus.FAILED;
        record.error = message;
        saga.status = SagaStatus.COMPENSATING;
        saga.failureReason = `Step '${stepDef.name}' failed: ${message}`;
        saga = await this.sagaRepository.save(saga);
        return this.runCompensation(saga);
      }
    }

    saga.status = SagaStatus.COMPLETED;
    saga.completedAt = new Date();
    return this.sagaRepository.save(saga);
  }

  private async runCompensation(
    saga: AgreementActivationSaga,
  ): Promise<AgreementActivationSaga> {
    if (saga.status !== SagaStatus.COMPENSATING) {
      saga.status = SagaStatus.COMPENSATING;
      saga = await this.sagaRepository.save(saga);
    }

    for (let i = this.stepDefinitions.length - 1; i >= 0; i--) {
      const stepDef = this.stepDefinitions[i];
      const record = saga.steps.find((s) => s.name === stepDef.name)!;
      if (record.status !== SagaStepStatus.COMPLETED) {
        continue; // Never ran (or already compensated) - nothing to undo.
      }

      try {
        await stepDef.compensate(
          saga.context,
          saga.agreementId,
          saga.previousAgreementStatus ?? AgreementStatus.SIGNED,
        );
        record.status = SagaStepStatus.COMPENSATED;
        record.compensatedAt = new Date().toISOString();
        record.error = undefined;
        saga = await this.sagaRepository.save(saga);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Compensation for step '${stepDef.name}' failed for agreement ${saga.agreementId}: ${message}`,
        );
        record.status = SagaStepStatus.COMPENSATION_FAILED;
        record.error = message;
        saga.status = SagaStatus.COMPENSATION_FAILED;
        saga.failureReason = `${saga.failureReason ?? ''}; compensation for '${stepDef.name}' failed: ${message}`;
        // Persist and stop: leaves the saga resumable by resumeIncompleteSagas()
        // instead of silently abandoning the remaining compensations.
        return this.sagaRepository.save(saga);
      }
    }

    saga.status = SagaStatus.COMPENSATED;
    saga.completedAt = new Date();
    saga = await this.sagaRepository.save(saga);

    await this.markAgreementActivationFailed(
      saga.agreementId,
      saga.failureReason ?? 'Agreement activation failed',
    );

    return saga;
  }

  private async markAgreementActivationFailed(
    agreementId: string,
    reason: string,
  ): Promise<void> {
    const agreement = await this.agreementRepository.findOne({
      where: { id: agreementId },
    });
    if (!agreement || agreement.status === AgreementStatus.ACTIVATION_FAILED) {
      return; // Already terminal - idempotent on retry/resume.
    }

    const oldStatus = agreement.status;
    this.stateService.validateTransition(
      oldStatus,
      AgreementStatus.ACTIVATION_FAILED,
    );
    agreement.status = AgreementStatus.ACTIVATION_FAILED;
    agreement.activationFailureReason = reason;
    await this.agreementRepository.save(agreement);

    this.eventEmitter.emit(
      'agreement.status.changed',
      new AgreementStatusChangedEvent(
        agreementId,
        oldStatus,
        AgreementStatus.ACTIVATION_FAILED,
        reason,
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Step 1: mint the rent obligation NFT
  // ---------------------------------------------------------------------

  private async executeMintNft(
    context: ActivationSagaContext,
    agreementId: string,
  ): Promise<Record<string, any>> {
    const existing = await this.nftService.getNftByAgreement(agreementId);
    if (existing) {
      return {
        nftId: existing.id,
        tokenId: existing.tokenId,
        alreadyExisted: true,
      };
    }

    const adminAddress = context.adminStellarPubKey;
    if (!adminAddress) {
      throw new Error(
        'Cannot mint obligation NFT: agreement has no admin Stellar public key',
      );
    }

    const nft = await this.nftService.mintNftForAgreement(
      agreementId,
      adminAddress,
    );
    return {
      nftId: nft.id,
      tokenId: nft.tokenId,
      obligationId: nft.obligationId,
    };
  }

  private async compensateMintNft(
    _context: ActivationSagaContext,
    agreementId: string,
  ): Promise<void> {
    await this.nftService.voidNftForAgreement(
      agreementId,
      'Agreement activation failed downstream; NFT mint compensated',
    );
  }

  // ---------------------------------------------------------------------
  // Step 2: fund escrow
  // ---------------------------------------------------------------------

  private async executeFundEscrow(
    _context: ActivationSagaContext,
    agreementId: string,
  ): Promise<Record<string, any>> {
    const existing =
      await this.escrowService.getEscrowForAgreement(agreementId);
    if (existing && existing.status !== EscrowStatus.CANCELLED) {
      return { escrowId: existing.id, alreadyExisted: true };
    }

    const escrow =
      await this.escrowService.createEscrowForAgreement(agreementId);
    return { escrowId: escrow.id };
  }

  private async compensateFundEscrow(
    _context: ActivationSagaContext,
    agreementId: string,
  ): Promise<void> {
    await this.escrowService.cancelEscrowForAgreement(
      agreementId,
      'Agreement activation failed downstream; escrow funding compensated',
    );
  }

  // ---------------------------------------------------------------------
  // Step 3: sync agreement with blockchain
  // ---------------------------------------------------------------------

  private async executeBlockchainSync(
    _context: ActivationSagaContext,
    agreementId: string,
  ): Promise<Record<string, any>> {
    await this.blockchainSync.syncAgreementWithBlockchain(agreementId);
    return { syncedAt: new Date().toISOString() };
  }

  private async compensateBlockchainSync(): Promise<void> {
    // Sync only mirrors on-chain state into local read fields; it writes
    // nothing on-chain and leaves nothing that needs rolling back locally.
  }

  // ---------------------------------------------------------------------
  // Step 4: flip the agreement to ACTIVE
  // ---------------------------------------------------------------------

  private async executeFinalizeActive(
    _context: ActivationSagaContext,
    agreementId: string,
  ): Promise<Record<string, any>> {
    const agreement = await this.agreementRepository.findOne({
      where: { id: agreementId },
    });
    if (!agreement) {
      throw new NotFoundException(`Agreement ${agreementId} not found`);
    }
    if (agreement.status === AgreementStatus.ACTIVE) {
      return { activated: true, alreadyActive: true };
    }

    const oldStatus = agreement.status;
    this.stateService.validateTransition(oldStatus, AgreementStatus.ACTIVE);
    agreement.status = AgreementStatus.ACTIVE;
    await this.agreementRepository.save(agreement);

    this.eventEmitter.emit(
      'agreement.status.changed',
      new AgreementStatusChangedEvent(
        agreementId,
        oldStatus,
        AgreementStatus.ACTIVE,
        'Agreement activation saga completed',
      ),
    );

    return { activated: true };
  }

  private async compensateFinalizeActive(
    _context: ActivationSagaContext,
    agreementId: string,
    previousAgreementStatus: string,
  ): Promise<void> {
    const agreement = await this.agreementRepository.findOne({
      where: { id: agreementId },
    });
    if (!agreement || agreement.status !== AgreementStatus.ACTIVE) {
      return; // Never actually flipped to ACTIVE - nothing to revert.
    }

    const target =
      (previousAgreementStatus as AgreementStatus) || AgreementStatus.SIGNED;
    // Bypass the forward-transition guard on purpose: this is a saga
    // rollback, not a normal business transition, and ACTIVE -> SIGNED is
    // intentionally absent from the allowed forward map.
    agreement.status = target;
    await this.agreementRepository.save(agreement);

    this.eventEmitter.emit(
      'agreement.status.changed',
      new AgreementStatusChangedEvent(
        agreementId,
        AgreementStatus.ACTIVE,
        target,
        'Agreement activation rolled back',
      ),
    );
  }

  // ---------------------------------------------------------------------
  // Step 5: notify tenant/landlord
  // ---------------------------------------------------------------------

  private async executeNotifyParties(
    context: ActivationSagaContext,
    agreementId: string,
  ): Promise<Record<string, any>> {
    const notifiedUserIds: string[] = [];
    for (const userId of [context.userId, context.adminId]) {
      if (!userId) continue;
      await this.notificationsService.notify(
        userId,
        'Lease activated',
        `Rent agreement ${agreementId} is now active.`,
        'agreement_activated',
      );
      notifiedUserIds.push(userId);
    }
    return { notifiedUserIds };
  }

  private async compensateNotifyParties(
    context: ActivationSagaContext,
    agreementId: string,
  ): Promise<void> {
    const notifiedUserIds: string[] =
      context[ActivationSagaStepName.NOTIFY_PARTIES]?.notifiedUserIds ?? [];
    for (const userId of notifiedUserIds) {
      await this.notificationsService.notify(
        userId,
        'Lease activation failed',
        `Activation of rent agreement ${agreementId} could not be completed and was rolled back.`,
        'agreement_activation_failed',
      );
    }
  }
}
