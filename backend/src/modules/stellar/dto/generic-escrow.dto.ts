import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const PUBLIC_KEY = /^G[A-Z0-9]{55}$/;
const ASSET_CODE = /^[a-zA-Z0-9]{1,12}$/;
const AMOUNT = /^\d+(\.\d{1,7})?$/;

export class GenericEscrowAssetDto {
  /** `XLM` for the native asset, `ISSUED` for a custom Stellar asset. */
  @IsString()
  assetType: 'XLM' | 'ISSUED';

  @IsOptional()
  @IsString()
  @Matches(ASSET_CODE, {
    message: 'Asset code must be 1-12 alphanumeric characters',
  })
  assetCode?: string;

  @IsOptional()
  @IsString()
  @Matches(PUBLIC_KEY, { message: 'Invalid asset issuer public key' })
  assetIssuer?: string;
}

export class FeeSplitDto {
  @IsString()
  @Matches(PUBLIC_KEY, { message: 'Invalid fee recipient public key' })
  address: string;

  /** Basis points: 100 = 1%. */
  @IsInt()
  @Min(0)
  @Max(10000)
  basisPoints: number;
}

export class CreateGenericEscrowDto {
  /** Any agreement type, e.g. `rental`, `freelance`, `trade`, `insurance`. */
  @IsString()
  agreementType: string;

  @IsOptional()
  @IsString()
  agreementReference?: string;

  @IsString()
  @Matches(PUBLIC_KEY, { message: 'Invalid depositor public key' })
  depositor: string;

  @IsString()
  @Matches(PUBLIC_KEY, { message: 'Invalid beneficiary public key' })
  beneficiary: string;

  @IsString()
  @Matches(PUBLIC_KEY, { message: 'Invalid arbiter public key' })
  arbiter: string;

  @IsString()
  @Matches(AMOUNT, {
    message: 'Amount must be positive with up to 7 decimal places',
  })
  amount: string;

  @IsObject()
  @ValidateNested()
  @Type(() => GenericEscrowAssetDto)
  asset: GenericEscrowAssetDto;

  /** Soroban token contract id used by the escrow contract for this asset. */
  @IsOptional()
  @IsString()
  @Matches(/^[CG][A-Z2-7]{55}$/, {
    message: 'Invalid Stellar token contract id',
  })
  tokenContractId?: string;

  /** Exactly three signers for a 2-of-3 setup (#6). */
  @IsArray()
  @IsString({ each: true })
  @Matches(PUBLIC_KEY, { each: true, message: 'Invalid signer public key' })
  signers: string[];

  @IsInt()
  @Min(2)
  @Max(2)
  requiredSignatures: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeeSplitDto)
  feeSplits: FeeSplitDto[];
}

export class LookupGenericAssetDto {
  @IsString()
  assetType: 'XLM' | 'ISSUED';

  @IsOptional()
  @IsString()
  @Matches(ASSET_CODE)
  assetCode?: string;

  @IsOptional()
  @IsString()
  @Matches(PUBLIC_KEY)
  assetIssuer?: string;
}
