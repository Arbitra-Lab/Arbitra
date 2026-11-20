import { PartialType } from '@nestjs/mapped-types';
import { CreateJurisdictionDto } from './create-jurisdiction.dto';

export class UpdateJurisdictionDto extends PartialType(CreateJurisdictionDto) {}
