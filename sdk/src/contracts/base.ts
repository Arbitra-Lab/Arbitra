import type { xdr } from '@stellar/stellar-sdk';
import type { ArbitraClient } from '../client.js';
import type { InvokeOptions, InvokeResult, ReadOptions } from '../types.js';

/**
 * Shared plumbing for per-contract wrapper classes. Each wrapper is a thin,
 * typed facade over `ArbitraClient.read`/`invoke` scoped to one contract ID.
 *
 * Methods not exposed by a wrapper can still be called through `read`/`call`
 * directly (both are `protected`, but `client` and `contractId` are public so
 * callers can drop down to `client.read(contractId, "method", [...scval.*])`
 * for anything the wrapper doesn't name explicitly).
 */
export abstract class BaseContract {
  constructor(
    public readonly client: ArbitraClient,
    public readonly contractId: string,
  ) {}

  protected read<T = unknown>(
    method: string,
    args: xdr.ScVal[] = [],
    opts?: ReadOptions,
  ): Promise<T> {
    return this.client.read<T>(this.contractId, method, args, opts);
  }

  protected call<T = unknown>(
    method: string,
    args: xdr.ScVal[] = [],
    opts?: InvokeOptions,
  ): Promise<InvokeResult<T>> {
    return this.client.invoke<T>(this.contractId, method, args, opts);
  }
}
