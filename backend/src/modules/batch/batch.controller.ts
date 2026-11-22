import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BatchService } from './services/batch.service';
import { BatchJobResponseDto } from './dto/batch-job-response.dto';

@ApiTags('Batch Operations')
@ApiBearerAuth('JWT-auth')
@Controller('batch')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Post('import/users')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT)
  @ApiOperation({ summary: 'Import users from CSV (queued)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importUsers(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ): Promise<BatchJobResponseDto> {
    return this.batchService.importUsers(file, req.user.id);
  }

  @Get('jobs/:id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.AGENT)
  @ApiOperation({ summary: 'Get batch job status and error summary' })
  async getJob(@Param('id', new ParseUUIDPipe()) id: string): Promise<BatchJobResponseDto> {
    return this.batchService.getJob(id);
  }
}
