import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Jurisdiction } from './entities/jurisdiction.entity';
import { JurisdictionsService } from './jurisdictions.service';
import { JurisdictionsController } from './jurisdictions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Jurisdiction])],
  controllers: [JurisdictionsController],
  providers: [JurisdictionsService],
  exports: [JurisdictionsService],
})
export class JurisdictionsModule {}
