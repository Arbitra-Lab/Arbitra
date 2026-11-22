import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProposalType, VoteChoice } from '../governance-state-machine';

export class CreateProposalDto {
  @IsEnum(ProposalType)
  type: ProposalType;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsObject()
  parameters?: Record<string, number>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  durationDays?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(10000)
  quorumBps?: number;

  @IsOptional()
  @IsInt()
  @Min(5000)
  @Max(10000)
  thresholdBps?: number;
}

export class CastVoteDto {
  @IsEnum(VoteChoice)
  choice: VoteChoice;
}

export class DistributeTokensDto {
  @IsString()
  userId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  idempotencyKey: string;

  @IsString()
  source: string;
}
