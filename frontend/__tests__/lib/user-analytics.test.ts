import { describe, expect, it } from 'vitest';
import {
  buildOverview,
  countByMonth,
  csvField,
  lastMonths,
  normalizePayments,
  normalizeReviews,
  sumByMonth,
  toCsv,
  PAYMENT_CSV_COLUMNS,
} from '@/lib/analytics/user-analytics';

const NOW = new Date('2026-11-15T12:00:00Z');

describe('user analytics aggregation (#156)', () => {
  it('lists the last months oldest first, across a year boundary', () => {
    expect(lastMonths(3, NOW).map((m) => m.key)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(
      lastMonths(3, new Date('2026-01-10T00:00:00Z')).map((m) => m.key),
    ).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(lastMonths(0, NOW)).toHaveLength(1);
  });

  it('counts events per month and ignores anything outside the window or invalid', () => {
    const points = countByMonth(
      [
        '2026-11-01T00:00:00Z',
        '2026-11-30T23:59:59Z',
        '2026-10-05T00:00:00Z',
        '2025-01-01T00:00:00Z',
        'garbage',
      ],
      2,
      NOW,
    );
    expect(points.map((p) => p.value)).toEqual([1, 2]);
    expect(points[1].label).toBe('Nov 26');
  });

  it('sums values per month and skips non-finite values', () => {
    const points = sumByMonth(
      [
        { date: '2026-11-02T00:00:00Z', value: 100 },
        { date: '2026-11-20T00:00:00Z', value: 50.5 },
        { date: '2026-10-02T00:00:00Z', value: 10 },
        { date: '2026-11-03T00:00:00Z', value: NaN },
      ],
      2,
      NOW,
    );
    expect(points.map((p) => p.value)).toEqual([10, 150.5]);
  });

  it('builds an overview', () => {
    const overview = buildOverview({
      activity: [
        { type: 'property_viewed', at: '2026-11-01T00:00:00Z' },
        { type: 'property_viewed', at: '2026-11-02T00:00:00Z' },
        { type: 'search_saved', at: '2026-11-02T00:00:00Z' },
      ],
      agreements: [{ id: 'a', title: 'A', status: 'active' }],
      payments: [
        {
          id: '1',
          amount: 100,
          currency: 'USD',
          status: 'completed',
          createdAt: '2026-11-01T00:00:00Z',
        },
        {
          id: '2',
          amount: 50,
          currency: 'USD',
          status: 'pending',
          createdAt: '2026-11-01T00:00:00Z',
        },
      ],
      reviews: [
        { id: 'r1', rating: 5, createdAt: '2026-11-01T00:00:00Z' },
        { id: 'r2', rating: 4, createdAt: '2026-11-01T00:00:00Z' },
        { id: 'r3', rating: 9, createdAt: '2026-11-01T00:00:00Z' },
      ],
    });
    expect(overview).toMatchObject({
      propertiesViewed: 2,
      savedSearches: 1,
      applicationsSent: 0,
      agreements: 1,
      paymentsCount: 2,
      paymentsTotal: 100,
      reviewsCount: 3,
      averageRating: 4.5,
    });
  });

  it('has no average rating without valid ratings', () => {
    expect(
      buildOverview({ activity: [], agreements: [], payments: [], reviews: [] })
        .averageRating,
    ).toBeNull();
  });
});

describe('response normalisation (#156)', () => {
  it('reads arrays and { data } and drops malformed rows', () => {
    const payments = normalizePayments({
      data: [
        {
          id: 'p1',
          amount: '12.5',
          currency: 'USDC',
          status: 'completed',
          createdAt: '2026-11-01T00:00:00Z',
        },
        { id: 'p2', amount: 'x', createdAt: '2026-11-01T00:00:00Z' },
        { id: 'p3', amount: 1, createdAt: 'nope' },
        'junk',
      ],
    });
    expect(payments).toEqual([
      {
        id: 'p1',
        amount: 12.5,
        currency: 'USDC',
        status: 'completed',
        createdAt: '2026-11-01T00:00:00Z',
        description: undefined,
      },
    ]);
    expect(normalizePayments(undefined)).toEqual([]);

    expect(
      normalizeReviews([
        {
          id: 'r',
          rating: 4,
          comment: 'Great',
          createdAt: '2026-11-01T00:00:00Z',
        },
      ]),
    ).toHaveLength(1);
    expect(normalizeReviews({ data: [{ rating: 4 }] })).toEqual([]);
  });
});

describe('CSV export (#156)', () => {
  it('quotes fields with commas, quotes and line breaks', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(12.5)).toBe('12.5');
  });

  it('neutralises spreadsheet formulas in text but keeps negative numbers', () => {
    for (const text of ['=SUM(A1)', '+1', '-1', '@cmd', '\tTab']) {
      expect(csvField(text).startsWith("'")).toBe(true);
    }
    expect(csvField(-5)).toBe('-5');
  });

  it('builds a document with a header row and CRLF endings', () => {
    const csv = toCsv(
      [
        {
          id: '1',
          amount: 10,
          currency: 'USD',
          status: 'completed',
          createdAt: '2026-11-01',
          description: '=evil',
        },
      ],
      PAYMENT_CSV_COLUMNS,
    );
    expect(csv).toBe(
      "Date,Amount,Currency,Status,Description\r\n2026-11-01,10,USD,completed,'=evil",
    );
  });

  it('exports just the header for no rows', () => {
    expect(toCsv([], PAYMENT_CSV_COLUMNS)).toBe(
      'Date,Amount,Currency,Status,Description',
    );
  });
});
