import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ApplicationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED';

export interface ArbiterApplicationRecord {
  id: string;
  userId: string;
  stellarAddress: string;
  qualifications: string | null;
  specialization: string | null;
  jurisdictions: string[] | null;
  languages: string[] | null;
  stakeAmount: string | null;
  kycReference: string | null;
  status: ApplicationStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ArbiterApplicationPayload {
  stellarAddress: string;
  qualifications?: string;
  specialization?: string;
  jurisdictions?: string[];
  languages?: string[];
  stakeAmount?: string;
  kycReference?: string;
}

export interface ArbiterDashboardRecord {
  arbiter: {
    stellarAddress: string;
    active: boolean;
    reputationScore: number;
    totalVotes: number;
    totalDisputesResolved: number;
    successfulResolutions: number;
    metadata: { specialization?: string; qualifications?: string } | null;
  };
  reputationScore: number;
  weightedVoteWeight: number;
  activeCases: Array<{ id: string; title: string; status: string }>;
  closedCases: number;
  successRate: number;
}

export interface ArbiterAnalyticsRecord {
  applicationsByStatus: Record<string, number>;
  activeArbiters: number;
  averageReputation: number;
  totalCasesAssigned: number;
}

export const arbiterKeys = {
  all: ['arbiter-onboarding'] as const,
  applications: () => [...arbiterKeys.all, 'applications'] as const,
  dashboard: (address: string) =>
    [...arbiterKeys.all, 'dashboard', address] as const,
  analytics: () => [...arbiterKeys.all, 'analytics'] as const,
};

export function useApplyAsArbiter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ArbiterApplicationPayload) => {
      const response = await apiClient.post<ArbiterApplicationRecord>(
        '/arbiters/applications',
        payload,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: arbiterKeys.all });
    },
  });
}

export function useArbiterApplications() {
  return useQuery({
    queryKey: arbiterKeys.applications(),
    queryFn: async () => {
      const response = await apiClient.get<ArbiterApplicationRecord[]>(
        '/arbiters/applications',
      );
      return response.data;
    },
  });
}

export function useReviewArbiterApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: { status: 'APPROVED' | 'REJECTED'; reviewNotes?: string };
    }) => {
      const response = await apiClient.post<ArbiterApplicationRecord>(
        `/arbiters/applications/${id}/review`,
        payload,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: arbiterKeys.all });
    },
  });
}

export function useArbiterDashboard(address: string) {
  return useQuery({
    queryKey: arbiterKeys.dashboard(address),
    queryFn: async () => {
      const response = await apiClient.get<ArbiterDashboardRecord>(
        `/arbiters/dashboard/${address}`,
      );
      return response.data;
    },
    enabled: !!address,
  });
}

export function useArbiterAnalytics() {
  return useQuery({
    queryKey: arbiterKeys.analytics(),
    queryFn: async () => {
      const response = await apiClient.get<ArbiterAnalyticsRecord>(
        '/arbiters/analytics',
      );
      return response.data;
    },
  });
}
