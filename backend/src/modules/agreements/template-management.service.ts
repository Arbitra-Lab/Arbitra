import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AgreementTemplate,
  TemplateStatus,
} from './entities/agreement-template.entity';
import { TemplateClause } from './entities/template-clause.entity';
import { TemplateUsage } from './entities/template-usage.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  QueryTemplatesDto,
  RecordTemplateUsageDto,
} from './dto/template.dto';
import {
  TemplateRenderingService,
  TemplateValidationResult,
} from './template-rendering.service';

export interface ComplianceIssue {
  code: string;
  message: string;
}

export interface PreviewResult {
  templateId: string;
  version: number;
  language: string;
  rendered: string;
  html: string;
  validation: TemplateValidationResult;
  compliance: ComplianceIssue[];
}

export interface TemplateAnalytics {
  templateId: string;
  usageCount: number;
  totalUsageRecords: number;
  recentUsage: Array<{
    id: string;
    userId: string | null;
    agreementId: string | null;
    createdAt: Date;
  }>;
}

const REQUIRED_CLAUSE_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /governing law|jurisdiction/i, code: 'MISSING_GOVERNING_LAW' },
  { pattern: /dispute|arbitration/i, code: 'MISSING_DISPUTE_CLAUSE' },
  { pattern: /payment|fee|consideration/i, code: 'MISSING_PAYMENT_CLAUSE' },
];

@Injectable()
export class TemplateManagementService {
  private readonly logger = new Logger(TemplateManagementService.name);

  constructor(
    @InjectRepository(AgreementTemplate)
    private readonly templateRepository: Repository<AgreementTemplate>,
    @InjectRepository(TemplateUsage)
    private readonly usageRepository: Repository<TemplateUsage>,
    private readonly renderer: TemplateRenderingService,
  ) {}

  /** Basic deterministic clause checks. Not legal advice. */
  checkCompliance(
    content: string,
    category: string,
    jurisdiction: string,
  ): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];
    if (!jurisdiction.trim()) {
      issues.push({
        code: 'MISSING_JURISDICTION',
        message: 'Jurisdiction is required',
      });
    }
    const allContent = content.toLowerCase();
    for (const { pattern, code } of REQUIRED_CLAUSE_PATTERNS) {
      if (!pattern.test(allContent)) {
        issues.push({
          code,
          message: `Template is missing a ${code.replace('MISSING_', '').toLowerCase().replace('_', ' ')} clause`,
        });
      }
    }
    if (category === 'insurance' && !/insur|coverage/i.test(allContent)) {
      issues.push({
        code: 'MISSING_COVERAGE_CLAUSE',
        message: 'Insurance templates must describe coverage',
      });
    }
    return issues;
  }

  async create(
    dto: CreateTemplateDto,
    adminId: string,
  ): Promise<AgreementTemplate> {
    const slug = this.normaliseSlug(dto.slug);
    const versions = await this.templateRepository.find({
      where: { slug },
      order: { version: 'DESC' },
      take: 1,
    });
    const version = versions.length ? versions[0].version + 1 : 1;

    // Only one approved version per slug is active at a time.
    await this.templateRepository
      .createQueryBuilder()
      .update(AgreementTemplate)
      .set({ status: TemplateStatus.ARCHIVED })
      .where('slug = :slug AND status = :status', {
        slug,
        status: TemplateStatus.APPROVED,
      })
      .execute();

    const template = this.templateRepository.create({
      slug,
      name: dto.name,
      baseContent: dto.baseContent,
      jurisdiction: dto.jurisdiction,
      language: dto.language ?? 'en',
      category: dto.category ?? 'rental',
      tags: dto.tags ?? [],
      isPublic: dto.isPublic ?? false,
      version,
      status: TemplateStatus.DRAFT,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      usageCount: 0,
      clauses: (dto.clauses ?? []).map((clause, index) => {
        const entity = new TemplateClause();
        entity.title = clause.title;
        entity.content = clause.content;
        entity.isMandatory = clause.isMandatory ?? false;
        entity.displayOrder = index;
        return entity;
      }),
    });

    void adminId; // creator is captured by the audit interceptor at controller level
    return this.templateRepository.save(template);
  }

  async update(id: string, dto: UpdateTemplateDto): Promise<AgreementTemplate> {
    const template = await this.findById(id);
    if (
      template.status !== TemplateStatus.DRAFT &&
      template.status !== TemplateStatus.REJECTED
    ) {
      throw new ForbiddenException(
        'Only draft or rejected templates can be edited',
      );
    }

    Object.assign(template, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.baseContent !== undefined && { baseContent: dto.baseContent }),
      ...(dto.jurisdiction !== undefined && { jurisdiction: dto.jurisdiction }),
      ...(dto.language !== undefined && { language: dto.language }),
      ...(dto.category !== undefined && { category: dto.category }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
      ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
    });

    if (dto.clauses) {
      template.clauses = dto.clauses.map((clause, index) => {
        const entity = new TemplateClause();
        entity.title = clause.title;
        entity.content = clause.content;
        entity.isMandatory = clause.isMandatory ?? false;
        entity.displayOrder = index;
        entity.template = template;
        return entity;
      });
    }

    return this.templateRepository.save(template);
  }

  async submitForApproval(id: string): Promise<AgreementTemplate> {
    const template = await this.findById(id);
    if (
      template.status !== TemplateStatus.DRAFT &&
      template.status !== TemplateStatus.REJECTED
    ) {
      throw new BadRequestException('Template is not in an editable state');
    }
    if (this.renderer.extractVariables(template.baseContent).length === 0) {
      throw new BadRequestException(
        'Template must declare at least one variable to be approved',
      );
    }
    template.status = TemplateStatus.PENDING_REVIEW;
    return this.templateRepository.save(template);
  }

  async approve(id: string, adminId: string): Promise<AgreementTemplate> {
    const template = await this.findById(id);
    if (template.status !== TemplateStatus.PENDING_REVIEW) {
      throw new BadRequestException('Template is not pending review');
    }
    if (
      this.checkCompliance(
        template.baseContent,
        template.category,
        template.jurisdiction,
      ).length > 0
    ) {
      throw new BadRequestException(
        'Template fails the automated compliance check',
      );
    }
    template.status = TemplateStatus.APPROVED;
    template.approvedBy = adminId;
    template.approvedAt = new Date();
    template.rejectionReason = null;
    return this.templateRepository.save(template);
  }

  async reject(id: string, reason: string): Promise<AgreementTemplate> {
    const template = await this.findById(id);
    if (template.status !== TemplateStatus.PENDING_REVIEW) {
      throw new BadRequestException('Template is not pending review');
    }
    template.status = TemplateStatus.REJECTED;
    template.rejectionReason = reason;
    return this.templateRepository.save(template);
  }

  async preview(
    id: string,
    variables: Record<string, string | number | boolean | null>,
  ): Promise<PreviewResult> {
    const template = await this.findById(id);
    const compiled = this.renderer.compileAgreement(
      template.baseContent,
      (template.clauses ?? []).map((clause) => ({
        title: clause.title,
        content: clause.content,
      })),
    );
    return {
      templateId: template.id,
      version: template.version,
      language: template.language,
      rendered: this.renderer.render(compiled, variables),
      html: this.renderer.renderHtml(compiled, variables),
      validation: this.renderer.validate(compiled, variables),
      compliance: this.checkCompliance(
        compiled,
        template.category,
        template.jurisdiction,
      ),
    };
  }

  async list(query: QueryTemplatesDto): Promise<AgreementTemplate[]> {
    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.language) where.language = query.language;
    if (query.category) where.category = query.category;
    if (query.publicOnly) {
      where.status = TemplateStatus.APPROVED;
      where.isPublic = true;
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return this.templateRepository.find({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  /** Marketplace = approved templates explicitly shared publicly. */
  async marketplace(language?: string): Promise<AgreementTemplate[]> {
    return this.list({
      publicOnly: true,
      language,
      limit: 100,
    });
  }

  async recordUsage(
    id: string,
    dto: RecordTemplateUsageDto,
    userId?: string,
  ): Promise<TemplateUsage> {
    const template = await this.findById(id);
    if (template.status !== TemplateStatus.APPROVED) {
      throw new BadRequestException('Only approved templates can be used');
    }
    const usage = this.usageRepository.create({
      templateId: template.id,
      templateVersion: template.version,
      userId: userId ?? null,
      agreementId: dto.agreementId ?? null,
    });
    await this.usageRepository.save(usage);
    template.usageCount = (template.usageCount ?? 0) + 1;
    await this.templateRepository.save(template);
    this.logger.log(
      `Template ${template.slug} v${template.version} used (agreement ${dto.agreementId ?? 'n/a'})`,
    );
    return usage;
  }

  async analytics(id: string): Promise<TemplateAnalytics> {
    const template = await this.findById(id);
    const [rows, total] = await this.usageRepository.findAndCount({
      where: { templateId: id },
      order: { createdAt: 'DESC' },
      take: 10,
    });
    return {
      templateId: id,
      usageCount: template.usageCount ?? 0,
      totalUsageRecords: total,
      recentUsage: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        agreementId: row.agreementId,
        createdAt: row.createdAt,
      })),
    };
  }

  private normaliseSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (!slug) throw new BadRequestException('Template slug is required');
    return slug;
  }

  private async findById(id: string): Promise<AgreementTemplate> {
    const template = await this.templateRepository.findOne({
      where: { id },
      relations: ['clauses'],
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }
}
