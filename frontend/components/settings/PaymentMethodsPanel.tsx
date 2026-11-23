'use client';

import { useCallback, useEffect, useState } from 'react';
import { SettingsCard } from './SettingsCard';
import { apiClient } from '@/lib/api-client';
import { notify } from '@/components/ui/toast';
import {
  describePaymentMethod,
  EMPTY_PAYMENT_METHOD_INPUT,
  normalizePaymentMethods,
  PAYMENT_METHOD_TYPES,
  validatePaymentMethodInput,
  type PaymentMethod,
  type PaymentMethodField,
  type PaymentMethodInput,
} from '@/lib/settings/payment-methods';

const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50';

/** Add, remove and choose the default payment method. Only last-four digits are ever collected. */
export function PaymentMethodsPanel() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState<PaymentMethodInput>(
    EMPTY_PAYMENT_METHOD_INPUT,
  );
  const [errors, setErrors] = useState<
    Partial<Record<PaymentMethodField, string>>
  >({});
  const [busy, setBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await apiClient.get<unknown>('/payment-methods');
      setMethods(normalizePaymentMethods(data));
    } catch {
      setLoadError('We could not load your payment methods.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirm = (text: string) => {
    setMessage(text);
    setFailure(null);
    notify.success(text);
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = validatePaymentMethodInput(input);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await apiClient.post('/payment-methods', result.payload);
      setInput(EMPTY_PAYMENT_METHOD_INPUT);
      setAdding(false);
      await load();
      confirm('Payment method added.');
    } catch {
      setMessage(null);
      setFailure('We could not add this payment method. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (id: string) => {
    setBusy(true);
    try {
      await apiClient.patch(`/payment-methods/${id}`, { isDefault: true });
      await load();
      confirm('Default payment method updated.');
    } catch {
      setMessage(null);
      setFailure('We could not update your default payment method.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await apiClient.delete(`/payment-methods/${id}`);
      setConfirmRemoveId(null);
      await load();
      confirm('Payment method removed.');
    } catch {
      setMessage(null);
      setFailure('We could not remove this payment method.');
    } finally {
      setBusy(false);
    }
  };

  const isWallet = input.paymentType === 'stellar_wallet';
  const isCard = input.paymentType === 'card';

  return (
    <SettingsCard
      title="Payment methods"
      description="Methods used to pay rent and fees. We only store the last four digits."
    >
      {message && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300"
        >
          {message}
        </p>
      )}
      {failure && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {failure}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-sm text-neutral-200/60">
          Loading payment methods…
        </p>
      ) : loadError ? (
        <div role="alert" className="text-sm text-red-300">
          {loadError}{' '}
          <button
            type="button"
            onClick={() => void load()}
            className="font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : methods.length === 0 ? (
        <p className="text-sm text-neutral-200/60">No payment methods yet.</p>
      ) : (
        <ul className="divide-y divide-white/10">
          {methods.map((method) => (
            <li
              key={method.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-medium text-white">
                  {describePaymentMethod(method)}
                </p>
                {method.isDefault && (
                  <span className="mt-1 inline-block rounded-full bg-brand-accent/20 px-2 py-0.5 text-xs font-semibold text-brand-accent">
                    Default
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!method.isDefault && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void makeDefault(method.id)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Make default
                  </button>
                )}
                {confirmRemoveId === method.id ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(method.id)}
                      className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Confirm remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs text-white"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmRemoveId(method.id)}
                    className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        {adding ? (
          <form
            onSubmit={add}
            className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-4"
            noValidate
          >
            <div>
              <label
                htmlFor="pm-type"
                className="mb-2 block text-sm font-medium text-white"
              >
                Type
              </label>
              <select
                id="pm-type"
                value={input.paymentType}
                onChange={(event) => {
                  setInput({ ...input, paymentType: event.target.value });
                  setErrors({});
                }}
                className={INPUT_CLASS}
              >
                {PAYMENT_METHOD_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {isWallet ? (
              <div>
                <label
                  htmlFor="pm-address"
                  className="mb-2 block text-sm font-medium text-white"
                >
                  Stellar public address
                </label>
                <input
                  id="pm-address"
                  value={input.address}
                  onChange={(event) =>
                    setInput({ ...input, address: event.target.value })
                  }
                  aria-invalid={Boolean(errors.address)}
                  aria-describedby={
                    errors.address ? 'pm-address-error' : undefined
                  }
                  placeholder="G…"
                  className={INPUT_CLASS}
                />
                {errors.address && (
                  <p
                    id="pm-address-error"
                    role="alert"
                    className="mt-1 text-xs text-red-300"
                  >
                    {errors.address}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="pm-last-four"
                    className="mb-2 block text-sm font-medium text-white"
                  >
                    Last 4 digits
                  </label>
                  <input
                    id="pm-last-four"
                    value={input.lastFour}
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="off"
                    onChange={(event) =>
                      setInput({ ...input, lastFour: event.target.value })
                    }
                    aria-invalid={Boolean(errors.lastFour)}
                    aria-describedby={
                      errors.lastFour ? 'pm-last-four-error' : undefined
                    }
                    className={INPUT_CLASS}
                  />
                  {errors.lastFour && (
                    <p
                      id="pm-last-four-error"
                      role="alert"
                      className="mt-1 text-xs text-red-300"
                    >
                      {errors.lastFour}
                    </p>
                  )}
                </div>
                {isCard && (
                  <div>
                    <label
                      htmlFor="pm-expiry"
                      className="mb-2 block text-sm font-medium text-white"
                    >
                      Expiry (MM/YY)
                    </label>
                    <input
                      id="pm-expiry"
                      value={input.expiry}
                      placeholder="08/29"
                      maxLength={5}
                      autoComplete="off"
                      onChange={(event) =>
                        setInput({ ...input, expiry: event.target.value })
                      }
                      aria-invalid={Boolean(errors.expiry)}
                      aria-describedby={
                        errors.expiry ? 'pm-expiry-error' : undefined
                      }
                      className={INPUT_CLASS}
                    />
                    {errors.expiry && (
                      <p
                        id="pm-expiry-error"
                        role="alert"
                        className="mt-1 text-xs text-red-300"
                      >
                        {errors.expiry}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={input.isDefault}
                onChange={(event) =>
                  setInput({ ...input, isDefault: event.target.checked })
                }
              />
              Use as my default payment method
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-brand-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? 'Adding…' : 'Add payment method'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setErrors({});
                  setInput(EMPTY_PAYMENT_METHOD_INPUT);
                }}
                className="rounded-xl px-4 py-2 text-sm text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white"
          >
            Add payment method
          </button>
        )}
      </div>
    </SettingsCard>
  );
}
