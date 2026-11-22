import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export type ProposalStatus =
  | 'ACTIVE'
  | 'SUCCEEDED'
  | 'DEFEATED'
  | 'QUEUED'
  | 'EXECUTED'
  | 'CANCELLED';

export interface GovernanceProposalRecord {
  id: string;
  type: string;
  title: string;
  description: string;
  proposerId: string;
  parameters: Record<string, number> | null;
  status: ProposalStatus;
  quorumBps: number;
  thresholdBps: number;
  forWeight: number;
  againstWeight: number;
  abstainWeight: number;
  voterCount: number;
  votingEndsAt: string;
  executionNotes: string | null;
}

export interface GovernanceAnalyticsRecord {
  proposalsByStatus: Record<string, number>;
  totalProposals: number;
  totalVotes: number;
  totalVotingPower: number;
  totalTokenSupply: number;
}

export interface GovernanceBalanceRecord {
  balance: number;
  lockedBalance: number;
}

export const governanceKeys = {
  all: ['governance'] as const,
  proposals: () => [...governanceKeys.all, 'proposals'] as const,
  analytics: () => [...governanceKeys.all, 'analytics'] as const,
  balance: () => [...governanceKeys.all, 'balance'] as const,
};

export function useGovernanceProposals() {
  return useQuery({
    queryKey: governanceKeys.proposals(),
    queryFn: async () => {
      const response = await apiClient.get<GovernanceProposalRecord[]>(
        '/governance/proposals',
      );
      return response.data;
    },
  });
}

export function useGovernanceAnalytics() {
  return useQuery({
    queryKey: governanceKeys.analytics(),
    queryFn: async () => {
      const response = await apiClient.get<GovernanceAnalyticsRecord>(
        '/governance/analytics',
      );
      return response.data;
    },
  });
}

export function useGovernanceBalance() {
  return useQuery({
    queryKey: governanceKeys.balance(),
    queryFn: async () => {
      const response = await apiClient.get<GovernanceBalanceRecord | null>(
        '/governance/tokens/me',
      );
      return response.data;
    },
  });
}

function useProposalAction(path: (id: string) => string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload?: unknown }) => {
      const response = await apiClient.post<GovernanceProposalRecord>(
        path(id),
        payload ?? {},
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: governanceKeys.all });
    },
  });
}

export function useVote() {
  return useProposalAction((id) => `/governance/proposals/${id}/vote`);
}

export function useFinalizeProposal() {
  return useProposalAction((id) => `/governance/proposals/${id}/finalize`);
}

export function useExecuteProposal() {
  return useProposalAction((id) => `/governance/proposals/${id}/execute`);
}

export function useCreateGovernanceProposal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      type: string;
      title: string;
      description: string;
      parameters?: Record<string, number>;
      durationDays?: number;
    }) => {
      const response = await apiClient.post<GovernanceProposalRecord>(
        '/governance/proposals',
        payload,
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: governanceKeys.all });
    },
  });
}
