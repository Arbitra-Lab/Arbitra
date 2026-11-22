import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../users/entities/user.entity';
import {
  AdminReconciliationQueryDto,
  ManualReconciliationDto,
} from './dto/admin-reconciliation.dto';
import { PaymentService } from './payment.service';

interface RequestUser {
  id?: string;
  role?: UserRole | string;
}

@ApiTags('Admin Reconciliation')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('admin/reconciliation')
export class AdminReconciliationController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'List reconciliation transactions with filters' })
  async listTransactions(
    @Query() query: AdminReconciliationQueryDto,
    @Request() req: { user?: RequestUser },
  ) {
    this.ensureAdmin(req.user);
    return this.paymentService.getAdminReconciliationTransactions(query);
  }

  @Get('transactions/export')
  @ApiOperation({ summary: 'Export reconciliation transactions to CSV' })
  async exportTransactions(
    @Query() query: AdminReconciliationQueryDto,
    @Request() req: { user?: RequestUser },
    @Res() res: Response,
  ) {
    this.ensureAdmin(req.user);
    const csv = await this.paymentService.exportAdminReconciliationCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="reconciliation-transactions.csv"',
    );
    res.send(csv);
  }

  @Post('transactions/:id/reconcile')
  @ApiOperation({
    summary: 'Manually mark a transaction as verified or corrected',
  })
  async reconcileTransaction(
    @Param('id') id: string,
    @Body() dto: ManualReconciliationDto,
    @Request() req: { user?: RequestUser },
  ) {
    this.ensureAdmin(req.user);
    return this.paymentService.markTransactionReconciled(
      id,
      dto,
      req.user?.id || 'admin',
    );
  }

  private ensureAdmin(user?: RequestUser) {
    const role = user?.role;
    if (role !== UserRole.ADMIN && role !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedException('Admin access required');
    }
  }
}
