/**
 * Dependency-free sliding-window rate limiter for high-frequency WebSocket
 * events (#12). A pure class with an injectable clock so behaviour is fully
 * deterministic in tests; no timers are created and state is per key.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Events still permitted in the current window. */
  remaining: number;
  /** Milliseconds until the next event would be allowed (0 when allowed). */
  retryAfterMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxEvents: number,
    private readonly windowMs: number,
    private readonly clock: () => number = () => Date.now(),
  ) {
    if (!Number.isFinite(maxEvents) || maxEvents < 0) {
      throw new Error('maxEvents must be a non-negative finite number');
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error('windowMs must be a positive finite number');
    }
  }

  /** Record an event for `key` and report whether it is within the limit. */
  check(key: string): RateLimitResult {
    const now = this.clock();

    if (this.maxEvents === 0) {
      return { allowed: false, remaining: 0, retryAfterMs: this.windowMs };
    }

    const existing = this.hits.get(key) ?? [];
    const cutoff = now - this.windowMs;
    const recent = existing.filter((timestamp) => timestamp > cutoff);

    if (recent.length >= this.maxEvents) {
      const retryAfterMs = Math.max(0, recent[0] + this.windowMs - now);
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxEvents - recent.length),
      retryAfterMs: 0,
    };
  }

  /** Clear one key, or all state when no key is supplied. */
  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }

  /** Number of keys currently holding state. Useful for leak detection. */
  get trackedKeys(): number {
    return this.hits.size;
  }
}
