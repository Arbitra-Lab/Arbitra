import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SorobanRpc } from '@stellar/stellar-sdk';
import { EventReconciliationService } from './event-reconciliation.service';
import {
  LedgerEvent,
  ReconciliationOutcome,
} from '../interfaces/ledger-event.interface';

export interface BlockchainEvent {
  type: string;
  agreementId: string;
  data: any;
  timestamp: number;
  transactionHash: string;
}

@Injectable()
export class BlockchainEventService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainEventService.name);
  private readonly server: SorobanRpc.Server;
  private isListening = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly eventReconciliationService: EventReconciliationService,
  ) {
    const rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ||
      'https://soroban-testnet.stellar.org';
    this.server = new SorobanRpc.Server(rpcUrl);
  }

  async onModuleInit() {
    await this.startListening();
  }

  async startListening() {
    if (this.isListening) return;
    this.isListening = true;
    this.logger.log('Started listening for blockchain events');
  }

  async stopListening() {
    this.isListening = false;
    this.logger.log('Stopped listening for blockchain events');
  }

  /**
   * Ingestion entry point for a raw ledger event. Routes the event through
   * the idempotent, confirmation- and reorg-aware reconciliation pipeline
   * before it is allowed to reach any registered stream handler.
   */
  async ingestLedgerEvent(
    event: LedgerEvent,
    currentLedger: number,
  ): Promise<ReconciliationOutcome> {
    const outcome = await this.eventReconciliationService.process(
      event,
      currentLedger,
    );

    this.logger.debug(
      `Ingested ${event.streamName}/${event.eventType} (ledger ${event.ledger}): ${outcome.status}`,
    );

    return outcome;
  }

  private emitEvent(event: BlockchainEvent) {
    this.eventEmitter.emit(`blockchain.${event.type}`, event);
    this.logger.debug(
      `Emitted event: ${event.type} for agreement ${event.agreementId}`,
    );
  }
}
