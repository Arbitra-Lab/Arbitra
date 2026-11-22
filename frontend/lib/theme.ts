/**
 * Pure theme helpers shared by the pre-paint script and the settings UI (#27).
 *
 * This module must stay dependency-free so the same rules can be mirrored in
 * the tiny inline script that runs before React hydrates. The builder below is
 * the single source of truth for that script's logic.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'arbitra_user_preferences';
export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;

export function parseThemePreference(value: unknown): ThemePreference {
  return typeof value === 'string' &&
    (THEME_PREFERENCES as readonly string[]).includes(value)
    ? (value as ThemePreference)
    : 'system';
}

/** Resolve "system" using the caller's media query result. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Read the theme preference out of a stored preferences JSON blob. */
export function themeFromStorage(raw: string | null): ThemePreference {
  if (!raw) return 'system';
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parseThemePreference(
        (parsed as { appearanceTheme?: unknown }).appearanceTheme,
      );
    }
  } catch {
    // Malformed storage falls back to the safe default.
  }
  return 'system';
}

/**
 * Compact, self-contained pre-paint script. It deliberately avoids template
 * interpolation of user data: the storage key is a fixed literal.
 */
export function buildThemeScript(
  storageKey: string = THEME_STORAGE_KEY,
): string {
  if (!/^[A-Za-z0-9_]+$/.test(storageKey)) {
    throw new Error('Theme storage key must be alphanumeric');
  }
  return `(function(){try{var k=${JSON.stringify(storageKey)},p="system",r=localStorage.getItem(k);if(r){var o=JSON.parse(r);if(o&&(o.appearanceTheme==="light"||o.appearanceTheme==="dark"||o.appearanceTheme==="system"))p=o.appearanceTheme}var d=p==="dark"||(p==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches),e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";e.setAttribute("data-theme",p);e.setAttribute("data-resolved-theme",d?"dark":"light")}catch(e){}})()`;
}

/** Apply a resolved theme to the document. Used by the settings UI. */
export function applyThemeDocument(
  documentRef: Document,
  preference: ThemePreference,
  prefersDark: boolean,
): void {
  const resolved = resolveTheme(preference, prefersDark);
  documentRef.documentElement.classList.toggle('dark', resolved === 'dark');
  documentRef.documentElement.style.colorScheme = resolved;
  documentRef.documentElement.setAttribute('data-theme', preference);
  documentRef.documentElement.setAttribute('data-resolved-theme', resolved);
}
