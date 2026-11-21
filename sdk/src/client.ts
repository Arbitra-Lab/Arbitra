import { Account, BASE_FEE, Contract, TransactionBuilder, rpc, xdr } from '@stellar/stellar-sdk';
import { ArbitraSdkError } from './errors.js';
import { TESTNET, TESTNET_CONTRACT_IDS } from './networks.js';
import { scval } from './scval.js';
import type {
  ContractIds,
  InvokeOptions,
  InvokeResult,
  NetworkConfig,
  ReadOptions,
  Signer,
} from './types.js';

/** A syntactically valid but unfunded account, used only to simulate read-only calls. */
const DUMMY_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

export interface ArbitraClientOptions {
  /** A network preset (e.g. `TESTNET` from `./networks.js`). Overridden by `rpcUrl`/`networkPassphrase` if given. */
  network?: NetworkConfig;
  rpcUrl?: string;
  networkPassphrase?: string;
  allowHttp?: boolean;
  /** Overrides for one or more deployed contract IDs; unset ones fall back to the testnet defaults. */
  contractIds?: Partial<ContractIds>;
  /** Default signer used by `invoke()` calls that don't pass one explicitly. */
  signer?: Signer;
  defaultFee?: string;
  defaultTimeoutSeconds?: number;
}

/**
 * Low-level client for reading from and submitting transactions to Arbitra's
 * Soroban contracts. Contract-specific wrappers in `./contracts/*` are built
 * on top of `read()` and `invoke()` below; integrators who need a method the
 * wrappers don't expose yet can call it directly through this client.
 */
export class ArbitraClient {
  readonly server: rpc.Server;
  readonly networkPassphrase: string;
  readonly contractIds: ContractIds;
  private signer?: Signer;
  private readonly defaultFee: string;
  private readonly defaultTimeoutSeconds: number;

  constructor(options: ArbitraClientOptions = {}) {
    const network = options.network ?? TESTNET;
    const rpcUrl = options.rpcUrl ?? network.rpcUrl;
    this.networkPassphrase = options.networkPassphrase ?? network.networkPassphrase;
    this.server = new rpc.Server(rpcUrl, {
      allowHttp: options.allowHttp ?? network.allowHttp ?? false,
    });
    this.contractIds = { ...TESTNET_CONTRACT_IDS, ...options.contractIds };
    this.signer = options.signer;
    this.defaultFee = options.defaultFee ?? BASE_FEE;
    this.defaultTimeoutSeconds = options.defaultTimeoutSeconds ?? 180;
  }

  /** Sets (or clears) the signer used by `invoke()` calls that don't pass one explicitly. */
  setSigner(signer: Signer | undefined): void {
    this.signer = signer;
  }

  getSigner(): Signer | undefined {
    return this.signer;
  }

  /**
   * Simulates a read-only contract call and decodes its return value.
   * Does not require a signer and never submits a transaction.
   */
  async read<T = unknown>(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
    opts: ReadOptions = {},
  ): Promise<T> {
    const account = new Account(opts.source ?? DUMMY_SOURCE, '0');
    const contract = new Contract(contractId);
    const tx = new TransactionBuilder(account, {
      fee: this.defaultFee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(this.defaultTimeoutSeconds)
      .build();

    const simulation = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new ArbitraSdkError(`Simulation of "${method}" failed: ${simulation.error}`);
    }

    const retval = simulation.result?.retval;
    return retval ? scval.toNative<T>(retval) : (undefined as T);
  }

  /**
   * Builds, simulates, signs, submits, and awaits a state-changing contract
   * call, returning the decoded return value and transaction hash.
   */
  async invoke<T = unknown>(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
    opts: InvokeOptions = {},
  ): Promise<InvokeResult<T>> {
    const signer = opts.signer ?? this.signer;
    if (!signer) {
      throw new ArbitraSdkError(
        `No signer configured for "${method}". Pass a Signer to new ArbitraClient({ signer }) or to invoke(..., { signer }).`,
      );
    }

    const account = await this.server.getAccount(signer.publicKey());
    const contract = new Contract(contractId);
    const builtTx = new TransactionBuilder(account, {
      fee: opts.fee ?? this.defaultFee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(opts.timeoutSeconds ?? this.defaultTimeoutSeconds)
      .build();

    const simulation = await this.server.simulateTransaction(builtTx);
    if (rpc.Api.isSimulationError(simulation)) {
      throw new ArbitraSdkError(`Simulation of "${method}" failed: ${simulation.error}`);
    }

    const preparedTx = rpc.assembleTransaction(builtTx, simulation).build();
    const signedXdr = await signer.signTransaction(preparedTx.toXDR(), {
      networkPassphrase: this.networkPassphrase,
    });
    const signedTx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);

    const sendResponse = await this.server.sendTransaction(signedTx);
    if (sendResponse.status === 'ERROR') {
      throw new ArbitraSdkError(
        `Failed to submit "${method}": ${JSON.stringify(sendResponse.errorResult)}`,
      );
    }

    const txHash = sendResponse.hash;
    let getResponse = await this.server.getTransaction(txHash);
    while (getResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      await sleep(1000);
      getResponse = await this.server.getTransaction(txHash);
    }

    if (getResponse.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new ArbitraSdkError(`Transaction "${method}" failed on-chain (hash ${txHash}).`);
    }

    const value = getResponse.returnValue ? scval.toNative<T>(getResponse.returnValue) : (undefined as T);
    return { value, txHash };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
