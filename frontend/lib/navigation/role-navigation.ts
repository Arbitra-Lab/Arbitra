/**
 * Role-based navigation utilities
 * Maps user roles to their respective dashboard routes
 */

export type UserRole = 'admin' | 'super_admin' | 'support' | 'auditor' | 'user';

/**
 * Dashboard route mapping for each role
 */
export const DASHBOARD_ROUTES: Record<UserRole, string> = {
  admin: '/admin',
  super_admin: '/admin',
  support: '/admin',
  auditor: '/admin',
  user: '/user',
};

/**
 * Get the dashboard route for a given role
 */
export function getDashboardRoute(role: UserRole | null | undefined): string {
  if (!role) {
    return '/'; // Default to landing page if no role
  }

  return DASHBOARD_ROUTES[role] || '/';
}

/**
 * Navigate to the appropriate dashboard based on role
 */
export function navigateToDashboard(role: UserRole | null | undefined): void {
  const route = getDashboardRoute(role);
  window.location.href = route;
}
