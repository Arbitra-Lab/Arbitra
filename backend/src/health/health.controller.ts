import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheckService, HealthCheck } from '@nestjs/terminus';
import { HealthService } from './health.service';
import { ShutdownState } from '../config/shutdown-state';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { StellarHealthIndicator } from './indicators/stellar.indicator';
import { MemoryHealthIndicator } from './indicators/memory.indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private healthService: HealthService,
    private shutdownState: ShutdownState,
    private databaseHealthIndicator: DatabaseHealthIndicator,
    private stellarHealthIndicator: StellarHealthIndicator,
    private memoryHealthIndicator: MemoryHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Basic health check',
    description:
      'Returns overall status and per-service health (database, stellar, memory).',
  })
  @ApiResponse({ status: 200, description: 'Service healthy or degraded' })
  @ApiResponse({ status: 503, description: 'Service unhealthy' })
  async check(@Res() res: Response) {
    return this.respond(res, false);
  }

  @Get('detailed')
  @HealthCheck()
  @ApiOperation({
    summary: 'Detailed health check',
    description: 'Includes system details (Node version, memory, PID).',
  })
  @ApiResponse({ status: 200, description: 'Detailed health info' })
  @ApiResponse({ status: 503, description: 'Service unhealthy' })
  async detailedCheck(@Res() res: Response) {
    return this.respond(res, true);
  }

  private getIndicators() {
    return [
      () => this.databaseHealthIndicator.isHealthy('database'),
      () => this.stellarHealthIndicator.isHealthy('stellar'),
      () => this.memoryHealthIndicator.isHealthy('memory'),
    ];
  }

  private async respond(@Res() res: Response, includeDetails: boolean) {
    if (this.shutdownState.isShuttingDown) {
      return res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json(
          this.healthService.shutdownResult(
            includeDetails,
            this.shutdownState.receivedSignal,
          ),
        );
    }

    try {
      const result = await this.health.check(this.getIndicators());
      const enhancedResult = this.healthService.enhanceHealthResult(
        result,
        includeDetails,
      );
      return res
        .status(this.determineHttpStatus(enhancedResult.status))
        .json(enhancedResult);
    } catch (error) {
      const degradedResult = this.healthService.handlePartialFailure(
        error,
        includeDetails,
      );
      return res
        .status(this.determineHttpStatus(degradedResult.status))
        .json(degradedResult);
    }
  }

  private determineHttpStatus(healthStatus: string): number {
    switch (healthStatus) {
      case 'ok':
        return HttpStatus.OK;
      case 'warning':
        return HttpStatus.OK; // Graceful degradation
      case 'error':
        return HttpStatus.SERVICE_UNAVAILABLE;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }
}
