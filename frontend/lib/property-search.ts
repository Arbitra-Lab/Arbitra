export interface PropertySearchFilters {
  priceMin: string;
  priceMax: string;
  amenities: string[];
  availabilityStart: string;
  availabilityEnd: string;
  leaseTerm: string;
  petPolicy: string;
}

export interface SearchableProperty {
  price?: number | string;
  amenities?: Array<string | { name?: string }>;
  rentalMode?: string;
  petsAllowed?: boolean;
  petPolicy?: string | null;
  availability?: Array<{ date?: string; available?: boolean }>;
  availableFrom?: string;
  availableTo?: string;
}

export const DEFAULT_PROPERTY_FILTERS: PropertySearchFilters = {
  priceMin: '',
  priceMax: '',
  amenities: [],
  availabilityStart: '',
  availabilityEnd: '',
  leaseTerm: '',
  petPolicy: '',
};

const FILTER_PARAMS = [
  'price_min',
  'price_max',
  'amenities',
  'availability',
  'lease_term',
  'pet_policy',
] as const;

export function parsePropertyFilters(
  params: URLSearchParams,
): PropertySearchFilters {
  const [availabilityStart = '', availabilityEnd = ''] = (
    params.get('availability') ?? ''
  ).split(',');

  return {
    priceMin: params.get('price_min') ?? '',
    priceMax: params.get('price_max') ?? '',
    amenities: (params.get('amenities') ?? '')
      .split(',')
      .map((amenity) => amenity.trim())
      .filter(Boolean),
    availabilityStart,
    availabilityEnd,
    leaseTerm: params.get('lease_term') ?? '',
    petPolicy: params.get('pet_policy') ?? '',
  };
}

export function serializePropertyFilters(
  filters: PropertySearchFilters,
  currentParams = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(currentParams);
  FILTER_PARAMS.forEach((key) => params.delete(key));

  if (filters.priceMin) params.set('price_min', filters.priceMin);
  if (filters.priceMax) params.set('price_max', filters.priceMax);
  if (filters.amenities.length) {
    params.set('amenities', [...filters.amenities].sort().join(','));
  }
  if (filters.availabilityStart || filters.availabilityEnd) {
    params.set(
      'availability',
      `${filters.availabilityStart},${filters.availabilityEnd}`,
    );
  }
  if (filters.leaseTerm) params.set('lease_term', filters.leaseTerm);
  if (filters.petPolicy) params.set('pet_policy', filters.petPolicy);
  return params;
}

function getAmenityNames(property: SearchableProperty): string[] {
  return (property.amenities ?? []).map((amenity) =>
    typeof amenity === 'string' ? amenity : (amenity.name ?? ''),
  );
}

function matchesAvailability(
  property: SearchableProperty,
  filters: PropertySearchFilters,
): boolean {
  const { availabilityStart: start, availabilityEnd: end } = filters;
  if (!start && !end) return true;

  if (property.availability) {
    const availableDays = new Set(
      property.availability
        .filter((entry) => entry.available)
        .map((entry) => entry.date),
    );
    if (start && end) {
      const cursor = new Date(`${start}T00:00:00`);
      const lastDay = new Date(`${end}T00:00:00`);
      while (cursor <= lastDay) {
        const date = [
          cursor.getFullYear(),
          String(cursor.getMonth() + 1).padStart(2, '0'),
          String(cursor.getDate()).padStart(2, '0'),
        ].join('-');
        if (!availableDays.has(date)) return false;
        cursor.setDate(cursor.getDate() + 1);
      }
      return true;
    }
    return availableDays.has(start || end);
  }

  if (property.availableFrom || property.availableTo) {
    if (start && property.availableTo && property.availableTo < start) {
      return false;
    }
    if (end && property.availableFrom && property.availableFrom > end) {
      return false;
    }
  }

  return true;
}

export function filterProperties<T extends SearchableProperty>(
  properties: T[],
  filters: PropertySearchFilters,
): T[] {
  return properties.filter((property) => {
    const price = Number(property.price);
    if (filters.priceMin && price < Number(filters.priceMin)) return false;
    if (filters.priceMax && price > Number(filters.priceMax)) return false;

    const amenities = getAmenityNames(property).map((name) =>
      name.toLowerCase(),
    );
    if (
      filters.amenities.some(
        (selected) => !amenities.includes(selected.toLowerCase()),
      )
    ) {
      return false;
    }

    if (filters.leaseTerm && property.rentalMode !== filters.leaseTerm) {
      return false;
    }

    const policy = property.petPolicy?.toLowerCase() ?? '';
    const policyAllowsPets =
      /(?:pets?|cats?|dogs?).{0,15}(?:allowed|welcome|accepted)|(?:allowed|welcome|accept).{0,15}(?:pets?|cats?|dogs?)/.test(
        policy,
      );
    const policyDisallowsAllPets =
      /\bno pets\b|\bpets? (?:not allowed|prohibited|forbidden)\b/.test(policy);
    const allowsPets =
      (property.petsAllowed || policyAllowsPets) && !policyDisallowsAllPets;
    if (filters.petPolicy === 'pets_allowed' && !allowsPets) {
      return false;
    }
    if (filters.petPolicy === 'no_pets' && allowsPets) {
      return false;
    }
    return matchesAvailability(property, filters);
  });
}
