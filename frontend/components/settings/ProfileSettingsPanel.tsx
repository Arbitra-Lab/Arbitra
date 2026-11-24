'use client';

import { useEffect, useState } from 'react';
import { SettingsCard } from './SettingsCard';
import { notify } from '@/components/ui/toast';
import {
  isProfileDirty,
  MAX_FULL_NAME_LENGTH,
  toProfilePayload,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues,
} from '@/lib/settings/profile';

interface ProfileSettingsPanelProps {
  accessToken: string | null;
}

const INPUT_CLASS =
  'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/50 disabled:opacity-60';

const EMPTY: ProfileFormValues = { fullName: '', phone: '' };

/** Personal info (name, phone) with explicit save and a confirmation message. */
export function ProfileSettingsPanel({
  accessToken,
}: ProfileSettingsPanelProps) {
  const [values, setValues] = useState<ProfileFormValues>(EMPTY);
  const [saved, setSaved] = useState<ProfileFormValues>(EMPTY);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    (async () => {
      try {
        const response = await fetch('/api/profile', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error('Unable to load profile');
        const data = (await response.json()) as Partial<ProfileFormValues> & {
          email?: string;
        };
        if (!active) return;
        const loaded = {
          fullName: typeof data.fullName === 'string' ? data.fullName : '',
          phone: typeof data.phone === 'string' ? data.phone : '',
        };
        setValues(loaded);
        setSaved(loaded);
        setEmail(typeof data.email === 'string' ? data.email : '');
      } catch {
        if (active)
          setFailure('We could not load your profile. Try again later.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [accessToken]);

  const dirty = isProfileDirty(values, saved);

  const update = (patch: Partial<ProfileFormValues>) => {
    setValues((current) => ({ ...current, ...patch }));
    setConfirmation(null);
    setFailure(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validateProfileForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !accessToken) return;

    setSaving(true);
    setConfirmation(null);
    setFailure(null);
    try {
      const payload = toProfilePayload(values);
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Unable to save profile');
      setValues(payload);
      setSaved(payload);
      setConfirmation('Profile saved.');
      notify.success('Profile saved');
    } catch {
      setFailure('We could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsCard
      title="Personal information"
      description="Update the name and phone number on your account."
    >
      {loading ? (
        <p role="status" className="text-sm text-neutral-200/60">
          Loading your profile…
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label
                htmlFor="profile-full-name"
                className="mb-2 block text-sm font-medium text-white"
              >
                Full name
              </label>
              <input
                id="profile-full-name"
                value={values.fullName}
                maxLength={MAX_FULL_NAME_LENGTH + 20}
                onChange={(event) => update({ fullName: event.target.value })}
                aria-invalid={Boolean(errors.fullName)}
                aria-describedby={
                  errors.fullName ? 'profile-full-name-error' : undefined
                }
                className={INPUT_CLASS}
              />
              {errors.fullName && (
                <p
                  id="profile-full-name-error"
                  role="alert"
                  className="mt-1 text-xs text-red-300"
                >
                  {errors.fullName}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="profile-phone"
                className="mb-2 block text-sm font-medium text-white"
              >
                Phone
              </label>
              <input
                id="profile-phone"
                type="tel"
                value={values.phone}
                onChange={(event) => update({ phone: event.target.value })}
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={
                  errors.phone ? 'profile-phone-error' : undefined
                }
                className={INPUT_CLASS}
              />
              {errors.phone && (
                <p
                  id="profile-phone-error"
                  role="alert"
                  className="mt-1 text-xs text-red-300"
                >
                  {errors.phone}
                </p>
              )}
            </div>
            <div className="md:col-span-2">
              <label
                htmlFor="profile-email"
                className="mb-2 block text-sm font-medium text-white"
              >
                Email
              </label>
              <input
                id="profile-email"
                value={email}
                readOnly
                disabled
                className={INPUT_CLASS}
              />
              <p className="mt-1 text-xs text-neutral-200/50">
                Your email is managed with your sign-in and cannot be changed
                here.
              </p>
            </div>
          </div>

          {confirmation && (
            <p
              role="status"
              className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300"
            >
              {confirmation}
            </p>
          )}
          {failure && (
            <p
              role="alert"
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            >
              {failure}
            </p>
          )}

          <button
            type="submit"
            disabled={!dirty || saving}
            className="rounded-xl bg-brand-accent px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      )}
    </SettingsCard>
  );
}
