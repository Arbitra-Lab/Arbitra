import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBatcher } from '@/lib/websocket/event-batcher';

describe('EventBatcher (#12)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses repeated keys and keeps the newest value', () => {
    const onFlush = vi.fn();
    const batcher = new EventBatcher<string>(100, onFlush);

    batcher.add('payments', 'first');
    batcher.add('payments', 'second');
    batcher.add('notifications', 'n1');
    expect(batcher.size).toBe(2);
    expect(onFlush).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onFlush).toHaveBeenCalledWith([
      { key: 'payments', value: 'second' },
      { key: 'notifications', value: 'n1' },
    ]);
    expect(batcher.size).toBe(0);
  });

  it('restarts the timer after a flush', () => {
    const onFlush = vi.fn();
    const batcher = new EventBatcher<number>(100, onFlush);

    batcher.add('k', 1);
    vi.advanceTimersByTime(100);
    batcher.add('k', 2);
    vi.advanceTimersByTime(99);
    expect(onFlush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onFlush).toHaveBeenCalledTimes(2);
  });

  it('flush is idempotent and dispose drops pending events', () => {
    const onFlush = vi.fn();
    const batcher = new EventBatcher<string>(100, onFlush);

    batcher.flush();
    expect(onFlush).not.toHaveBeenCalled();

    batcher.add('k', 'v');
    batcher.dispose();
    vi.advanceTimersByTime(200);
    expect(onFlush).not.toHaveBeenCalled();
    expect(batcher.size).toBe(0);
  });
});
