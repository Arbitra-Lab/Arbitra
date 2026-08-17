import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Materialized per-owner/per-property/per-UTC-day inquiry counters.
@Entity('analytics_inquiry_rollups_daily')
@Index(
  'uq_analytics_inquiry_rollups_daily_owner_property_bucket',
  ['ownerId', 'propertyId', 'bucketDate'],
  { unique: true },
)
@Index('idx_analytics_inquiry_rollups_daily_owner_bucket', [
  'ownerId',
  'bucketDate',
])
export class AnalyticsInquiryRollupDaily {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'property_id', type: 'uuid' })
  propertyId: string;

  // UTC day (YYYY-MM-DD) of the source inquiry createdAt.
  @Column({ name: 'bucket_date', type: 'date' })
  bucketDate: string;

  @Column({ name: 'inquiry_count', type: 'int', default: 0 })
  inquiryCount: number;

  @Column({ name: 'viewed_inquiry_count', type: 'int', default: 0 })
  viewedInquiryCount: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
