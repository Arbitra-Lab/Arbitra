import { ApiProperty } from '@nestjs/swagger';
import { BatchJobStatus, BatchJobType } from '../entities/batch-job.entity';

export class BatchJobResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: BatchJobType })
  type: BatchJobType;

  @ApiProperty({ enum: BatchJobStatus })
  status: BatchJobStatus;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  totalRows: number;

  @ApiProperty()
  processedRows: number;

  @ApiProperty()
  successCount: number;

  @ApiProperty()
  failureCount: number;

  @ApiProperty({ description: 'Progress percentage 0-100' })
  progress: number;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  errors: Array<{ row: number; reason: string }>;

  @ApiProperty({ required: false })
  createdAt: Date;

  @ApiProperty({ required: false, nullable: true })
  startedAt?: Date | null;

  @ApiProperty({ required: false, nullable: true })
  completedAt?: Date | null;
}
