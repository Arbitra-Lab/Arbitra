'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiClient } from '@/lib/api-client';
import { recordActivity } from '@/lib/activity-log';
import { PropertyDetailsModal } from '@/components/properties/PropertyDetailsModal';
import { SaveSearchButton } from '@/components/properties/SaveSearchButton';
import {
  DEFAULT_PROPERTY_FILTERS,
  filterProperties,
  parsePropertyFilters,
  serializePropertyFilters,
  type PropertySearchFilters,
  type SearchableProperty,
} from '@/lib/property-search';

// Leaflet needs `window`, so the map is only ever loaded in the browser.
const PropertyMap = dynamic(
  () => import('@/components/properties/PropertyMap'),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        className="rounded-2xl border border-border-subtle bg-surface p-8 text-center text-text-muted"
      >
        Loading map…
      </div>
    ),
  },
);

interface PropertyRecord extends SearchableProperty {
  id: string;
  title: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  currency?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | string | null;
  images?: Array<{ url: string; isPrimary?: boolean; sortOrder?: number }>;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

interface PropertyPageResponse {
  data: PropertyRecord[];
  meta?: { total?: number; page?: number; limit?: number };
}

function getPropertyPage(payload: unknown): PropertyPageResponse {
  const result = payload as Partial<PropertyPageResponse> | null;
  if (Array.isArray(result)) return { data: result as PropertyRecord[] };
  if (result && Array.isArray(result.data))
    return result as PropertyPageResponse;
  throw new Error('The property service returned an unexpected response.');
}

async function fetchProperties(
  signal: AbortSignal,
  availability?: { start: string; end: string },
): Promise<PropertyRecord[]> {
  const properties: PropertyRecord[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({ page: String(page), limit: '100' });
    if (availability?.start) {
      params.set('availabilityStart', availability.start);
    }
    if (availability?.end) {
      params.set('availabilityEnd', availability.end);
    }
    const { data } = await apiClient.get<
      PropertyPageResponse | PropertyRecord[]
    >(`/properties?${params}`, { signal });
    const result = getPropertyPage(data);
    properties.push(...result.data);
    if (result.data.length < 100) return properties;
    page += 1;
  }
}

function FilterFields({
  filters,
  onChange,
  amenities,
}: {
  filters: PropertySearchFilters;
  onChange: (next: PropertySearchFilters) => void;
  amenities: string[];
}) {
  const update = (patch: Partial<PropertySearchFilters>) =>
    onChange({ ...filters, ...patch });

  return (
    <div className="space-y-6">
      <section aria-labelledby="price-filter-heading">
        <h3 id="price-filter-heading" className="mb-3 font-semibold">
          Monthly price
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-text-muted">
            Minimum
            <input
              aria-label="Minimum monthly price"
              type="number"
              min="0"
              value={filters.priceMin}
              onChange={(event) => update({ priceMin: event.target.value })}
              placeholder="$0"
              className="mt-1 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-foreground"
            />
          </label>
          <label className="text-sm text-text-muted">
            Maximum
            <input
              aria-label="Maximum monthly price"
              type="number"
              min="0"
              value={filters.priceMax}
              onChange={(event) => update({ priceMax: event.target.value })}
              placeholder="No limit"
              className="mt-1 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-foreground"
            />
          </label>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-text-muted">
            Up to ${filters.priceMax || '10,000'}
            <input
              aria-label="Maximum price range"
              type="range"
              min="0"
              max="10000"
              step="100"
              value={Math.min(Number(filters.priceMax || 10000), 10000)}
              onChange={(event) =>
                update({
                  priceMax:
                    event.target.value === '10000' ? '' : event.target.value,
                })
              }
              className="mt-2 w-full accent-brand-blue"
            />
          </label>
          <label className="block text-xs text-text-muted">
            At least ${filters.priceMin || '0'}
            <input
              aria-label="Minimum price range"
              type="range"
              min="0"
              max="10000"
              step="100"
              value={Math.min(Number(filters.priceMin || 0), 10000)}
              onChange={(event) =>
                update({
                  priceMin:
                    event.target.value === '0' ? '' : event.target.value,
                })
              }
              className="mt-2 w-full accent-brand-blue"
            />
          </label>
        </div>
      </section>

      <section aria-labelledby="amenities-filter-heading">
        <h3 id="amenities-filter-heading" className="mb-3 font-semibold">
          Amenities
        </h3>
        {amenities.length ? (
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {amenities.map((amenity) => (
              <label key={amenity} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={filters.amenities.includes(amenity)}
                  onChange={(event) =>
                    update({
                      amenities: event.target.checked
                        ? [...filters.amenities, amenity]
                        : filters.amenities.filter((item) => item !== amenity),
                    })
                  }
                  className="accent-brand-blue"
                />
                {amenity}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Amenities will appear when listings are available.
          </p>
        )}
      </section>

      <section aria-labelledby="availability-filter-heading">
        <h3 id="availability-filter-heading" className="mb-3 font-semibold">
          Availability
        </h3>
        <label className="mb-3 block text-sm text-text-muted">
          Check-in
          <input
            aria-label="Availability start date"
            type="date"
            value={filters.availabilityStart}
            onChange={(event) =>
              update({ availabilityStart: event.target.value })
            }
            className="mt-1 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-foreground"
          />
        </label>
        <label className="block text-sm text-text-muted">
          Check-out
          <input
            aria-label="Availability end date"
            type="date"
            min={filters.availabilityStart || undefined}
            value={filters.availabilityEnd}
            onChange={(event) =>
              update({ availabilityEnd: event.target.value })
            }
            className="mt-1 w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-foreground"
          />
        </label>
        <p className="mt-2 text-xs text-text-muted">
          Listings must be available for every selected date.
        </p>
      </section>

      <section aria-labelledby="lease-filter-heading">
        <h3 id="lease-filter-heading" className="mb-3 font-semibold">
          Lease term
        </h3>
        <select
          aria-label="Lease term"
          value={filters.leaseTerm}
          onChange={(event) => update({ leaseTerm: event.target.value })}
          className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-foreground"
        >
          <option value="">Any term</option>
          <option value="long_term">Long term</option>
          <option value="short_term">Short term</option>
          <option value="hybrid">Hybrid</option>
          <option value="flexible">Flexible</option>
        </select>
      </section>

      <section aria-labelledby="pets-filter-heading">
        <h3 id="pets-filter-heading" className="mb-3 font-semibold">
          Pet policy
        </h3>
        <select
          aria-label="Pet policy"
          value={filters.petPolicy}
          onChange={(event) => update({ petPolicy: event.target.value })}
          className="w-full rounded-lg border border-border-subtle bg-background px-3 py-2 text-foreground"
        >
          <option value="">Any policy</option>
          <option value="pets_allowed">Pets allowed</option>
          <option value="no_pets">No pets</option>
        </select>
      </section>
    </div>
  );
}

function PropertyCard({ property }: { property: PropertyRecord }) {
  const image = property.images
    ?.slice()
    .sort(
      (left, right) =>
        Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary)) ||
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0),
    )[0]?.url;
  const location = [property.city, property.state, property.country]
    .filter(Boolean)
    .join(', ');

  return (
    <article className="overflow-hidden rounded-2xl border border-border-subtle bg-surface shadow-card">
      {image ? (
        // Use the URL supplied by the listing API; listings without a photo have a neutral placeholder.
        <img
          src={image}
          alt=""
          className="h-52 w-full bg-surface-raised object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-52 items-center justify-center bg-surface-raised text-sm text-text-muted"
        >
          No photo available
        </div>
      )}
      <div className="p-5">
        <p className="text-sm text-text-muted">
          {location || 'Location not provided'}
        </p>
        <h2 className="mt-1 text-lg font-semibold">{property.title}</h2>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm text-text-muted">
          {property.description ||
            'Contact the property manager for more details.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-text-muted">
          {property.bedrooms != null && <span>{property.bedrooms} beds</span>}
          {property.bathrooms != null && (
            <span>{property.bathrooms} baths</span>
          )}
          {property.area != null && <span>{property.area} m²</span>}
        </div>
        <p className="mt-4 text-xl font-bold">
          {property.currency || 'USD'} {Number(property.price).toLocaleString()}
          <span className="ml-1 text-sm font-normal text-text-muted">
            / month
          </span>
        </p>
      </div>
    </article>
  );
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [filters, setFilters] = useState(DEFAULT_PROPERTY_FILTERS);
  const [visibleFilters, setVisibleFilters] = useState(
    DEFAULT_PROPERTY_FILTERS,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [availabilityMatches, setAvailabilityMatches] = useState<{
    key: string;
    ids: Set<string>;
  } | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    const initial = parsePropertyFilters(
      new URLSearchParams(window.location.search),
    );
    setFilters(initial);
    setVisibleFilters(initial);
    initialized.current = true;

    const handlePopState = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const next = parsePropertyFilters(
        new URLSearchParams(window.location.search),
      );
      setFilters(next);
      setVisibleFilters(next);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const { availabilityStart: start, availabilityEnd: end } = visibleFilters;
    if (!start && !end) {
      setAvailabilityMatches(null);
      setAvailabilityError('');
      setAvailabilityLoading(false);
      return;
    }

    const controller = new AbortController();
    const key = `${start},${end}`;
    setAvailabilityLoading(true);
    setAvailabilityError('');
    fetchProperties(controller.signal, { start, end })
      .then((matches) => {
        setAvailabilityMatches({
          key,
          ids: new Set(matches.map((property) => property.id)),
        });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setAvailabilityError(
            cause instanceof Error
              ? cause.message
              : 'Unable to check property availability. Please try again.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setAvailabilityLoading(false);
      });
    return () => controller.abort();
  }, [visibleFilters.availabilityStart, visibleFilters.availabilityEnd]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetchProperties(controller.signal)
      .then(setProperties)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Unable to load properties. Please try again.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const updateFilters = useCallback((next: PropertySearchFilters) => {
    setFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setVisibleFilters(next), 200);
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    const params = serializePropertyFilters(
      filters,
      new URLSearchParams(window.location.search),
    );
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  }, [filters]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  const filteredProperties = useMemo(() => {
    const matches = filterProperties(properties, visibleFilters);
    const { availabilityStart, availabilityEnd } = visibleFilters;
    if (!availabilityStart && !availabilityEnd) return matches;

    const key = `${availabilityStart},${availabilityEnd}`;
    if (availabilityMatches?.key !== key) return [];
    return matches.filter((property) =>
      availabilityMatches.ids.has(property.id),
    );
  }, [availabilityMatches, properties, visibleFilters]);
  const hasAvailabilityFilter = Boolean(
    visibleFilters.availabilityStart || visibleFilters.availabilityEnd,
  );
  const checkingAvailability =
    hasAvailabilityFilter &&
    !availabilityError &&
    (availabilityLoading ||
      availabilityMatches?.key !==
        `${visibleFilters.availabilityStart},${visibleFilters.availabilityEnd}`);
  const amenityOptions = useMemo(
    () =>
      [
        ...new Set(
          properties.flatMap((property) =>
            (property.amenities ?? []).map((amenity) =>
              typeof amenity === 'string' ? amenity : (amenity.name ?? ''),
            ),
          ),
        ),
      ]
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right)),
    [properties],
  );
  const activeCount =
    Number(Boolean(filters.priceMin || filters.priceMax)) +
    filters.amenities.length +
    Number(Boolean(filters.availabilityStart || filters.availabilityEnd)) +
    Number(Boolean(filters.leaseTerm)) +
    Number(Boolean(filters.petPolicy));
  const clearFilters = () => updateFilters(DEFAULT_PROPERTY_FILTERS);
  const selectedProperty =
    filteredProperties.find((property) => property.id === selectedId) ?? null;
  const currentQuery = serializePropertyFilters(
    filters,
    new URLSearchParams(),
  ).toString();
  const handleSelect = (propertyId: string) => {
    setSelectedId(propertyId);
    const property = properties.find((item) => item.id === propertyId);
    recordActivity({
      type: 'property_viewed',
      refId: propertyId,
      label: property?.title,
    });
  };

  return (
    <main
      id="main-content"
      className="mx-auto min-h-screen max-w-7xl px-4 py-10 sm:px-6 lg:px-8"
    >
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-accent">
          Find your next home
        </p>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          Browse properties
        </h1>
        <p className="mt-3 max-w-2xl text-text-muted">
          Explore available listings and narrow your search with filters that
          fit your needs.
        </p>
      </header>

      <div className="mb-5 flex items-center justify-between gap-4">
        <p aria-live="polite" className="text-sm text-text-muted">
          {loading
            ? 'Loading properties…'
            : checkingAvailability
              ? 'Checking availability…'
              : `${filteredProperties.length} ${filteredProperties.length === 1 ? 'property' : 'properties'} found`}
        </p>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="rounded-lg border border-border-subtle bg-surface px-4 py-2 text-sm font-semibold lg:hidden"
        >
          Filters{activeCount ? ` (${activeCount})` : ''}
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden rounded-2xl border border-border-subtle bg-surface p-5 lg:block">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold">Filters</h2>
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm text-brand-accent"
            >
              Clear all
            </button>
          </div>
          <FilterFields
            filters={filters}
            onChange={updateFilters}
            amenities={amenityOptions}
          />
        </aside>

        <section aria-label="Property results">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Results view"
              className="inline-flex rounded-lg border border-border-subtle p-1"
            >
              {(['list', 'map'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  className={`rounded-md px-4 py-1.5 text-sm font-semibold capitalize ${
                    view === mode ? 'bg-brand-blue text-white' : ''
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <SaveSearchButton query={currentQuery} />
          </div>
          {loading || checkingAvailability ? (
            <div
              role="status"
              className="rounded-2xl border border-border-subtle bg-surface p-8 text-center text-text-muted"
            >
              {checkingAvailability
                ? 'Checking property availability…'
                : 'Loading property listings…'}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-400/40 bg-surface p-8 text-center"
            >
              <h2 className="font-semibold">We couldn’t load properties</h2>
              <p className="mt-2 text-sm text-text-muted">{error}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-4 rounded-lg bg-brand-blue px-4 py-2 font-semibold text-white"
              >
                Try again
              </button>
            </div>
          ) : availabilityError ? (
            <div
              role="alert"
              className="rounded-2xl border border-red-400/40 bg-surface p-8 text-center"
            >
              <h2 className="font-semibold">
                We couldn’t check property availability
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                {availabilityError}
              </p>
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="rounded-2xl border border-border-subtle bg-surface p-8 text-center">
              <h2 className="font-semibold">
                {properties.length
                  ? 'No properties match these filters'
                  : 'No properties available yet'}
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                {properties.length
                  ? 'Try adjusting your filters to see more listings.'
                  : 'Please check back later for new listings.'}
              </p>
              {properties.length > 0 && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 text-sm font-semibold text-brand-accent"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : view === 'map' ? (
            <PropertyMap
              properties={filteredProperties}
              onSelect={handleSelect}
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProperties.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          )}
        </section>
      </div>

      <PropertyDetailsModal
        property={selectedProperty}
        onClose={() => setSelectedId(null)}
      />

      {filtersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setFiltersOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filters-heading"
            className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-2xl border border-border-subtle bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="mobile-filters-heading" className="text-lg font-bold">
                Filters
              </h2>
              <button
                type="button"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
                className="rounded-lg px-3 py-2 text-sm"
              >
                Done
              </button>
            </div>
            <FilterFields
              filters={filters}
              onChange={updateFilters}
              amenities={amenityOptions}
            />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-lg border border-border-subtle px-4 py-3 font-semibold"
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                className="rounded-lg bg-brand-blue px-4 py-3 font-semibold text-white"
              >
                Show {filteredProperties.length} results
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
