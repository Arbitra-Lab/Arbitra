/**
 * Aggregation and CSV export for the personal analytics dashboard (#156).
 * Everything here is pure so the numbers shown in the charts can be tested.
 */

import type { ActivityEntry } from '@/lib/activity-log';

export interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
  description?: string;
}

export interface ReviewRecord {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface AgreementRecord {
  id: string;
  title: string;
  status: string;
  monthlyRent?: number;
  startDate?: string;
  endDate?: string;
}

export interface MonthBucket {
  /** `YYYY-MM` (UTC). */
  key: string;
  /** Short label for chart axes, e.g. `Nov 25`. */
  label: string;
}

export interface MonthlyPoint extends MonthBucket {
  value: number;
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** The last `months` calendar months ending with the month of `now`, oldest first. */
export function lastMonths(
  months: number,
  now: Date = new Date(),
): MonthBucket[] {
  const count = Math.max(1, Math.floor(months));
  const buckets: MonthBucket[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    buckets.push({
      key: monthKey(date),
      label: `${MONTH_NAMES[date.getUTCMonth()]} ${String(date.getUTCFullYear()).slice(2)}`,
    });
  }
  return buckets;
}

/** Sum `value` per month over the last `months` months; items outside the window or with bad dates/values are ignored. */
export function sumByMonth(
  items: Array<{ date: string; value: number }>,
  months = 6,
  now: Date = new Date(),
): MonthlyPoint[] {
  const buckets = lastMonths(months, now);
  const totals = new Map(buckets.map((b) => [b.key, 0]));
  for (const item of items) {
    const time = Date.parse(item.date);
    if (Number.isNaN(time) || !Number.isFinite(item.value)) continue;
    const key = monthKey(new Date(time));
    if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + item.value);
  }
  return buckets.map((b) => ({ ...b, value: totals.get(b.key) ?? 0 }));
}

/** Count events per month over the last `months` months. */
export function countByMonth(
  dates: string[],
  months = 6,
  now: Date = new Date(),
): MonthlyPoint[] {
  return sumByMonth(
    dates.map((date) => ({ date, value: 1 })),
    months,
    now,
  );
}

export interface AnalyticsOverview {
  propertiesViewed: number;
  savedSearches: number;
  applicationsSent: number;
  agreements: number;
  paymentsTotal: number;
  paymentsCount: number;
  reviewsCount: number;
  averageRating: number | null;
}

export function buildOverview(input: {
  activity: ActivityEntry[];
  agreements: AgreementRecord[];
  payments: PaymentRecord[];
  reviews: ReviewRecord[];
}): AnalyticsOverview {
  const count = (type: ActivityEntry['type']) =>
    input.activity.filter((entry) => entry.type === type).length;
  const rated = input.reviews.filter(
    (r) => Number.isFinite(r.rating) && r.rating >= 1 && r.rating <= 5,
  );
  const completed = input.payments.filter((p) => isCompleted(p.status));

  return {
    propertiesViewed: count('property_viewed'),
    savedSearches: count('search_saved'),
    applicationsSent: count('application_sent'),
    agreements: input.agreements.length,
    paymentsTotal: completed.reduce(
      (sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0),
      0,
    ),
    paymentsCount: input.payments.length,
    reviewsCount: input.reviews.length,
    averageRating: rated.length
      ? Math.round(
          (rated.reduce((s, r) => s + r.rating, 0) / rated.length) * 10,
        ) / 10
      : null,
  };
}

function isCompleted(status: string): boolean {
  return ['completed', 'confirmed', 'paid', 'success', 'succeeded'].includes(
    status.toLowerCase(),
  );
}

// ─── Normalising API responses ───────────────────────────────────────────────

function listOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data;
  }
  return [];
}

export function normalizePayments(raw: unknown): PaymentRecord[] {
  const result: PaymentRecord[] = [];
  for (const item of listOf(raw)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const amount = Number(row.amount);
    const createdAt = String(row.createdAt ?? row.paidAt ?? '');
    if (
      typeof row.id !== 'string' ||
      !Number.isFinite(amount) ||
      Number.isNaN(Date.parse(createdAt))
    ) {
      continue;
    }
    result.push({
      id: row.id,
      amount,
      currency: typeof row.currency === 'string' ? row.currency : 'USD',
      status: typeof row.status === 'string' ? row.status : 'unknown',
      createdAt,
      description:
        typeof row.description === 'string' ? row.description : undefined,
    });
  }
  return result;
}

export function normalizeReviews(raw: unknown): ReviewRecord[] {
  const result: ReviewRecord[] = [];
  for (const item of listOf(raw)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const rating = Number(row.rating);
    const createdAt = String(row.createdAt ?? '');
    if (
      typeof row.id !== 'string' ||
      !Number.isFinite(rating) ||
      Number.isNaN(Date.parse(createdAt))
    ) {
      continue;
    }
    result.push({
      id: row.id,
      rating,
      comment: typeof row.comment === 'string' ? row.comment : undefined,
      createdAt,
    });
  }
  return result;
}

// ─── CSV ─────────────────────────────────────────────────────────────────────

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * One CSV field. Values are quoted when they contain a comma, quote or line
 * break, and a leading `= + - @` (or tab/CR) is prefixed with `'` so a
 * spreadsheet cannot run user-supplied text as a formula.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (
    /^[=+\-@\t\r]/.test(text) &&
    !(typeof value === 'number' && Number.isFinite(value))
  ) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Build a CSV document (CRLF line endings, header row first). */
export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const lines = [columns.map((c) => csvField(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(c.value(row))).join(','));
  }
  return lines.join('\r\n');
}

export const PAYMENT_CSV_COLUMNS: Array<CsvColumn<PaymentRecord>> = [
  { header: 'Date', value: (p) => p.createdAt },
  { header: 'Amount', value: (p) => p.amount },
  { header: 'Currency', value: (p) => p.currency },
  { header: 'Status', value: (p) => p.status },
  { header: 'Description', value: (p) => p.description },
];

export const AGREEMENT_CSV_COLUMNS: Array<CsvColumn<AgreementRecord>> = [
  { header: 'Agreement', value: (a) => a.title },
  { header: 'Status', value: (a) => a.status },
  { header: 'Monthly rent', value: (a) => a.monthlyRent },
  { header: 'Start date', value: (a) => a.startDate },
  { header: 'End date', value: (a) => a.endDate },
];

export const REVIEW_CSV_COLUMNS: Array<CsvColumn<ReviewRecord>> = [
  { header: 'Date', value: (r) => r.createdAt },
  { header: 'Rating', value: (r) => r.rating },
  { header: 'Comment', value: (r) => r.comment },
];

export const ACTIVITY_CSV_COLUMNS: Array<CsvColumn<ActivityEntry>> = [
  { header: 'Date', value: (a) => a.at },
  { header: 'Type', value: (a) => a.type },
  { header: 'Detail', value: (a) => a.label ?? a.refId },
];

/** Trigger a browser download of `csv` (with a BOM so Excel reads UTF-8). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
