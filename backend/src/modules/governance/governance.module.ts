import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';
import {
  GovernanceParameter,
  GovernanceProposal,
  GovernanceTokenBalance,
  GovernanceTokenDistribution,
  GovernanceVote,
} from './entities/governance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GovernanceProposal,
      GovernanceVote,
      GovernanceTokenBalance,
      GovernanceTokenDistribution,
      GovernanceParameter,
    ]),
  ],
  controllers: [GovernanceController],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
