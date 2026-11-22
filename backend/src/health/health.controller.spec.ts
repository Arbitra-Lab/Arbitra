import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HealthCheckResult,
  HealthCheckStatus,
} from '@nestjs/terminus';
import { Response } from 'express';
import { HealthController } from './health.controller';
import { HealthService, EnhancedHealthResult } from './health.service';
import { ShutdownState } from '../config/shutdown-state';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { StellarHealthIndicator } from './indicators/stellar.indicator';
import { MemoryHealthIndicator } from './indicators/memory.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let healthService: HealthService;
  let shutdownState: ShutdownState;
  let mockResponse: Partial<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest.fn(),
          },
        },
        {
          provide: HealthService,
          useValue: {
            enhanceHealthResult: jest.fn(),
            handlePartialFailure: jest.fn(),
            shutdownResult: jest.fn(),
          },
        },
        {
          provide: ShutdownState,
          useValue: { isShuttingDown: false, receivedSignal: null },
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: {
            isHealthy: jest.fn(),
          },
        },
        {
          provide: StellarHealthIndicator,
          useValue: {
            isHealthy: jest.fn(),
          },
        },
        {
          provide: MemoryHealthIndicator,
          useValue: {
            isHealthy: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    healthService = module.get<HealthService>(HealthService);
    shutdownState = module.get<ShutdownState>(ShutdownState);

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check', () => {
    it('should return healthy status when all services are up', async () => {
      const mockHealthResult: HealthCheckResult = {
        status: 'ok' as HealthCheckStatus,
        info: {},
        error: {},
        details: {},
      };

      const mockEnhancedResult: EnhancedHealthResult = {
        status: 'ok',
        timestamp: '2024-01-15T10:30:00Z',
        version: '1.0.0',
        uptime: 3600,
        services: {
          database: { status: 'ok', responseTime: 120 },
          stellar: { status: 'ok', responseTime: 450 },
          memory: { status: 'ok', heapUsed: '45MB' },
        },
      };

      jest
        .spyOn(healthCheckService, 'check')
        .mockResolvedValue(mockHealthResult);
      jest
        .spyOn(healthService, 'enhanceHealthResult')
        .mockReturnValue(mockEnhancedResult);

      await controller.check(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockEnhancedResult);
    });

    it('should handle partial failures with warning status', async () => {
      const mockError = new Error('Partial failure');
      const mockDegradedResult: EnhancedHealthResult = {
        status: 'warning',
        timestamp: '2024-01-15T10:30:00Z',
        version: '1.0.0',
        uptime: 3600,
        services: {
          database: { status: 'ok', responseTime: 120 },
          stellar: { status: 'error', responseTime: null },
          memory: { status: 'ok', heapUsed: '45MB' },
        },
      };

      jest.spyOn(healthCheckService, 'check').mockRejectedValue(mockError);
      jest
        .spyOn(healthService, 'handlePartialFailure')
        .mockReturnValue(mockDegradedResult);

      await controller.check(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockDegradedResult);
    });

    it('should return 503 for complete system failure', async () => {
      const mockError = new Error('Complete failure');
      const mockFailureResult: EnhancedHealthResult = {
        status: 'error',
        timestamp: '2024-01-15T10:30:00Z',
        version: '1.0.0',
        uptime: 3600,
        services: {
          database: { status: 'error', responseTime: null },
          stellar: { status: 'error', responseTime: null },
          memory: { status: 'error', responseTime: null },
        },
      };

      jest.spyOn(healthCheckService, 'check').mockRejectedValue(mockError);
      jest
        .spyOn(healthService, 'handlePartialFailure')
        .mockReturnValue(mockFailureResult);

      await controller.check(mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(mockFailureResult);
    });
  });

  describe('detailedCheck', () => {
    it('should return detailed health information', async () => {
      const mockHealthResult: HealthCheckResult = {
        status: 'ok' as HealthCheckStatus,
        info: {},
        error: {},
        details: {},
      };

      const mockDetailedResult: EnhancedHealthResult = {
        status: 'ok',
        timestamp: '2024-01-15T10:30:00Z',
        version: '1.0.0',
        uptime: 3600,
        services: {
          database: { status: 'ok', responseTime: 120 },
          stellar: { status: 'ok', responseTime: 450 },
          memory: { status: 'ok', heapUsed: '45MB' },
        },
        environment: 'test',
        details: {
          nodeVersion: 'v18.0.0',
          platform: 'linux',
          architecture: 'x64',
          processId: 12345,
          memoryUsage: {},
        },
      };

      jest
        .spyOn(healthCheckService, 'check')
        .mockResolvedValue(mockHealthResult);
      jest
        .spyOn(healthService, 'enhanceHealthResult')
        .mockReturnValue(mockDetailedResult);

      await controller.detailedCheck(mockResponse as Response);

      expect(healthService.enhanceHealthResult).toHaveBeenCalledWith(
        mockHealthResult,
        true,
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(mockDetailedResult);
    });
  });

  describe('shutdown behaviour', () => {
    const shuttingDownResult: EnhancedHealthResult = {
      status: 'error',
      timestamp: '2024-01-15T10:30:00Z',
      version: '1.0.0',
      uptime: 3600,
      services: { shutdown: { status: 'down', signal: 'SIGTERM' } },
    };

    beforeEach(() => {
      (shutdownState as any).isShuttingDown = true;
      (shutdownState as any).receivedSignal = 'SIGTERM';
      jest
        .spyOn(healthService, 'shutdownResult')
        .mockReturnValue(shuttingDownResult);
    });

    it('returns 503 from the basic probe without running indicators', async () => {
      await controller.check(mockResponse as Response);

      expect(healthCheckService.check).not.toHaveBeenCalled();
      expect(healthService.shutdownResult).toHaveBeenCalledWith(
        false,
        'SIGTERM',
      );
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(shuttingDownResult);
    });

    it('returns 503 from the detailed probe without running indicators', async () => {
      await controller.detailedCheck(mockResponse as Response);

      expect(healthCheckService.check).not.toHaveBeenCalled();
      expect(healthService.shutdownResult).toHaveBeenCalledWith(
        true,
        'SIGTERM',
      );
      expect(mockResponse.status).toHaveBeenCalledWith(503);
      expect(mockResponse.json).toHaveBeenCalledWith(shuttingDownResult);
    });

    it('runs all three indicators when the service is not shutting down', async () => {
      (shutdownState as any).isShuttingDown = false;
      jest.spyOn(healthCheckService, 'check').mockResolvedValue({
        status: 'ok' as HealthCheckStatus,
        info: {},
        error: {},
        details: {},
      });
      jest
        .spyOn(healthService, 'enhanceHealthResult')
        .mockReturnValue(shuttingDownResult);

      await controller.check(mockResponse as Response);

      expect(healthCheckService.check).toHaveBeenCalledTimes(1);
      const indicators = (healthCheckService.check as jest.Mock).mock
        .calls[0][0];
      expect(indicators).toHaveLength(3);
    });
  });
});
