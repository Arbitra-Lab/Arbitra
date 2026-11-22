/**
 * Small pure micro-batcher for incoming realtime events (#12).
 *
 * Repeated events of the same logical type within a short window collapse to
 * one entry. This keeps a burst of dispute/vote events from triggering a
 * React Query refetch storm while still refreshing every affected domain.
 */

export interface BatchedEvent<T> {
  /** Dedupe key, e.g. "invalidate:payments". */
  key: string;
  value: T;
}

export class EventBatcher<T> {
  private readonly pending = new Map<string, T>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly delayMs: number,
    private readonly onFlush: (events: Array<BatchedEvent<T>>) => void,
  ) {}

  /** Queue an event. Newest value wins for a repeated key within the window. */
  add(key: string, value: T): void {
    this.pending.set(key, value);
    if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.delayMs);
    }
  }

  /** Immediately deliver and clear everything currently queued. */
  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pending.size === 0) return;

    const events = Array.from(this.pending, ([key, value]) => ({ key, value }));
    this.pending.clear();
    this.onFlush(events);
  }

  /** Cancel pending work without delivering it. */
  dispose(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending.clear();
  }

  get size(): number {
    return this.pending.size;
  }
}
