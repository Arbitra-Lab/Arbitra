import { EntityManager } from 'typeorm';

/**
 * A single blockchain-ledger event awaiting reconciliation.
 *
 * `ledger` + `txHash` + `eventIndex` together form the dedup key: the same
 * event re-delivered any number of times must resolve to the same key.
 */
export interface LedgerEvent<T = Record<string, unknown>> {
  /** Logical consumer stream this event belongs to, e.g. `nft-obligation`. */
  streamName: string;
  eventType: string;
  ledger: number;
  ledgerHash: string;
  parentLedgerHash: string;
  txHash: string;
  eventIndex: number;
  data: T;
}

export type ReconciliationStatus =
  | 'applied'
  | 'duplicate'
  | 'pending-confirmation'
  | 'failed';

export interface ReconciliationOutcome {
  status: ReconciliationStatus;
  dedupKey: string;
  error?: string;
}

/**
 * Implemented by the module that owns the side effect for a stream (e.g.
 * NftEventProcessor). `apply` and `rollback` are always invoked with the
 * EntityManager of the reconciliation pipeline's active transaction, so side
 * effects live or die with the idempotency record written around them.
 */
export interface EventHandler<T = Record<string, unknown>> {
  /**
   * Apply the side effect for `event`. May return arbitrary compensation
   * data that `rollback` will later need to undo the effect (e.g. the
   * previous owner of a record before it was overwritten).
   */
  apply(
    manager: EntityManager,
    event: LedgerEvent<T>,
  ): Promise<Record<string, unknown> | void>;

  /**
   * Undo the side effect previously applied for `event`, using the
   * compensation data captured by `apply`. Called when a reorg orphans a
   * previously-applied event.
   */
  rollback(
    manager: EntityManager,
    event: LedgerEvent<T>,
    compensationData: Record<string, unknown> | null,
  ): Promise<void>;
}
