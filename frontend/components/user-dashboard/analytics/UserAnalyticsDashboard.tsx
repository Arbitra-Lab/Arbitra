'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/store/authStore';
import { useUserAgreements } from '@/lib/query/hooks/use-agreements';
import { readActivity, type ActivityEntry } from '@/lib/activity-log';
import {
  ACTIVITY_CSV_COLUMNS,
  AGREEMENT_CSV_COLUMNS,
  PAYMENT_CSV_COLUMNS,
  REVIEW_CSV_COLUMNS,
  buildOverview,
  countByMonth,
  downloadCsv,
  normalizePayments,
  normalizeReviews,
  sumByMonth,
  toCsv,
  type AgreementRecord,
  type CsvColumn,
} from '@/lib/analytics/user-analytics';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'activity', label: 'Activity' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'payments', label: 'Payments' },
  { id: 'reviews', label: 'Reviews' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const CARD = 'rounded-2xl border border-white/10 bg-white/5 p-4 md:p-6';
const CHART_MONTHS = 6;

const ACTIVITY_LABELS: Record<ActivityEntry['type'], string> = {
  property_viewed: 'Viewed a property',
  search_saved: 'Saved a search',
  application_sent: 'Sent an application',
};

function formatDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={CARD}>
      <p className="text-xs text-neutral-200/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function ExportButton<T>({
  filename,
  rows,
  columns,
}: {
  filename: string;
  rows: T[];
  columns: Array<CsvColumn<T>>;
}) {
  return (
    <button
      type="button"
      disabled={rows.length === 0}
      onClick={() => downloadCsv(filename, toCsv(rows, columns))}
      className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Download aria-hidden="true" className="h-4 w-4" />
      Export CSV
    </button>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className={CARD}>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mb-4 text-xs text-neutral-200/60">{description}</p>
      <div className="h-56 w-full md:h-64">{children}</div>
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-neutral-200/60">{children}</p>;
}

function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-sm text-white">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/10 text-xs text-neutral-200/60">
            {headers.map((header) => (
              <th key={header} scope="col" className="py-2 pr-4 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-white/5">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-2 pr-4">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Personal analytics: activity, agreements, payments and reviews, with trend charts and CSV export. */
export function UserAnalyticsDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabId>('overview');
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    setActivity(readActivity());
  }, []);

  const agreementsQuery = useUserAgreements();
  const paymentsQuery = useQuery({
    queryKey: ['analytics', 'payments'],
    queryFn: async () =>
      normalizePayments(
        (await apiClient.get<unknown>('/payments?limit=100')).data,
      ),
    staleTime: 60_000,
  });
  const reviewsQuery = useQuery({
    queryKey: ['analytics', 'reviews', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () =>
      normalizeReviews(
        (await apiClient.get<unknown>(`/reviews/user/${user?.id}`)).data,
      ),
    staleTime: 60_000,
  });

  const agreements = useMemo<AgreementRecord[]>(
    () =>
      (agreementsQuery.data ?? []).map((agreement) => ({
        id: agreement.id,
        title: agreement.displayTitle ?? agreement.id,
        status: agreement.status ?? 'unknown',
        monthlyRent: agreement.monthlyRent,
        startDate: agreement.startDate,
        endDate: agreement.endDate,
      })),
    [agreementsQuery.data],
  );
  const payments = useMemo(
    () => paymentsQuery.data ?? [],
    [paymentsQuery.data],
  );
  const reviews = useMemo(() => reviewsQuery.data ?? [], [reviewsQuery.data]);

  const overview = useMemo(
    () => buildOverview({ activity, agreements, payments, reviews }),
    [activity, agreements, payments, reviews],
  );
  const viewsByMonth = useMemo(
    () =>
      countByMonth(
        activity.filter((a) => a.type === 'property_viewed').map((a) => a.at),
        CHART_MONTHS,
      ),
    [activity],
  );
  const paymentsByMonth = useMemo(
    () =>
      sumByMonth(
        payments
          .filter((p) =>
            ['completed', 'confirmed', 'paid', 'success', 'succeeded'].includes(
              p.status.toLowerCase(),
            ),
          )
          .map((p) => ({ date: p.createdAt, value: p.amount })),
        CHART_MONTHS,
      ),
    [payments],
  );

  const moveTab = (index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length];
    setTab(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const viewsChart = (
    <ChartCard
      title="Properties viewed per month"
      description={`Last ${CHART_MONTHS} months`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={viewsByMonth}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} />
          <YAxis
            allowDecimals={false}
            stroke="#a3a3a3"
            fontSize={12}
            width={32}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            name="Viewed"
            stroke="#38bdf8"
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  const paymentsChart = (
    <ChartCard
      title="Payment history"
      description={`Completed payments per month, last ${CHART_MONTHS} months`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={paymentsByMonth}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis dataKey="label" stroke="#a3a3a3" fontSize={12} />
          <YAxis stroke="#a3a3a3" fontSize={12} width={48} />
          <Tooltip />
          <Bar
            dataKey="value"
            name="Paid"
            fill="#34d399"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );

  return (
    <main className="p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-white md:text-3xl">
            Your analytics
          </h1>
          <p className="mt-1 text-sm text-neutral-200/60">
            Your activity, agreements, payments and reviews in one place.
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Analytics sections"
          className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1"
        >
          {TABS.map((item, index) => (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[item.id] = node;
              }}
              id={`analytics-tab-${item.id}`}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-controls={`analytics-panel-${item.id}`}
              tabIndex={tab === item.id ? 0 : -1}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowRight') moveTab(index + 1);
                else if (event.key === 'ArrowLeft') moveTab(index - 1);
                else return;
                event.preventDefault();
              }}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold ${
                tab === item.id
                  ? 'bg-white/15 text-white'
                  : 'text-neutral-200/70 hover:bg-white/10'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`analytics-panel-${tab}`}
          aria-labelledby={`analytics-tab-${tab}`}
          className="space-y-6"
        >
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                  label="Properties viewed"
                  value={overview.propertiesViewed}
                />
                <StatCard
                  label="Saved searches"
                  value={overview.savedSearches}
                />
                <StatCard
                  label="Applications sent"
                  value={overview.applicationsSent}
                />
                <StatCard label="Agreements" value={overview.agreements} />
                <StatCard
                  label="Payments made"
                  value={overview.paymentsCount}
                />
                <StatCard
                  label="Total paid"
                  value={overview.paymentsTotal.toLocaleString()}
                />
                <StatCard
                  label="Reviews received"
                  value={overview.reviewsCount}
                />
                <StatCard
                  label="Average rating"
                  value={
                    overview.averageRating === null
                      ? '—'
                      : overview.averageRating
                  }
                />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                {viewsChart}
                {paymentsChart}
              </div>
            </>
          )}

          {tab === 'activity' && (
            <>
              {viewsChart}
              <section className={CARD}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-white">
                    Recent activity
                  </h2>
                  <ExportButton
                    filename="activity.csv"
                    rows={activity}
                    columns={ACTIVITY_CSV_COLUMNS}
                  />
                </div>
                {activity.length === 0 ? (
                  <EmptyNote>
                    Nothing yet. Properties you open on the map and searches you
                    save will show up here.
                  </EmptyNote>
                ) : (
                  <DataTable
                    caption="Recent activity"
                    headers={['Date', 'Activity', 'Detail']}
                    rows={[...activity]
                      .reverse()
                      .slice(0, 50)
                      .map((entry) => [
                        formatDate(entry.at),
                        ACTIVITY_LABELS[entry.type],
                        entry.label ?? '—',
                      ])}
                  />
                )}
              </section>
            </>
          )}

          {tab === 'agreements' && (
            <section className={CARD}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-white">
                  Agreements
                </h2>
                <ExportButton
                  filename="agreements.csv"
                  rows={agreements}
                  columns={AGREEMENT_CSV_COLUMNS}
                />
              </div>
              {agreementsQuery.isLoading ? (
                <EmptyNote>Loading agreements…</EmptyNote>
              ) : agreementsQuery.isError ? (
                <EmptyNote>We could not load your agreements.</EmptyNote>
              ) : agreements.length === 0 ? (
                <EmptyNote>You have no agreements yet.</EmptyNote>
              ) : (
                <DataTable
                  caption="Agreements"
                  headers={[
                    'Agreement',
                    'Status',
                    'Monthly rent',
                    'Start',
                    'End',
                  ]}
                  rows={agreements.map((a) => [
                    a.title,
                    a.status,
                    a.monthlyRent ?? '—',
                    formatDate(a.startDate),
                    formatDate(a.endDate),
                  ])}
                />
              )}
            </section>
          )}

          {tab === 'payments' && (
            <>
              {paymentsChart}
              <section className={CARD}>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold text-white">
                    Payments
                  </h2>
                  <ExportButton
                    filename="payments.csv"
                    rows={payments}
                    columns={PAYMENT_CSV_COLUMNS}
                  />
                </div>
                {paymentsQuery.isLoading ? (
                  <EmptyNote>Loading payments…</EmptyNote>
                ) : paymentsQuery.isError ? (
                  <EmptyNote>We could not load your payments.</EmptyNote>
                ) : payments.length === 0 ? (
                  <EmptyNote>No payments yet.</EmptyNote>
                ) : (
                  <DataTable
                    caption="Payments"
                    headers={['Date', 'Amount', 'Status', 'Description']}
                    rows={payments.map((p) => [
                      formatDate(p.createdAt),
                      `${p.amount.toLocaleString()} ${p.currency}`,
                      p.status,
                      p.description ?? '—',
                    ])}
                  />
                )}
              </section>
            </>
          )}

          {tab === 'reviews' && (
            <section className={CARD}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-white">
                  Reviews received
                  {overview.averageRating !== null && (
                    <span className="ml-2 text-sm font-normal text-neutral-200/60">
                      average {overview.averageRating} / 5
                    </span>
                  )}
                </h2>
                <ExportButton
                  filename="reviews.csv"
                  rows={reviews}
                  columns={REVIEW_CSV_COLUMNS}
                />
              </div>
              {reviewsQuery.isLoading ? (
                <EmptyNote>Loading reviews…</EmptyNote>
              ) : reviewsQuery.isError ? (
                <EmptyNote>We could not load your reviews.</EmptyNote>
              ) : reviews.length === 0 ? (
                <EmptyNote>You have not received any reviews yet.</EmptyNote>
              ) : (
                <DataTable
                  caption="Reviews received"
                  headers={['Date', 'Rating', 'Comment']}
                  rows={reviews.map((r) => [
                    formatDate(r.createdAt),
                    `${r.rating} / 5`,
                    r.comment ?? '—',
                  ])}
                />
              )}
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
