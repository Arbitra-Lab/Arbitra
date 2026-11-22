import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import { BatchJob, BatchJobStatus, BatchJobType } from '../entities/batch-job.entity';
import { BatchJobResponseDto } from '../dto/batch-job-response.dto';

export interface BatchImportRow {
  row: number;
  data: Record<string, string>;
}

@Injectable()
export class BatchService {
  constructor(
    @InjectRepository(BatchJob)
    private readonly batchJobRepo: Repository<BatchJob>,
    @InjectQueue('batch-import')
    private readonly batchQueue: Queue,
  ) {}

  async importUsers(file: Express.Multer.File, userId: string): Promise<BatchJobResponseDto> {
    return this.createImportJob(file, userId, BatchJobType.USER_IMPORT, 'import-users');
  }

  async getJob(id: string): Promise<BatchJobResponseDto> {
    const job = await this.batchJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Batch job ${id} not found`);
    return this.toDto(job);
  }

  private async createImportJob(
    file: Express.Multer.File,
    userId: string,
    type: BatchJobType,
    queueName: string,
  ): Promise<BatchJobResponseDto> {
    if (!file) throw new BadRequestException('CSV file is required');
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are supported');
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('CSV file is empty');
    }

    const hash = createHash('sha256')
      .update(file.buffer)
      .update(`:${type}:${userId}`)
      .digest('hex');
    const idempotencyKey = `${type}:${hash}`;

    const existing = await this.batchJobRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      throw new ConflictException({
        message: 'Duplicate import detected. This file has already been submitted for this import type.',
        jobId: existing.id,
        status: existing.status,
      });
    }

    const rows = this.parseCsv(file.buffer.toString('utf8'));
    if (rows.length === 0) {
      throw new BadRequestException('CSV contains no data rows');
    }

    const job = this.batchJobRepo.create({
      type,
      status: BatchJobStatus.QUEUED,
      idempotencyKey,
      fileName: file.originalname,
      totalRows: rows.length,
      processedRows: 0,
      successCount: 0,
      failureCount: 0,
      errors: [],
      createdBy: userId,
    });
    const saved = await this.batchJobRepo.save(job);

    await this.batchQueue.add(
      queueName,
      { jobId: saved.id, type, rows, createdBy: userId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    return this.toDto(saved);
  }

  parseCsv(content: string): BatchImportRow[] {
    const lines = content
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];

    const headers = this.splitCsvLine(lines[0]).map((h) => h.trim());
    const rows: BatchImportRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this.splitCsvLine(lines[i]);
      if (values.every((v) => v.trim() === '')) continue;
      const data: Record<string, string> = {};
      headers.forEach((h, idx) => {
        data[h] = (values[idx] ?? '').trim();
      });
      rows.push({ row: i + 1, data });
    }
    return rows;
  }

  private splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') {
        result.push(current);
        current = '';
      } else current += ch;
    }
    result.push(current);
    return result;
  }

  toDto(job: BatchJob): BatchJobResponseDto {
    const progress =
      job.totalRows === 0 ? 0 : Math.round((job.processedRows / job.totalRows) * 100);
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      fileName: job.fileName,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      successCount: job.successCount,
      failureCount: job.failureCount,
      progress,
      errors: (job.errors || []).map((e) => ({ row: e.row, reason: e.reason })),
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }
}
