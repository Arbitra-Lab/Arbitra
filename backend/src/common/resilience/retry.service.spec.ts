import { RetryService } from './retry.service';

describe('RetryService', () => {
  let service: RetryService;

  beforeEach(() => {
    service = new RetryService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries a transient database connection loss before succeeding', async () => {
    const query = jest
      .fn<Promise<string>, []>()
      .mockRejectedValueOnce(new Error('database connection lost: ECONNRESET'))
      .mockResolvedValue('connected');

    await expect(
      service.execute('database-query', query, {
        maxAttempts: 2,
        initialDelayMs: 0,
        maxDelayMs: 0,
        jitterFactor: 0,
      }),
    ).resolves.toBe('connected');

    expect(query).toHaveBeenCalledTimes(2);
    expect(service.getMetrics('database-query')).toMatchObject({
      totalAttempts: 2,
      failedAttempts: 1,
      successfulRetries: 1,
    });
  });

  it('keeps a simulated 100ms dependency call pending until its latency elapses', async () => {
    jest.useFakeTimers();
    let completed = false;
    const delayedCall = service
      .execute('delayed-dependency', async () => {
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
        return 'response';
      })
      .then((response) => {
        completed = true;
        return response;
      });

    await jest.advanceTimersByTimeAsync(99);
    expect(completed).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    await expect(delayedCall).resolves.toBe('response');
    expect(completed).toBe(true);
    expect(service.getMetrics('delayed-dependency')?.totalAttempts).toBe(1);
  });
});
