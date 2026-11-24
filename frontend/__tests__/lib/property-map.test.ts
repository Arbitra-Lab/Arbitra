import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  formatPriceLabel,
  getBounds,
  getMappablePoints,
  toCoordinate,
} from '@/lib/properties/map';

const property = (id: string, latitude: unknown, longitude: unknown) => ({
  id,
  title: id,
  latitude: latitude as number,
  longitude: longitude as number,
});

describe('property map helpers (#150)', () => {
  describe('toCoordinate', () => {
    it('accepts numbers and numeric strings inside the range', () => {
      expect(toCoordinate(12.5, -90, 90)).toBe(12.5);
      expect(toCoordinate('12.5', -90, 90)).toBe(12.5);
      expect(toCoordinate(-90, -90, 90)).toBe(-90);
      expect(toCoordinate(90, -90, 90)).toBe(90);
    });

    it('rejects missing, non-numeric and out-of-range values', () => {
      for (const bad of [null, undefined, '', 'abc', NaN, Infinity, 91, -91]) {
        expect(toCoordinate(bad, -90, 90)).toBeNull();
      }
    });
  });

  describe('getMappablePoints', () => {
    it('keeps listings with coordinates and drops the rest', () => {
      const points = getMappablePoints([
        property('a', 6.5, 3.4),
        property('b', null, null),
        property('c', '40.7', '-74'),
        property('d', 120, 10),
      ]);
      expect(points.map((p) => p.property.id)).toEqual(['a', 'c']);
      expect(points[1]).toMatchObject({ lat: 40.7, lng: -74 });
    });

    it('treats 0,0 as "not set"', () => {
      expect(getMappablePoints([property('a', 0, 0)])).toEqual([]);
      expect(getMappablePoints([property('a', 0, 12)])).toHaveLength(1);
    });

    it('returns an empty list for no listings', () => {
      expect(getMappablePoints([])).toEqual([]);
    });
  });

  describe('getBounds', () => {
    it('returns the smallest box around all points', () => {
      const points = getMappablePoints([
        property('a', 10, 20),
        property('b', -5, 30),
        property('c', 7, -15),
      ]);
      expect(getBounds(points)).toEqual([
        [-5, -15],
        [10, 30],
      ]);
    });

    it('handles a single point and no points', () => {
      expect(getBounds(getMappablePoints([property('a', 1, 2)]))).toEqual([
        [1, 2],
        [1, 2],
      ]);
      expect(getBounds([])).toBeNull();
    });
  });

  describe('formatPriceLabel', () => {
    it('shows small prices in full and large ones as k', () => {
      expect(formatPriceLabel(850)).toBe('$850');
      expect(formatPriceLabel(1200)).toBe('$1.2k');
      expect(formatPriceLabel(2000)).toBe('$2k');
      expect(formatPriceLabel('1500')).toBe('$1.5k');
    });

    it('uses the right symbol, or the code for other currencies', () => {
      expect(formatPriceLabel(900, 'EUR')).toBe('€900');
      expect(formatPriceLabel(900, 'usdc')).toBe('USDC 900');
    });

    it('shows a dash for a missing or invalid price', () => {
      expect(formatPriceLabel(undefined)).toBe('—');
      expect(formatPriceLabel('abc')).toBe('—');
      expect(formatPriceLabel('')).toBe('—');
    });
  });

  describe('escapeHtml', () => {
    it('escapes markup so listing text cannot inject HTML into a marker', () => {
      expect(escapeHtml('<img src=x onerror="a()">&\'')).toBe(
        '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;',
      );
    });
  });
});
