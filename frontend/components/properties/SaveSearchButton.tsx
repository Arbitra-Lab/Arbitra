'use client';

import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { addSavedSearch, MAX_SEARCH_NAME_LENGTH } from '@/lib/saved-searches';
import { recordActivity } from '@/lib/activity-log';
import { notify } from '@/components/ui/toast';

interface SaveSearchButtonProps {
  /** The current filters as a query string (what the properties page puts in the URL). */
  query: string;
}

/** Saves the current filters under a name; saved searches are managed in Settings → Notifications. */
export function SaveSearchButton({ query }: SaveSearchButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = addSavedSearch({ name, query });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    recordActivity({
      type: 'search_saved',
      refId: result.saved.id,
      label: result.saved.name,
    });
    notify.success(`Saved search “${result.saved.name}”`);
    setName('');
    setError(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold"
      >
        <Bookmark aria-hidden="true" className="h-4 w-4" />
        Save search
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-start gap-2"
      noValidate
    >
      <div>
        <label htmlFor="saved-search-name" className="sr-only">
          Name for this search
        </label>
        <input
          id="saved-search-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={MAX_SEARCH_NAME_LENGTH}
          placeholder="Name this search"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'saved-search-error' : undefined}
          className="rounded-lg border border-border-subtle bg-background px-3 py-2 text-sm text-foreground"
        />
        {error && (
          <p
            id="saved-search-error"
            role="alert"
            className="mt-1 text-xs text-red-500"
          >
            {error}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white"
      >
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="rounded-lg px-3 py-2 text-sm"
      >
        Cancel
      </button>
    </form>
  );
}
