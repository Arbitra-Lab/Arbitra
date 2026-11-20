import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { InsuranceService } from './insurance.service';
import { FileInsuranceClaimDto } from './dto/file-claim.dto';
import { DecideInsuranceClaimDto } from './dto/claim-decision.dto';
import { InsuranceClaimStatus } from './entities/insurance-claim.entity';

interface RequestUser {
  id: string;
  role: UserRole;
}

function isAdmin(user: RequestUser): boolean {
  return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
}

@ApiTags('Insurance')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('insurance')
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Get('pool')
  @ApiOperation({ summary: 'Protocol insurance pool balance and claim stats' })
  async getPool() {
    return this.insuranceService.getPoolSummary();
  }

  @Post('claims')
  @ApiOperation({
    summary: 'File an insurance claim against a resolved dispute',
  })
  async fileClaim(
    @Body() dto: FileInsuranceClaimDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.insuranceService.fileClaim(dto, req.user.id);
  }

  @Get('claims')
  @ApiOperation({
    summary: 'List insurance claims (admins see all; others see their own)',
  })
  async listClaims(
    @Query('status') status: InsuranceClaimStatus | undefined,
    @Request() req: { user: RequestUser },
  ) {
    return this.insuranceService.listClaims({
      status,
      claimantUserId: isAdmin(req.user) ? undefined : req.user.id,
    });
  }

  @Get('claims/:id')
  @ApiOperation({ summary: 'Get an insurance claim by id' })
  async getClaim(
    @Param('id') id: string,
    @Request() req: { user: RequestUser },
  ) {
    return this.insuranceService.getClaim(id, {
      id: req.user.id,
      isAdmin: isAdmin(req.user),
    });
  }

  @Post('claims/:id/decision')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Approve or reject a pending insurance claim' })
  async decideClaim(
    @Param('id') id: string,
    @Body() dto: DecideInsuranceClaimDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.insuranceService.decideClaim(id, dto, req.user.id);
  }
}
