import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROPERTY_FILTERS,
  filterProperties,
  parsePropertyFilters,
  serializePropertyFilters,
} from '../property-search';

describe('property search filters', () => {
  it('parses and serializes URL filters while preserving unrelated parameters', () => {
    const parsed = parsePropertyFilters(
      new URLSearchParams(
        'view=map&price_min=900&price_max=2200&amenities=Gym,Pool&availability=2026-07-01,2026-07-05&lease_term=long_term&pet_policy=pets_allowed',
      ),
    );

    expect(parsed).toEqual({
      priceMin: '900',
      priceMax: '2200',
      amenities: ['Gym', 'Pool'],
      availabilityStart: '2026-07-01',
      availabilityEnd: '2026-07-05',
      leaseTerm: 'long_term',
      petPolicy: 'pets_allowed',
    });
    expect(
      serializePropertyFilters(
        { ...parsed, amenities: ['Pool', 'Gym'] },
        new URLSearchParams('view=map&price_min=old'),
      ).toString(),
    ).toBe(
      'view=map&price_min=900&price_max=2200&amenities=Gym%2CPool&availability=2026-07-01%2C2026-07-05&lease_term=long_term&pet_policy=pets_allowed',
    );
  });

  it('filters properties locally by price, amenities, lease mode, and pet policy', () => {
    const properties = [
      {
        id: 'one',
        price: 1800,
        amenities: [{ name: 'Gym' }, { name: 'Pool' }],
        rentalMode: 'long_term',
        petsAllowed: true,
      },
      {
        id: 'two',
        price: 2400,
        amenities: [{ name: 'Gym' }],
        rentalMode: 'short_term',
        petsAllowed: false,
      },
    ];

    expect(
      filterProperties(properties, {
        ...DEFAULT_PROPERTY_FILTERS,
        priceMin: '1000',
        priceMax: '2000',
        amenities: ['Pool'],
        leaseTerm: 'long_term',
        petPolicy: 'pets_allowed',
      }).map(({ id }) => id),
    ).toEqual(['one']);
  });

  it('uses availability data on properties when it is present', () => {
    const properties = [
      { id: 'open', availability: [{ date: '2026-07-01', available: true }] },
      {
        id: 'blocked',
        availability: [{ date: '2026-07-01', available: false }],
      },
      { id: 'unknown' },
    ];

    expect(
      filterProperties(properties, {
        ...DEFAULT_PROPERTY_FILTERS,
        availabilityStart: '2026-07-01',
      }).map(({ id }) => id),
    ).toEqual(['open', 'unknown']);
  });
});
