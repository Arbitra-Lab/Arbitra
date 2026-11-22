import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { BatchController } from './batch.controller';
import { BatchService } from './services/batch.service';
import { BatchImportProcessor } from './processors/batch-import.processor';
import { BatchJob } from './entities/batch-job.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([BatchJob, User]),
    BullModule.registerQueue({ name: 'batch-import' }),
  ],
  controllers: [BatchController],
  providers: [BatchService, BatchImportProcessor],
  exports: [BatchService],
})
export class BatchModule {}
