'use client';

import { Award, BarChart3, Gavel } from 'lucide-react';
import type { ComponentType } from 'react';

import { canAccessAdmin } from '@/lib/admin-access';

export type AdminAppRole = 'admin';

export type AdminNavItem = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  href: string;
  visibleFor: AdminAppRole[];
};

const adminNavItems: AdminNavItem[] = [
  {
    icon: Gavel,
    label: 'Disputes Dashboard',
    href: '/admin/disputes',
    visibleFor: ['admin'],
  },
  {
    icon: Award,
    label: 'Arbiters Management',
    href: '/admin/arbiters',
    visibleFor: ['admin'],
  },
  {
    icon: BarChart3,
    label: 'Platform Analytics',
    href: '/admin/analytics',
    visibleFor: ['admin'],
  },
];

function findBestNavMatch(pathname: string) {
  return [...adminNavItems]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => pathname.startsWith(item.href));
}

export function getAdminNavItems(
  role: string | null | undefined,
): AdminNavItem[] {
  if (!canAccessAdmin(role)) return [];
  return adminNavItems;
}

export function getAdminPageTitle(pathname: string): string {
  const matched = findBestNavMatch(pathname);
  if (matched) return matched.label;
  return pathname === '/admin' ? 'Admin' : 'Admin Panel';
}

export function getAdminBreadcrumbItems(pathname: string): Array<{
  label: string;
  href?: string;
}> {
  if (pathname === '/admin') {
    return [{ label: 'Admin' }];
  }

  const matched = findBestNavMatch(pathname);
  if (matched) {
    return [{ label: 'Admin', href: '/admin' }, { label: matched.label }];
  }

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
    );

  return segments.map((segment, index) => ({
    label: segment,
    href:
      index === segments.length - 1
        ? undefined
        : `/${pathname
            .split('/')
            .filter(Boolean)
            .slice(0, index + 1)
            .join('/')}`,
  }));
}
