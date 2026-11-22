import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TemplateStatus } from '../entities/agreement-template.entity';

export interface TemplateClauseInput {
  title: string;
  content: string;
  isMandatory?: boolean;
}

export class CreateTemplateDto {
  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsString()
  baseContent: string;

  @IsString()
  jurisdiction: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  clauses?: TemplateClauseInput[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  baseContent?: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsArray()
  clauses?: TemplateClauseInput[];
}

export class PreviewTemplateDto {
  @IsOptional()
  variables?: Record<string, string | number | boolean | null>;
}

export class QueryTemplatesDto {
  @IsOptional()
  @IsString()
  status?: TemplateStatus;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  publicOnly?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}

export class RecordTemplateUsageDto {
  @IsOptional()
  @IsString()
  agreementId?: string;

  @IsOptional()
  variables?: Record<string, string | number | boolean | null>;
}
