import type { StellarBalanceRow } from './stellar-horizon';

export interface AssetValuation {
  assetCode: string;
  assetIssuer?: string;
  label: string;
  amount: number;
  /** USD value, or null when no rate is available for this asset. */
  fiatValue: number | null;
  /** 0-100 share of the total portfolio fiat value. */
  percentOfPortfolio: number;
}

export interface PortfolioSummary {
  totalFiatValue: number;
  assets: AssetValuation[];
  /** True when at least one held asset has no usable fiat rate. */
  hasUnpricedAssets: boolean;
}

/**
 * Combines raw trustline balances with USD rates into a portfolio summary:
 * per-asset fiat value and percentage share of the total. Assets without a
 * known rate contribute to the asset list but not to totals/percentages.
 */
export function computePortfolioSummary(
  balances: StellarBalanceRow[],
  rates: Record<string, number>,
): PortfolioSummary {
  const priced = balances.map((b) => {
    const amount = parseFloat(b.amount) || 0;
    const rate = rates[b.assetCode];
    const fiatValue = typeof rate === 'number' ? amount * rate : null;
    return {
      assetCode: b.assetCode,
      assetIssuer: b.assetIssuer,
      label: b.label,
      amount,
      fiatValue,
    };
  });

  const totalFiatValue = priced.reduce(
    (sum, a) => sum + (a.fiatValue ?? 0),
    0,
  );

  const assets: AssetValuation[] = priced.map((a) => ({
    ...a,
    percentOfPortfolio:
      totalFiatValue > 0 && a.fiatValue !== null
        ? (a.fiatValue / totalFiatValue) * 100
        : 0,
  }));

  return {
    totalFiatValue,
    assets,
    hasUnpricedAssets: assets.some((a) => a.fiatValue === null),
  };
}
