import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EventReconciliationService } from './event-reconciliation.service';
import {
  EventHandler,
  LedgerEvent,
} from '../interfaces/ledger-event.interface';
import { Dispute, DisputeStatus } from '../../disputes/entities/dispute.entity';
import {
  DisputeEvent,
  DisputeEventType,
} from '../../disputes/entities/dispute-event.entity';
import { DisputeVote } from '../../disputes/entities/dispute-vote.entity';

export const DISPUTE_CHAIN_STREAM = 'dispute-chain';

@Injectable()
export class DisputeChainIndexerService implements EventHandler, OnModuleInit {
  private readonly logger = new Logger(DisputeChainIndexerService.name);

  constructor(
    private readonly reconciliation: EventReconciliationService,
    @InjectRepository(Dispute)
    private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(DisputeEvent)
    private readonly disputeEventRepo: Repository<DisputeEvent>,
    @InjectRepository(DisputeVote)
    private readonly voteRepo: Repository<DisputeVote>,
  ) {}

  onModuleInit() {
    this.reconciliation.registerHandler(DISPUTE_CHAIN_STREAM, this);
  }

  @OnEvent('blockchain.dispute.raised')
  async onRaised(payload: any) {
    return this.ingest('dispute.raised', payload);
  }
  @OnEvent('blockchain.dispute.vote')
  async onVote(payload: any) {
    return this.ingest('dispute.vote', payload);
  }
  @OnEvent('blockchain.dispute.resolved')
  async onResolved(payload: any) {
    return this.ingest('dispute.resolved', payload);
  }
  @OnEvent('blockchain.dispute.appeal_filed')
  async onAppealFiled(payload: any) {
    return this.ingest('dispute.appeal_filed', payload);
  }
  @OnEvent('blockchain.dispute.appeal_resolved')
  async onAppealResolved(payload: any) {
    return this.ingest('dispute.appeal_resolved', payload);
  }

  private async ingest(eventType: string, payload: any) {
    const event: LedgerEvent = {
      streamName: DISPUTE_CHAIN_STREAM,
      eventType,
      ledger: Number(payload.ledger ?? 0),
      ledgerHash: String(payload.ledgerHash ?? payload.txHash ?? 'unknown'),
      parentLedgerHash: String(payload.parentLedgerHash ?? 'unknown'),
      txHash: String(
        payload.txHash ?? payload.transactionHash ?? `tx-${Date.now()}`,
      ),
      eventIndex: Number(payload.eventIndex ?? 0),
      data: payload ?? {},
    };
    const currentLedger = Number(payload.currentLedger ?? event.ledger);
    return this.reconciliation.process(event, currentLedger);
  }

  async apply(
    manager: any,
    event: LedgerEvent,
  ): Promise<Record<string, unknown> | void> {
    const data = event.data as any;
    const disputeId = String(
      data.disputeId ?? data.caseId ?? data.agreementId ?? '',
    );
    const dispute = disputeId
      ? await manager.getRepository(Dispute).findOne({
          where: [{ disputeId }, { blockchainAgreementId: disputeId }],
        })
      : null;

    if (dispute) {
      if (event.eventType === 'dispute.raised') {
        dispute.status = DisputeStatus.OPEN;
        dispute.blockchainSyncedAt = new Date();
        dispute.transactionHash = data.txHash ?? event.txHash;
      }
      if (event.eventType === 'dispute.vote') {
        if (data.favorLandlord === true || data.favorClaimant === true)
          dispute.votesFavorLandlord = (dispute.votesFavorLandlord ?? 0) + 1;
        if (data.favorLandlord === false || data.favorClaimant === false)
          dispute.votesFavorTenant = (dispute.votesFavorTenant ?? 0) + 1;
      }
      if (event.eventType === 'dispute.resolved') {
        dispute.status = DisputeStatus.RESOLVED;
        dispute.blockchainOutcome = data.outcome ?? dispute.blockchainOutcome;
        dispute.resolvedAt = new Date();
        dispute.blockchainSyncedAt = new Date();
      }
      if (event.eventType === 'dispute.appeal_filed') {
        dispute.metadata = {
          ...(dispute.metadata || {}),
          appeal: {
            status: 'filed',
            filedAt: new Date().toISOString(),
            reason: data.reason,
          },
        };
      }
      if (event.eventType === 'dispute.appeal_resolved') {
        dispute.metadata = {
          ...(dispute.metadata || {}),
          appeal: {
            ...(dispute.metadata?.appeal || {}),
            status: 'resolved',
            resolvedAt: new Date().toISOString(),
            outcome: data.outcome,
          },
        };
      }
      await manager.getRepository(Dispute).save(dispute);
    }

    const typeMap: Record<string, DisputeEventType> = {
      'dispute.raised': DisputeEventType.DISPUTE_RAISED,
      'dispute.vote': DisputeEventType.VOTE_CAST,
      'dispute.resolved': DisputeEventType.RESOLUTION_ENFORCED,
      'dispute.appeal_filed': DisputeEventType.APPEAL_FILED,
      'dispute.appeal_resolved': DisputeEventType.APPEAL_RESOLVED,
    };
    const mapped = typeMap[event.eventType];
    if (mapped && disputeId) {
      const rec = manager.getRepository(DisputeEvent).create({
        disputeId,
        eventType: mapped,
        eventData: data,
        timestamp: new Date(),
        triggeredBy: 'blockchain-indexer',
        transactionHash: event.txHash,
      });
      await manager.getRepository(DisputeEvent).save(rec);
    }

    this.logger.log(`Indexed ${event.eventType} ${event.txHash}`);
    return { disputeId, eventType: event.eventType };
  }

  async rollback(
    manager: any,
    event: LedgerEvent,
    compensationData: Record<string, unknown> | null,
  ): Promise<void> {
    const disputeId = String(
      (compensationData as any)?.disputeId ??
        (event.data as any)?.disputeId ??
        '',
    );
    if (!disputeId) return;
    await manager
      .getRepository(DisputeEvent)
      .delete({ transactionHash: event.txHash, disputeId });
    this.logger.warn(`Rolled back indexed dispute event ${event.txHash}`);
  }
}
