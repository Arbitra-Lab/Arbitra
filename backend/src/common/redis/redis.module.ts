import { Global, Module } from '@nestjs/common';
import { RedisConnectionFactory } from './redis-connection.factory';

@Global()
@Module({
  providers: [RedisConnectionFactory],
  exports: [RedisConnectionFactory],
})
export class RedisModule {}
