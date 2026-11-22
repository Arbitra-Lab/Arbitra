import { Global, Module } from '@nestjs/common';
import { LockService } from './lock.service';
import { REDIS_CLIENT } from './redis-client.token';
import { RedisConnectionFactory } from '../redis/redis-connection.factory';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [RedisConnectionFactory],
      useFactory: (redisFactory: RedisConnectionFactory) =>
        redisFactory.createLockClient(),
    },
    LockService,
  ],
  exports: [LockService, REDIS_CLIENT],
})
export class LockModule {}
