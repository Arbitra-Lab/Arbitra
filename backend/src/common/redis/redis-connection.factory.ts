import { Injectable, Logger } from '@nestjs/common';
import { redisStore } from 'cache-manager-redis-yet';
import { upstashStore } from '../cache/upstash-cache.store';

export type RedisMode = 'upstash' | 'sentinel' | 'standalone';
export type RedisClientKind = 'cache' | 'lock' | 'bull';

export interface RedisProfile {
  maxRetriesPerRequest: number | null;
  enableReadyCheck: boolean;
  connectTimeout: number;
  retryStrategy(times: number): number;
}

/**
 * Bull keeps unsent jobs in memory and must not drop them on transient
 * disconnects, so its profile deliberately differs from the cache profile.
 */
export const REDIS_PROFILES: Record<RedisClientKind, RedisProfile> = {
  cache: {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 50, 2_000),
  },
  lock: {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 50, 2_000),
  },
  bull: {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 50, 2_000),
  },
};

interface RedisLikeClient {
  quit?: () => unknown | Promise<unknown>;
  disconnect?: () => void;
}

@Injectable()
export class RedisConnectionFactory {
  private readonly logger = new Logger(RedisConnectionFactory.name);
  private readonly clients = new Set<RedisLikeClient>();

  get mode(): RedisMode {
    const configured = process.env.REDIS_MODE?.toLowerCase();
    if (
      configured === 'upstash' ||
      configured === 'sentinel' ||
      configured === 'standalone'
    ) {
      return configured;
    }
    return process.env.REDIS_URL && process.env.REDIS_TOKEN
      ? 'upstash'
      : 'standalone';
  }

  isUpstash(): boolean {
    return (
      this.mode === 'upstash' &&
      Boolean(process.env.REDIS_URL && process.env.REDIS_TOKEN)
    );
  }

  private sentinels(): Array<{ host: string; port: number }> {
    const raw = process.env.REDIS_SENTINELS || 'localhost:26379';
    const parsed = raw
      .split(',')
      .map((entry) => {
        const [host, portString] = entry.trim().split(':');
        const port = Number(portString || 26379);
        if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
          return null;
        }
        return { host, port };
      })
      .filter(
        (entry): entry is { host: string; port: number } => entry !== null,
      );

    if (parsed.length === 0) {
      throw new Error(
        'REDIS_SENTINELS must contain at least one host:port entry',
      );
    }
    return parsed;
  }

  /** Explicit connection options for a client kind, including failover settings. */
  getConnectionOptions(kind: RedisClientKind): Record<string, unknown> {
    const profile = REDIS_PROFILES[kind];
    const options: Record<string, unknown> = {
      maxRetriesPerRequest: profile.maxRetriesPerRequest,
      enableReadyCheck: profile.enableReadyCheck,
      connectTimeout: profile.connectTimeout,
      retryStrategy: profile.retryStrategy,
    };

    if (process.env.REDIS_PASSWORD) {
      options.password = process.env.REDIS_PASSWORD;
    }
    if (process.env.REDIS_USERNAME) {
      options.username = process.env.REDIS_USERNAME;
    }
    if (process.env.REDIS_TLS === 'true') {
      options.tls = { rejectUnauthorized: true };
    }

    if (this.mode === 'sentinel') {
      options.sentinels = this.sentinels();
      options.name = process.env.REDIS_SENTINEL_MASTER_NAME || 'mymaster';
      if (process.env.REDIS_SENTINEL_PASSWORD) {
        options.sentinelPassword = process.env.REDIS_SENTINEL_PASSWORD;
      }
      options.sentinelRetryStrategy = (times: number) =>
        Math.min(times * 100, 3_000);
    } else {
      options.host = process.env.REDIS_HOST || 'localhost';
      options.port = parseInt(process.env.REDIS_PORT || '6379', 10);
    }

    return options;
  }

  createBullOptions(): Record<string, unknown> {
    if (this.isUpstash()) {
      return {
        url: process.env.REDIS_URL,
        token: process.env.REDIS_TOKEN,
      };
    }
    return this.getConnectionOptions('bull');
  }

  async createCacheStore(): Promise<{ store: unknown; ttl: number }> {
    const ttl = 600;
    if (this.isUpstash()) {
      this.logger.log('[Redis] Using Upstash REST API');
      return {
        store: upstashStore({
          url: process.env.REDIS_URL as string,
          token: process.env.REDIS_TOKEN as string,
          ttl,
        }),
        ttl,
      };
    }

    const Redis = require('ioredis');
    const client: RedisLikeClient = new Redis(
      this.getConnectionOptions('cache'),
    );
    this.clients.add(client);
    this.logger.log(`[Redis] Using ${this.mode} cache client`);
    return { store: await redisStore(client as any), ttl };
  }

  createLockClient(): RedisLikeClient | null {
    if (process.env.NODE_ENV === 'test') {
      return null;
    }
    const Redis = require('ioredis');
    const client: RedisLikeClient = new Redis(
      this.getConnectionOptions('lock'),
    );
    this.clients.add(client);
    this.logger.log(`[Redis] Using ${this.mode} lock client`);
    return client;
  }

  async closeAll(): Promise<void> {
    const clients = [...this.clients];
    this.clients.clear();
    await Promise.all(
      clients.map(async (client) => {
        try {
          if (client.quit) {
            await client.quit();
          } else {
            client.disconnect?.();
          }
        } catch (error) {
          this.logger.warn(
            'Redis client did not close cleanly',
            error as Error,
          );
          client.disconnect?.();
        }
      }),
    );
  }
}
