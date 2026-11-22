import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { GenericEscrowPayload } from '@/lib/escrow/generic-escrow';

export interface GenericEscrowResult extends Omit<
  GenericEscrowPayload,
  'asset'
> {
  escrowId: string;
  /** The backend returns the resolved asset, including its Horizon id. */
  asset: ResolvedGenericAsset;
}

export interface ResolvedGenericAsset {
  id: string;
  assetType: 'XLM' | 'ISSUED';
  assetCode?: string;
  assetIssuer?: string;
  verifiedOnHorizon: boolean;
}

export function useCreateGenericEscrow() {
  return useMutation({
    mutationFn: async (payload: GenericEscrowPayload) => {
      const response = await apiClient.post<GenericEscrowResult>(
        '/stellar/escrow/generic',
        payload,
      );
      return response.data;
    },
  });
}

export function useResolveGenericAsset() {
  return useMutation({
    mutationFn: async (asset: GenericEscrowPayload['asset']) => {
      const response = await apiClient.post<ResolvedGenericAsset>(
        '/stellar/escrow/generic/asset',
        asset,
      );
      return response.data;
    },
  });
}
