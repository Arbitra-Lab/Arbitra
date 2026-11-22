import { SlidingWindowRateLimiter } from '../ws-rate-limiter';

describe('SlidingWindowRateLimiter (#12)', () => {
  it('allows a burst up to the limit then rejects with a retry time', () => {
    let now = 1_000;
    const limiter = new SlidingWindowRateLimiter(3, 1_000, () => now);

    expect(limiter.check('user:1')).toEqual({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });
    expect(limiter.check('user:1').remaining).toBe(1);
    expect(limiter.check('user:1').remaining).toBe(0);

    const rejected = limiter.check('user:1');
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterMs).toBe(1_000);
  });

  it('slides the window so only expired events are dropped', () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter(2, 1_000, () => now);

    limiter.check('k'); // t=0
    now = 500;
    limiter.check('k'); // t=500 -> full
    expect(limiter.check('k').allowed).toBe(false);

    now = 1_001;
    expect(limiter.check('k').allowed).toBe(true); // t=0 expired
    expect(limiter.check('k').allowed).toBe(false); // t=500 still active
    now = 1_501;
    expect(limiter.check('k').allowed).toBe(true);
  });

  it('isolates keys from each other', () => {
    const limiter = new SlidingWindowRateLimiter(1, 10_000, () => 100);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.trackedKeys).toBe(2);
  });

  it('supports reset of a single key and full reset', () => {
    const limiter = new SlidingWindowRateLimiter(1, 10_000, () => 100);
    limiter.check('a');
    limiter.check('b');
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
    limiter.reset();
    expect(limiter.trackedKeys).toBe(0);
  });

  it('rejects everything when the limit is zero and validates config', () => {
    const limiter = new SlidingWindowRateLimiter(0, 100, () => 100);
    expect(limiter.check('k')).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterMs: 100,
    });
    expect(() => new SlidingWindowRateLimiter(-1, 100)).toThrow(/maxEvents/);
    expect(() => new SlidingWindowRateLimiter(1, 0)).toThrow(/windowMs/);
  });
});
