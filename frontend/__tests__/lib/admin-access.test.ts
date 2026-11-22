import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canAccessAdmin,
  isAdminBypassEnabled,
  isArbitrationAdmin,
} from '@/lib/admin-access';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('admin access controls', () => {
  it('allows the documented admin roles', () => {
    expect(canAccessAdmin('admin')).toBe(true);
    expect(canAccessAdmin('SUPER_ADMIN')).toBe(true);
    expect(canAccessAdmin('support')).toBe(true);
    expect(canAccessAdmin('auditor')).toBe(true);
  });

  it('rejects regular users and missing roles', () => {
    expect(canAccessAdmin('user')).toBe(false);
    expect(canAccessAdmin(null)).toBe(false);
    expect(canAccessAdmin(undefined)).toBe(false);
  });

  it('restricts arbitration actions to admin, super admin and auditor', () => {
    expect(isArbitrationAdmin('admin')).toBe(true);
    expect(isArbitrationAdmin('auditor')).toBe(true);
    expect(isArbitrationAdmin('support')).toBe(false);
    expect(isArbitrationAdmin('user')).toBe(false);
  });

  it('honors an explicit dev-only bypass', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('NEXT_PUBLIC_ALLOW_ADMIN_BYPASS', 'true');

    expect(isAdminBypassEnabled()).toBe(true);
    expect(canAccessAdmin('user')).toBe(true);
    expect(isArbitrationAdmin('user')).toBe(true);
  });

  it('ignores the bypass in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_ALLOW_ADMIN_BYPASS', 'true');

    expect(isAdminBypassEnabled()).toBe(false);
    expect(canAccessAdmin('user')).toBe(false);
    expect(isArbitrationAdmin('user')).toBe(false);
  });
});
