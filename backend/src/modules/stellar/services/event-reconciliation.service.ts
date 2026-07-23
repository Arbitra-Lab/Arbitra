import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import {
  AncestryEntry,
  BlockchainStreamCursor,
} from '../entities/blockchain-stream-cursor.entity';
import { BlockchainEventIdempotency } from '../entities/blockchain-event-idempotency.entity';
import { BlockchainEventDeadLetter } from '../entities/blockchain-event-dead-letter.entity';
import {
  EventHandler,
  LedgerEvent,
  ReconciliationOutcome,
} from '../interfaces/ledger-event.interface';

const DEFAULT_CONFIRMATION_DEPTH = 1;
const ANCESTRY_WINDOW = 50;
const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Idempotent, reorg-aware pipeline sitting between raw ledger-event ingestion
 * and each stream's side effect. Every consumer (e.g. NftEventProcessor)
 * registers itself as an EventHandler for a stream name and delegates all
 * incoming events to `process()` instead of applying them directly.
 */
@Injectable()
export class EventReconciliationService {
  private readonly logger = new Logger(EventReconciliationService.name);
  private readonly handlers = new Map<string, EventHandler>();
  private readonly confirmationDepth: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @InjectRepository(BlockchainStreamCursor)
    private readonly cursorRepository: Repository<BlockchainStreamCursor>,
    @InjectRepository(BlockchainEventIdempotency)
    private readonly idempotencyRepository: Repository<BlockchainEventIdempotency>,
    @InjectRepository(BlockchainEventDeadLetter)
    private readonly deadLetterRepository: Repository<BlockchainEventDeadLetter>,
  ) {
    this.confirmationDepth = Number(
      this.configService.get<string>('BLOCKCHAIN_EVENT_CONFIRMATION_DEPTH') ??
        DEFAULT_CONFIRMATION_DEPTH,
    );
  }

  registerHandler(streamName: string, handler: EventHandler): void {
    this.handlers.set(streamName, handler);
  }

  /**
   * Entry point for newly-observed ledger events. `currentLedger` is the
   * chain tip as known by the caller, used to gate application until the
   * event is past the configured confirmation depth.
   */
  async process(
    event: LedgerEvent,
    currentLedger: number,
  ): Promise<ReconciliationOutcome> {
    const dedupKey = this.buildDedupKey(event);
    const handler = this.getHandler(event.streamName);

    if (currentLedger - event.ledger < this.confirmationDepth) {
      return { status: 'pending-confirmation', dedupKey };
    }

    await this.reconcileAncestry(event, handler);

    return this.applyEvent(event, handler);
  }

  /** Manual replay path: re-applies a dead-lettered event, bypassing confirmation gating. */
  async replayDeadLetter(id: string): Promise<ReconciliationOutcome> {
    const record = await this.deadLetterRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Dead letter event ${id} not found`);
    }

    const handler = this.getHandler(record.streamName);
    const event: LedgerEvent = {
      streamName: record.streamName,
      eventType: record.eventType,
      ledger: record.ledger,
      ledgerHash: '',
      parentLedgerHash: '',
      txHash: record.txHash,
      eventIndex: record.eventIndex,
      data: record.payload ?? {},
    };

    const outcome = await this.applyEvent(event, handler);

    if (outcome.status === 'applied' || outcome.status === 'duplicate') {
      record.status = 'replayed';
      record.lastAttemptAt = new Date();
      await this.deadLetterRepository.save(record);
    }

    return outcome;
  }

  async listDeadLetters(
    streamName?: string,
  ): Promise<BlockchainEventDeadLetter[]> {
    return this.deadLetterRepository.find({
      where: streamName ? { streamName } : {},
      order: { createdAt: 'DESC' },
    });
  }

  /** Automated replay path: periodically retries every pending dead letter. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async replayPendingDeadLetters(): Promise<void> {
    const pending = await this.deadLetterRepository.find({
      where: { status: 'pending' },
    });

    for (const record of pending) {
      try {
        await this.replayDeadLetter(record.id);
      } catch (error) {
        this.logger.warn(
          `Automated dead-letter replay failed for ${record.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  private getHandler(streamName: string): EventHandler {
    const handler = this.handlers.get(streamName);
    if (!handler) {
      throw new BadRequestException(
        `No event handler registered for stream "${streamName}"`,
      );
    }
    return handler;
  }

  private buildDedupKey(event: LedgerEvent): string {
    return `${event.streamName}:${event.ledger}:${event.txHash}:${event.eventIndex}`;
  }

  /**
   * Detects a reorg two ways: (a) the ledger the event lands on was already
   * recorded in ancestry under a different hash (that height was replaced),
   * or (b) the event's declared parent hash disagrees with what we stored
   * for `ledger - 1` (the chain it builds on no longer matches). Either
   * signal rolls back every applied event at or after the fork point before
   * the canonical event is let through.
   */
  private async reconcileAncestry(
    event: LedgerEvent,
    handler: EventHandler,
  ): Promise<void> {
    const cursor = await this.cursorRepository.findOne({
      where: { streamName: event.streamName },
    });
    if (!cursor) {
      return;
    }

    const ancestry = cursor.ancestry ?? [];
    const sameLedgerEntry = ancestry.find(
      (entry) => entry.ledger === event.ledger,
    );
    const parentEntry = ancestry.find(
      (entry) => entry.ledger === event.ledger - 1,
    );

    const sameLedgerConflict =
      !!sameLedgerEntry && sameLedgerEntry.hash !== event.ledgerHash;
    const parentConflict =
      !!parentEntry && parentEntry.hash !== event.parentLedgerHash;

    if (sameLedgerConflict || parentConflict) {
      await this.rollbackOrphaned(event.streamName, event.ledger, handler);
    }
  }

  private async rollbackOrphaned(
    streamName: string,
    forkLedger: number,
    handler: EventHandler,
  ): Promise<void> {
    const orphaned = await this.idempotencyRepository.find({
      where: {
        streamName,
        status: 'applied',
        ledger: MoreThanOrEqual(forkLedger),
      },
      order: { ledger: 'DESC', eventIndex: 'DESC' },
    });

    if (orphaned.length === 0) {
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      for (const record of orphaned) {
        const reconstructed: LedgerEvent = {
          streamName: record.streamName,
          eventType: record.eventType,
          ledger: record.ledger,
          ledgerHash: record.ledgerHash,
          parentLedgerHash: record.parentLedgerHash,
          txHash: record.txHash,
          eventIndex: record.eventIndex,
          data: record.payload ?? {},
        };

        await handler.rollback(
          queryRunner.manager,
          reconstructed,
          record.compensationData,
        );

        record.status = 'rolled_back';
        record.rolledBackAt = new Date();
        await queryRunner.manager.save(BlockchainEventIdempotency, record);
      }

      const cursor = await queryRunner.manager.findOne(BlockchainStreamCursor, {
        where: { streamName },
      });

      if (cursor) {
        const remaining = (cursor.ancestry ?? []).filter(
          (entry) => entry.ledger < forkLedger,
        );
        const newTip = remaining[remaining.length - 1];
        cursor.ancestry = remaining;
        cursor.lastConfirmedLedger = newTip ? newTip.ledger : forkLedger - 1;
        cursor.lastConfirmedLedgerHash = newTip ? newTip.hash : null;
        await queryRunner.manager.save(BlockchainStreamCursor, cursor);
      }

      await queryRunner.commitTransaction();
      this.logger.warn(
        `Reorg detected on stream "${streamName}": rolled back ${orphaned.length} event(s) at/after ledger ${forkLedger}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** Dedup-check + side effect + cursor advance, all in one DB transaction. */
  private async applyEvent(
    event: LedgerEvent,
    handler: EventHandler,
  ): Promise<ReconciliationOutcome> {
    const dedupKey = this.buildDedupKey(event);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existing = await queryRunner.manager.findOne(
        BlockchainEventIdempotency,
        { where: { dedupKey } },
      );

      if (existing) {
        await queryRunner.commitTransaction();
        return { status: 'duplicate', dedupKey };
      }

      const compensationData =
        (await handler.apply(queryRunner.manager, event)) ?? null;

      const record = queryRunner.manager.create(BlockchainEventIdempotency, {
        streamName: event.streamName,
        ledger: event.ledger,
        txHash: event.txHash,
        eventIndex: event.eventIndex,
        dedupKey,
        eventType: event.eventType,
        ledgerHash: event.ledgerHash,
        parentLedgerHash: event.parentLedgerHash,
        payload: event.data,
        status: 'applied',
        compensationData,
        appliedAt: new Date(),
      });
      await queryRunner.manager.save(BlockchainEventIdempotency, record);

      await this.advanceCursor(queryRunner.manager, event);

      await queryRunner.commitTransaction();
      return { status: 'applied', dedupKey };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      if (this.isUniqueViolation(error)) {
        return { status: 'duplicate', dedupKey };
      }

      await this.moveToDeadLetter(event, dedupKey, error);
      return {
        status: 'failed',
        dedupKey,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await queryRunner.release();
    }
  }

  private async advanceCursor(
    manager: EntityManager,
    event: LedgerEvent,
  ): Promise<void> {
    let cursor = await manager.findOne(BlockchainStreamCursor, {
      where: { streamName: event.streamName },
    });

    if (!cursor) {
      cursor = manager.create(BlockchainStreamCursor, {
        streamName: event.streamName,
        lastConfirmedLedger: 0,
        lastConfirmedLedgerHash: null,
        ancestry: [],
      });
    }

    const byLedger = new Map<number, AncestryEntry>(
      (cursor.ancestry ?? []).map((entry) => [entry.ledger, entry]),
    );
    byLedger.set(event.ledger, {
      ledger: event.ledger,
      hash: event.ledgerHash,
    });

    cursor.ancestry = Array.from(byLedger.values())
      .sort((a, b) => a.ledger - b.ledger)
      .slice(-ANCESTRY_WINDOW);

    if (event.ledger >= cursor.lastConfirmedLedger) {
      cursor.lastConfirmedLedger = event.ledger;
      cursor.lastConfirmedLedgerHash = event.ledgerHash;
    }

    await manager.save(BlockchainStreamCursor, cursor);
  }

  private async moveToDeadLetter(
    event: LedgerEvent,
    dedupKey: string,
    error: unknown,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? (error.stack ?? null) : null;

    try {
      const existing = await this.deadLetterRepository.findOne({
        where: { dedupKey },
      });

      if (existing) {
        existing.attempts += 1;
        existing.errorMessage = errorMessage;
        existing.errorStack = errorStack;
        existing.status = 'pending';
        existing.lastAttemptAt = new Date();
        await this.deadLetterRepository.save(existing);
      } else {
        const record = this.deadLetterRepository.create({
          streamName: event.streamName,
          dedupKey,
          eventType: event.eventType,
          ledger: event.ledger,
          txHash: event.txHash,
          eventIndex: event.eventIndex,
          payload: event.data,
          errorMessage,
          errorStack,
          attempts: 1,
          status: 'pending',
          lastAttemptAt: new Date(),
        });
        await this.deadLetterRepository.save(record);
      }

      this.logger.error(
        `Event ${dedupKey} moved to dead-letter: ${errorMessage}`,
      );
    } catch (dlqError) {
      this.logger.error(
        `Failed to write dead-letter record for ${dedupKey}`,
        dlqError instanceof Error ? dlqError.stack : String(dlqError),
      );
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
  }
}
