import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BASE_FEE } from '@stellar/stellar-sdk';
import { randomUUID } from 'node:crypto';
import {
  AuditAction,
  AuditLevel,
  AuditStatus,
} from '../../audit/entities/audit-log.entity';
import { AuditService } from '../../audit/audit.service';
import { CreateEscrowDto, ReleaseEscrowDto } from '../dto/escrow.dto';
import {
  DEFAULT_BATCH_CONCURRENCY,
  MAX_BATCH_CONCURRENCY,
} from '../dto/escrow-batch.dto';
import { StellarService } from './stellar.service';

export type BatchOperation = 'create' | 'release';
export type BatchItemStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';
export type BatchStatus =
  | 'running'
  | 'completed'
  | 'completed_with_failures'
  | 'rolled_back';

export interface BatchItemResult {
  index: number;
  /** Original index in the source batch, used by retry batches. */
  sourceIndex?: number;
  escrowId?: number;
  status: BatchItemStatus;
  transactionHash?: string;
  error?: string;
}

export interface BatchProgress {
  id: string;
  operation: BatchOperation;
  status: BatchStatus;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  rolledBack: number;
  /** Sum of Stellar base fees for operations that were submitted successfully. */
  feeEstimateStroops: string;
  feeEstimateXlm: number;
  createdAt: string;
  updatedAt: string;
  items: BatchItemResult[];
}

interface BatchOptions {
  concurrency?: number;
  stopOnFirstFailure?: boolean;
}

const BATCH_RETENTION = 100;

@Injectable()
export class EscrowBatchService {
  private readonly logger = new Logger(EscrowBatchService.name);
  private readonly batches = new Map<string, BatchProgress>();
  private readonly batchInputs = new Map<string, unknown[]>();

  constructor(
    private readonly stellarService: StellarService,
    private readonly auditService: AuditService,
  ) {}

  async createBatch(
    items: CreateEscrowDto[],
    performedBy?: string,
    options: BatchOptions = {},
  ): Promise<BatchProgress> {
    const batch = this.startBatch('create', items);
    let aborted = false;

    await this.runWithConcurrency(
      items,
      options.concurrency,
      async (item, index) => {
        if (aborted) {
          this.updateItem(batch, index, { status: 'cancelled' });
          return;
        }

        try {
          const escrow = await this.stellarService.createEscrow(item);
          this.updateItem(batch, index, {
            status: 'succeeded',
            escrowId: escrow.id,
          });
        } catch (error) {
          this.updateItem(batch, index, {
            status: 'failed',
            error: this.errorMessage(error),
          });
          if (options.stopOnFirstFailure) {
            aborted = true;
          }
        }
      },
    );

    if (aborted) {
      await this.rollbackCreatedEscrows(batch);
      batch.status = 'rolled_back';
    }

    return this.finishBatch(batch, performedBy);
  }

  async releaseBatch(
    items: ReleaseEscrowDto[],
    performedBy?: string,
    options: BatchOptions = {},
  ): Promise<BatchProgress> {
    const batch = this.startBatch('release', items);

    await this.runWithConcurrency(
      items,
      options.concurrency,
      async (item, index) => {
        try {
          const escrow = await this.stellarService.releaseEscrow(item);
          this.updateItem(batch, index, {
            status: 'succeeded',
            escrowId: escrow.id,
            transactionHash: escrow.releaseTransactionHash ?? undefined,
          });
        } catch (error) {
          this.updateItem(batch, index, {
            status: 'failed',
            escrowId: item.escrowId,
            error: this.errorMessage(error),
          });
        }
      },
    );

    return this.finishBatch(batch, performedBy);
  }

  getBatch(batchId: string): BatchProgress {
    const batch = this.batches.get(batchId);
    if (!batch) {
      throw new NotFoundException(`Batch ${batchId} was not found`);
    }
    return batch;
  }

  /**
   * Requeues only failed items from a previous batch. Original item indexes and
   * successes are preserved so clients can diff the result against the first run.
   */
  async retryFailed(
    batchId: string,
    performedBy?: string,
  ): Promise<BatchProgress> {
    const previous = this.getBatch(batchId);
    const failedItems = previous.items.filter(
      (item) => item.status === 'failed',
    );
    if (failedItems.length === 0) {
      return previous;
    }

    const inputs = this.batchInputs.get(batchId) ?? [];
    const retryInputs = failedItems.map((item) => inputs[item.index]);
    const retry = this.startBatch(previous.operation, retryInputs);
    retry.items = failedItems.map((item, position) => ({
      index: position,
      sourceIndex: item.index,
      escrowId: item.escrowId,
      status: 'pending',
      error: item.error,
    }));

    await this.runWithConcurrency(
      retryInputs,
      undefined,
      async (input, position) => {
        try {
          const escrow =
            previous.operation === 'create'
              ? await this.stellarService.createEscrow(input as CreateEscrowDto)
              : await this.stellarService.releaseEscrow(
                  input as ReleaseEscrowDto,
                );

          this.updateItem(retry, position, {
            status: 'succeeded',
            escrowId: escrow.id,
          });
        } catch (error) {
          this.updateItem(retry, position, {
            status: 'failed',
            error: this.errorMessage(error),
          });
        }
      },
    );

    return this.finishBatch(retry, performedBy);
  }

  private startBatch(
    operation: BatchOperation,
    inputs: unknown[],
  ): BatchProgress {
    const total = inputs.length;
    const now = new Date().toISOString();
    const batch: BatchProgress = {
      id: randomUUID(),
      operation,
      status: 'running',
      total,
      processed: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      rolledBack: 0,
      feeEstimateStroops: '0',
      feeEstimateXlm: 0,
      createdAt: now,
      updatedAt: now,
      items: Array.from({ length: total }, (_unused, index) => ({
        index,
        status: 'pending',
      })),
    };

    this.batches.set(batch.id, batch);
    this.batchInputs.set(batch.id, [...inputs]);
    this.trimRetention();
    return batch;
  }

  private async runWithConcurrency<T>(
    items: T[],
    configuredLimit: number | undefined,
    worker: (item: T, index: number) => Promise<void>,
  ): Promise<void> {
    const limit = Math.min(
      Math.max(1, configuredLimit ?? DEFAULT_BATCH_CONCURRENCY),
      MAX_BATCH_CONCURRENCY,
    );
    let cursor = 0;

    const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
      (async () => {
        while (cursor < items.length) {
          const index = cursor;
          cursor += 1;
          await worker(items[index], index);
        }
      })(),
    );

    await Promise.all(runners);
  }

  private updateItem(
    batch: BatchProgress,
    index: number,
    update: Partial<BatchItemResult>,
  ): void {
    const item = batch.items[index];
    Object.assign(item, update);
    batch.processed = batch.items.filter(
      (entry) => entry.status !== 'pending',
    ).length;
    batch.succeeded = batch.items.filter(
      (entry) => entry.status === 'succeeded',
    ).length;
    batch.failed = batch.items.filter(
      (entry) => entry.status === 'failed',
    ).length;
    batch.cancelled = batch.items.filter(
      (entry) => entry.status === 'cancelled',
    ).length;
    const submitted = batch.items.filter(
      (entry) =>
        entry.status === 'succeeded' ||
        entry.status === 'failed' ||
        entry.status === 'rolled_back',
    ).length;
    const stroops = BigInt(BASE_FEE) * BigInt(submitted);
    batch.feeEstimateStroops = stroops.toString();
    batch.feeEstimateXlm = Number(stroops) / 10_000_000;
    batch.updatedAt = new Date().toISOString();
  }

  private async rollbackCreatedEscrows(batch: BatchProgress): Promise<void> {
    const succeeded = batch.items.filter((item) => item.status === 'succeeded');
    for (const item of succeeded) {
      if (item.escrowId === undefined) continue;
      try {
        await this.stellarService.refundEscrow({
          escrowId: item.escrowId,
          reason: `Partial rollback of batch ${batch.id}`,
        });
        item.status = 'rolled_back';
        batch.rolledBack += 1;
      } catch (error) {
        item.error = `Rollback failed: ${this.errorMessage(error)}`;
        this.logger.error(
          `Could not roll back escrow ${item.escrowId} from batch ${batch.id}`,
          error as Error,
        );
      }
    }

    batch.succeeded = batch.items.filter(
      (entry) => entry.status === 'succeeded',
    ).length;
    batch.updatedAt = new Date().toISOString();
  }

  private finishBatch(
    batch: BatchProgress,
    performedBy?: string,
  ): BatchProgress {
    if (batch.status === 'running') {
      batch.status = batch.failed > 0 ? 'completed_with_failures' : 'completed';
    }
    batch.updatedAt = new Date().toISOString();

    void this.auditService.log({
      action: AuditAction.BULK_OPERATION,
      entityType: 'escrow-batch',
      entityId: batch.id,
      performedBy,
      status:
        batch.status === 'completed'
          ? AuditStatus.SUCCESS
          : AuditStatus.FAILURE,
      level: batch.failed > 0 ? AuditLevel.WARN : AuditLevel.INFO,
      metadata: {
        operation: batch.operation,
        total: batch.total,
        processed: batch.processed,
        succeeded: batch.succeeded,
        failed: batch.failed,
        cancelled: batch.cancelled,
        rolledBack: batch.rolledBack,
      },
    });

    return batch;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private trimRetention(): void {
    if (this.batches.size <= BATCH_RETENTION) return;
    const oldest = [...this.batches.values()].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    if (oldest) {
      this.batches.delete(oldest.id);
      this.batchInputs.delete(oldest.id);
    }
  }
}
