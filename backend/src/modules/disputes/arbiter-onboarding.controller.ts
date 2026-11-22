import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ArbiterOnboardingService } from './arbiter-onboarding.service';
import {
  ApplyAsArbiterDto,
  ReviewApplicationDto,
} from './dto/arbiter-onboarding.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Arbiters')
@ApiBearerAuth('JWT-auth')
@Controller('arbiters')
@UseGuards(JwtAuthGuard)
export class ArbiterOnboardingController {
  constructor(private readonly onboarding: ArbiterOnboardingService) {}

  @Post('applications')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply to become an arbiter (#7)' })
  apply(@Body() dto: ApplyAsArbiterDto, @Request() req: RequestWithUser) {
    return this.onboarding.apply(dto, req.user.id);
  }

  @Get('applications')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  listApplications() {
    return this.onboarding.listApplications();
  }

  @Get('applications/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  getApplication(@Param('id') id: string) {
    return this.onboarding.getApplication(id);
  }

  @Post('applications/:id/review')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject an arbiter application (#7)' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
    @Request() req: RequestWithUser,
  ) {
    return this.onboarding.review(id, dto, req.user.id);
  }

  @Post('applications/:id/suspend')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  suspend(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.onboarding.suspend(id, req.user.id);
  }

  @Get('dashboard/:address')
  @ApiOperation({ summary: 'Arbiter case assignment dashboard (#7)' })
  dashboard(@Param('address') address: string) {
    return this.onboarding.getDashboard(address);
  }

  @Get('analytics')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  analytics() {
    return this.onboarding.getAnalytics();
  }
}
