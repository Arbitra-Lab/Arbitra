import { INestApplication, Logger } from '@nestjs/common';
import { ShutdownState } from './shutdown-state';

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 30_000;

export class ShutdownTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Shutdown timed out after ${timeoutMs}ms, forcing exit`);
    this.name = 'ShutdownTimeoutError';
  }
}

export interface ShutdownServer {
  close(callback: (error?: Error) => void): unknown;
}

export interface DrainableQueue {
  pause(): void | Promise<void>;
  close(): void | Promise<void>;
}

export interface ShutdownCheckpoint {
  name: string;
  close(): void | Promise<void>;
}

export interface GracefulShutdownOptions {
  state: ShutdownState;
  logger?: Logger;
  /** Mark application unhealthy as soon as shutdown begins. */
  onShutdownStart?: () => void | Promise<void>;
  /** Drain background work before closing the Nest application. */
  beforeAppClose?: () => void | Promise<void>;
  timeoutMs?: number;
  server?: ShutdownServer;
  queues?: ReadonlyArray<DrainableQueue>;
  checkpoints?: ReadonlyArray<ShutdownCheckpoint>;
  exit?: (code: number) => void;
}

function closeServer(server: ShutdownServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * The single owner of process shutdown. It flips shared health state first,
 * stops accepting connections, drains queues, closes resources in parallel,
 * and applies one deadline to the whole sequence.
 */
export function registerGracefulShutdown(
  app: INestApplication,
  options: GracefulShutdownOptions,
): (signal: string) => Promise<void> {
  const logger = options.logger ?? new Logger('GracefulShutdown');
  const timeoutMs = options.timeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const queues = options.queues ?? [];
  const checkpoints = options.checkpoints ?? [];
  const exit = options.exit ?? ((code: number) => process.exit(code));

  app.enableShutdownHooks();

  const shutdown = async (signal: string): Promise<void> => {
    if (!options.state.begin(signal)) {
      logger.warn(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }

    logger.log(`Received ${signal}, starting graceful shutdown`);
    let forceExitTimer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_resolve, reject) => {
      forceExitTimer = setTimeout(
        () => reject(new ShutdownTimeoutError(timeoutMs)),
        timeoutMs,
      );
    });

    let failed = false;
    try {
      await options.onShutdownStart?.();
      await options.beforeAppClose?.();
      await app.close();
      clearTimeout(forceExitTimer);
      logger.log('Application closed successfully');
      process.exit(0);
      if (options.server) {
        await Promise.race([closeServer(options.server), deadline]);
        logger.log('HTTP server stopped accepting connections');
      }

      await Promise.race([
        Promise.all(
          queues.map(async (queue) => {
            await queue.pause();
            await queue.close();
          }),
        ),
        deadline,
      ]);
      logger.log(`Drained ${queues.length} job queue(s)`);

      await Promise.race([
        Promise.all(
          checkpoints.map(async (checkpoint) => {
            try {
              await checkpoint.close();
              logger.log(`Closed ${checkpoint.name}`);
            } catch (error) {
              failed = true;
              logger.error(`Error closing ${checkpoint.name}`, error as Error);
            }
          }),
        ),
        deadline,
      ]);

      await Promise.race([app.close(), deadline]);
      logger.log('Application closed');
    } catch (error) {
      failed = true;
      if (error instanceof ShutdownTimeoutError) {
        logger.error(error.message);
      } else {
        logger.error('Error during graceful shutdown', error as Error);
      }
    } finally {
      clearTimeout(forceExitTimer!);
      exit(failed ? 1 : 0);
    }
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  return shutdown;
}
