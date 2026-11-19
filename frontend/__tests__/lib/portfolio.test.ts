import { describe, it, expect } from 'vitest';
import { computePortfolioSummary } from '@/lib/portfolio';
import type { StellarBalanceRow } from '@/lib/stellar-horizon';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mixedAssetBalances: StellarBalanceRow[] = [
  {
    label: 'XLM',
    amount: '1000.0000000',
    assetType: 'native',
    assetCode: 'XLM',
  },
  {
    label: 'USDC:GA12…WXYZ',
    amount: '250.0000000',
    assetType: 'credit_alphanum4',
    assetCode: 'USDC',
    assetIssuer: 'GA12000000000000000000000000000000000000000000WXYZ',
  },
  {
    label: 'OBSCURE:GB99…ABCD',
    amount: '5.0000000',
    assetType: 'credit_alphanum12',
    assetCode: 'OBSCURE',
    assetIssuer: 'GB99000000000000000000000000000000000000000000ABCD',
  },
];

const rates = { XLM: 0.1, USDC: 1 };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('computePortfolioSummary', () => {
  it('computes the total fiat value across priced assets only', () => {
    const summary = computePortfolioSummary(mixedAssetBalances, rates);

    // 1000 * 0.1 + 250 * 1 = 350; OBSCURE has no rate and contributes 0
    expect(summary.totalFiatValue).toBeCloseTo(350, 5);
  });

  it('computes correct per-asset fiat values and allocation percentages', () => {
    const summary = computePortfolioSummary(mixedAssetBalances, rates);

    const xlm = summary.assets.find((a) => a.assetCode === 'XLM');
    const usdc = summary.assets.find((a) => a.assetCode === 'USDC');
    const obscure = summary.assets.find((a) => a.assetCode === 'OBSCURE');

    expect(xlm?.fiatValue).toBeCloseTo(100, 5);
    expect(xlm?.percentOfPortfolio).toBeCloseTo((100 / 350) * 100, 5);

    expect(usdc?.fiatValue).toBeCloseTo(250, 5);
    expect(usdc?.percentOfPortfolio).toBeCloseTo((250 / 350) * 100, 5);

    expect(obscure?.fiatValue).toBeNull();
    expect(obscure?.percentOfPortfolio).toBe(0);

    const pricedPercentTotal =
      (xlm?.percentOfPortfolio ?? 0) + (usdc?.percentOfPortfolio ?? 0);
    expect(pricedPercentTotal).toBeCloseTo(100, 5);
  });

  it('flags when any held asset has no known fiat rate', () => {
    const summary = computePortfolioSummary(mixedAssetBalances, rates);
    expect(summary.hasUnpricedAssets).toBe(true);
  });

  it('does not flag unpriced assets when every asset has a rate', () => {
    const summary = computePortfolioSummary(
      mixedAssetBalances.slice(0, 2),
      rates,
    );
    expect(summary.hasUnpricedAssets).toBe(false);
  });

  it('returns zero totals and percentages for an empty account', () => {
    const summary = computePortfolioSummary([], rates);
    expect(summary.totalFiatValue).toBe(0);
    expect(summary.assets).toEqual([]);
    expect(summary.hasUnpricedAssets).toBe(false);
  });

  it('assigns 0% allocation to every asset when no rates are available at all', () => {
    const summary = computePortfolioSummary(mixedAssetBalances, {});
    expect(summary.totalFiatValue).toBe(0);
    expect(summary.assets.every((a) => a.percentOfPortfolio === 0)).toBe(
      true,
    );
    expect(summary.assets.every((a) => a.fiatValue === null)).toBe(true);
  });
});
