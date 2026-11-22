import { Test, TestingModule } from '@nestjs/testing';
import { DatabasePerformanceService } from './database-performance.service';
import { DataSource } from 'typeorm';

describe('DatabasePerformanceService', () => {
  let service: DatabasePerformanceService;
  let mockDataSource: Partial<DataSource>;

  beforeEach(async () => {
    mockDataSource = {
      query: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabasePerformanceService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<DatabasePerformanceService>(
      DatabasePerformanceService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get slow queries', async () => {
    const mockResult = [{ query: 'SELECT * FROM users', total_exec_time: 100 }];
    (mockDataSource.query as jest.Mock).mockResolvedValue(mockResult);

    const result = await service.getSlowQueries();
    expect(result).toEqual(mockResult);
    expect(mockDataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_stat_statements'),
      [100],
    );
  });

  it('should handle pg_stat_statements failure gracefully', async () => {
    (mockDataSource.query as jest.Mock).mockRejectedValue(
      new Error('relation "pg_stat_statements" does not exist'),
    );

    const result = await service.getSlowQueries();
    expect(result).toEqual([]);
  });

  it('should recommend indexes from slow queries', () => {
    const recs = service.recommendIndexesFromSlowQueries([
      {
        query:
          'SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC',
        mean_exec_time: 250,
        calls: 30,
      },
    ] as any);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].sql).toContain('CREATE INDEX');
  });

  it('should run nightly optimization and store report', async () => {
    (mockDataSource.query as jest.Mock).mockResolvedValueOnce([
      {
        query: 'SELECT * FROM payments WHERE user_id = $1',
        mean_exec_time: 120,
        calls: 10,
      },
    ]);
    const report = await service.runNightlyIndexOptimization();
    expect(report.analyzedQueries).toBe(1);
    expect(service.getLastOptimizationReport()).toBeTruthy();
  });
});
