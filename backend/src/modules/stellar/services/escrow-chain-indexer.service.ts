import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventReconciliationService } from './event-reconciliation.service';
import {
  EventHandler,
  LedgerEvent,
} from '../interfaces/ledger-event.interface';
import { StellarEscrow, EscrowStatus } from '../entities/stellar-escrow.entity';

export const ESCROW_CHAIN_STREAM = 'escrow-chain';

@Injectable()
export class EscrowChainIndexerService implements EventHandler, OnModuleInit {
  private readonly logger = new Logger(EscrowChainIndexerService.name);
  constructor(
    private readonly reconciliation: EventReconciliationService,
    @InjectRepository(StellarEscrow)
    private readonly escrowRepo: Repository<StellarEscrow>,
  ) {}

  onModuleInit() {
    this.reconciliation.registerHandler(ESCROW_CHAIN_STREAM, this);
  }

  @OnEvent('blockchain.escrow.status_changed')
  async onStatus(payload: any) {
    const event: LedgerEvent = {
      streamName: ESCROW_CHAIN_STREAM,
      eventType: 'escrow.status_changed',
      ledger: Number(payload.ledger ?? 0),
      ledgerHash: String(payload.ledgerHash ?? payload.txHash ?? 'unknown'),
      parentLedgerHash: String(payload.parentLedgerHash ?? 'unknown'),
      txHash: String(
        payload.txHash ?? payload.transactionHash ?? `tx-${Date.now()}`,
      ),
      eventIndex: Number(payload.eventIndex ?? 0),
      data: payload ?? {},
    };
    return this.reconciliation.process(
      event,
      Number(payload.currentLedger ?? event.ledger),
    );
  }

  async apply(
    manager: any,
    event: LedgerEvent,
  ): Promise<Record<string, unknown> | void> {
    const data = event.data as any;
    const escrowId = String(data.escrowId ?? data.blockchainEscrowId ?? '');
    if (!escrowId) return;
    const escrow = await manager.getRepository(StellarEscrow).findOne({
      where: [
        { blockchainEscrowId: escrowId },
        { id: Number.isFinite(Number(escrowId)) ? Number(escrowId) : -1 },
      ],
    });
    if (!escrow) return { escrowId, missing: true };
    const prev = escrow.status;
    const next = data.status as EscrowStatus;
    if (next && Object.values(EscrowStatus).includes(next))
      escrow.status = next;
    escrow.onChainStatus = data.onChainStatus ?? next ?? escrow.onChainStatus;
    escrow.blockchainSyncedAt = new Date();
    escrow.escrowMetadata = {
      ...(escrow.escrowMetadata || {}),
      lastIndexedEvent: {
        type: event.eventType,
        txHash: event.txHash,
        at: new Date().toISOString(),
      },
    };
    await manager.getRepository(StellarEscrow).save(escrow);
    this.logger.log(
      `Indexed escrow status ${escrowId} ${prev} -> ${escrow.status}`,
    );
    return { escrowId, previousStatus: prev, nextStatus: escrow.status };
  }

  async rollback(
    manager: any,
    event: LedgerEvent,
    compensationData: Record<string, unknown> | null,
  ): Promise<void> {
    const escrowId = String(
      (compensationData as any)?.escrowId ??
        (event.data as any)?.escrowId ??
        '',
    );
    const prev = (compensationData as any)?.previousStatus;
    if (!escrowId || !prev) return;
    const escrow = await manager
      .getRepository(StellarEscrow)
      .findOne({ where: [{ blockchainEscrowId: escrowId }] });
    if (escrow) {
      escrow.status = prev as EscrowStatus;
      await manager.getRepository(StellarEscrow).save(escrow);
    }
  }
}
