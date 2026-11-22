'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

export const ANALYTICS_SECTIONS = [
  'usage',
  'revenue',
  'arbiters',
  'users',
  'disputes',
  'health',
] as const;

export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number];
export type AnalyticsGroupBy = 'day' | 'week' | 'month';

export interface AdminAnalyticsFilters {
  days: number;
  groupBy: AnalyticsGroupBy;
  sections: AnalyticsSection[];
  compare: boolean;
}

export interface TrendPoint {
  bucket: string;
  count: number;
}

export interface AdminAnalyticsReport {
  generatedAt: string;
  range: { from: string; to: string; days: number; groupBy: string };
  usage?: {
    totals: Record<string, number>;
    trends: Record<string, TrendPoint[]>;
  };
  revenue?: {
    totalAmount: number;
    transactionCount: number;
    byCategory: Array<{ category: string; amount: number; count: number }>;
    trend: TrendPoint[];
  };
  arbiters?: {
    total: number;
    active: number;
    averageReputation: number;
    top: Array<{
      arbiterId: number;
      active: boolean;
      reputationScore: number;
      votesInRange: number;
      weightedVotesInRange: number;
      successRate: number;
    }>;
  };
  users?: {
    newUsers: number;
    activeUsers: number;
    retainedUsers: number;
    retentionRate: number;
    byRole: Array<{ role: string; count: number }>;
    trend: TrendPoint[];
  };
  disputes?: {
    total: number;
    resolutionRate: number;
    medianResolutionHours: number;
    byStatus: Array<{ key: string; count: number }>;
    byType: Array<{ key: string; count: number }>;
    byPriority: Array<{ key: string; count: number }>;
    averageWeightedVotes: number;
  };
  health?: {
    status: string;
    failedPaymentRate: number;
    slaBreachRate: number;
    escalationCount: number;
    activeArbiters: number;
  };
  comparison?: Record<string, number | string>;
}

export interface AdminAnalyticsResult {
  report: AdminAnalyticsReport;
  source: 'live' | 'sample';
}

const queryKey = ['admin-analytics'] as const;

function buildQuery(filters: AdminAnalyticsFilters): string {
  const params = new URLSearchParams({
    days: String(filters.days),
    groupBy: filters.groupBy,
    compare: String(filters.compare),
  });
  for (const section of filters.sections) {
    params.append('sections', section);
  }
  return params.toString();
}

function sampleReport(filters: AdminAnalyticsFilters): AdminAnalyticsReport {
  const to = new Date();
  const from = new Date(to.getTime() - (filters.days - 1) * 86_400_000);
  const base: AdminAnalyticsReport = {
    generatedAt: to.toISOString(),
    range: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: filters.days,
      groupBy: filters.groupBy,
    },
  };

  if (filters.sections.includes('usage')) {
    base.usage = {
      totals: {
        disputes: 42,
        agreements: 118,
        weightedVotes: 96,
        transactions: 311,
      },
      trends: {
        disputes: [
          { bucket: from.toISOString().slice(0, 10), count: 12 },
          { bucket: to.toISOString().slice(0, 10), count: 30 },
        ],
      },
    };
  }
  if (filters.sections.includes('revenue')) {
    base.revenue = {
      totalAmount: 1845000,
      transactionCount: 186,
      byCategory: [
        { category: 'rent', amount: 1240000, count: 120 },
        { category: 'security_deposit', amount: 605000, count: 66 },
      ],
      trend: [{ bucket: to.toISOString().slice(0, 10), count: 1845000 }],
    };
  }
  if (filters.sections.includes('arbiters')) {
    base.arbiters = {
      total: 12,
      active: 10,
      averageReputation: 92.4,
      top: [
        {
          arbiterId: 1,
          active: true,
          reputationScore: 96,
          votesInRange: 18,
          weightedVotesInRange: 42,
          successRate: 0.91,
        },
      ],
    };
  }
  if (filters.sections.includes('users')) {
    base.users = {
      newUsers: 67,
      activeUsers: 154,
      retainedUsers: 63,
      retentionRate: 0.41,
      byRole: [
        { role: 'user', count: 58 },
        { role: 'admin', count: 9 },
      ],
      trend: [{ bucket: to.toISOString().slice(0, 10), count: 67 }],
    };
  }
  if (filters.sections.includes('disputes')) {
    base.disputes = {
      total: 42,
      resolutionRate: 0.78,
      medianResolutionHours: 36,
      byStatus: [
        { key: 'RESOLVED', count: 28 },
        { key: 'OPEN', count: 9 },
        { key: 'UNDER_REVIEW', count: 5 },
      ],
      byType: [{ key: 'RENT_PAYMENT', count: 21 }],
      byPriority: [
        { key: 'HIGH', count: 14 },
        { key: 'NORMAL', count: 20 },
        { key: 'LOW', count: 8 },
      ],
      averageWeightedVotes: 2.3,
    };
  }
  if (filters.sections.includes('health')) {
    base.health = {
      status: 'healthy',
      failedPaymentRate: 0.03,
      slaBreachRate: 0.05,
      escalationCount: 4,
      activeArbiters: 10,
    };
  }
  if (filters.compare) {
    base.comparison = {
      disputes: 37,
      completedPayments: 160,
      newUsers: 55,
      weightedVotes: 81,
    };
  }
  return base;
}

export function useAdminAnalytics(
  filters: AdminAnalyticsFilters,
  enabled = true,
) {
  return useQuery<AdminAnalyticsResult>({
    enabled,
    queryKey: [...queryKey, filters],
    queryFn: async () => {
      try {
        const { data } = await apiClient.get<AdminAnalyticsReport>(
          `/analytics/admin/dashboard?${buildQuery(filters)}`,
        );
        if (data && typeof data === 'object' && 'range' in data) {
          return { report: data, source: 'live' };
        }
      } catch {
        // Fall back to sample data so the dashboard remains usable offline.
      }
      return { report: sampleReport(filters), source: 'sample' };
    },
  });
}

export async function downloadAdminAnalyticsCsv(
  filters: AdminAnalyticsFilters,
): Promise<void> {
  const { data } = await apiClient.get<string>(
    `/analytics/admin/export?${buildQuery(filters)}`,
    { headers: { Accept: 'text/csv' }, retries: 0 },
  );

  const blob = new Blob([data], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arbitra-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
