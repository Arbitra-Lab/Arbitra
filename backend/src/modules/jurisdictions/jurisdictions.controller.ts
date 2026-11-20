import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JurisdictionsService } from './jurisdictions.service';
import { CreateJurisdictionDto } from './dto/create-jurisdiction.dto';
import { UpdateJurisdictionDto } from './dto/update-jurisdiction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('Jurisdictions')
@ApiBearerAuth('JWT-auth')
@Controller('jurisdictions')
@UseGuards(JwtAuthGuard)
export class JurisdictionsController {
  constructor(private readonly jurisdictionsService: JurisdictionsService) {}

  @Get()
  @ApiOperation({ summary: 'List supported jurisdictions' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'List of jurisdictions' })
  findAll(@Query('activeOnly') activeOnly?: string) {
    return this.jurisdictionsService.findAll(activeOnly === 'true');
  }

  @Get(':code')
  @ApiOperation({ summary: 'Get a jurisdiction by code' })
  @ApiParam({ name: 'code', example: 'US-CA' })
  @ApiResponse({ status: 200, description: 'Jurisdiction details' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findOne(@Param('code') code: string) {
    return this.jurisdictionsService.findByCode(code);
  }

  @Get(':code/dispute-guidance')
  @ApiOperation({
    summary: 'Get required arbitration procedure and suggested quorum',
  })
  @ApiParam({ name: 'code', example: 'US-CA' })
  getDisputeGuidance(@Param('code') code: string) {
    return this.jurisdictionsService.getDisputeGuidance(code);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Register a new jurisdiction (admin only)' })
  @ApiResponse({ status: 201, description: 'Jurisdiction created' })
  create(@Body() dto: CreateJurisdictionDto) {
    return this.jurisdictionsService.create(dto);
  }

  @Put(':code')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a jurisdiction (admin only)' })
  @ApiParam({ name: 'code', example: 'US-CA' })
  update(@Param('code') code: string, @Body() dto: UpdateJurisdictionDto) {
    return this.jurisdictionsService.update(code, dto);
  }

  @Delete(':code')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Deactivate a jurisdiction (admin only)' })
  @ApiParam({ name: 'code', example: 'US-CA' })
  deactivate(@Param('code') code: string) {
    return this.jurisdictionsService.deactivate(code);
  }
}
