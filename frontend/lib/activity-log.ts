/**
 * Small on-device activity log feeding the personal analytics dashboard (#156).
 *
 * Only events the server has no per-user record of (properties viewed, searches
 * saved) are kept here. Storage is injectable so the log can be tested, and
 * every storage access is wrapped: private browsing or a full quota must never
 * break the feature that recorded the event.
 */

export type ActivityType =
  | 'property_viewed'
  | 'search_saved'
  | 'application_sent';

export interface ActivityEntry {
  type: ActivityType;
  /** Id of the thing acted on (property id, saved search id, ...). */
  refId?: string;
  /** Short human label shown in the activity tab. */
  label?: string;
  /** ISO timestamp. */
  at: string;
}

export const ACTIVITY_STORAGE_KEY = 'arbitra_activity_log';
export const MAX_ACTIVITY_ENTRIES = 500;
const MAX_LABEL_LENGTH = 120;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const ACTIVITY_TYPES: ReadonlySet<string> = new Set<ActivityType>([
  'property_viewed',
  'search_saved',
  'application_sent',
]);

function isEntry(value: unknown): value is ActivityEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.type === 'string' &&
    ACTIVITY_TYPES.has(entry.type) &&
    typeof entry.at === 'string' &&
    !Number.isNaN(Date.parse(entry.at))
  );
}

/** Stored entries, oldest first. Corrupt or foreign data is ignored, never thrown. */
export function readActivity(
  storage: StorageLike | null = defaultStorage(),
): ActivityEntry[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(ACTIVITY_STORAGE_KEY) ?? '[]',
    );
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

/** Append an event, keeping only the newest {@link MAX_ACTIVITY_ENTRIES}. */
export function recordActivity(
  entry: Omit<ActivityEntry, 'at'> & { at?: string },
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  const next: ActivityEntry = {
    type: entry.type,
    at: entry.at ?? new Date().toISOString(),
    ...(entry.refId ? { refId: String(entry.refId).slice(0, 100) } : {}),
    ...(entry.label
      ? { label: String(entry.label).slice(0, MAX_LABEL_LENGTH) }
      : {}),
  };
  try {
    const entries = [...readActivity(storage), next].slice(
      -MAX_ACTIVITY_ENTRIES,
    );
    storage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable or full: analytics are best effort.
  }
}
