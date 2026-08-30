import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRollupService } from './analytics-rollup.service';
import { Property } from '../properties/entities/property.entity';
import { PropertyInquiry } from '../inquiries/entities/property-inquiry.entity';
import { Dispute } from '../disputes/entities/dispute.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Property, PropertyInquiry, Dispute])],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRollupService],
  exports: [AnalyticsService, AnalyticsRollupService],
})
export class AnalyticsModule {}
