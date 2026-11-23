import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

export enum DisputeOutcome {
  FAVOR_CLAIMANT = 'FavorClaimant',
  FAVOR_RESPONDENT = 'FavorRespondent',
}

export interface DisputeInfo {
  caseId: string;
  detailsHash: string;
  raisedAt: number;
  resolved: boolean;
  resolvedAt?: number;
  votesFavorClaimant: number;
  votesFavorRespondent: number;
  outcome?: DisputeOutcome;
}

export interface ArbiterInfo {
  address: string;
  addedAt: number;
  active: boolean;
}

export interface VoteInfo {
  arbiter: string;
  caseId: string;
  favorClaimant: boolean;
  votedAt: number;
}

@Injectable()
export class DisputeContractService {
  private readonly logger = new Logger(DisputeContractService.name);
  private readonly contractId: string;
  private readonly rpcUrl: string;
  private readonly network: string;
  private readonly networkPassphrase: string;
  private readonly allowHttpRpc: boolean;
  private readonly adminKeypair?: StellarSdk.Keypair;

  constructor(private configService: ConfigService) {
    this.contractId =
      this.configService.get<string>('DISPUTE_CONTRACT_ID') || '';
    this.rpcUrl =
      this.configService.get<string>('SOROBAN_RPC_URL') ||
      'https://soroban-testnet.stellar.org';
    this.network = this.configService.get<string>('STELLAR_NETWORK', 'testnet');
    this.networkPassphrase =
      this.configService.get<string>('STELLAR_NETWORK_PASSPHRASE') ||
      (this.network === 'mainnet'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET);
    this.allowHttpRpc =
      this.configService.get<string>('SOROBAN_RPC_ALLOW_HTTP') === 'true';

    const adminSecret = this.configService.get<string>(
      'STELLAR_ADMIN_SECRET_KEY',
    );
    if (adminSecret) {
      this.adminKeypair = StellarSdk.Keypair.fromSecret(adminSecret);
    }
  }

  async addArbiter(arbiterAddress: string): Promise<string> {
    if (!this.adminKeypair) {
      throw new Error('Admin keypair not configured');
    }

    this.logger.log(`Adding arbiter: ${arbiterAddress}`);

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(this.adminKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'add_arbiter',
          StellarSdk.Address.fromString(
            this.adminKeypair.publicKey(),
          ).toScVal(),
          StellarSdk.Address.fromString(arbiterAddress).toScVal(),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(this.adminKeypair);

    return this.submitAndWait(server, prepared);
  }

  async raiseDispute(
    raiserAddress: string,
    caseId: string,
    detailsHash: string,
  ): Promise<string> {
    this.logger.log(`Raising dispute for case: ${caseId}`);

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const raiserKeypair = StellarSdk.Keypair.fromSecret(raiserAddress);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(raiserKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'raise_dispute',
          StellarSdk.Address.fromString(raiserKeypair.publicKey()).toScVal(),
          StellarSdk.nativeToScVal(caseId, { type: 'string' }),
          StellarSdk.nativeToScVal(detailsHash, { type: 'string' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(raiserKeypair);

    return this.submitAndWait(server, prepared);
  }

  async voteOnDispute(
    arbiterAddress: string,
    caseId: string,
    favorClaimant: boolean,
  ): Promise<string> {
    this.logger.log(`Arbiter voting on dispute: ${caseId}`);

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const arbiterKeypair = StellarSdk.Keypair.fromSecret(arbiterAddress);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(arbiterKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'vote_on_dispute',
          StellarSdk.Address.fromString(arbiterKeypair.publicKey()).toScVal(),
          StellarSdk.nativeToScVal(caseId, { type: 'string' }),
          StellarSdk.nativeToScVal(favorClaimant, { type: 'bool' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(arbiterKeypair);

    return this.submitAndWait(server, prepared);
  }

  async resolveDispute(
    caseId: string,
  ): Promise<{ outcome: DisputeOutcome; txHash: string }> {
    if (!this.adminKeypair) {
      throw new Error('Admin keypair not configured');
    }

    this.logger.log(`Resolving dispute: ${caseId}`);

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(this.adminKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'resolve_dispute',
          StellarSdk.nativeToScVal(caseId, { type: 'string' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(this.adminKeypair);

    const txHash = await this.submitAndWait(server, prepared);

    const outcome = await this.getDisputeOutcome(caseId);
    return { outcome, txHash };
  }

  async getDispute(caseId: string): Promise<DisputeInfo | null> {
    if (!this.adminKeypair) {
      return null;
    }

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(this.adminKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'get_dispute',
          StellarSdk.nativeToScVal(caseId, { type: 'string' }),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    const simulated = await server.simulateTransaction(prepared);

    if (
      StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) &&
      simulated.result?.retval
    ) {
      return this.parseDisputeInfo(simulated.result.retval);
    }

    return null;
  }

  async getArbiter(arbiterAddress: string): Promise<ArbiterInfo | null> {
    if (!this.adminKeypair) {
      return null;
    }

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(this.adminKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'get_arbiter',
          StellarSdk.Address.fromString(arbiterAddress).toScVal(),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    const simulated = await server.simulateTransaction(prepared);

    if (
      StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) &&
      simulated.result?.retval
    ) {
      return this.parseArbiterInfo(simulated.result.retval);
    }

    return null;
  }

  async getArbiterCount(): Promise<number> {
    if (!this.adminKeypair) {
      return 0;
    }

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(this.adminKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(contract.call('get_arbiter_count'))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    const simulated = await server.simulateTransaction(prepared);

    if (
      StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) &&
      simulated.result?.retval
    ) {
      return StellarSdk.scValToNative(simulated.result.retval);
    }

    return 0;
  }

  async getVote(
    caseId: string,
    arbiterAddress: string,
  ): Promise<VoteInfo | null> {
    if (!this.adminKeypair) {
      return null;
    }

    const server = new StellarSdk.SorobanRpc.Server(this.rpcUrl, {
      allowHttp: this.allowHttpRpc,
    });
    const contract = new StellarSdk.Contract(this.contractId);

    const tx = new StellarSdk.TransactionBuilder(
      await server.getAccount(this.adminKeypair.publicKey()),
      {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: this.getNetworkPassphrase(),
      },
    )
      .addOperation(
        contract.call(
          'get_vote',
          StellarSdk.nativeToScVal(caseId, { type: 'string' }),
          StellarSdk.Address.fromString(arbiterAddress).toScVal(),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    const simulated = await server.simulateTransaction(prepared);

    if (
      StellarSdk.SorobanRpc.Api.isSimulationSuccess(simulated) &&
      simulated.result?.retval
    ) {
      return this.parseVoteInfo(simulated.result.retval);
    }

    return null;
  }

  private async getDisputeOutcome(caseId: string): Promise<DisputeOutcome> {
    const dispute = await this.getDispute(caseId);
    if (!dispute || !dispute.outcome) {
      throw new Error('Dispute not resolved');
    }
    return dispute.outcome;
  }

  private parseDisputeInfo(result: StellarSdk.xdr.ScVal): DisputeInfo {
    const native = StellarSdk.scValToNative(result);
    return {
      caseId: native.case_id,
      detailsHash: native.details_hash,
      raisedAt: native.raised_at,
      resolved: native.resolved,
      resolvedAt: native.resolved_at,
      votesFavorClaimant: native.votes_favor_claimant,
      votesFavorRespondent: native.votes_favor_respondent,
      outcome:
        native.votes_favor_claimant > native.votes_favor_respondent
          ? DisputeOutcome.FAVOR_CLAIMANT
          : DisputeOutcome.FAVOR_RESPONDENT,
    };
  }

  private parseArbiterInfo(result: StellarSdk.xdr.ScVal): ArbiterInfo {
    const native = StellarSdk.scValToNative(result);
    return {
      address: native.address,
      addedAt: native.added_at,
      active: native.active,
    };
  }

  private parseVoteInfo(result: StellarSdk.xdr.ScVal): VoteInfo {
    const native = StellarSdk.scValToNative(result);
    return {
      arbiter: native.arbiter,
      caseId: native.case_id,
      favorClaimant: native.favor_claimant,
      votedAt: native.voted_at,
    };
  }

  private getNetworkPassphrase(): string {
    return this.networkPassphrase;
  }

  private async submitAndWait(
    server: StellarSdk.SorobanRpc.Server,
    transaction: StellarSdk.Transaction,
  ): Promise<string> {
    const result = await server.sendTransaction(transaction);
    if (result.status === 'ERROR') {
      throw new Error(
        `Dispute contract rejected transaction: ${JSON.stringify(result.errorResult)}`,
      );
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await server.getTransaction(result.hash);
      if (
        response.status ===
        StellarSdk.SorobanRpc.Api.GetTransactionStatus.SUCCESS
      ) {
        return result.hash;
      }
      if (
        response.status ===
        StellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED
      ) {
        throw new Error(`Dispute contract transaction failed: ${result.hash}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error(`Dispute contract transaction timed out: ${result.hash}`);
  }
}
