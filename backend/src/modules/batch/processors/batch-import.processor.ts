import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BatchJob, BatchJobStatus, BatchJobType, BatchJobError } from '../entities/batch-job.entity';
import { BatchImportRow } from '../services/batch.service';
import { User, AuthMethod, UserRole } from '../../users/entities/user.entity';

interface BatchImportJobData {
  jobId: string;
  type: BatchJobType;
  rows: BatchImportRow[];
  createdBy: string;
}

@Processor('batch-import')
export class BatchImportProcessor {
  private readonly logger = new Logger(BatchImportProcessor.name);

  constructor(
    @InjectRepository(BatchJob)
    private readonly batchJobRepo: Repository<BatchJob>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Process('import-users')
  async handleUserImport(job: Job<BatchImportJobData>): Promise<void> {
    const { jobId, rows } = job.data;
    const batchJob = await this.batchJobRepo.findOne({ where: { id: jobId } });
    if (!batchJob) return;

    batchJob.status = BatchJobStatus.PROCESSING;
    batchJob.startedAt = new Date();
    await this.batchJobRepo.save(batchJob);

    const errors: BatchJobError[] = [];
    let successCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const { row, data } = rows[i];
      try {
        await this.importUserRow(data);
        successCount++;
      } catch (err) {
        errors.push({
          row,
          reason: err instanceof Error ? err.message : 'Unknown import error',
          data,
        });
      }
      batchJob.processedRows = i + 1;
      batchJob.successCount = successCount;
      batchJob.failureCount = errors.length;
      batchJob.errors = errors;
      if ((i + 1) % 10 === 0 || i === rows.length - 1) {
        await this.batchJobRepo.save(batchJob);
      }
    }

    batchJob.status = errors.length === rows.length ? BatchJobStatus.FAILED : BatchJobStatus.COMPLETED;
    batchJob.completedAt = new Date();
    batchJob.processedRows = rows.length;
    batchJob.successCount = successCount;
    batchJob.failureCount = errors.length;
    batchJob.errors = errors;
    await this.batchJobRepo.save(batchJob);
    this.logger.log(`Batch job ${jobId} completed: ${successCount}/${rows.length} succeeded`);
  }

  private async importUserRow(data: Record<string, string>): Promise<void> {
    const email = (data.email || '').trim().toLowerCase();
    const firstName = (data.firstName || data.first_name || '').trim();
    const lastName = (data.lastName || data.last_name || '').trim();
    const roleRaw = (data.role || 'user').trim().toLower();
    const password = (data.password || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Invalid or missing email');
    }
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const allowedRoles = new Set(Object.values(UserRole));
    const role = allowedRoles.has(roleRaw as UserRole) ? (roleRaw as UserRole) : UserRole.USER;

    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      throw new Error(`Duplicate user email: ${email}`);
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      email,
      firstName: firstName || null,
      lastName: lastName || null,
      password: hashed,
      role,
      authMethod: AuthMethod.PASSWORD,
    } as Partial<User>);
    await this.userRepo.save(user);
  }
}
