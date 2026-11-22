import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum AnalyticsSection {
  USAGE = 'usage',
  REVENUE = 'revenue',
  ARBITERS = 'arbiters',
  USERS = 'users',
  DISPUTES = 'disputes',
  HEALTH = 'health',
}

export enum AnalyticsGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class AdminAnalyticsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 365, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @ApiPropertyOptional({
    enum: AnalyticsSection,
    isArray: true,
    description: 'Limit the report to selected dashboard sections',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.values(AnalyticsSection).length)
  @IsEnum(AnalyticsSection, { each: true })
  sections?: AnalyticsSection[];

  @ApiPropertyOptional({
    enum: AnalyticsGroupBy,
    default: AnalyticsGroupBy.DAY,
  })
  @IsOptional()
  @IsEnum(AnalyticsGroupBy)
  groupBy?: AnalyticsGroupBy;

  @ApiPropertyOptional({
    default: false,
    description: 'Include comparison metrics for the preceding period',
  })
  @IsOptional()
  @IsBoolean()
  compare?: boolean;
}
