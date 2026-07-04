/**
 * Barrel export for all domain stores and selectors.
 *
 * Import from `@/store` instead of reaching into individual files:
 *   import { useAuthStore, useUIStore, selectUser } from '@/store';
 */

// ── Stores ───────────────────────────────────────────────────────────────────
export { useAuthStore, useAuth } from './authStore';
export type { AuthStore, User } from './authStore';

export { useNotificationStore, selectUnreadCount } from './notificationStore';
export type { NotificationStore } from './notificationStore';

export { useUIStore } from './ui-store';
export type { UIStore, ThemeMode, ModalState, Toast } from './ui-store';

export { useLoadingStore, LOADING_KEYS } from './loading-store';
export type { LoadingStore, LoadingKey } from './loading-store';

export { useLoading, withLoading } from '../hooks/use-loading';

export { useErrorStore, useError } from './errorStore';
export type {
  ErrorStore,
  GlobalError,
  GlobalErrorCategory,
  GlobalErrorSeverity,
} from './errorStore';

// ── Selectors ────────────────────────────────────────────────────────────────
export {
  selectUser,
  selectIsAuthenticated,
  selectAuthLoading,
  selectUserRole,
  selectAccessToken,
  selectNotifications,
  selectUnreadNotifications,
  selectNotificationsByType,
  selectTheme,
  selectSidebarOpen,
  selectSidebarCollapsed,
  selectActiveModal,
  selectToasts,
  selectGlobalLoading,
  selectIsOnline,
  selectIsLoadingKey,
  selectAnyLoading,
} from './selectors';

// ── Middleware ────────────────────────────────────────────────────────────────
export { withMiddleware } from './middleware';
