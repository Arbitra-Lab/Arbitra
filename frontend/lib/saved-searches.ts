/**
 * Saved property searches, kept on this device (#151).
 *
 * A saved search is a name plus the query string the properties page already
 * uses for its filters, so re-running one is just opening
 * `/properties?<query>`.
 */

export interface SavedSearch {
  id: string;
  name: string;
  /** Query string without the leading `?`. */
  query: string;
  createdAt: string;
}

export const SAVED_SEARCHES_KEY = 'arbitra_saved_searches';
export const MAX_SAVED_SEARCHES = 20;
export const MAX_SEARCH_NAME_LENGTH = 60;
const MAX_QUERY_LENGTH = 1000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isSavedSearch(value: unknown): value is SavedSearch {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.query === 'string' &&
    typeof v.createdAt === 'string'
  );
}

export function readSavedSearches(
  storage: StorageLike | null = defaultStorage(),
): SavedSearch[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(SAVED_SEARCHES_KEY) ?? '[]',
    );
    return Array.isArray(parsed) ? parsed.filter(isSavedSearch) : [];
  } catch {
    return [];
  }
}

function write(storage: StorageLike | null, searches: SavedSearch[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(searches));
    return true;
  } catch {
    return false;
  }
}

export type SaveSearchResult =
  | { ok: true; searches: SavedSearch[]; saved: SavedSearch }
  | { ok: false; error: string };

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Save a search. Rejects blank/overlong names, duplicate names (case-insensitive) and a full list. */
export function addSavedSearch(
  input: { name: string; query: string },
  storage: StorageLike | null = defaultStorage(),
): SaveSearchResult {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Enter a name for this search.' };
  if (name.length > MAX_SEARCH_NAME_LENGTH) {
    return {
      ok: false,
      error: `Names can be at most ${MAX_SEARCH_NAME_LENGTH} characters.`,
    };
  }

  const query = input.query.trim().replace(/^\?/, '');
  if (query.length > MAX_QUERY_LENGTH) {
    return { ok: false, error: 'This search is too long to save.' };
  }

  const existing = readSavedSearches(storage);
  if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: 'You already have a search with that name.' };
  }
  if (existing.length >= MAX_SAVED_SEARCHES) {
    return {
      ok: false,
      error: `You can save up to ${MAX_SAVED_SEARCHES} searches. Remove one first.`,
    };
  }

  const saved: SavedSearch = {
    id: newId(),
    name,
    query,
    createdAt: new Date().toISOString(),
  };
  const searches = [...existing, saved];
  if (!write(storage, searches)) {
    return {
      ok: false,
      error: 'Could not save: browser storage is unavailable.',
    };
  }
  return { ok: true, searches, saved };
}

/** Remove a search by id. Unknown ids leave the list unchanged. */
export function removeSavedSearch(
  id: string,
  storage: StorageLike | null = defaultStorage(),
): SavedSearch[] {
  const searches = readSavedSearches(storage).filter((s) => s.id !== id);
  write(storage, searches);
  return searches;
}

/** The properties-page URL that re-runs a saved search. */
export function savedSearchHref(search: SavedSearch): string {
  return search.query ? `/properties?${search.query}` : '/properties';
}
