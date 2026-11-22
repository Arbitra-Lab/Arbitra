import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AgreementTemplate,
  TemplateStatus,
} from '../entities/agreement-template.entity';
import { TemplateUsage } from '../entities/template-usage.entity';
import { TemplateManagementService } from '../template-management.service';
import { TemplateRenderingService } from '../template-rendering.service';

const VALID_BODY =
  'Payment terms apply. Governing law is Nigeria. Disputes go to arbitration.';

function makeTemplate(
  overrides: Partial<AgreementTemplate> = {},
): AgreementTemplate {
  return {
    id: 't1',
    slug: 'rental-basic',
    name: 'Basic Rental',
    baseContent: VALID_BODY + ' Tenant: {{tenantName}}.',
    jurisdiction: 'Nigeria',
    language: 'en',
    category: 'rental',
    version: 1,
    status: TemplateStatus.DRAFT,
    isPublic: false,
    usageCount: 0,
    tags: [],
    clauses: [],
    approvedBy: null,
    approvedAt: null,
    rejectionReason: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AgreementTemplate;
}

describe('TemplateManagementService (#13)', () => {
  let service: TemplateManagementService;
  let templates: AgreementTemplate[];
  let usages: TemplateUsage[];
  let archived: Array<{ slug: string; status: TemplateStatus }>;

  beforeEach(() => {
    templates = [];
    usages = [];
    archived = [];

    const templateRepo = {
      find: jest.fn(async (opts: any) => {
        let result = [...templates];
        if (opts?.where?.slug) {
          result = result.filter((t) => t.slug === opts.where.slug);
        }
        if (opts?.where?.status) {
          result = result.filter((t) => t.status === opts.where.status);
        }
        if (opts?.where?.isPublic !== undefined) {
          result = result.filter((t) => t.isPublic === opts.where.isPublic);
        }
        if (opts?.where?.language) {
          result = result.filter((t) => t.language === opts.where.language);
        }
        if (opts?.where?.category) {
          result = result.filter((t) => t.category === opts.where.category);
        }
        result.sort((a, b) => b.version - a.version);
        if (opts?.take) result = result.slice(0, opts.take);
        return result;
      }),
      findOne: jest.fn(
        async (opts: any) =>
          templates.find((t) => t.id === opts.where.id) ?? null,
      ),
      create: jest.fn((data: Partial<AgreementTemplate>) => ({
        ...data,
      })) as unknown as jest.Mock,
      save: jest.fn(async (entity: AgreementTemplate) => {
        if (!entity.id) {
          entity.id = `generated-${templates.length + 1}`;
          templates.push(entity);
        }
        return entity;
      }),
      createQueryBuilder: jest.fn(() => {
        const builder: any = {
          update: () => builder,
          set: (values: Partial<AgreementTemplate>) => {
            archived.push({
              slug: 'rental-basic',
              status: values.status as TemplateStatus,
            });
            templates
              .filter(
                (t) =>
                  t.slug === 'rental-basic' &&
                  t.status === TemplateStatus.APPROVED,
              )
              .forEach((t) => (t.status = values.status as TemplateStatus));
            return builder;
          },
          where: () => builder,
          execute: async () => ({ affected: 0 }),
        };
        return builder;
      }),
    };

    const usageRepo = {
      create: jest.fn((data: Partial<TemplateUsage>) => ({ ...data })),
      save: jest.fn(async (entity: TemplateUsage) => {
        entity.id = `usage-${usages.length + 1}`;
        entity.createdAt = new Date();
        usages.push(entity);
        return entity;
      }),
      findAndCount: jest.fn(async () => [usages.slice(0, 10), usages.length]),
    };

    service = new TemplateManagementService(
      templateRepo as any,
      usageRepo as any,
      new TemplateRenderingService(),
    );
  });

  it('normalises slugs and increments versions, archiving the old approved one', async () => {
    templates.push(makeTemplate({ status: TemplateStatus.APPROVED }));

    const created = await service.create(
      {
        slug: '  Rental Basic!  ',
        name: 'v2',
        baseContent: VALID_BODY,
        jurisdiction: 'Nigeria',
        clauses: [{ title: 'Pet', content: 'No cats' }],
      },
      'admin-1',
    );

    expect(created.slug).toBe('rental-basic');
    expect(created.version).toBe(2);
    expect(created.status).toBe(TemplateStatus.DRAFT);
    expect(created.clauses).toHaveLength(1);
    expect(archived).toEqual([
      { slug: 'rental-basic', status: TemplateStatus.ARCHIVED },
    ]);
  });

  it('refuses to edit approved templates', async () => {
    templates.push(makeTemplate({ status: TemplateStatus.APPROVED }));
    await expect(service.update('t1', { name: 'changed' })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('requires variables before a template can be submitted and checks compliance on approval', async () => {
    templates.push(makeTemplate({ baseContent: 'No variables here.' }));
    await expect(service.submitForApproval('t1')).rejects.toThrow(
      BadRequestException,
    );

    templates[0].baseContent = 'Payment terms and fees apply. {{x}}';
    await service.submitForApproval('t1');
    expect(templates[0].status).toBe(TemplateStatus.PENDING_REVIEW);
    await expect(service.approve('t1', 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('approves and rejects pending templates', async () => {
    templates.push(makeTemplate({ status: TemplateStatus.PENDING_REVIEW }));
    const approved = await service.approve('t1', 'admin-1');
    expect(approved.status).toBe(TemplateStatus.APPROVED);
    expect(approved.approvedBy).toBe('admin-1');
    expect(approved.approvedAt).toBeInstanceOf(Date);

    templates.push(
      makeTemplate({
        id: 't2',
        status: TemplateStatus.PENDING_REVIEW,
      }),
    );
    const rejected = await service.reject('t2', 'Needs legal review');
    expect(rejected.status).toBe(TemplateStatus.REJECTED);
    expect(rejected.rejectionReason).toBe('Needs legal review');
  });

  it('previews with validation, escaped HTML and compliance issues', async () => {
    templates.push(
      makeTemplate({
        clauses: [
          { title: 'Notice', content: 'Notice to {{tenantName}}' },
        ] as any,
      }),
    );
    const preview = await service.preview('t1', {
      tenantName: '<b>Ada</b>',
    });
    expect(preview.validation.valid).toBe(true);
    expect(preview.rendered).toContain('<b>Ada</b>');
    expect(preview.html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
    expect(preview.compliance).toEqual([]);
  });

  it('lists only approved public templates in the marketplace', async () => {
    templates.push(
      makeTemplate({ status: TemplateStatus.APPROVED, isPublic: true }),
    );
    templates.push(
      makeTemplate({ id: 't2', status: TemplateStatus.DRAFT, isPublic: true }),
    );
    templates.push(
      makeTemplate({
        id: 't3',
        status: TemplateStatus.APPROVED,
        isPublic: false,
      }),
    );
    const result = await service.marketplace();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('records usage only for approved templates and reports analytics', async () => {
    templates.push(makeTemplate({ status: TemplateStatus.DRAFT }));
    await expect(service.recordUsage('t1', {}, 'user-1')).rejects.toThrow(
      BadRequestException,
    );

    templates[0].status = TemplateStatus.APPROVED;
    await service.recordUsage('t1', { agreementId: 'a-1' }, 'user-1');
    expect(templates[0].usageCount).toBe(1);
    expect(usages).toHaveLength(1);

    const analytics = await service.analytics('t1');
    expect(analytics.usageCount).toBe(1);
    expect(analytics.totalUsageRecords).toBe(1);
    expect(analytics.recentUsage[0].agreementId).toBe('a-1');
  });

  it('throws for a missing template', async () => {
    await expect(service.preview('missing', {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reports compliance issues deterministically', () => {
    const issues = service.checkCompliance('Hello {{x}}', 'insurance', '');
    expect(issues.map((issue) => issue.code)).toEqual([
      'MISSING_JURISDICTION',
      'MISSING_GOVERNING_LAW',
      'MISSING_DISPUTE_CLAUSE',
      'MISSING_PAYMENT_CLAUSE',
      'MISSING_COVERAGE_CLAUSE',
    ]);
  });
});
