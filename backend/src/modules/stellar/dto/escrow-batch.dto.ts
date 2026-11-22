import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CreateEscrowDto, ReleaseEscrowDto } from './escrow.dto';

export const MAX_BATCH_SIZE = 100;
export const MAX_BATCH_CONCURRENCY = 10;
export const DEFAULT_BATCH_CONCURRENCY = 5;

export class CreateEscrowBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => CreateEscrowDto)
  items: CreateEscrowDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_BATCH_CONCURRENCY)
  concurrency?: number;

  @IsOptional()
  @IsBoolean()
  stopOnFirstFailure?: boolean;
}

export class ReleaseEscrowBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => ReleaseEscrowDto)
  items: ReleaseEscrowDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_BATCH_CONCURRENCY)
  concurrency?: number;
}
