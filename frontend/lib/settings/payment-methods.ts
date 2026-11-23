/**
 * Payment-method helpers for the settings dashboard (#151).
 *
 * The backend stores only a type, the last four digits, an expiry and a
 * default flag. This module validates user input into exactly that shape,
 * so full card or account numbers never leave the form.
 */

export type PaymentMethodType = 'bank_account' | 'card' | 'stellar_wallet';

export const PAYMENT_METHOD_TYPES: ReadonlyArray<{
  value: PaymentMethodType;
  label: string;
}> = [
  { value: 'bank_account', label: 'Bank account' },
  { value: 'card', label: 'Card' },
  { value: 'stellar_wallet', label: 'Stellar wallet' },
];

export interface PaymentMethod {
  id: string;
  paymentType: string;
  lastFour?: string;
  /** ISO date (last day of the expiry month) when the backend returns one. */
  expiryDate?: string;
  isDefault: boolean;
  metadata?: Record<string, unknown>;
}

export interface PaymentMethodInput {
  paymentType: string;
  /** Last four digits only. */
  lastFour: string;
  /** `MM/YY`; required for cards. */
  expiry: string;
  /** Public Stellar address; required for wallets. */
  address: string;
  isDefault: boolean;
}

export interface CreatePaymentMethodPayload {
  paymentType: PaymentMethodType;
  lastFour?: string;
  expiryDate?: string;
  isDefault: boolean;
  metadata?: Record<string, unknown>;
}

export type PaymentMethodField =
  | 'paymentType'
  | 'lastFour'
  | 'expiry'
  | 'address';

export type ValidationResult =
  | { ok: true; payload: CreatePaymentMethodPayload }
  | { ok: false; errors: Partial<Record<PaymentMethodField, string>> };

export const EMPTY_PAYMENT_METHOD_INPUT: PaymentMethodInput = {
  paymentType: 'bank_account',
  lastFour: '',
  expiry: '',
  address: '',
  isDefault: false,
};

const LAST_FOUR = /^\d{4}$/;
const EXPIRY = /^(0[1-9]|1[0-2])\/(\d{2})$/;
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** `MM/YY` to the last day of that month as `YYYY-MM-DD`, or `null` when invalid. */
export function expiryToIsoDate(expiry: string): string | null {
  const match = EXPIRY.exec(expiry.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** An ISO date as `MM/YY`, or an empty string when it is not a date. */
export function formatExpiry(isoDate?: string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(
    date.getUTCFullYear() % 100,
  ).padStart(2, '0')}`;
}

function isExpired(expiry: string, now: Date): boolean {
  const match = EXPIRY.exec(expiry);
  if (!match) return false;
  const year = 2000 + Number(match[2]);
  const month = Number(match[1]);
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  return year < currentYear || (year === currentYear && month < currentMonth);
}

/** Validate a form into the payload the API accepts. Never accepts more than four digits of a number. */
export function validatePaymentMethodInput(
  input: PaymentMethodInput,
  now: Date = new Date(),
): ValidationResult {
  const errors: Partial<Record<PaymentMethodField, string>> = {};
  const type = PAYMENT_METHOD_TYPES.find((t) => t.value === input.paymentType);
  if (!type) {
    return {
      ok: false,
      errors: { paymentType: 'Choose a payment method type.' },
    };
  }

  const lastFour = input.lastFour.trim();
  const expiry = input.expiry.trim();
  const address = input.address.trim();

  if (type.value === 'stellar_wallet') {
    if (!STELLAR_ADDRESS.test(address)) {
      errors.address =
        'Enter a valid Stellar public address (starts with G, 56 characters).';
    }
  } else {
    if (!LAST_FOUR.test(lastFour)) {
      errors.lastFour = 'Enter only the last 4 digits.';
    }
    if (type.value === 'card') {
      if (!EXPIRY.test(expiry)) {
        errors.expiry = 'Enter the expiry as MM/YY.';
      } else if (isExpired(expiry, now)) {
        errors.expiry = 'This card has expired.';
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const payload: CreatePaymentMethodPayload = {
    paymentType: type.value,
    isDefault: input.isDefault,
  };
  if (type.value === 'stellar_wallet') {
    payload.metadata = { address };
  } else {
    payload.lastFour = lastFour;
    if (type.value === 'card') {
      payload.expiryDate = expiryToIsoDate(expiry) ?? undefined;
    }
  }
  return { ok: true, payload };
}

/** Read the list response whether the API returns an array or `{ data: [...] }`; drops malformed rows. */
export function normalizePaymentMethods(raw: unknown): PaymentMethod[] {
  const list = Array.isArray(raw)
    ? raw
    : raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as { data?: unknown }).data)
      ? (raw as { data: unknown[] }).data
      : [];

  const methods: PaymentMethod[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.paymentType !== 'string')
      continue;
    methods.push({
      id: row.id,
      paymentType: row.paymentType,
      lastFour: typeof row.lastFour === 'string' ? row.lastFour : undefined,
      expiryDate:
        typeof row.expiryDate === 'string' ? row.expiryDate : undefined,
      isDefault: row.isDefault === true,
      metadata:
        row.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : undefined,
    });
  }
  return methods;
}

/** One-line description such as `Card •••• 4242 (exp 08/29)`; never includes more than four digits. */
export function describePaymentMethod(method: PaymentMethod): string {
  const label =
    PAYMENT_METHOD_TYPES.find((t) => t.value === method.paymentType)?.label ??
    method.paymentType.replace(/_/g, ' ');

  if (method.paymentType === 'stellar_wallet') {
    const address = method.metadata?.address;
    if (typeof address === 'string' && address.length > 10) {
      return `${label} ${address.slice(0, 4)}…${address.slice(-4)}`;
    }
    return label;
  }

  const parts = [label];
  if (method.lastFour) parts.push(`•••• ${method.lastFour}`);
  const expiry = formatExpiry(method.expiryDate);
  if (expiry) parts.push(`(exp ${expiry})`);
  return parts.join(' ');
}
