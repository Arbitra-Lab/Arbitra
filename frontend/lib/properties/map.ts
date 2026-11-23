/**
 * Pure helpers for the property map (#150): which listings can be placed on
 * a map, how their price label reads, and the area the map should show.
 */

export interface MapPropertyLike {
  id: string;
  price?: number | string;
  currency?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

export interface MapPoint<T extends MapPropertyLike> {
  property: T;
  lat: number;
  lng: number;
}

export type LatLngBounds = [[number, number], [number, number]];

/** Map centre and zoom used before any listing is placed. */
export const DEFAULT_MAP_CENTER: [number, number] = [20, 0];
export const DEFAULT_MAP_ZOOM = 2;

/** A finite number within `[min, max]`, or `null`. Accepts numeric strings (APIs often serialise decimals as strings). */
export function toCoordinate(
  value: unknown,
  min: number,
  max: number,
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/**
 * Listings that have usable coordinates. `0, 0` is treated as "not set": it is
 * the common default for a missing location and sits in the Atlantic Ocean.
 */
export function getMappablePoints<T extends MapPropertyLike>(
  properties: T[],
): Array<MapPoint<T>> {
  const points: Array<MapPoint<T>> = [];
  for (const property of properties) {
    const lat = toCoordinate(property.latitude, -90, 90);
    const lng = toCoordinate(property.longitude, -180, 180);
    if (lat === null || lng === null) continue;
    if (lat === 0 && lng === 0) continue;
    points.push({ property, lat, lng });
  }
  return points;
}

/** The smallest box containing every point, or `null` when there are none. */
export function getBounds<T extends MapPropertyLike>(
  points: Array<MapPoint<T>>,
): LatLngBounds | null {
  if (points.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const { lat, lng } of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [
    [south, west],
    [north, east],
  ];
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  NGN: '₦',
};

/** Compact marker label: `$850`, `$1.2k`, `$2k`, `USDC 950`; `—` for a missing or invalid price. */
export function formatPriceLabel(
  price: number | string | undefined,
  currency = 'USD',
): string {
  const amount = Number(price);
  if (price === undefined || price === '' || !Number.isFinite(amount)) {
    return '—';
  }

  const code = currency.toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code];
  const prefix = symbol ?? `${code} `;

  if (Math.abs(amount) < 1000) {
    return `${prefix}${Math.round(amount)}`;
  }
  const thousands = amount / 1000;
  const text = Number.isInteger(thousands)
    ? String(thousands)
    : thousands.toFixed(1).replace(/\.0$/, '');
  return `${prefix}${text}k`;
}

/** Escape text before placing it inside marker HTML (listing text is user supplied). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
