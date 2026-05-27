import { Test, TestingModule } from '@nestjs/testing';
import { PerformanceMonitorService } from './performance-monitor.service';
import { MetricsService } from './metrics.service';
import { AlertService } from './alert.service';

describe('PerformanceMonitorService - database query monitoring', () => {
  let service: PerformanceMonitorService;
  let metricsService: { recordDatabaseQuery: jest.Mock };

  beforeEach(async () => {
    metricsService = { recordDatabaseQuery: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PerformanceMonitorService,
        { provide: MetricsService, useValue: metricsService },
        { provide: AlertService, useValue: { handleAlert: jest.fn() } },
      ],
    }).compile();

    service = module.get<PerformanceMonitorService>(PerformanceMonitorService);
  });

  it('records query durations and forwards them to the metrics service', () => {
    service.recordDatabaseQuery('findUser', 20);
    service.recordDatabaseQuery('findUser', 40);

    const stats = service.getDatabaseStats();
    const op = stats.operations.find((o) => o.operation === 'findUser');

    expect(op).toBeDefined();
    expect(op!.count).toBe(2);
    expect(op!.avgDuration).toBe(30);
    expect(stats.totalQueries).toBe(2);
    expect(metricsService.recordDatabaseQuery).toHaveBeenCalledWith(
      'findUser',
      20,
    );
  });

  it('tracks slow queries past the threshold', () => {
    service.recordDatabaseQuery('reportQuery', 750);

    const stats = service.getDatabaseStats();
    const op = stats.operations.find((o) => o.operation === 'reportQuery');

    expect(op!.slowCount).toBe(1);
    expect(stats.recentSlowQueries).toHaveLength(1);
    expect(stats.recentSlowQueries[0]).toMatchObject({
      operation: 'reportQuery',
      duration: 750,
    });
  });

  it('ranks the slowest operations for bottleneck detection', () => {
    service.recordDatabaseQuery('fast', 10);
    service.recordDatabaseQuery('slow', 900);

    const stats = service.getDatabaseStats();
    expect(stats.slowestOperations[0].operation).toBe('slow');
  });

  it('reports no queries before any are recorded', () => {
    const stats = service.getDatabaseStats();
    expect(stats.totalQueries).toBe(0);
    expect(stats.operations).toHaveLength(0);
  });
});
