import { INestApplication, Logger } from '@nestjs/common';
import { registerGracefulShutdown } from './graceful-shutdown';
import { ShutdownState } from './shutdown-state';

const originalListeners = {
  SIGTERM: process.listeners('SIGTERM'),
  SIGINT: process.listeners('SIGINT'),
};

function createLogger() {
  return {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

function createApp(onClose?: () => void) {
  return {
    enableShutdownHooks: jest.fn(),
    close: jest.fn().mockImplementation(async () => {
      onClose?.();
    }),
  } as unknown as INestApplication;
}

describe('registerGracefulShutdown', () => {
  afterEach(() => {
    jest.useRealTimers();
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    for (const listener of originalListeners.SIGTERM) {
      process.on('SIGTERM', listener);
    }
    for (const listener of originalListeners.SIGINT) {
      process.on('SIGINT', listener);
    }
  });

  it('registers signals, enables hooks, and runs steps in order', async () => {
    const order: string[] = [];
    const app = createApp(() => order.push('app.close'));
    const state = new ShutdownState();
    const server = {
      close: jest.fn((callback: (error?: Error) => void) => {
        order.push('server.close');
        callback();
      }),
    };
    const queue = {
      pause: jest.fn(async () => {
        order.push('queue.pause');
      }),
      close: jest.fn(async () => {
        order.push('queue.close');
      }),
    };
    const checkpoints = [
      {
        name: 'database',
        close: async () => {
          order.push('database.close');
        },
      },
      {
        name: 'Redis',
        close: async () => {
          order.push('redis.close');
        },
      },
    ];
    const exit = jest.fn((code: number) => order.push(`exit:${code}`));

    const shutdown = registerGracefulShutdown(app, {
      state,
      logger: createLogger(),
      server,
      queues: [queue],
      checkpoints,
      exit,
    });

    expect(app.enableShutdownHooks).toHaveBeenCalled();
    expect(process.listeners('SIGTERM').length).toBeGreaterThan(0);
    expect(process.listeners('SIGINT').length).toBeGreaterThan(0);

    const pending = shutdown('SIGTERM');
    expect(state.isShuttingDown).toBe(true);
    expect(state.receivedSignal).toBe('SIGTERM');
    await pending;

    expect(order).toEqual([
      'server.close',
      'queue.pause',
      'queue.close',
      'database.close',
      'redis.close',
      'app.close',
      'exit:0',
    ]);
  });

  it('ignores a second signal while a shutdown is in progress', async () => {
    const app = createApp();
    const state = new ShutdownState();
    const server = {
      close: jest.fn((callback: (error?: Error) => void) => callback()),
    };
    const logger = createLogger();
    const exit = jest.fn();

    const shutdown = registerGracefulShutdown(app, {
      state,
      logger,
      server,
      exit,
    });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('forces exit with code 1 when the deadline expires', async () => {
    jest.useFakeTimers();
    const app = createApp();
    const state = new ShutdownState();
    const exit = jest.fn();

    const shutdown = registerGracefulShutdown(app, {
      state,
      logger: createLogger(),
      timeoutMs: 30_000,
      server: { close: jest.fn() },
      exit,
    });

    const pending = shutdown('SIGTERM');
    jest.advanceTimersByTime(30_000);
    await pending;

    expect(exit).toHaveBeenCalledWith(1);
    expect(app.close).not.toHaveBeenCalled();
  });

  it('still closes later checkpoints when one fails', async () => {
    const app = createApp();
    const state = new ShutdownState();
    const laterClose = jest.fn();
    const exit = jest.fn();
    const logger = createLogger();

    const shutdown = registerGracefulShutdown(app, {
      state,
      logger,
      server: {
        close: jest.fn((callback: (error?: Error) => void) => callback()),
      },
      checkpoints: [
        {
          name: 'database',
          close: () => {
            throw new Error('connection already closed');
          },
        },
        { name: 'Redis', close: laterClose },
      ],
      exit,
    });

    await shutdown('SIGTERM');

    expect(laterClose).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits with code 1 when app.close rejects', async () => {
    const app = {
      enableShutdownHooks: jest.fn(),
      close: jest.fn().mockRejectedValue(new Error('close failed')),
    } as unknown as INestApplication;
    const exit = jest.fn();

    const shutdown = registerGracefulShutdown(app, {
      state: new ShutdownState(),
      logger: createLogger(),
      exit,
    });

    await shutdown('SIGTERM');

    expect(exit).toHaveBeenCalledWith(1);
  });
});
