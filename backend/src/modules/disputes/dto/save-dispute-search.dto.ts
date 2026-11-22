import { IsString, MaxLength, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveDisputeSearchDto {
  @ApiProperty({ example: 'High value rent disputes' })
  @IsString()
  @MaxLength(120)
  name: string;

  @ApiProperty({ description: 'QueryDisputesDto-compatible filter object' })
  @IsObject()
  filters: Record<string, unknown>;
}
