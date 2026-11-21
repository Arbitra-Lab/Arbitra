import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class FileInsuranceClaimDto {
  @IsString()
  @IsNotEmpty()
  disputeId: string;

  /** Defaults to the dispute's requested amount when omitted. */
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;

  @IsString()
  @MinLength(10)
  reason: string;
}
