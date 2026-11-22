'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  useApproveTemplate,
  useCreateTemplate,
  useSubmitTemplate,
  useTemplatePreview,
  useTemplates,
  type AgreementTemplateRecord,
  type CreateTemplatePayload,
} from '@/lib/query/hooks/use-agreement-templates';

const DEFAULT_FORM: CreateTemplatePayload = {
  slug: '',
  name: '',
  baseContent:
    'This {{agreementType}} is governed by the laws of {{jurisdiction}}. ' +
    'Payment terms are {{paymentTerms}}. Disputes are resolved by arbitration.',
  jurisdiction: 'Nigeria',
  language: 'en',
  category: 'rental',
  tags: [],
  isPublic: false,
};

function StatusBadge({ status }: { status: string }) {
  const colours: Record<string, string> = {
    DRAFT: 'bg-slate-500/20 text-slate-200',
    PENDING_REVIEW: 'bg-amber-500/20 text-amber-200',
    APPROVED: 'bg-emerald-500/20 text-emerald-200',
    REJECTED: 'bg-rose-500/20 text-rose-200',
    ARCHIVED: 'bg-neutral-500/20 text-neutral-300',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colours[status] ?? colours.DRAFT}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

export default function AdminTemplatesPage() {
  const templatesQuery = useTemplates();
  const createMutation = useCreateTemplate();
  const submitMutation = useSubmitTemplate();
  const approveMutation = useApproveTemplate();

  const [form, setForm] = useState<CreateTemplatePayload>(DEFAULT_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [variableText, setVariableText] = useState('{}');

  const previewVariables = (() => {
    try {
      const parsed: unknown = JSON.parse(variableText);
      return parsed && typeof parsed === 'object'
        ? (parsed as Record<string, string>)
        : {};
    } catch {
      return {};
    }
  })();
  const preview = useTemplatePreview(selectedId, previewVariables);

  const update = <K extends keyof CreateTemplatePayload>(
    key: K,
    value: CreateTemplatePayload[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const handleCreate = async () => {
    try {
      const created = await createMutation.mutateAsync(form);
      setSelectedId(created.id);
      setForm(DEFAULT_FORM);
      toast.success(`Created ${created.name} v${created.version}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create template',
      );
    }
  };

  const act = async (
    mutation: typeof submitMutation,
    id: string,
    message: string,
  ) => {
    try {
      await mutation.mutateAsync({ id });
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    }
  };

  const templates: AgreementTemplateRecord[] = templatesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Agreement Templates</h1>
        <p className="mt-1 text-sm text-white/70">
          Create, preview, approve and publish reusable agreement templates.
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">
            New template
          </h2>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-white/70">Slug</span>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
                value={form.slug}
                onChange={(e) => update('slug', e.target.value)}
                placeholder="rental-standard"
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/70">Name</span>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="text-white/70">Language</span>
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
                  value={form.language}
                  onChange={(e) => update('language', e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-white/70">Category</span>
                <select
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
                  value={form.category}
                  onChange={(e) => update('category', e.target.value)}
                >
                  <option value="rental">Rental</option>
                  <option value="freelance">Freelance</option>
                  <option value="trade">Trade</option>
                  <option value="insurance">Insurance</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-white/70">Jurisdiction</span>
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
                value={form.jurisdiction}
                onChange={(e) => update('jurisdiction', e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-white/70">
                Content (use {'{{variable}}'} placeholders)
              </span>
              <textarea
                rows={7}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white"
                value={form.baseContent}
                onChange={(e) => update('baseContent', e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-white/80">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(e) => update('isPublic', e.target.checked)}
              />
              Publish to marketplace when approved
            </label>
            <button
              type="button"
              onClick={handleCreate}
              disabled={createMutation.isPending || !form.slug || !form.name}
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating…' : 'Create draft'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">
            Preview & validate
          </h2>
          {!selectedId ? (
            <p className="text-sm text-white/60">
              Create or select a template to preview it.
            </p>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="text-white/70">Variables (JSON)</span>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 font-mono text-xs text-white"
                  value={variableText}
                  onChange={(e) => setVariableText(e.target.value)}
                />
              </label>
              {preview.data && (
                <>
                  <div
                    className="max-h-48 overflow-auto rounded-lg bg-slate-900/70 p-3 text-sm whitespace-pre-wrap text-white/85"
                    data-testid="template-preview"
                  >
                    {preview.data.rendered}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {preview.data.validation.missing.map((name) => (
                      <li key={name} className="text-amber-300">
                        Missing variable: {name}
                      </li>
                    ))}
                    {preview.data.compliance.map((issue) => (
                      <li key={issue.code} className="text-rose-300">
                        {issue.message}
                      </li>
                    ))}
                    {preview.data.validation.valid &&
                      preview.data.compliance.length === 0 && (
                        <li className="text-emerald-300">Ready for review</li>
                      )}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h2 className="mb-4 text-lg font-semibold text-white">All templates</h2>
        {templatesQuery.isLoading ? (
          <p className="text-sm text-white/60">Loading templates…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-white/60">No templates yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white/85">
              <thead className="text-white/60">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Language</th>
                  <th className="p-2">Version</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Uses</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-t border-white/10">
                    <td className="p-2">
                      <button
                        type="button"
                        className="font-semibold hover:underline"
                        onClick={() => setSelectedId(template.id)}
                      >
                        {template.name}
                      </button>
                      <div className="text-xs text-white/50">
                        {template.slug}
                      </div>
                    </td>
                    <td className="p-2">{template.language}</td>
                    <td className="p-2">v{template.version}</td>
                    <td className="p-2">
                      <StatusBadge status={template.status} />
                    </td>
                    <td className="p-2">{template.usageCount}</td>
                    <td className="p-2 space-x-2">
                      {template.status === 'DRAFT' && (
                        <button
                          type="button"
                          className="text-brand-accent hover:underline"
                          onClick={() =>
                            act(
                              submitMutation,
                              template.id,
                              'Submitted for review',
                            )
                          }
                        >
                          Submit
                        </button>
                      )}
                      {template.status === 'PENDING_REVIEW' && (
                        <button
                          type="button"
                          className="text-emerald-300 hover:underline"
                          onClick={() =>
                            act(
                              approveMutation,
                              template.id,
                              'Template approved',
                            )
                          }
                        >
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
