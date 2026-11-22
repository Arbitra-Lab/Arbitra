import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { User } from '../../users/entities/user.entity';
import {
  CreateEscrowBatchDto,
  ReleaseEscrowBatchDto,
} from '../dto/escrow-batch.dto';
import { EscrowBatchService } from '../services/escrow-batch.service';

@ApiTags('Escrow Batches')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('stellar/escrow/batches')
export class EscrowBatchController {
  constructor(private readonly batchService: EscrowBatchService) {}

  @Post('create')
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create a batch of escrows with bounded concurrency',
  })
  createBatch(@Body() dto: CreateEscrowBatchDto, @CurrentUser() user: User) {
    return this.batchService.createBatch(dto.items, user?.id, {
      concurrency: dto.concurrency,
      stopOnFirstFailure: dto.stopOnFirstFailure,
    });
  }

  @Post('release')
  @Throttle({ strict: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Bulk release escrows with bounded concurrency' })
  releaseBatch(@Body() dto: ReleaseEscrowBatchDto, @CurrentUser() user: User) {
    return this.batchService.releaseBatch(dto.items, user?.id, {
      concurrency: dto.concurrency,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get progress and per-item results for a batch' })
  getBatch(@Param('id') id: string) {
    return this.batchService.getBatch(id);
  }

  @Post(':id/retry-failed')
  @ApiOperation({ summary: 'Retry only the failed items of a batch' })
  retryFailed(@Param('id') id: string, @CurrentUser() user: User) {
    return this.batchService.retryFailed(id, user?.id);
  }
}
