import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { AnalyticsService } from './analytics.service';
import { LandlordAnalyticsQueryDto } from './dto/landlord-analytics-query.dto';
import { DisputeCohortQueryDto } from './dto/dispute-cohort-query.dto';
import { DisputeType } from '../disputes/entities/dispute.entity';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('landlord/dashboard')
  @ApiOperation({ summary: 'Get landlord property analytics dashboard data' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Number of days to include in trend data (1-365)',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: ['auto', 'raw', 'rollup'],
    description:
      'Data source: auto (rollup when available), raw (always recompute), rollup (force rollup, falls back to raw)',
  })
  async getLandlordDashboard(
    @CurrentUser() user: User,
    @Query() query: LandlordAnalyticsQueryDto,
  ) {
    return this.analyticsService.getLandlordDashboard(
      user.id,
      query.days ?? 30,
      query.source ?? 'auto',
    );
  }

  @Get('disputes/cohorts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: '[Admin] Get dispute-outcome cohort metrics',
    description:
      'Returns pre-aggregated dispute resolution metrics bucketed by month and category. ' +
      'Includes median resolution time, ruling distribution (landlord/tenant/inconclusive), ' +
      'and refund rate. Use `backfill=true` to compute metrics across all historical disputes.',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'Start of date range (ISO 8601, e.g. 2026-01-01)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'End of date range (ISO 8601, e.g. 2026-12-31)',
  })
  @ApiQuery({
    name: 'months',
    required: false,
    type: Number,
    description:
      'Look-back window in months when no explicit date range is given (1–36, default 12)',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    enum: DisputeType,
    description: 'Filter cohorts to a single dispute category',
  })
  @ApiQuery({
    name: 'backfill',
    required: false,
    type: Boolean,
    description:
      'When true, recomputes cohort metrics from the earliest dispute in the database',
  })
  async getDisputeCohortMetrics(@Query() query: DisputeCohortQueryDto) {
    return this.analyticsService.getDisputeCohortMetrics(query);
  }
}
