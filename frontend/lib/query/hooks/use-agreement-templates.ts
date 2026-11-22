import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type TemplateStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'ARCHIVED';

export interface AgreementTemplateRecord {
  id: string;
  slug: string;
  name: string;
  baseContent: string;
  jurisdiction: string;
  language: string;
  category: string;
  version: number;
  status: TemplateStatus;
  isPublic: boolean;
  usageCount: number;
  tags: string[];
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
}

export interface TemplatePreview {
  templateId: string;
  version: number;
  language: string;
  rendered: string;
  html: string;
  validation: { missing: string[]; unknown: string[]; valid: boolean };
  compliance: Array<{ code: string; message: string }>;
}

export interface CreateTemplatePayload {
  slug: string;
  name: string;
  baseContent: string;
  jurisdiction: string;
  language: string;
  category: string;
  tags: string[];
  isPublic: boolean;
}

export const templateKeys = {
  all: ['agreement-templates'] as const,
  list: () => [...templateKeys.all, 'list'] as const,
};

export function useTemplates() {
  return useQuery({
    queryKey: templateKeys.list(),
    queryFn: async () => {
      const response = await apiClient.get<AgreementTemplateRecord[]>(
        '/templates?limit=100',
      );
      return response.data;
    },
  });
}

export function useTemplatePreview(
  id: string | null,
  variables: Record<string, string>,
) {
  return useQuery({
    queryKey: [...templateKeys.all, 'preview', id, variables],
    queryFn: async () => {
      const response = await apiClient.post<TemplatePreview>(
        `/templates/${id}/preview`,
        { variables },
      );
      return response.data;
    },
    enabled: Boolean(id),
  });
}

function useTemplateAction<TVariables>(path: (id: string) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload?: TVariables;
    }) => {
      const response = await apiClient.post<AgreementTemplateRecord>(
        path(id),
        payload ?? {},
      );
      return response.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useSubmitTemplate() {
  return useTemplateAction((id) => `/templates/${id}/submit`);
}

export function useApproveTemplate() {
  return useTemplateAction((id) => `/templates/${id}/approve`);
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTemplatePayload) => {
      const response = await apiClient.post<AgreementTemplateRecord>(
        '/templates',
        payload,
      );
      return response.data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: templateKeys.all }),
  });
}
