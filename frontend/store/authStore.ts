'use client';

import { create } from 'zustand';
import { withMiddleware } from './middleware';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'user';
  avatar?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  walletAddress: string | null;
}

interface AuthActions {
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string, user: User) => void;
  setWalletAddress: (address: string | null) => void;
  hydrate: () => void;
}

export type AuthStore = AuthState & AuthActions;

// ─── Constants ───────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEYS = {
  ACCESS_TOKEN: 'arbitra_access_token',
  REFRESH_TOKEN: 'arbitra_refresh_token',
  USER: 'arbitra_user',
  WALLET_ADDRESS: 'arbitra_wallet_address',
} as const;

const AUTH_COOKIE_NAME = 'arbitra_auth_token';

// ─── Cookie Helpers ──────────────────────────────────────────────────────────

function setAuthCookie(token: string) {
  document.cookie = `${AUTH_COOKIE_NAME}=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
}

function removeAuthCookie() {
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}

// ─── Storage Helpers ─────────────────────────────────────────────────────────

function readStoredAuth(): Omit<AuthState, 'loading'> {
  if (typeof window === 'undefined') {
    return {
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      walletAddress: null,
    };
  }

  try {
    const storedAccessToken = localStorage.getItem(
      AUTH_STORAGE_KEYS.ACCESS_TOKEN,
    );
    const storedRefreshToken = localStorage.getItem(
      AUTH_STORAGE_KEYS.REFRESH_TOKEN,
    );
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEYS.USER);
    const storedWalletAddress = localStorage.getItem(
      AUTH_STORAGE_KEYS.WALLET_ADDRESS,
    );

    if (storedAccessToken && storedUser) {
      return {
        user: JSON.parse(storedUser) as User,
        accessToken: storedAccessToken,
        refreshToken: storedRefreshToken,
        isAuthenticated: true,
        walletAddress: storedWalletAddress,
      };
    }
  } catch {
    // Corrupted storage — clear and start fresh
    localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
    localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
    localStorage.removeItem(AUTH_STORAGE_KEYS.USER);
    localStorage.removeItem(AUTH_STORAGE_KEYS.WALLET_ADDRESS);
    removeAuthCookie();
  }

  return {
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    walletAddress: null,
  };
}

function clearStorage() {
  localStorage.removeItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN);
  localStorage.removeItem(AUTH_STORAGE_KEYS.USER);
  localStorage.removeItem(AUTH_STORAGE_KEYS.WALLET_ADDRESS);
  removeAuthCookie();
}

function persistAuth(accessToken: string, refreshToken: string, user: User) {
  localStorage.setItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
  localStorage.setItem(AUTH_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
  localStorage.setItem(AUTH_STORAGE_KEYS.USER, JSON.stringify(user));
  setAuthCookie(accessToken);
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  withMiddleware(
    (set, get) => ({
      // Initial state — SSR-safe defaults; call hydrate() on client mount
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      loading: true,
      walletAddress: null,

      /**
       * Hydrate from localStorage on client mount.
       * Should be called once from the root layout/component.
       */
      hydrate: () => {
        const stored = readStoredAuth();
        set((state) => {
          let user = stored.user;
          // FORCED TO ADMIN FOR DEVELOPMENT - Global bypass for all admin pages
          if (user && process.env.NODE_ENV !== 'production') {
            user = { ...user, role: 'admin' };
          }
          state.user = user;
          state.accessToken = stored.accessToken;
          state.refreshToken = stored.refreshToken;
          state.isAuthenticated = stored.isAuthenticated;
          state.walletAddress = stored.walletAddress;
          state.loading = false;
        });
      },

      /**
       * Directly set tokens & user (useful after registration or
       * when the backend response is already available).
       */
      setTokens: (accessToken: string, refreshToken: string, user: User) => {
        // FORCED TO ADMIN FOR DEVELOPMENT - Global bypass for all admin pages
        let finalUser = user;
        if (user && process.env.NODE_ENV !== 'production') {
          finalUser = { ...user, role: 'admin' };
        }
        persistAuth(accessToken, refreshToken, finalUser);
        set((state) => {
          state.user = finalUser;
          state.accessToken = accessToken;
          state.refreshToken = refreshToken;
          state.isAuthenticated = true;
          state.loading = false;
        });
      },

      /**
       * Set wallet address and persist to localStorage.
       */
      setWalletAddress: (address: string | null) => {
        if (address) {
          localStorage.setItem(AUTH_STORAGE_KEYS.WALLET_ADDRESS, address);
        } else {
          localStorage.removeItem(AUTH_STORAGE_KEYS.WALLET_ADDRESS);
        }
        set((state) => {
          state.walletAddress = address;
        });
      },

      /**
       * Login with email/password — calls the backend auth endpoint.
       */
      login: async (
        email: string,
      ): Promise<{ success: boolean; error?: string }> => {
        // --- REAL AUTHENTICATION LOGIC (Commented out for development) ---
        /*
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return {
              success: false,
              error: errorData.message || 'Invalid credentials. Please try again.',
            };
          }

          const data = await response.json();
          get().setTokens(data.accessToken, data.refreshToken, data.user);
          return { success: true };
        } catch {
          return {
            success: false,
            error: 'Network error. Please check your connection.',
          };
        }
        */

        // DEV BYPASS: map demo emails to roles for local testing.
        const normalizedEmail = (email || 'dev@arbitra.local').toLowerCase();
        const inferredRole: User['role'] = normalizedEmail.includes('admin')
          ? 'admin'
          : 'user';

        get().setTokens('mock-access-token', 'mock-refresh-token', {
          id: 'dev-123',
          email: normalizedEmail,
          firstName:
            inferredRole.charAt(0).toUpperCase() + inferredRole.slice(1),
          lastName: 'User',
          role: inferredRole,
        });
        return { success: true };
      },

      /**
       * Logout — clears tokens from storage, cookie, and state.
       */
      logout: async () => {
        const token = localStorage.getItem(AUTH_STORAGE_KEYS.ACCESS_TOKEN);

        // Best-effort call to backend logout
        if (token) {
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch {
            // Silently fail — we still clear local state
          }
        }

        clearStorage();

        set((state) => {
          state.user = null;
          state.accessToken = null;
          state.refreshToken = null;
          state.isAuthenticated = false;
          state.walletAddress = null;
          state.loading = false;
        });
      },
    }),
    'auth',
  ),
);

// ─── Convenience Hook (backward-compatible with old AuthContext) ─────────────

export const useAuth = useAuthStore;
