import {
  CircuitBreakerOpenError,
  CircuitBreakerService,
} from './circuit-breaker.service';
import { FallbackService } from './fallback.service';

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(() => {
    service = new CircuitBreakerService();
  });

  afterEach(() => {
    service.resetAll();
    service.clear();
    jest.useRealTimers();
  });

  it('rejects while open, then closes after a successful half-open probe', async () => {
    jest.useFakeTimers();
    const name = 'recovering-dependency';
    const options = {
      failureThreshold: 0.5,
      successThreshold: 0.5,
      timeout: 100,
      windowSize: 2,
    };

    await expect(
      service.execute(
        name,
        async () => {
          throw new Error('temporarily unavailable');
        },
        options,
      ),
    ).rejects.toThrow('temporarily unavailable');
    await expect(
      service.execute(name, async () => 'blocked'),
    ).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(service.getMetricsForBreaker(name)).toMatchObject({
      state: 'OPEN',
      failures: 1,
      rejects: 1,
    });

    await jest.advanceTimersByTimeAsync(100);
    expect(service.getMetricsForBreaker(name)?.state).toBe('HALF_OPEN');

    await expect(service.execute(name, async () => 'recovered')).resolves.toBe(
      'recovered',
    );
    expect(service.getMetricsForBreaker(name)?.state).toBe('CLOSED');
  });

  it('opens at a deterministic 50% external API error rate and serves fallback data', async () => {
    const fallback = new FallbackService();
    const outcomes = ['live-1', 'error', 'live-2', 'error'] as const;
    let call = 0;
    const externalApi = jest.fn(async () => {
      const outcome = outcomes[call++];
      if (outcome === 'error') {
        throw new Error('temporarily unavailable');
      }
      return outcome;
    });
    const name = 'half-failing-api';
    const responses: string[] = [];

    for (let index = 0; index < outcomes.length; index++) {
      responses.push(
        await fallback.execute(
          () =>
            service.execute(name, externalApi, {
              failureThreshold: 0.5,
              windowSize: outcomes.length,
            }),
          { fallbackValue: `cached-${index}` },
        ),
      );
    }

    expect(responses).toEqual(['live-1', 'cached-1', 'live-2', 'cached-3']);
    expect(externalApi).toHaveBeenCalledTimes(4);
    expect(fallback.getStats().totalFallbacks).toBe(2);
    expect(service.getMetricsForBreaker(name)).toMatchObject({
      state: 'OPEN',
      failures: 2,
      successes: 2,
    });

    await expect(
      fallback.execute(() => service.execute(name, externalApi), {
        fallbackValue: 'cached-open-circuit',
      }),
    ).resolves.toBe('cached-open-circuit');
    expect(externalApi).toHaveBeenCalledTimes(4);
    expect(service.getMetricsForBreaker(name)?.rejects).toBe(1);
  });
});
