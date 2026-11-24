'use client';

import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';

export interface PropertyDetails {
  id: string;
  title: string;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  price?: number | string;
  currency?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  area?: number | string | null;
  amenities?: Array<string | { name?: string }>;
  images?: Array<{ url: string; isPrimary?: boolean; sortOrder?: number }>;
}

interface PropertyDetailsModalProps {
  property: PropertyDetails | null;
  onClose: () => void;
}

const MOBILE_QUERY = '(max-width: 767px)';

/** True on phone-sized screens; false on the server and before the first effect. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return isMobile;
}

function amenityNames(property: PropertyDetails): string[] {
  return (property.amenities ?? [])
    .map((amenity) =>
      typeof amenity === 'string' ? amenity : (amenity.name ?? ''),
    )
    .filter(Boolean);
}

function PropertySummary({ property }: { property: PropertyDetails }) {
  const image = [...(property.images ?? [])].sort(
    (a, b) =>
      Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) ||
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  )[0]?.url;
  const location = [property.city, property.state, property.country]
    .filter(Boolean)
    .join(', ');
  const amenities = amenityNames(property);
  const price = Number(property.price);

  return (
    <div>
      {image ? (
        // The listing API supplies the URL; listings without a photo get a neutral placeholder below.
        <img
          src={image}
          alt=""
          className="h-48 w-full rounded-xl bg-surface-raised object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-48 items-center justify-center rounded-xl bg-surface-raised text-sm text-text-muted"
        >
          No photo available
        </div>
      )}

      <p className="mt-4 text-sm text-text-muted">
        {location || 'Location not provided'}
      </p>
      <h2 id="property-details-title" className="mt-1 text-xl font-semibold">
        {property.title}
      </h2>
      <p className="mt-2 text-sm text-text-muted">
        {property.description ||
          'Contact the property manager for more details.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-sm text-text-muted">
        {property.bedrooms != null && <span>{property.bedrooms} beds</span>}
        {property.bathrooms != null && <span>{property.bathrooms} baths</span>}
        {property.area != null && <span>{property.area} m²</span>}
      </div>

      {amenities.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Amenities">
          {amenities.map((name) => (
            <li
              key={name}
              className="rounded-full border border-border-subtle px-3 py-1 text-xs"
            >
              {name}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-2xl font-bold">
        {Number.isFinite(price)
          ? `${property.currency || 'USD'} ${price.toLocaleString()}`
          : 'Price on request'}
        {Number.isFinite(price) && (
          <span className="ml-1 text-sm font-normal text-text-muted">
            / month
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Property details opened from a map marker. On phones it is a bottom sheet
 * that can be dismissed with a swipe down; on larger screens a centred dialog
 * closed with the button, Escape or a click outside.
 */
export function PropertyDetailsModal({
  property,
  onClose,
}: PropertyDetailsModalProps) {
  const isMobile = useIsMobile();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!property || isMobile) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [property, isMobile, onClose]);

  if (isMobile) {
    return (
      <BottomSheet
        isOpen={Boolean(property)}
        onClose={onClose}
        title={property?.title}
      >
        {property && <PropertySummary property={property} />}
      </BottomSheet>
    );
  }

  if (!property) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close property details"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-details-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-subtle bg-surface p-5"
      >
        <PropertySummary property={property} />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg border border-border-subtle px-4 py-3 font-semibold"
        >
          Close
        </button>
      </section>
    </div>
  );
}
