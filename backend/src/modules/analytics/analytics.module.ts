import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AnalyticsRollupService } from './analytics-rollup.service';
import { Property } from '../properties/entities/property.entity';
import { PropertyInquiry } from '../inquiries/entities/property-inquiry.entity';
import { AnalyticsInquiryRollupDaily } from './entities/analytics-inquiry-rollup-daily.entity';
import { AnalyticsRollupWatermark } from './entities/analytics-rollup-watermark.entity';
import { Arbiter } from '../disputes/entities/arbiter.entity';
import { Dispute } from '../disputes/entities/dispute.entity';
import { DisputeVote } from '../disputes/entities/dispute-vote.entity';
import { Payment } from '../payments/entities/payment.entity';
import { RentAgreement } from '../rent/entities/rent-contract.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      PropertyInquiry,
      AnalyticsInquiryRollupDaily,
      AnalyticsRollupWatermark,
      Dispute,
      DisputeVote,
      RentAgreement,
      Payment,
      User,
      Arbiter,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AdminAnalyticsService, AnalyticsRollupService],
  exports: [AnalyticsService, AdminAnalyticsService, AnalyticsRollupService],
})
export class AnalyticsModule {}
