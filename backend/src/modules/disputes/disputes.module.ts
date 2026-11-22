import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';
import { DisputeBlockchainService } from './dispute-blockchain.service';
import { DisputeSlaService } from './dispute-sla.service';
import { DisputeAssignmentService } from './dispute-assignment.service';
import { ArbiterOnboardingService } from './arbiter-onboarding.service';
import { ArbiterOnboardingController } from './arbiter-onboarding.controller';
import { DisputeSlaReconcilerService } from './dispute-sla-reconciler.service';
import { DisputeNotificationService } from './dispute-notification.service';
import { DisputeEvidenceEncryptionService } from './dispute-evidence-encryption.service';
import { EncryptionModule } from '../../common/services/encryption.module';
import { DisputeSearchIndexService } from './dispute-search-index.service';
import { Dispute } from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeComment } from './entities/dispute-comment.entity';
import { DisputeEvent } from './entities/dispute-event.entity';
import { Arbiter } from './entities/arbiter.entity';
import { ArbiterApplication } from './entities/arbiter-application.entity';
import { DisputeVote } from './entities/dispute-vote.entity';
import { SavedDisputeSearch } from './entities/saved-dispute-search.entity';
import { RentAgreement } from '../rent/entities/rent-contract.entity';
import { User } from '../users/entities/user.entity';
import { AuditModule } from '../audit/audit.module';
import { StellarModule } from '../stellar/stellar.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dispute,
      DisputeEvidence,
      DisputeComment,
      DisputeEvent,
      Arbiter,
      ArbiterApplication,
      DisputeVote,
      SavedDisputeSearch,
      RentAgreement,
      User,
    ]),
    ScheduleModule.forRoot(),
    AuditModule,
    StellarModule,
    KycModule,
    EncryptionModule,
  ],
  controllers: [DisputesController, ArbiterOnboardingController],
  providers: [
    DisputesService,
    DisputeBlockchainService,
    DisputeSlaService,
    DisputeAssignmentService,
    DisputeSlaReconcilerService,
    DisputeNotificationService,
    ArbiterOnboardingService,
    DisputeEvidenceEncryptionService,
    DisputeSearchIndexService,
  ],
  exports: [
    DisputesService,
    DisputeBlockchainService,
    DisputeSlaService,
    DisputeAssignmentService,
    DisputeEvidenceEncryptionService,
  ],
})
export class DisputesModule {}
