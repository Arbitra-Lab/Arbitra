import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StellarBalanceRow } from '@/lib/stellar-horizon';
import type { FiatRateSnapshot } from '@/lib/fiat-prices';

const WALLET_ADDRESS = 'GA1234567890MOCKPUBLICKEY0000000000000000000000000';

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

const rateSnapshot: FiatRateSnapshot = {
  rates: { XLM: 0.1, USDC: 1 },
  fetchedAt: Date.UTC(2026, 0, 1, 12, 0, 0),
};

const fetchAccountBalances = vi.fn();
const fetchFiatRates = vi.fn();
const getCachedFiatRates = vi.fn();

vi.mock('@/lib/stellar-horizon', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stellar-horizon')>(
    '@/lib/stellar-horizon',
  );
  return {
    ...actual,
    fetchAccountBalances: (...args: unknown[]) =>
      fetchAccountBalances(...args),
  };
});

vi.mock('@/lib/fiat-prices', async () => {
  const actual = await vi.importActual<typeof import('@/lib/fiat-prices')>(
    '@/lib/fiat-prices',
  );
  return {
    ...actual,
    fetchFiatRates: (...args: unknown[]) => fetchFiatRates(...args),
    getCachedFiatRates: () => getCachedFiatRates(),
  };
});

vi.mock('@/store/authStore', () => ({
  useAuthStore: (_selector: unknown) => WALLET_ADDRESS,
}));

async function importPortfolioOverview() {
  const mod = await import('@/components/wallet/PortfolioOverview');
  return mod.PortfolioOverview;
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PortfolioOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCachedFiatRates.mockReturnValue(null);
  });

  it('renders correct total value and per-asset allocation percentages for a mixed-asset account', async () => {
    fetchAccountBalances.mockResolvedValue(mixedAssetBalances);
    fetchFiatRates.mockResolvedValue(rateSnapshot);

    const PortfolioOverview = await importPortfolioOverview();
    renderWithClient(<PortfolioOverview />);

    // Total = 1000*0.1 (XLM) + 250*1 (USDC) = 350; OBSCURE has no rate
    await waitFor(() => {
      expect(screen.getByTestId('portfolio-total')).toHaveTextContent(
        '$350.00',
      );
    });

    const rows = screen.getAllByTestId('portfolio-asset-row');
    expect(rows).toHaveLength(3);

    const pctByCode: Record<string, string> = {};
    rows.forEach((row) => {
      const code = row.querySelector('span')?.textContent ?? '';
      const pct = row.querySelector(
        '[data-testid="portfolio-asset-pct"]',
      )?.textContent;
      if (pct) pctByCode[code] = pct;
    });

    expect(pctByCode.XLM).toBe('28.6%'); // 100 / 350
    expect(pctByCode.USDC).toBe('71.4%'); // 250 / 350
    expect(pctByCode.OBSCURE).toBe('0.0%'); // unpriced asset

    expect(
      screen.getByText(/don't have a known fiat rate/i),
    ).toBeInTheDocument();

    expect(screen.getByText(/Prices as of/i)).toBeInTheDocument();
  });

  it('shows an empty state when the account holds no assets', async () => {
    fetchAccountBalances.mockResolvedValue([]);

    const PortfolioOverview = await importPortfolioOverview();
    renderWithClient(<PortfolioOverview />);

    await waitFor(() => {
      expect(screen.getByText(/No assets yet/i)).toBeInTheDocument();
    });
  });

  it('shows an error state when Horizon is unreachable', async () => {
    fetchAccountBalances.mockRejectedValue(new Error('Horizon error (503)'));

    const PortfolioOverview = await importPortfolioOverview();
    renderWithClient(<PortfolioOverview />);

    await waitFor(() => {
      expect(
        screen.getByText(/Couldn't load your balances/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Horizon error \(503\)/i)).toBeInTheDocument();
  });
});
