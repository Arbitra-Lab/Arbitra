import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApplicationStatus } from '../arbiter-onboarding-state';

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/;

export class ApplyAsArbiterDto {
  @IsString()
  @Matches(PUBLIC_KEY, { message: 'Invalid Stellar public key' })
  stellarAddress: string;

  @IsOptional()
  @IsString()
  qualifications?: string;

  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  jurisdictions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @IsString()
  stakeAmount?: string;

  @IsOptional()
  @IsString()
  kycReference?: string;
}

export class ReviewApplicationDto {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @IsOptional()
  @IsString()
  reviewNotes?: string;
}
