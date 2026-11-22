import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { TemplateManagementService } from './template-management.service';
import {
  CreateTemplateDto,
  PreviewTemplateDto,
  QueryTemplatesDto,
  RecordTemplateUsageDto,
  UpdateTemplateDto,
} from './dto/template.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Agreement Templates')
@ApiBearerAuth('JWT-auth')
@Controller('templates')
@UseGuards(JwtAuthGuard)
export class TemplatesController {
  constructor(private readonly templateService: TemplateManagementService) {}

  /** Public catalogue of approved, shared templates. */
  @Get('marketplace')
  @ApiOperation({ summary: 'List templates in the marketplace (#13)' })
  marketplace(@Query('language') language?: string) {
    return this.templateService.marketplace(language);
  }

  @Get()
  list(@Query() query: QueryTemplatesDto) {
    return this.templateService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.templateService.preview(id, {});
  }

  @Post(':id/preview')
  preview(@Param('id') id: string, @Body() dto: PreviewTemplateDto) {
    return this.templateService.preview(id, dto.variables ?? {});
  }

  @Post(':id/usage')
  recordUsage(
    @Param('id') id: string,
    @Body() dto: RecordTemplateUsageDto,
    @Request() req: RequestWithUser,
  ) {
    return this.templateService.recordUsage(id, dto, req.user.id);
  }

  @Get(':id/analytics')
  analytics(@Param('id') id: string) {
    return this.templateService.analytics(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  create(@Body() dto: CreateTemplateDto, @Request() req: RequestWithUser) {
    return this.templateService.create(dto, req.user.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTemplateDto) {
    return this.templateService.update(id, dto);
  }

  @Post(':id/submit')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  submit(@Param('id') id: string) {
    return this.templateService.submitForApproval(id);
  }

  @Post(':id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  approve(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.templateService.approve(id, req.user.id);
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  reject(@Param('id') id: string, @Body('reason') reason: string) {
    return this.templateService.reject(id, reason);
  }
}
