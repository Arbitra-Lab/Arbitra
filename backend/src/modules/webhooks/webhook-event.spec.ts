import {
  computeWebhookBackoffMs,
  WEBHOOK_BASE_BACKOFF_MS,
  WEBHOOK_MAX_BACKOFF_MS,
  WEBHOOK_MAX_DELIVERY_ATTEMPTS,
} from './webhook-event';

describe('computeWebhookBackoffMs', () => {
  it('returns a delay within [50%, 100%] of the exponential value for attempt 1', () => {
    const exponential = WEBHOOK_BASE_BACKOFF_MS * Math.pow(2, 0);
    const delayAtZero = computeWebhookBackoffMs(1, { random: () => 0 });
    const delayAtMax = computeWebhookBackoffMs(1, { random: () => 0.999999 });

    expect(delayAtZero).toBeGreaterThanOrEqual(exponential / 2);
    expect(delayAtZero).toBeLessThan(exponential / 2 + 1);
    expect(delayAtMax).toBeLessThanOrEqual(exponential);
    expect(delayAtMax).toBeGreaterThan(delayAtZero);
  });

  it('doubles the exponential base on each successive attempt', () => {
    const midpoint = (attempt: number) =>
      computeWebhookBackoffMs(attempt, { random: () => 0.5 });

    const m1 = midpoint(1);
    const m2 = midpoint(2);
    const m3 = midpoint(3);

    // midpoint of equal-jitter is 0.75 * exponential, so at a fixed jitter
    // draw the schedule exactly doubles each attempt (while under the cap).
    expect(m2).toBe(m1 * 2);
    expect(m3).toBe(m2 * 2);
  });

  it('caps the delay at WEBHOOK_MAX_BACKOFF_MS regardless of how large the attempt number is', () => {
    const delay = computeWebhookBackoffMs(50, { random: () => 0.999999 });
    expect(delay).toBeLessThanOrEqual(WEBHOOK_MAX_BACKOFF_MS);
    expect(delay).toBeGreaterThanOrEqual(WEBHOOK_MAX_BACKOFF_MS / 2);
  });

  it('treats attempt 0 or negative the same as attempt 1 (never returns a shorter delay)', () => {
    const attemptZero = computeWebhookBackoffMs(0, { random: () => 0 });
    const attemptOne = computeWebhookBackoffMs(1, { random: () => 0 });
    expect(attemptZero).toBe(attemptOne);
  });

  it('never returns a negative or zero delay for any attempt within the retry ceiling', () => {
    for (let attempt = 1; attempt <= WEBHOOK_MAX_DELIVERY_ATTEMPTS; attempt++) {
      const delay = computeWebhookBackoffMs(attempt, { random: () => 0 });
      expect(delay).toBeGreaterThan(0);
    }
  });

  it('produces a monotonically non-decreasing schedule across the retry ceiling at a fixed jitter draw', () => {
    const schedule = Array.from(
      { length: WEBHOOK_MAX_DELIVERY_ATTEMPTS },
      (_, i) => computeWebhookBackoffMs(i + 1, { random: () => 0.5 }),
    );
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]).toBeGreaterThanOrEqual(schedule[i - 1]);
    }
  });

  it('respects custom baseMs and maxMs overrides', () => {
    const delay = computeWebhookBackoffMs(10, {
      baseMs: 1000,
      maxMs: 5000,
      random: () => 0.999999,
    });
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
