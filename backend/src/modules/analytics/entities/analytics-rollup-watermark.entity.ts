import { Column, Entity, PrimaryColumn } from 'typeorm';

// One row per rollup job; watermark = max source updatedAt folded so far.
@Entity('analytics_rollup_watermarks')
export class AnalyticsRollupWatermark {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  name: string;

  // `Date` normalizes to TIMESTAMP on postgres and DATETIME on sqlite.
  @Column({ type: Date, nullable: true })
  watermark: Date | null;

  @Column({ name: 'last_run_at', type: Date, nullable: true })
  lastRunAt: Date | null;
}
