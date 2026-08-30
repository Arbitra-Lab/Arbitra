import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRollupService } from './analytics-rollup.service';
import { Property } from '../properties/entities/property.entity';
import { PropertyInquiry } from '../inquiries/entities/property-inquiry.entity';
import { AnalyticsInquiryRollupDaily } from './entities/analytics-inquiry-rollup-daily.entity';
import { AnalyticsRollupWatermark } from './entities/analytics-rollup-watermark.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Property,
      PropertyInquiry,
      AnalyticsInquiryRollupDaily,
      AnalyticsRollupWatermark,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRollupService],
  exports: [AnalyticsService, AnalyticsRollupService],
})
export class AnalyticsModule {}
