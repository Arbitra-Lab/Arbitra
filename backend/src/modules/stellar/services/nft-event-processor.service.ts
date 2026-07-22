import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EntityManager } from 'typeorm';
import { RentObligationNft } from '../../agreements/entities/rent-obligation-nft.entity';
import { EventReconciliationService } from './event-reconciliation.service';
import {
  EventHandler,
  LedgerEvent,
} from '../interfaces/ledger-event.interface';

export const NFT_OBLIGATION_STREAM = 'nft-obligation';

export interface ObligationMintedEvent {
  agreementId: string;
  admin: string;
  mintedAt: number;
  txHash: string;
  ledger: number;
  ledgerHash: string;
  parentLedgerHash: string;
  eventIndex: number;
  currentLedger: number;
}

export interface ObligationTransferredEvent {
  agreementId: string;
  from: string;
  to: string;
  txHash: string;
  ledger: number;
  ledgerHash: string;
  parentLedgerHash: string;
  eventIndex: number;
  currentLedger: number;
}

interface MintCompensation extends Record<string, unknown> {
  created: boolean;
  agreementId: string;
}

interface TransferCompensation extends Record<string, unknown> {
  agreementId: string;
  previousOwner: string;
  previousTransferCount: number;
  previousTransferTxHash: string | undefined;
  previousTransferredAt: Date | undefined;
}

/**
 * Applies rent-obligation-NFT side effects for confirmed ledger events.
 * Registers itself with EventReconciliationService so every mint/transfer
 * is deduped, confirmation-gated and reorg-safe before it ever touches the
 * RentObligationNft table.
 */
@Injectable()
export class NftEventProcessor implements EventHandler, OnModuleInit {
  private readonly logger = new Logger(NftEventProcessor.name);

  constructor(
    private readonly eventReconciliationService: EventReconciliationService,
  ) {}

  onModuleInit() {
    this.eventReconciliationService.registerHandler(
      NFT_OBLIGATION_STREAM,
      this,
    );
  }

  @OnEvent('obligation.minted')
  async handleObligationMinted(event: ObligationMintedEvent) {
    const ledgerEvent: LedgerEvent = {
      streamName: NFT_OBLIGATION_STREAM,
      eventType: 'obligation.minted',
      ledger: event.ledger,
      ledgerHash: event.ledgerHash,
      parentLedgerHash: event.parentLedgerHash,
      txHash: event.txHash,
      eventIndex: event.eventIndex,
      data: event as unknown as Record<string, unknown>,
    };

    const outcome = await this.eventReconciliationService.process(
      ledgerEvent,
      event.currentLedger,
    );
    this.logger.debug(
      `obligation.minted for agreement ${event.agreementId}: ${outcome.status}`,
    );
  }

  @OnEvent('obligation.transferred')
  async handleObligationTransferred(event: ObligationTransferredEvent) {
    const ledgerEvent: LedgerEvent = {
      streamName: NFT_OBLIGATION_STREAM,
      eventType: 'obligation.transferred',
      ledger: event.ledger,
      ledgerHash: event.ledgerHash,
      parentLedgerHash: event.parentLedgerHash,
      txHash: event.txHash,
      eventIndex: event.eventIndex,
      data: event as unknown as Record<string, unknown>,
    };

    const outcome = await this.eventReconciliationService.process(
      ledgerEvent,
      event.currentLedger,
    );
    this.logger.debug(
      `obligation.transferred for agreement ${event.agreementId}: ${outcome.status}`,
    );
  }

  async apply(
    manager: EntityManager,
    event: LedgerEvent,
  ): Promise<Record<string, unknown> | void> {
    switch (event.eventType) {
      case 'obligation.minted':
        return this.applyMint(
          manager,
          event.data as unknown as ObligationMintedEvent,
        );
      case 'obligation.transferred':
        return this.applyTransfer(
          manager,
          event.data as unknown as ObligationTransferredEvent,
        );
      default:
        throw new Error(`Unsupported NFT event type: ${event.eventType}`);
    }
  }

  async rollback(
    manager: EntityManager,
    event: LedgerEvent,
    compensationData: Record<string, unknown> | null,
  ): Promise<void> {
    switch (event.eventType) {
      case 'obligation.minted':
        return this.rollbackMint(manager, compensationData as MintCompensation);
      case 'obligation.transferred':
        return this.rollbackTransfer(
          manager,
          compensationData as TransferCompensation,
        );
      default:
        throw new Error(`Unsupported NFT event type: ${event.eventType}`);
    }
  }

  private async applyMint(
    manager: EntityManager,
    data: ObligationMintedEvent,
  ): Promise<MintCompensation> {
    const existing = await manager.findOne(RentObligationNft, {
      where: { agreementId: data.agreementId },
    });

    if (existing) {
      this.logger.warn(
        `NFT already exists for agreement ${data.agreementId}, skipping mint`,
      );
      return { created: false, agreementId: data.agreementId };
    }

    const nft = manager.create(RentObligationNft, {
      agreementId: data.agreementId,
      obligationId: data.agreementId,
      currentOwner: data.admin,
      originalLandlord: data.admin,
      mintTxHash: data.txHash,
      mintedAt: new Date(data.mintedAt * 1000),
      status: 'active',
      transferCount: 0,
    });

    await manager.save(RentObligationNft, nft);
    this.logger.log(`NFT record created for agreement ${data.agreementId}`);

    return { created: true, agreementId: data.agreementId };
  }

  private async rollbackMint(
    manager: EntityManager,
    compensationData: MintCompensation | null,
  ): Promise<void> {
    if (!compensationData?.created) {
      return;
    }

    await manager.delete(RentObligationNft, {
      agreementId: compensationData.agreementId,
    });
    this.logger.warn(
      `Rolled back NFT mint for agreement ${compensationData.agreementId}`,
    );
  }

  private async applyTransfer(
    manager: EntityManager,
    data: ObligationTransferredEvent,
  ): Promise<TransferCompensation> {
    const nft = await manager.findOne(RentObligationNft, {
      where: { agreementId: data.agreementId },
    });

    if (!nft) {
      throw new Error(
        `NFT not found for agreement ${data.agreementId}, cannot process transfer`,
      );
    }

    const compensation: TransferCompensation = {
      agreementId: data.agreementId,
      previousOwner: nft.currentOwner,
      previousTransferCount: nft.transferCount,
      previousTransferTxHash: nft.lastTransferTxHash,
      previousTransferredAt: nft.lastTransferredAt,
    };

    nft.currentOwner = data.to;
    nft.lastTransferTxHash = data.txHash;
    nft.lastTransferredAt = new Date();
    nft.transferCount += 1;

    await manager.save(RentObligationNft, nft);
    this.logger.log(
      `NFT ownership updated for agreement ${data.agreementId}: ${data.from} -> ${data.to}`,
    );

    return compensation;
  }

  private async rollbackTransfer(
    manager: EntityManager,
    compensationData: TransferCompensation | null,
  ): Promise<void> {
    if (!compensationData) {
      return;
    }

    const nft = await manager.findOne(RentObligationNft, {
      where: { agreementId: compensationData.agreementId },
    });

    if (!nft) {
      return;
    }

    nft.currentOwner = compensationData.previousOwner;
    nft.transferCount = compensationData.previousTransferCount;
    nft.lastTransferTxHash = compensationData.previousTransferTxHash;
    nft.lastTransferredAt = compensationData.previousTransferredAt;

    await manager.save(RentObligationNft, nft);
    this.logger.warn(
      `Rolled back NFT transfer for agreement ${compensationData.agreementId}`,
    );
  }
}
