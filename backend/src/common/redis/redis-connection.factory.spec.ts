import { RedisConnectionFactory } from './redis-connection.factory';

const managedKeys = [
  'REDIS_MODE',
  'REDIS_URL',
  'REDIS_TOKEN',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'REDIS_USERNAME',
  'REDIS_TLS',
  'REDIS_SENTINELS',
  'REDIS_SENTINEL_MASTER_NAME',
  'REDIS_SENTINEL_PASSWORD',
];

describe('RedisConnectionFactory', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of managedKeys) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of managedKeys) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('uses standalone options with the cache retry profile by default', () => {
    process.env.REDIS_HOST = 'redis.internal';
    process.env.REDIS_PORT = '6380';

    const factory = new RedisConnectionFactory();
    const options = factory.getConnectionOptions('cache');

    expect(factory.mode).toBe('standalone');
    expect(options).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      connectTimeout: 10_000,
    });
  });

  it('keeps the Bull profile distinct from the cache profile', () => {
    const options = new RedisConnectionFactory().getConnectionOptions('bull');

    expect(options.maxRetriesPerRequest).toBeNull();
    expect(options.enableReadyCheck).toBe(false);
  });

  it('builds Sentinel options with three sentinels and a master name', () => {
    process.env.REDIS_MODE = 'sentinel';
    process.env.REDIS_SENTINELS =
      'sentinel-1:26379, sentinel-2:26380, sentinel-3:26381';
    process.env.REDIS_SENTINEL_MASTER_NAME = 'arbitra-primary';
    process.env.REDIS_SENTINEL_PASSWORD = 'sentinel-secret';

    const options = new RedisConnectionFactory().getConnectionOptions('cache');

    expect(options.sentinels).toEqual([
      { host: 'sentinel-1', port: 26379 },
      { host: 'sentinel-2', port: 26380 },
      { host: 'sentinel-3', port: 26381 },
    ]);
    expect(options.name).toBe('arbitra-primary');
    expect(options.sentinelPassword).toBe('sentinel-secret');
    expect(options.sentinelRetryStrategy).toEqual(expect.any(Function));
    expect(options.host).toBeUndefined();
  });

  it('rejects an invalid Sentinel list', () => {
    process.env.REDIS_MODE = 'sentinel';
    process.env.REDIS_SENTINELS = 'not-a-host:not-a-port';

    expect(() =>
      new RedisConnectionFactory().getConnectionOptions('cache'),
    ).toThrow(/REDIS_SENTINELS/);
  });

  it('uses Upstash credentials without opening a local client', () => {
    process.env.REDIS_MODE = 'upstash';
    process.env.REDIS_URL = 'https://example.upstash.io';
    process.env.REDIS_TOKEN = 'token';

    const factory = new RedisConnectionFactory();

    expect(factory.isUpstash()).toBe(true);
    expect(factory.createBullOptions()).toEqual({
      url: 'https://example.upstash.io',
      token: 'token',
    });
  });

  it('closes every tracked client and clears the registry', async () => {
    const factory = new RedisConnectionFactory();
    const first = { quit: jest.fn().mockResolvedValue('OK') };
    const second = { quit: jest.fn().mockResolvedValue('OK') };
    (factory as any).clients.add(first);
    (factory as any).clients.add(second);

    await factory.closeAll();

    expect(first.quit).toHaveBeenCalledTimes(1);
    expect(second.quit).toHaveBeenCalledTimes(1);
    expect((factory as any).clients.size).toBe(0);
  });

  it('falls back to disconnect when quit rejects', async () => {
    const factory = new RedisConnectionFactory();
    const client = {
      quit: jest.fn().mockRejectedValue(new Error('already closed')),
      disconnect: jest.fn(),
    };
    (factory as any).clients.add(client);

    await factory.closeAll();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
