import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  Min,
  Max,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArbitrationProcedure } from '../entities/jurisdiction.entity';

export class CreateJurisdictionDto {
  @ApiProperty({ description: 'Stable jurisdiction code', example: 'US-CA' })
  @IsNotEmpty()
  @IsString()
  @Length(2, 16)
  code: string;

  @ApiProperty({ example: 'California, United States' })
  @IsNotEmpty()
  @IsString()
  @Length(1, 100)
  name: string;

  @ApiProperty({ description: 'ISO 3166-1 alpha-2 country code', example: 'US' })
  @IsNotEmpty()
  @IsString()
  @Length(2, 2)
  country: string;

  @ApiPropertyOptional({ description: 'State/province/region code', example: 'CA' })
  @IsOptional()
  @IsString()
  @Length(1, 10)
  region?: string;

  @ApiProperty({ description: 'ISO 4217 currency code', example: 'USD' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Max security deposit expressed as a multiple of monthly rent',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxSecurityDepositMonths?: number;

  @ApiPropertyOptional({ description: 'Minimum lease termination notice period, in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minNoticePeriodDays?: number;

  @ApiPropertyOptional({ description: 'Maximum late fee as a percentage of monthly rent' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maxLateFeePercent?: number;

  @ApiPropertyOptional({ description: 'Minimum grace period before late fees may apply, in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minGracePeriodDays?: number;

  @ApiPropertyOptional({
    description: 'Days after an incident within which a dispute must be filed',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  disputeFilingWindowDays?: number;

  @ApiPropertyOptional({ enum: ArbitrationProcedure })
  @IsOptional()
  @IsEnum(ArbitrationProcedure)
  requiredArbitrationProcedure?: ArbitrationProcedure;

  @ApiPropertyOptional({ description: 'Suggested minimum arbiter quorum for this jurisdiction' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minArbiterQuorum?: number;
}
