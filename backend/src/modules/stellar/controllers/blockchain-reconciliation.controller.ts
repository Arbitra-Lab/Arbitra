import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { UserRole } from '../../users/entities/user.entity';
import { EventReconciliationService } from '../services/event-reconciliation.service';

@ApiTags('Blockchain Event Reconciliation')
@ApiBearerAuth('JWT-auth')
@Controller('v1/blockchain-reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class BlockchainReconciliationController {
  constructor(
    private readonly eventReconciliationService: EventReconciliationService,
  ) {}

  @Get('dead-letters')
  @ApiOperation({ summary: '[Admin] List dead-lettered blockchain events' })
  @ApiQuery({ name: 'streamName', required: false })
  @ApiResponse({ status: 200, description: 'Dead-lettered events' })
  async listDeadLetters(@Query('streamName') streamName?: string) {
    return this.eventReconciliationService.listDeadLetters(streamName);
  }

  @Post('dead-letters/:id/replay')
  @ApiOperation({ summary: '[Admin] Manually replay a dead-lettered event' })
  @ApiParam({ name: 'id', description: 'Dead letter event ID' })
  @ApiResponse({ status: 200, description: 'Replay outcome' })
  @ApiResponse({ status: 404, description: 'Dead letter event not found' })
  async replayDeadLetter(@Param('id') id: string) {
    return this.eventReconciliationService.replayDeadLetter(id);
  }
}
