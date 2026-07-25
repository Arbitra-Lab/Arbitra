import {
  IsNumber,
  Min,
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class ProcessRefundDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  reason: string;

  /** Client-supplied key so a retried refund request doesn't double-refund. */
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
