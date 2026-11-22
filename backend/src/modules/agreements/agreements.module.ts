import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgreementsController } from './agreements.controller';
import { AgreementNftController } from './agreement-nft.controller';
import { AgreementsService } from './agreements.service';
import { AgreementNftService } from './agreement-nft.service';
import { NftAnalyticsService } from './nft-analytics.service';
import { BlockchainSyncService } from './blockchain-sync.service';
import { EscrowIntegrationService } from './escrow-integration.service';
import { TemplateRenderingService } from './template-rendering.service';
import { TemplateManagementService } from './template-management.service';
import { TemplatesController } from './templates.controller';
import { AgreementTemplate } from './entities/agreement-template.entity';
import { TemplateClause } from './entities/template-clause.entity';
import { TemplateUsage } from './entities/template-usage.entity';
import { PDFGenerationService } from './pdf-generation.service';
import { RentAgreement } from '../rent/entities/rent-contract.entity';
import { Payment } from '../rent/entities/payment.entity';
import { StellarEscrow } from '../stellar/entities/stellar-escrow.entity';
import { RentObligationNft } from './entities/rent-obligation-nft.entity';
import { NFTTransfer } from './entities/nft-transfer.entity';
import { AgreementActivationSaga } from './sagas/agreement-activation-saga.entity';

import { AuditModule } from '../audit/audit.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { StellarModule } from '../stellar/stellar.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { AgreementStateService } from './state-machines/agreement-state-machine.service';
import { AgreementsEventListener } from './listeners/agreement-event-listener';
import { AgreementCronService } from './cron/agreement-cron.service';
import { AgreementActivationSagaService } from './sagas/agreement-activation-saga.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RentAgreement,
      Payment,
      StellarEscrow,
      RentObligationNft,
      NFTTransfer,
      AgreementActivationSaga,
      AgreementTemplate,
      TemplateClause,
      TemplateUsage,
    ]),
    AuditModule,
    ReviewsModule,
    StellarModule,
    NotificationsModule,
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
  ],
  controllers: [
    AgreementsController,
    AgreementNftController,
    TemplatesController,
  ],
  providers: [
    AgreementsService,
    AgreementNftService,
    NftAnalyticsService,
    BlockchainSyncService,
    EscrowIntegrationService,
    TemplateRenderingService,
    TemplateManagementService,
    PDFGenerationService,
    AgreementStateService,
    AgreementsEventListener,
    AgreementCronService,
    AgreementActivationSagaService,
  ],
  exports: [
    AgreementsService,
    AgreementNftService,
    NftAnalyticsService,
    BlockchainSyncService,
    EscrowIntegrationService,
    TemplateRenderingService,
    TemplateManagementService,
    PDFGenerationService,
  ],
})
export class AgreementsModule {}
