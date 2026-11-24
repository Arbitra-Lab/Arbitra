'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SettingsCard } from './SettingsCard';
import { notify } from '@/components/ui/toast';
import {
  readSavedSearches,
  removeSavedSearch,
  savedSearchHref,
  type SavedSearch,
} from '@/lib/saved-searches';

/** Saved property searches: run again or remove. New ones are saved from the properties page. */
export function SavedSearchesPanel() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    setSearches(readSavedSearches());
  }, []);

  const remove = (search: SavedSearch) => {
    setSearches(removeSavedSearch(search.id));
    notify.success(`Removed “${search.name}”`);
  };

  return (
    <SettingsCard
      title="Saved searches"
      description="Property searches you saved. Run one again or remove it."
    >
      {searches.length === 0 ? (
        <p className="text-sm text-neutral-200/60">
          No saved searches yet. Use “Save search” on the{' '}
          <Link href="/properties" className="underline">
            properties page
          </Link>{' '}
          to keep one.
        </p>
      ) : (
        <ul className="divide-y divide-white/10">
          {searches.map((search) => (
            <li
              key={search.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">{search.name}</p>
                <p className="text-xs text-neutral-200/50">
                  Saved {new Date(search.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Link
                  href={savedSearchHref(search)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Run search
                </Link>
                <button
                  type="button"
                  onClick={() => remove(search)}
                  aria-label={`Remove saved search ${search.name}`}
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
