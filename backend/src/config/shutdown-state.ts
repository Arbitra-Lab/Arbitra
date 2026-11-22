import { Injectable } from '@nestjs/common';

/**
 * Shared, injectable signal state. The shutdown orchestrator writes it and the
 * health controller reads it, so a SIGTERM is visible to probes immediately.
 */
@Injectable()
export class ShutdownState {
  private signal: string | null = null;

  get isShuttingDown(): boolean {
    return this.signal !== null;
  }

  get receivedSignal(): string | null {
    return this.signal;
  }

  /** Returns false when a shutdown is already in progress. */
  begin(signal: string): boolean {
    if (this.signal !== null) {
      return false;
    }
    this.signal = signal;
    return true;
  }

  reset(): void {
    this.signal = null;
  }
}
