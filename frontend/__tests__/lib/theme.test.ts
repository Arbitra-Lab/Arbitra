import { describe, expect, it } from 'vitest';
import {
  applyThemeDocument,
  buildThemeScript,
  parseThemePreference,
  resolveTheme,
  themeFromStorage,
} from '@/lib/theme';

describe('theme helpers (#27)', () => {
  it('parses only supported preferences and falls back to system', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
    expect(parseThemePreference('sepia')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference(42)).toBe('system');
  });

  it('resolves system preference from the media query result', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('reads the theme from stored preferences and tolerates corrupt data', () => {
    expect(themeFromStorage('{"appearanceTheme":"dark"}')).toBe('dark');
    expect(themeFromStorage('{"appearanceTheme":"bogus"}')).toBe('system');
    expect(themeFromStorage('not json')).toBe('system');
    expect(themeFromStorage(null)).toBe('system');
    expect(themeFromStorage('[]')).toBe('system');
  });

  it('builds a pre-paint script with the fixed storage key', () => {
    const script = buildThemeScript();
    expect(script).toContain('arbitra_user_preferences');
    expect(script).toContain('prefers-color-scheme: dark');
    expect(script).toContain('data-resolved-theme');
    expect(buildThemeScript('custom_key')).toContain('custom_key');
    expect(() => buildThemeScript('bad";key')).toThrow(/alphanumeric/);
  });

  it('applies theme attributes to the document element', () => {
    document.documentElement.className = '';
    applyThemeDocument(document, 'system', true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('system');
    expect(document.documentElement.getAttribute('data-resolved-theme')).toBe(
      'dark',
    );
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyThemeDocument(document, 'light', true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
