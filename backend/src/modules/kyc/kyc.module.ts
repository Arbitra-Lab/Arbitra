import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { Kyc } from './kyc.entity';
import { KycService } from './kyc.service';
import { KycExpiryService } from './kyc-expiry.service';
import { KycController } from './kyc.controller';
import { UsersModule } from '../users/users.module';
import { SecurityModule } from '../security/security.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Kyc]),
    BullModule.registerQueue({ name: 'email' }),
    ScheduleModule.forRoot(),
    UsersModule,
    SecurityModule,
    AuditModule,
    NotificationsModule,
    WebhooksModule,
  ],
  providers: [KycService, KycExpiryService],
  controllers: [KycController],
  exports: [KycService, KycExpiryService],
})
export class KycModule {}
