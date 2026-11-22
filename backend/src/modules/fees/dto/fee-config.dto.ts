import {
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { FeeAgreementType } from '../entities/fee-config.entity';

export class CreateFeeConfigDto {
  @IsEnum(FeeAgreementType)
  agreementType: FeeAgreementType;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  baseRate: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flatFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxFee?: number;

  @IsOptional()
  @IsArray()
  volumeTiers?: Array<{ minVolume: number; maxVolume?: number; rate: number }>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CalculateFeeDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsEnum(FeeAgreementType)
  agreementType?: FeeAgreementType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  historicalVolume?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}
