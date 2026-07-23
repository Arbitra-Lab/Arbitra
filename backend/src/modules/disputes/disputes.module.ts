import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { DisputeBlockchainService } from './dispute-blockchain.service';
import { DisputeSlaService } from './dispute-sla.service';
import { DisputeAssignmentService } from './dispute-assignment.service';
import { DisputeSlaReconcilerService } from './dispute-sla-reconciler.service';
import { DisputeNotificationService } from './dispute-notification.service';
import { Dispute } from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeComment } from './entities/dispute-comment.entity';
import { DisputeEvent } from './entities/dispute-event.entity';
import { Arbiter } from './entities/arbiter.entity';
import { DisputeVote } from './entities/dispute-vote.entity';
import { RentAgreement } from '../rent/entities/rent-contract.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dispute,
      DisputeEvidence,
      DisputeComment,
      DisputeEvent,
      Arbiter,
      DisputeVote,
      RentAgreement,
      User,
    ]),
    ScheduleModule.forRoot(),
    AuditModule,
    StellarModule,
  ],
  controllers: [DisputesController],
  providers: [
    DisputesService,
    DisputeBlockchainService,
    DisputeSlaService,
    DisputeAssignmentService,
    DisputeSlaReconcilerService,
    DisputeNotificationService,
  ],
  exports: [
    DisputesService,
    DisputeBlockchainService,
    DisputeSlaService,
    DisputeAssignmentService,
  ],
})
export class DisputesModule {}
