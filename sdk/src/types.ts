import type { xdr } from '@stellar/stellar-sdk';

/** IDs of the Arbitra protocol's deployed Soroban contracts. */
export interface ContractIds {
  arbitraAgreement: string;
  escrow: string;
  disputeResolution: string;
  payment: string;
  propertyRegistry: string;
  rentObligation: string;
  agentRegistry: string;
  userProfile: string;
}

/** Network connection parameters (RPC endpoint + passphrase). */
export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  allowHttp?: boolean;
}

/**
 * Abstraction over "something that can sign a Stellar transaction".
 * Implementations might wrap a `Keypair` (scripts/servers) or a browser
 * wallet such as Freighter (`signTransaction` returns a signed XDR string).
 */
export interface Signer {
  publicKey(): string;
  signTransaction(
    transactionXdr: string,
    opts: { networkPassphrase: string },
  ): Promise<string>;
}

/** Result of a state-changing contract invocation that was submitted on-chain. */
export interface InvokeResult<T> {
  /** Decoded return value of the invoked function. */
  value: T;
  /** Hash of the submitted transaction. */
  txHash: string;
}

/** Options accepted by read-only (simulated) contract calls. */
export interface ReadOptions {
  /** Source account used for the simulation; defaults to a throwaway account. */
  source?: string;
}

/** Options accepted by state-changing (submitted) contract calls. */
export interface InvokeOptions {
  /** Overrides the client's configured signer for this call only. */
  signer?: Signer;
  /** Base fee, in stroops. Defaults to the client's configured fee. */
  fee?: string;
  /** Transaction builder timeout, in seconds. Defaults to 180. */
  timeoutSeconds?: number;
}

export type ScValArgs = xdr.ScVal[];

