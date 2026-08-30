import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeType } from '../../disputes/entities/dispute.entity';

export enum CohortGroupBy {
  MONTH = 'month',
  ROLE = 'role',
  CATEGORY = 'category',
}

export class DisputeCohortQueryDto {
  @ApiPropertyOptional({
    description: 'Start date for the date range filter (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for the date range filter (ISO 8601)',
    example: '2026-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Filter by dispute category',
    enum: DisputeType,
  })
  @IsOptional()
  @IsEnum(DisputeType)
  category?: DisputeType;

  @ApiPropertyOptional({
    description: 'Number of months to look back when no date range is given',
    minimum: 1,
    maximum: 36,
    default: 12,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;

  @ApiPropertyOptional({
    description: 'Trigger a full backfill from the earliest dispute onwards',
    default: false,
  })
  @IsOptional()
  backfill?: boolean;
}
