import { Injectable } from '@nestjs/common';

export type TemplateVariableValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface TemplateValidationResult {
  /** Placeholders in the template with no supplied value. */
  missing: string[];
  /** Supplied variables that the template does not reference. */
  unknown: string[];
  valid: boolean;
}

/**
 * Pure agreement template renderer (#13).
 *
 * Syntax is `{{variable_name}}`. Plain-text rendering preserves unresolved
 * placeholders for backwards compatibility; HTML rendering escapes values to
 * prevent injected markup reaching generated PDFs or web previews.
 */
@Injectable()
export class TemplateRenderingService {
  private static readonly VARIABLE = /\{\{\s*(\w+)\s*\}\}/g;

  /** Substitute variables in a plain-text template. */
  render(
    content: string,
    variables: Record<string, TemplateVariableValue>,
  ): string {
    return content.replace(
      TemplateRenderingService.VARIABLE,
      (match, key: string) => {
        const value = variables[key];
        return value === undefined || value === null ? match : String(value);
      },
    );
  }

  /** Substitute variables with HTML escaping for previews and PDF input. */
  renderHtml(
    content: string,
    variables: Record<string, TemplateVariableValue>,
  ): string {
    return content.replace(
      TemplateRenderingService.VARIABLE,
      (match, key: string) => {
        const value = variables[key];
        return value === undefined || value === null
          ? match
          : this.escapeHtml(String(value));
      },
    );
  }

  /** List every distinct variable referenced by a template. */
  extractVariables(content: string): string[] {
    const found = new Set<string>();
    for (const match of content.matchAll(TemplateRenderingService.VARIABLE)) {
      found.add(match[1]);
    }
    return Array.from(found);
  }

  /** Report missing and unused variables so previews can block invalid input. */
  validate(
    content: string,
    variables: Record<string, TemplateVariableValue>,
  ): TemplateValidationResult {
    const referenced = this.extractVariables(content);
    const supplied = Object.keys(variables);
    const missing = referenced.filter(
      (key) => variables[key] === undefined || variables[key] === null,
    );
    const unknown = supplied.filter((key) => !referenced.includes(key));
    return { missing, unknown, valid: missing.length === 0 };
  }

  /** Compile base content and clauses into a full agreement text. */
  compileAgreement(
    baseContent: string,
    clauses: Array<{ title: string; content: string }>,
  ): string {
    const clausesText = clauses
      .map((c, i) => `${i + 1}. ${c.title}\n${c.content}`)
      .join('\n\n');
    return `${baseContent}\n\n--- ADDITIONAL CLAUSES ---\n\n${clausesText}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
