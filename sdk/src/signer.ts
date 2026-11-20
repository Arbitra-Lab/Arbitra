import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import type { Signer } from './types.js';

/**
 * A `Signer` backed by a raw Stellar `Keypair`. Suitable for server-side
 * scripts and backends holding a secret key directly — never use this with
 * a secret key you don't control (e.g. in a browser), use a wallet-backed
 * `Signer` (Freighter, xBull, etc.) instead.
 */
export class KeypairSigner implements Signer {
  private readonly keypair: Keypair;

  constructor(secretKeyOrKeypair: string | Keypair) {
    this.keypair =
      typeof secretKeyOrKeypair === 'string'
        ? Keypair.fromSecret(secretKeyOrKeypair)
        : secretKeyOrKeypair;
  }

  publicKey(): string {
    return this.keypair.publicKey();
  }

  async signTransaction(
    transactionXdr: string,
    opts: { networkPassphrase: string },
  ): Promise<string> {
    const tx = TransactionBuilder.fromXDR(transactionXdr, opts.networkPassphrase);
    tx.sign(this.keypair);
    return tx.toXDR();
  }
}
