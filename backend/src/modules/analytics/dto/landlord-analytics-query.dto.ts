import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AnalyticsDataSource } from '../analytics.service';

export class LandlordAnalyticsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;

  @IsOptional()
  @IsIn(['auto', 'raw', 'rollup'])
  source?: AnalyticsDataSource;
}
