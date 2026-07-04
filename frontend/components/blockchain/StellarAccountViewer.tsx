'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAccountBalances } from '@/lib/stellar-horizon';
import { getStellarExpertAccountUrl } from '@/lib/stellar-network';
import { AssetBalanceDisplay } from '@/components/blockchain/AssetBalanceDisplay';
import { BlockchainStatusBadge } from '@/components/blockchain/BlockchainStatusBadge';
import { ExternalLink, Loader2 } from 'lucide-react';

export interface StellarAccountViewerProps {
  /** Optional initial G... address */
  initialPublicKey?: string;
  className?: string;
}

export function StellarAccountViewer({
  initialPublicKey = '',
  className = '',
}: StellarAccountViewerProps) {
  const [input, setInput] = useState(initialPublicKey);

  const trimmed = input.trim();
  const enabled = trimmed.length >= 56 && trimmed.startsWith('G');

  const { data, error, refetch, isFetching, isFetched } = useQuery({
    queryKey: ['stellar-account-balances', trimmed],
    queryFn: () => fetchAccountBalances(trimmed),
    enabled: false,
    retry: 1,
  });

  const errMsg = error instanceof Error ? error.message : null;

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            Stellar public key
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="G…"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-accent/40"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          disabled={!enabled || isFetching}
          onClick={() => {
            if (!enabled) return;
            void refetch();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue/90 hover:bg-brand-blue text-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50 shrink-0"
        >
          {isFetching ? <Loader2 className="animate-spin" size={18} /> : null}
          Load account
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <BlockchainStatusBadge variant="network" />
        {enabled && isFetched && !errMsg && (
          <BlockchainStatusBadge variant="success" label="Account loaded" />
        )}
      </div>

      {enabled && (isFetched || isFetching) && (
        <AssetBalanceDisplay
          balances={data ?? []}
          loading={isFetching}
          error={errMsg}
        />
      )}

      {enabled && !errMsg && data && data.length > 0 && (
        <a
          href={getStellarExpertAccountUrl(trimmed)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-brand-accent hover:text-brand-accent/80"
        >
          View on Stellar Expert
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  );
}
