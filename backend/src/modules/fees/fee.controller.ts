import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeeService } from './fee.service';
import { CalculateFeeDto, CreateFeeConfigDto } from './dto/fee-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { FeeAgreementType } from './entities/fee-config.entity';

@ApiTags('Fees')
@Controller('fees')
export class FeeController {
  constructor(private readonly feeService: FeeService) {}

  @Get('calculate')
  @ApiOperation({
    summary:
      'Calculate protocol fee transparently for an amount/agreement type',
  })
  async calculate(
    @Query('amount') amount: string,
    @Query('agreementType') agreementType?: FeeAgreementType,
    @Query('historicalVolume') historicalVolume?: string,
    @Query('currency') currency?: string,
  ) {
    const dto: CalculateFeeDto = {
      amount: Number(amount),
      agreementType,
      historicalVolume:
        historicalVolume == null ? undefined : Number(historicalVolume),
      currency,
    };
    return this.feeService.calculateFee(dto);
  }

  @Get('configs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  async listConfigs() {
    return this.feeService.listConfigs();
  }

  @Post('configs')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  async upsertConfig(@Body() dto: CreateFeeConfigDto) {
    return this.feeService.upsertConfig(dto);
  }

  @Get('analytics')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth('JWT-auth')
  async analytics() {
    return this.feeService.analytics();
  }
}
