'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { en, es, fr, type TranslationKeys } from './translations';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupportedLocale = 'en' | 'es' | 'fr';

export interface LocaleOption {
  code: SupportedLocale;
  label: string;
  nativeLabel: string;
  dir: 'ltr' | 'rtl';
}

export const LOCALE_OPTIONS: LocaleOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español', dir: 'ltr' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', dir: 'ltr' },
];

const TRANSLATIONS: Record<SupportedLocale, TranslationKeys> = { en, es, fr };

// ─── Store ───────────────────────────────────────────────────────────────────

interface I18nState {
  locale: SupportedLocale;
}

interface I18nActions {
  setLocale: (locale: SupportedLocale) => void;
}

type I18nStore = I18nState & I18nActions;

export const useI18nStore = create<I18nStore>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
    }),
    { name: 'arbitra-locale' },
  ),
);

// ─── Hook ────────────────────────────────────────────────────────────────────

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeyOf<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

type TranslationPath = NestedKeyOf<TranslationKeys>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

/**
 * Primary i18n hook. Returns a `t()` function and locale helpers.
 *
 * @example
 * const { t, locale, setLocale } = useTranslation();
 * <p>{t('common.save')}</p>
 */
export function useTranslation() {
  const { locale, setLocale } = useI18nStore();
  const dict = TRANSLATIONS[locale] as unknown as Record<string, unknown>;

  function t(key: TranslationPath): string {
    return getNestedValue(dict, key);
  }

  return { t, locale, setLocale, localeOptions: LOCALE_OPTIONS };
}
