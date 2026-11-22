/**
 * Shared admin authorization checks for client-side route guards.
 *
 * Production always uses the authenticated user's role. Local and test
 * environments can opt into an explicit bypass with
 * NEXT_PUBLIC_ALLOW_ADMIN_BYPASS=true; the bypass is compiled out of
 * production because NODE_ENV must also be different from "production".
 */

export const ADMIN_ROLES = [
  'admin',
  'super_admin',
  'support',
  'auditor',
] as const;

export function isAdminBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_ALLOW_ADMIN_BYPASS === 'true'
  );
}

export function canAccessAdmin(role: string | null | undefined): boolean {
  if (isAdminBypassEnabled()) return true;
  if (!role) return false;
  return (ADMIN_ROLES as readonly string[]).includes(role.toLowerCase());
}

export function isArbitrationAdmin(role: string | null | undefined): boolean {
  if (isAdminBypassEnabled()) return true;
  if (!role) return false;
  return ['admin', 'super_admin', 'auditor'].includes(role.toLowerCase());
}
