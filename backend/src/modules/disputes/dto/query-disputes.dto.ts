import {
  IsOptional,
  IsEnum,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsArray,
  IsUUID,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { DisputeStatus, DisputeType } from '../entities/dispute.entity';
import { Type } from 'class-transformer';

export class QueryDisputesDto {
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @IsOptional()
  @IsEnum(DisputeType)
  disputeType?: DisputeType;

  @IsOptional()
  @IsString()
  @IsUUID()
  agreementId?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  initiatedBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  sortBy?: string = 'createdAt';

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  disputeIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  arbiterId?: string;

  @IsOptional()
  @IsString()
  @IsUUID()
  partyId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jurisdiction?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
