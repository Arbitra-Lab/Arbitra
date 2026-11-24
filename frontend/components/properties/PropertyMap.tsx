'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  escapeHtml,
  formatPriceLabel,
  getBounds,
  getMappablePoints,
  type LatLngBounds,
  type MapPropertyLike,
} from '@/lib/properties/map';

export type MapProperty = MapPropertyLike & { title: string };

interface PropertyMapProps {
  /** Already filtered listings: markers are exactly the listings that have coordinates. */
  properties: MapProperty[];
  onSelect: (propertyId: string) => void;
}

/** Re-frame the map whenever the set of markers changes (e.g. after a filter change). */
function FitBounds({ bounds }: { bounds: LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, bounds]);
  return null;
}

function priceIcon(label: string) {
  return L.divIcon({
    className: '',
    html: `<span class="inline-block whitespace-nowrap rounded-full border-2 border-white bg-brand-blue px-2 py-1 text-xs font-bold text-white shadow-lg">${escapeHtml(label)}</span>`,
    iconSize: [64, 28],
    iconAnchor: [32, 14],
  });
}

/**
 * Leaflet map with one rent-price marker per listing. Clicking a marker (or
 * pressing Enter on it) reports the listing id so the page can open its details.
 * Load with `next/dynamic` and `ssr: false`: Leaflet needs `window`.
 */
export default function PropertyMap({
  properties,
  onSelect,
}: PropertyMapProps) {
  const points = useMemo(() => getMappablePoints(properties), [properties]);
  const bounds = useMemo(() => getBounds(points), [points]);
  const hiddenCount = properties.length - points.length;

  return (
    <div className="relative isolate z-0">
      <div
        className="h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-border-subtle"
        data-testid="property-map"
      >
        <MapContainer
          center={DEFAULT_MAP_CENTER}
          zoom={DEFAULT_MAP_ZOOM}
          scrollWheelZoom
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds bounds={bounds} />
          {points.map(({ property, lat, lng }) => {
            const label = formatPriceLabel(property.price, property.currency);
            return (
              <Marker
                key={property.id}
                position={[lat, lng]}
                icon={priceIcon(label)}
                title={`${property.title}, ${label} per month`}
                eventHandlers={{ click: () => onSelect(property.id) }}
              />
            );
          })}
        </MapContainer>
      </div>

      {points.length === 0 && (
        <p role="status" className="mt-3 text-center text-sm text-text-muted">
          None of these listings have a map location yet.
        </p>
      )}
      {points.length > 0 && hiddenCount > 0 && (
        <p role="status" className="mt-3 text-center text-sm text-text-muted">
          {hiddenCount} {hiddenCount === 1 ? 'listing is' : 'listings are'} not
          shown because {hiddenCount === 1 ? 'it has' : 'they have'} no map
          location. Switch to the list to see{' '}
          {hiddenCount === 1 ? 'it' : 'them'}.
        </p>
      )}
    </div>
  );
}
