import { describe, expect, it } from 'vitest';
import {
  addSavedSearch,
  MAX_SAVED_SEARCHES,
  readSavedSearches,
  removeSavedSearch,
  savedSearchHref,
} from '@/lib/saved-searches';
import {
  ACTIVITY_STORAGE_KEY,
  MAX_ACTIVITY_ENTRIES,
  readActivity,
  recordActivity,
} from '@/lib/activity-log';
import {
  describePaymentMethod,
  expiryToIsoDate,
  formatExpiry,
  normalizePaymentMethods,
  validatePaymentMethodInput,
  EMPTY_PAYMENT_METHOD_INPUT,
} from '@/lib/settings/payment-methods';
import {
  isProfileDirty,
  toProfilePayload,
  validateProfileForm,
} from '@/lib/settings/profile';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('saved searches (#151)', () => {
  it('saves, lists and removes a search', () => {
    const storage = memoryStorage();
    const result = addSavedSearch(
      { name: '  2 bed  ', query: '?price_max=1500' },
      storage,
    );
    expect(result.ok).toBe(true);
    const [saved] = readSavedSearches(storage);
    expect(saved).toMatchObject({ name: '2 bed', query: 'price_max=1500' });
    expect(savedSearchHref(saved)).toBe('/properties?price_max=1500');

    expect(removeSavedSearch(saved.id, storage)).toEqual([]);
    expect(readSavedSearches(storage)).toEqual([]);
  });

  it('rejects blank, overlong and duplicate names', () => {
    const storage = memoryStorage();
    expect(addSavedSearch({ name: '   ', query: '' }, storage).ok).toBe(false);
    expect(
      addSavedSearch({ name: 'x'.repeat(61), query: '' }, storage).ok,
    ).toBe(false);
    expect(addSavedSearch({ name: 'Home', query: '' }, storage).ok).toBe(true);
    expect(addSavedSearch({ name: 'home', query: '' }, storage).ok).toBe(false);
  });

  it('stops at the limit', () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_SAVED_SEARCHES; i += 1) {
      expect(addSavedSearch({ name: `s${i}`, query: '' }, storage).ok).toBe(
        true,
      );
    }
    expect(addSavedSearch({ name: 'one more', query: '' }, storage).ok).toBe(
      false,
    );
  });

  it('ignores corrupt storage and works without storage', () => {
    expect(
      readSavedSearches(memoryStorage({ arbitra_saved_searches: '{nope' })),
    ).toEqual([]);
    expect(readSavedSearches(null)).toEqual([]);
    expect(addSavedSearch({ name: 'a', query: '' }, null).ok).toBe(false);
  });

  it('an unknown id leaves the list unchanged', () => {
    const storage = memoryStorage();
    addSavedSearch({ name: 'a', query: '' }, storage);
    expect(removeSavedSearch('missing', storage)).toHaveLength(1);
  });
});

describe('activity log (#156)', () => {
  it('records events with a timestamp and reads them back', () => {
    const storage = memoryStorage();
    recordActivity(
      { type: 'property_viewed', refId: 'p1', label: 'Loft' },
      storage,
    );
    const [entry] = readActivity(storage);
    expect(entry).toMatchObject({
      type: 'property_viewed',
      refId: 'p1',
      label: 'Loft',
    });
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
  });

  it('keeps only the newest entries', () => {
    const storage = memoryStorage();
    for (let i = 0; i < MAX_ACTIVITY_ENTRIES + 5; i += 1) {
      recordActivity({ type: 'search_saved', refId: String(i) }, storage);
    }
    const entries = readActivity(storage);
    expect(entries).toHaveLength(MAX_ACTIVITY_ENTRIES);
    expect(entries[entries.length - 1].refId).toBe(
      String(MAX_ACTIVITY_ENTRIES + 4),
    );
  });

  it('drops malformed entries and survives broken storage', () => {
    const storage = memoryStorage({
      [ACTIVITY_STORAGE_KEY]: JSON.stringify([
        { type: 'property_viewed', at: '2026-01-01T00:00:00Z' },
        { type: 'nope', at: '2026-01-01T00:00:00Z' },
        { type: 'property_viewed', at: 'not a date' },
        null,
      ]),
    });
    expect(readActivity(storage)).toHaveLength(1);
    expect(readActivity(null)).toEqual([]);
    expect(() =>
      recordActivity(
        { type: 'property_viewed' },
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          },
        },
      ),
    ).not.toThrow();
  });
});

describe('payment methods (#151)', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  it('accepts a bank account with the last 4 digits', () => {
    const result = validatePaymentMethodInput(
      { ...EMPTY_PAYMENT_METHOD_INPUT, lastFour: '1234' },
      now,
    );
    expect(result).toEqual({
      ok: true,
      payload: {
        paymentType: 'bank_account',
        lastFour: '1234',
        isDefault: false,
      },
    });
  });

  it('never accepts more than four digits', () => {
    for (const lastFour of [
      '12345',
      '4242 4242 4242 4242',
      '12a4',
      '',
      '123',
    ]) {
      const result = validatePaymentMethodInput(
        { ...EMPTY_PAYMENT_METHOD_INPUT, lastFour },
        now,
      );
      expect(result.ok).toBe(false);
    }
  });

  it('validates card expiry, including the current month and expired cards', () => {
    const card = {
      ...EMPTY_PAYMENT_METHOD_INPUT,
      paymentType: 'card',
      lastFour: '4242',
    };
    expect(
      validatePaymentMethodInput({ ...card, expiry: '06/26' }, now).ok,
    ).toBe(true);
    expect(
      validatePaymentMethodInput({ ...card, expiry: '05/26' }, now).ok,
    ).toBe(false);
    expect(
      validatePaymentMethodInput({ ...card, expiry: '13/30' }, now).ok,
    ).toBe(false);
    expect(validatePaymentMethodInput({ ...card, expiry: '' }, now).ok).toBe(
      false,
    );
    const ok = validatePaymentMethodInput({ ...card, expiry: '02/28' }, now);
    expect(ok.ok && ok.payload.expiryDate).toBe('2028-02-29');
  });

  it('requires a valid Stellar address for wallets and sends no digits', () => {
    const wallet = {
      ...EMPTY_PAYMENT_METHOD_INPUT,
      paymentType: 'stellar_wallet',
    };
    expect(
      validatePaymentMethodInput({ ...wallet, address: 'GABC' }, now).ok,
    ).toBe(false);
    const address = `G${'A'.repeat(55)}`;
    const result = validatePaymentMethodInput({ ...wallet, address }, now);
    expect(result).toEqual({
      ok: true,
      payload: {
        paymentType: 'stellar_wallet',
        isDefault: false,
        metadata: { address },
      },
    });
  });

  it('rejects an unknown type', () => {
    expect(
      validatePaymentMethodInput(
        { ...EMPTY_PAYMENT_METHOD_INPUT, paymentType: 'crypto' },
        now,
      ).ok,
    ).toBe(false);
  });

  it('converts expiry both ways', () => {
    expect(expiryToIsoDate('08/29')).toBe('2029-08-31');
    expect(expiryToIsoDate('8/29')).toBeNull();
    expect(formatExpiry('2029-08-31')).toBe('08/29');
    expect(formatExpiry(undefined)).toBe('');
    expect(formatExpiry('junk')).toBe('');
  });

  it('normalizes list responses and describes methods without full numbers', () => {
    const methods = normalizePaymentMethods({
      data: [
        {
          id: 'a',
          paymentType: 'card',
          lastFour: '4242',
          expiryDate: '2029-08-31',
          isDefault: true,
        },
        { id: 'b' },
        null,
      ],
    });
    expect(methods).toHaveLength(1);
    expect(describePaymentMethod(methods[0])).toBe(
      'Card •••• 4242 (exp 08/29)',
    );
    expect(
      normalizePaymentMethods([{ id: 'x', paymentType: 'bank_account' }]),
    ).toHaveLength(1);
    expect(normalizePaymentMethods('oops')).toEqual([]);
  });
});

describe('profile form (#151)', () => {
  it('requires a name and a plausible phone number', () => {
    expect(validateProfileForm({ fullName: 'Ada', phone: '' })).toEqual({});
    expect(
      validateProfileForm({ fullName: 'Ada', phone: '+1 555 123 4567' }),
    ).toEqual({});
    expect(
      validateProfileForm({ fullName: ' ', phone: '' }).fullName,
    ).toBeTruthy();
    expect(
      validateProfileForm({ fullName: 'x'.repeat(101), phone: '' }).fullName,
    ).toBeTruthy();
    expect(
      validateProfileForm({ fullName: 'Ada', phone: 'call me' }).phone,
    ).toBeTruthy();
  });

  it('trims what is sent and tracks changes', () => {
    expect(toProfilePayload({ fullName: ' Ada ', phone: ' 123456 ' })).toEqual({
      fullName: 'Ada',
      phone: '123456',
    });
    expect(
      isProfileDirty(
        { fullName: 'Ada ', phone: '' },
        { fullName: 'Ada', phone: '' },
      ),
    ).toBe(false);
    expect(
      isProfileDirty(
        { fullName: 'Ada L', phone: '' },
        { fullName: 'Ada', phone: '' },
      ),
    ).toBe(true);
  });
});
