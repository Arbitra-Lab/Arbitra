/**
 * Fiat (USD) pricing for Stellar assets, backed by the CoinGecko public
 * price API with a localStorage cache so the last-known rates survive
 * reloads and can be shown instantly while a fresh fetch is in flight.
 */

const COINGECKO_SIMPLE_PRICE_URL =
  'https://api.coingecko.com/api/v3/simple/price';

/** Maps Stellar asset codes we know how to price to CoinGecko ids. */
const ASSET_TO_COINGECKO_ID: Record<string, string> = {
  XLM: 'stellar',
  USDC: 'usd-coin',
  USDT: 'tether',
  EURC: 'euro-coin',
  DAI: 'dai',
  BTC: 'bitcoin',
  ETH: 'ethereum',
};

const CACHE_KEY = 'arbitra:fiat-rates:v1';

export interface FiatRateSnapshot {
  /** USD rate per unit, keyed by asset code. Missing key = unpriced asset. */
  rates: Record<string, number>;
  /** Epoch ms when these rates were fetched. */
  fetchedAt: number;
}

export function isPriceableAsset(assetCode: string): boolean {
  return assetCode in ASSET_TO_COINGECKO_ID;
}

export function getCachedFiatRates(): FiatRateSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FiatRateSnapshot>;
    if (!parsed || typeof parsed.fetchedAt !== 'number' || !parsed.rates) {
      return null;
    }
    return { rates: parsed.rates, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function setCachedFiatRates(snapshot: FiatRateSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // storage unavailable (quota, private mode) — cache is best-effort
  }
}

/**
 * Fetches current USD rates for the given asset codes. Unknown asset codes
 * are silently skipped (left out of the returned `rates` map) rather than
 * failing the whole request, since an account may hold untracked tokens.
 */
export async function fetchFiatRates(
  assetCodes: string[],
): Promise<FiatRateSnapshot> {
  const uniqueCodes = Array.from(new Set(assetCodes));
  const idsByCode = uniqueCodes
    .map((code) => [code, ASSET_TO_COINGECKO_ID[code]] as const)
    .filter(([, id]) => Boolean(id));

  if (idsByCode.length === 0) {
    const snapshot: FiatRateSnapshot = { rates: {}, fetchedAt: Date.now() };
    setCachedFiatRates(snapshot);
    return snapshot;
  }

  const ids = idsByCode.map(([, id]) => id);
  const res = await fetch(
    `${COINGECKO_SIMPLE_PRICE_URL}?ids=${ids.join(',')}&vs_currencies=usd`,
    { cache: 'no-store' },
  );

  if (!res.ok) {
    throw new Error(`Price feed error (${res.status})`);
  }

  const json = (await res.json()) as Record<string, { usd?: number }>;

  const rates: Record<string, number> = {};
  for (const [code, id] of idsByCode) {
    const usd = json[id]?.usd;
    if (typeof usd === 'number') {
      rates[code] = usd;
    }
  }

  const snapshot: FiatRateSnapshot = { rates, fetchedAt: Date.now() };
  setCachedFiatRates(snapshot);
  return snapshot;
}
