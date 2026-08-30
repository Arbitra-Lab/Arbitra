import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class AdminRefundDecisionDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsString()
  @MinLength(2)
  notes: string;

  /** Client-supplied key so a retried decision submission doesn't apply twice. */
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}
