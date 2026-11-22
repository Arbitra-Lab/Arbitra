import { TemplateRenderingService } from './template-rendering.service';

describe('TemplateRenderingService (#13)', () => {
  let service: TemplateRenderingService;

  beforeEach(() => {
    service = new TemplateRenderingService();
  });

  it('should substitute variables correctly', () => {
    const result = service.render('Hello {{name}}, welcome to {{city}}!', {
      name: 'Jadon',
      city: 'Akure',
    });
    expect(result).toBe('Hello Jadon, welcome to Akure!');
  });

  it('should leave unknown variables as is', () => {
    expect(
      service.render('Hello {{name}}, your ID is {{id}}.', { name: 'Jadon' }),
    ).toBe('Hello Jadon, your ID is {{id}}.');
  });

  it('tolerates whitespace in placeholders and non-string values', () => {
    expect(service.render('A={{ a }}, B={{b}}', { a: 42, b: false })).toBe(
      'A=42, B=false',
    );
  });

  it('extracts distinct referenced variables', () => {
    expect(service.extractVariables('{{a}} and {{ b }} and {{a}}')).toEqual([
      'a',
      'b',
    ]);
  });

  it('validates missing and unused variables', () => {
    const result = service.validate('Hello {{name}}, ID {{id}}', {
      name: 'Jadon',
      extra: true,
    });
    expect(result).toEqual({
      missing: ['id'],
      unknown: ['extra'],
      valid: false,
    });
    expect(service.validate('Hello {{name}}', { name: 'Jadon' })).toEqual({
      missing: [],
      unknown: [],
      valid: true,
    });
  });

  it('treats null and empty string differently during validation', () => {
    expect(service.validate('{{a}}|{{b}}', { a: null, b: '' })).toEqual({
      missing: ['a'],
      unknown: [],
      valid: false,
    });
  });

  it('escapes HTML in rendered values but not the surrounding template', () => {
    const template = '<p>{{name}}</p>';
    expect(
      service.renderHtml(template, { name: '<script>alert(1)</script>' }),
    ).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(service.renderHtml('{{a}}', { a: `&"'<>` })).toBe(
      '&amp;&quot;&#39;&lt;&gt;',
    );
    expect(service.renderHtml('{{missing}}', {})).toBe('{{missing}}');
  });

  it('should compile base content and clauses', () => {
    const result = service.compileAgreement('Base Agreement Content', [
      { title: 'Pet Policy', content: 'No cats allowed' },
    ]);
    expect(result).toContain('Base Agreement Content');
    expect(result).toContain('1. Pet Policy');
    expect(result).toContain('No cats allowed');
  });
});
