'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { selectWalletAddress } from '@/store/selectors';
import { fetchAccountBalances } from '@/lib/stellar-horizon';
import {
  fetchFiatRates,
  getCachedFiatRates,
  type FiatRateSnapshot,
} from '@/lib/fiat-prices';
import { computePortfolioSummary } from '@/lib/portfolio';

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatFiat(value: number | null): string {
  if (value === null) return '—';
  return USD_FORMATTER.format(value);
}

export function PortfolioOverview() {
  const publicKey = useAuthStore(selectWalletAddress);

  const {
    data: balances,
    isLoading: balancesLoading,
    error: balancesError,
    refetch: refetchBalances,
  } = useQuery({
    queryKey: ['stellar-balances', publicKey],
    queryFn: () => fetchAccountBalances(publicKey as string),
    enabled: !!publicKey,
    staleTime: 30_000,
    retry: 1,
  });

  const assetCodes = balances?.map((b) => b.assetCode) ?? [];

  const {
    data: rateSnapshot,
    isFetching: ratesFetching,
    error: ratesError,
    refetch: refetchRates,
  } = useQuery<FiatRateSnapshot>({
    queryKey: ['fiat-rates', assetCodes.join(',')],
    queryFn: () => fetchFiatRates(assetCodes),
    enabled: !!balances && assetCodes.length > 0,
    staleTime: 60_000,
    retry: 1,
    initialData: () => getCachedFiatRates() ?? undefined,
  });

  const handleRefresh = () => {
    refetchBalances();
    refetchRates();
  };

  if (!publicKey) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/10">
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <Wallet size={24} className="text-neutral-200/40" />
          <p className="text-sm font-semibold text-white">
            No wallet connected
          </p>
          <p className="text-xs text-neutral-200/60 max-w-xs">
            Connect a Stellar wallet to see your aggregated portfolio value.
          </p>
        </div>
      </div>
    );
  }

  if (balancesLoading) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/10">
        <div className="flex items-center gap-2 text-neutral-200/60 text-sm py-8 justify-center">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading portfolio...</span>
        </div>
      </div>
    );
  }

  if (balancesError || !balances) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/10">
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <AlertTriangle size={22} className="text-amber-400" />
          <p className="text-sm font-semibold text-white">
            Couldn&apos;t load your balances
          </p>
          <p className="text-xs text-neutral-200/60 max-w-xs">
            {balancesError instanceof Error
              ? balancesError.message
              : 'The Stellar network is unreachable right now.'}
          </p>
          <button
            onClick={handleRefresh}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/10">
        <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
          <Wallet size={24} className="text-neutral-200/40" />
          <p className="text-sm font-semibold text-white">No assets yet</p>
          <p className="text-xs text-neutral-200/60 max-w-xs">
            This wallet doesn&apos;t hold any Stellar assets yet.
          </p>
        </div>
      </div>
    );
  }

  const rates = rateSnapshot?.rates ?? {};
  const { totalFiatValue, assets, hasUnpricedAssets } =
    computePortfolioSummary(balances, rates);

  const pricesAsOfLabel = rateSnapshot?.fetchedAt
    ? new Date(rateSnapshot.fetchedAt).toLocaleTimeString()
    : null;

  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/10">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-[10px] font-bold text-neutral-200/40 uppercase tracking-widest mb-2">
            Portfolio Value
          </h3>
          <p
            data-testid="portfolio-total"
            className="text-3xl font-bold text-white tracking-tight"
          >
            {formatFiat(totalFiatValue)}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={ratesFetching}
          aria-label="Refresh prices"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-neutral-200/80 transition-colors disabled:opacity-50"
        >
          <RefreshCw
            size={12}
            className={ratesFetching ? 'animate-spin' : ''}
          />
          Refresh
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-neutral-200/40">
          {pricesAsOfLabel
            ? `Prices as of ${pricesAsOfLabel}`
            : ratesError
              ? 'Prices unavailable — showing holdings only'
              : 'Fetching prices...'}
        </p>
      </div>

      <div className="space-y-3">
        {assets.map((asset) => (
          <div
            key={`${asset.assetCode}-${asset.assetIssuer ?? 'native'}`}
            data-testid="portfolio-asset-row"
            className="px-3 py-3 rounded-xl bg-white/5"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="min-w-0">
                <span className="text-sm font-semibold text-white">
                  {asset.assetCode}
                </span>
                {asset.assetIssuer && (
                  <span className="ml-2 font-mono text-[10px] text-neutral-200/40">
                    {asset.assetIssuer.slice(0, 4)}…
                    {asset.assetIssuer.slice(-4)}
                  </span>
                )}
              </div>
              <span className="text-xs text-neutral-200/60 font-mono">
                {asset.amount.toFixed(7)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span
                data-testid="portfolio-asset-fiat"
                className="text-sm text-neutral-200/80"
              >
                {formatFiat(asset.fiatValue)}
              </span>
              <span
                data-testid="portfolio-asset-pct"
                className="text-xs font-semibold text-emerald-400"
              >
                {asset.percentOfPortfolio.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{ width: `${Math.min(asset.percentOfPortfolio, 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {hasUnpricedAssets && (
        <p className="mt-4 text-[10px] text-neutral-200/40">
          Some assets don&apos;t have a known fiat rate and are excluded from
          the totals above.
        </p>
      )}
    </div>
  );
}
