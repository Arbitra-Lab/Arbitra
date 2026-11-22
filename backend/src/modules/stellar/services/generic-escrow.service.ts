import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Horizon } from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { StellarEscrow } from '../entities/stellar-escrow.entity';
import { EscrowContractService } from './escrow-contract.service';
import {
  CreateGenericEscrowDto,
  GenericEscrowAssetDto,
  LookupGenericAssetDto,
} from '../dto/generic-escrow.dto';

export interface ResolvedAsset {
  /** Contract/Horizon identifier: `native` or `CODE:ISSUER`. */
  id: string;
  assetType: 'XLM' | 'ISSUED';
  assetCode?: string;
  assetIssuer?: string;
  /** True when the custom asset was confirmed to exist on Horizon. */
  verifiedOnHorizon: boolean;
}

export interface FeeDistribution {
  address: string;
  basisPoints: number;
  amount: string;
}

export interface GenericEscrowPlan {
  agreementType: string;
  agreementReference?: string;
  depositor: string;
  beneficiary: string;
  arbiter: string;
  amount: string;
  asset: ResolvedAsset;
  tokenContractId: string;
  signers: string[];
  requiredSignatures: number;
  feeSplits: FeeDistribution[];
}

export interface GenericEscrowResult extends GenericEscrowPlan {
  escrowId: string;
}

/**
 * Agreement-agnostic escrow facade (#6). It validates a neutral escrow plan,
 * resolves assets through Horizon and delegates on-chain work to the existing
 * `EscrowContractService` so there is a single Stellar integration path.
 */
@Injectable()
export class GenericEscrowService {
  private readonly logger = new Logger(GenericEscrowService.name);
  private readonly horizon: Horizon.Server;

  constructor(
    private readonly configService: ConfigService,
    private readonly escrowContractService: EscrowContractService,
    @InjectRepository(StellarEscrow)
    private readonly escrowRepository: Repository<StellarEscrow>,
  ) {
    const horizonUrl =
      this.configService.get<string>('stellar.horizonUrl') ??
      'https://horizon-testnet.stellar.org';
    this.horizon = new Horizon.Server(horizonUrl);
  }

  /** Pure plan builder, including 2-of-3 and fee-split validation. */
  buildPlan(
    dto: CreateGenericEscrowDto,
    asset: ResolvedAsset,
  ): GenericEscrowPlan {
    const tokenContractId =
      dto.tokenContractId ??
      this.configService.get<string>('GENERIC_ESCROW_TOKEN_ID') ??
      '';
    if (!/^[CG][A-Z2-7]{55}$/.test(tokenContractId)) {
      throw new BadRequestException(
        'A valid Stellar token contract id is required for the escrow asset',
      );
    }
    if (dto.requiredSignatures !== 2 || dto.signers?.length !== 3) {
      throw new BadRequestException(
        'Generic escrow requires exactly 2-of-3 multisig signers',
      );
    }
    if (new Set(dto.signers).size !== 3) {
      throw new BadRequestException('Multisig signers must be unique');
    }
    if (!Array.isArray(dto.feeSplits) || dto.feeSplits.length > 2) {
      throw new BadRequestException(
        'The escrow contract supports at most two fee recipients',
      );
    }
    const totalBps = dto.feeSplits.reduce(
      (sum, split) => sum + Number(split.basisPoints || 0),
      0,
    );
    if (totalBps > 10000) {
      throw new BadRequestException('Fee splits cannot exceed 100%');
    }

    return {
      agreementType: dto.agreementType,
      agreementReference: dto.agreementReference,
      depositor: dto.depositor,
      beneficiary: dto.beneficiary,
      arbiter: dto.arbiter,
      amount: dto.amount,
      asset,
      tokenContractId,
      signers: dto.signers,
      requiredSignatures: dto.requiredSignatures,
      feeSplits: dto.feeSplits.map((split) => ({
        address: split.address,
        basisPoints: split.basisPoints,
        amount: ((Number(dto.amount) * split.basisPoints) / 10000).toFixed(7),
      })),
    };
  }

  /** Resolve XLM or a custom Stellar asset via the Horizon assets endpoint. */
  async describeAsset(
    asset: GenericEscrowAssetDto | LookupGenericAssetDto,
  ): Promise<ResolvedAsset> {
    if (asset.assetType === 'XLM') {
      return { id: 'native', assetType: 'XLM', verifiedOnHorizon: true };
    }

    if (!asset.assetCode || !asset.assetIssuer) {
      throw new BadRequestException(
        'Issued assets require an asset code and issuer',
      );
    }

    try {
      const page = await this.horizon
        .assets()
        .forCode(asset.assetCode)
        .forIssuer(asset.assetIssuer)
        .call();
      return {
        id: `${asset.assetCode}:${asset.assetIssuer}`,
        assetType: 'ISSUED',
        assetCode: asset.assetCode,
        assetIssuer: asset.assetIssuer,
        verifiedOnHorizon: page.records.length > 0,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Horizon asset lookup failed: ${message}`);
      throw new ServiceUnavailableException(
        'Could not verify the asset with Stellar Horizon',
      );
    }
  }

  /** Create an escrow for any agreement type using the shared contract path. */
  async create(dto: CreateGenericEscrowDto): Promise<GenericEscrowResult> {
    const asset = await this.describeAsset(dto.asset);
    const plan = this.buildPlan(dto, asset);

    const escrowId = await this.escrowContractService.createMultiSigEscrow({
      participants: [plan.depositor, plan.beneficiary, plan.arbiter],
      requiredSignatures: plan.requiredSignatures,
      amount: plan.amount,
      token: plan.tokenContractId,
      arbiter: plan.arbiter,
      description: `${plan.agreementType}${plan.agreementReference ? `:${plan.agreementReference}` : ''}`,
    });

    // Persist the agreement-agnostic plan and fee configuration alongside the
    // multisig metadata already stored by EscrowContractService.
    const escrow = await this.escrowRepository.findOne({
      where: { blockchainEscrowId: escrowId },
    });
    if (escrow) {
      escrow.escrowMetadata = {
        ...escrow.escrowMetadata,
        genericEscrow: plan,
      };
      await this.escrowRepository.save(escrow);
    }

    this.logger.log(
      `Created ${plan.agreementType} escrow ${escrowId} with ${asset.id} (2-of-3)`,
    );
    return { ...plan, escrowId };
  }
}
