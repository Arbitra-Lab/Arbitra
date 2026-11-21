import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsuranceController } from './insurance.controller';
import { InsuranceService } from './insurance.service';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { Dispute } from '../disputes/entities/dispute.entity';
import { PaymentModule } from '../payments/payment.module';

@Module({
  imports: [TypeOrmModule.forFeature([InsuranceClaim, Dispute]), PaymentModule],
  controllers: [InsuranceController],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
