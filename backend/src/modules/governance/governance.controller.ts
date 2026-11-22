import {
  Body,
  Controller,
  Get,
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
import { GovernanceService } from './governance.service';
import {
  CastVoteDto,
  CreateProposalDto,
  DistributeTokensDto,
} from './dto/governance.dto';

interface RequestWithUser extends Request {
  user: { id: string };
}

@ApiTags('Governance')
@ApiBearerAuth('JWT-auth')
@Controller('governance')
@UseGuards(JwtAuthGuard)
export class GovernanceController {
  constructor(private readonly governanceService: GovernanceService) {}

  @Get('proposals')
  list() {
    return this.governanceService.listProposals();
  }

  @Post('proposals')
  @ApiOperation({ summary: 'Create a governance proposal (#24)' })
  create(@Body() dto: CreateProposalDto, @Request() req: RequestWithUser) {
    return this.governanceService.createProposal(dto, req.user.id);
  }

  @Get('proposals/:id')
  get(@Param('id') id: string) {
    return this.governanceService.getProposal(id);
  }

  @Post('proposals/:id/vote')
  vote(
    @Param('id') id: string,
    @Body() dto: CastVoteDto,
    @Request() req: RequestWithUser,
  ) {
    return this.governanceService.castVote(id, req.user.id, dto);
  }

  @Post('proposals/:id/finalize')
  finalize(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.governanceService.finalizeProposal(id, req.user.id);
  }

  @Post('proposals/:id/execute')
  execute(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.governanceService.executeProposal(id, req.user.id);
  }

  @Post('proposals/:id/cancel')
  cancel(@Param('id') id: string, @Request() req: RequestWithUser) {
    return this.governanceService.cancelProposal(id, req.user.id);
  }

  @Get('analytics')
  analytics() {
    return this.governanceService.getAnalytics();
  }

  @Get('tokens/me')
  myBalance(@Request() req: RequestWithUser) {
    return this.governanceService.getBalance(req.user.id);
  }

  @Post('tokens/distribute')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  distribute(
    @Body() dto: DistributeTokensDto,
    @Request() req: RequestWithUser,
  ) {
    return this.governanceService.distributeTokens(dto, req.user.id);
  }
}
