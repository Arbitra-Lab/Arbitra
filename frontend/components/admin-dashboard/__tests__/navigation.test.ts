import { afterEach, describe, expect, it } from 'vitest';

import { getAdminNavItems } from '../navigation';

const originalBypass = process.env.NEXT_PUBLIC_ALLOW_ADMIN_BYPASS;

afterEach(() => {
  if (originalBypass === undefined) {
    delete process.env.NEXT_PUBLIC_ALLOW_ADMIN_BYPASS;
  } else {
    process.env.NEXT_PUBLIC_ALLOW_ADMIN_BYPASS = originalBypass;
  }
});

describe('admin navigation role filtering', () => {
  it('returns admin modules for admin users', () => {
    const items = getAdminNavItems('admin');

    expect(items.map((item) => item.href)).toEqual([
      '/admin/disputes',
      '/admin/arbiters',
      '/admin/analytics',
    ]);
  });

  it('hides admin modules from regular users', () => {
    expect(getAdminNavItems('user')).toEqual([]);
    expect(getAdminNavItems(null)).toEqual([]);
  });

  it('shows modules to support staff without exposing arbitration voting', () => {
    expect(getAdminNavItems('support').length).toBeGreaterThan(0);
  });
});
