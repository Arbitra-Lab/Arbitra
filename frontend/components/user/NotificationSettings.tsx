'use client';

import { Bell, Mail, MessageSquareText, Smartphone } from 'lucide-react';
import type { ComponentType } from 'react';
import { apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserPreferences } from '@/components/settings/types';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  LandlordNotificationType,
  NOTIFICATION_TYPE_LABELS,
  NotificationSettingsState,
} from './notifications.types';

const EXTRA_SETTINGS_STORAGE_KEY = 'arbitra_landlord_notification_settings';
const preferencesQueryKey = ['landlord-notification-preferences'];

type NotificationSettingsProps = {
  userId?: string;
};

function readExtraSettings(userId?: string): NotificationSettingsState {
  if (typeof window === 'undefined' || !userId) {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }

  try {
    const raw = localStorage.getItem(`${EXTRA_SETTINGS_STORAGE_KEY}:${userId}`);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return {
      ...DEFAULT_NOTIFICATION_SETTINGS,
      ...JSON.parse(raw),
    } as NotificationSettingsState;
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function persistExtraSettings(
  userId: string,
  settings: NotificationSettingsState,
) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    `${EXTRA_SETTINGS_STORAGE_KEY}:${userId}`,
    JSON.stringify(settings),
  );
}

function deriveSettings(
  preferences: UserPreferences,
  userId?: string,
): NotificationSettingsState {
  const extra = readExtraSettings(userId);

  return {
    channels: {
      email:
        preferences.notifications.email.newPropertyMatches ||
        preferences.notifications.email.paymentReminders ||
        preferences.notifications.email.maintenanceUpdates,
      sms: extra.channels.sms,
      inApp:
        preferences.notifications.inAppSummary ||
        preferences.notifications.push.newMessages ||
        preferences.notifications.push.criticalAlerts,
    },
    frequency: extra.frequency,
    mutedTypes: extra.mutedTypes,
  };
}

function buildPreferencesPayload(
  current: UserPreferences,
  settings: NotificationSettingsState,
): UserPreferences {
  const muted = new Set(settings.mutedTypes);
  const emailEnabled = settings.channels.email;
  const inAppEnabled = settings.channels.inApp;

  return {
    ...current,
    notifications: {
      email: {
        newPropertyMatches: emailEnabled && !muted.has('tenant'),
        paymentReminders: emailEnabled && !muted.has('payment'),
        maintenanceUpdates: emailEnabled && !muted.has('maintenance'),
      },
      push: {
        newMessages: inAppEnabled && !muted.has('tenant'),
        criticalAlerts: inAppEnabled && !muted.has('system'),
      },
      inAppSummary: inAppEnabled,
    },
  };
}

const muteableTypes: LandlordNotificationType[] = [
  'payment',
  'maintenance',
  'tenant',
  'system',
];

export default function NotificationSettings({
  userId,
}: NotificationSettingsProps) {
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: async () => {
      const { data } =
        await apiClient.get<UserPreferences>('/users/preferences');
      return data;
    },
    enabled: Boolean(userId),
  });

  const settings = preferencesQuery.data
    ? deriveSettings(preferencesQuery.data, userId)
    : DEFAULT_NOTIFICATION_SETTINGS;

  const saveMutation = useMutation({
    mutationFn: async (nextSettings: NotificationSettingsState) => {
      if (!preferencesQuery.data) {
        throw new Error('Preferences are not loaded yet.');
      }

      const payload = buildPreferencesPayload(
        preferencesQuery.data,
        nextSettings,
      );
      await apiClient.patch('/users/preferences', payload);

      if (userId) {
        persistExtraSettings(userId, nextSettings);
      }

      return payload;
    },
    onSuccess: (updatedPreferences) => {
      queryClient.setQueryData(preferencesQueryKey, updatedPreferences);
    },
  });

  const updateSettings = (
    updater: (current: NotificationSettingsState) => NotificationSettingsState,
  ) => {
    const next = updater(settings);
    saveMutation.mutate(next);
  };

  if (preferencesQuery.isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 text-slate-300">
        Loading notification preferences...
      </div>
    );
  }

  if (preferencesQuery.isError) {
    return (
      <div className="rounded-3xl border border-rose-400/20 bg-rose-500/10 p-6 text-rose-100">
        {(preferencesQuery.error as Error).message ||
          'Unable to load notification preferences.'}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-brand-accent/15 p-3 text-brand-accent">
            <Bell className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              Delivery Preferences
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              Control how landlord alerts are delivered and how frequently you
              hear from the platform.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <PreferenceToggleCard
            icon={Mail}
            title="Email alerts"
            description="Receive payment, maintenance, and tenant updates by email."
            checked={settings.channels.email}
            disabled={saveMutation.isPending}
            onChange={() =>
              updateSettings((current) => ({
                ...current,
                channels: {
                  ...current.channels,
                  email: !current.channels.email,
                },
              }))
            }
          />
          <PreferenceToggleCard
            icon={Smartphone}
            title="SMS alerts"
            description="Store a mobile preference for urgent landlord reminders."
            checked={settings.channels.sms}
            disabled={saveMutation.isPending}
            onChange={() =>
              updateSettings((current) => ({
                ...current,
                channels: { ...current.channels, sms: !current.channels.sms },
              }))
            }
          />
          <PreferenceToggleCard
            icon={MessageSquareText}
            title="In-app alerts"
            description="Keep real-time summaries and dashboard unread badges enabled."
            checked={settings.channels.inApp}
            disabled={saveMutation.isPending}
            onChange={() =>
              updateSettings((current) => ({
                ...current,
                channels: {
                  ...current.channels,
                  inApp: !current.channels.inApp,
                },
              }))
            }
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white">
            Notification Frequency
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            Choose how often Arbitra should bundle landlord notifications.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              {
                value: 'realtime',
                label: 'Real-time',
                description: 'Send alerts as activity happens.',
              },
              {
                value: 'daily',
                label: 'Daily digest',
                description: 'Batch notifications once per day.',
              },
              {
                value: 'weekly',
                label: 'Weekly digest',
                description: 'Reduce noise with a weekly summary.',
              },
            ].map((option) => {
              const isActive = settings.frequency === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={saveMutation.isPending}
                  onClick={() =>
                    updateSettings((current) => ({
                      ...current,
                      frequency:
                        option.value as NotificationSettingsState['frequency'],
                    }))
                  }
                  className={`rounded-2xl border p-4 text-left transition ${
                    isActive
                      ? 'border-brand-accent/50 bg-brand-accent/10 text-white'
                      : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="mt-2 text-xs text-slate-300">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-white">
            Muted Notification Types
          </h3>
          <p className="mt-1 text-sm text-slate-300">
            Mute categories you do not want to surface prominently in landlord
            workflows.
          </p>

          <div className="mt-5 space-y-3">
            {muteableTypes.map((type) => {
              const checked = settings.mutedTypes.includes(type);

              return (
                <label
                  key={type}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {NOTIFICATION_TYPE_LABELS[type]}
                    </p>
                    <p className="text-xs text-slate-300">
                      Hide this category from active landlord notifications.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saveMutation.isPending}
                    onChange={() =>
                      updateSettings((current) => ({
                        ...current,
                        mutedTypes: checked
                          ? current.mutedTypes.filter((item) => item !== type)
                          : [...current.mutedTypes, type],
                      }))
                    }
                    className="h-4 w-4 rounded border-white/20 bg-slate-950 text-brand-accent focus:ring-brand-accent"
                  />
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-sm text-slate-300" aria-live="polite">
        {saveMutation.isPending && 'Saving notification preferences...'}
        {!saveMutation.isPending &&
          saveMutation.isSuccess &&
          'Preferences saved.'}
        {saveMutation.isError &&
          ((saveMutation.error as Error).message ||
            'Unable to save notification preferences.')}
      </div>
    </section>
  );
}

type PreferenceToggleCardProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
};

function PreferenceToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  disabled = false,
  onChange,
}: PreferenceToggleCardProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={`rounded-2xl border p-4 text-left transition ${
        checked
          ? 'border-brand-accent/40 bg-brand-accent/10'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="rounded-2xl bg-white/10 p-3 text-brand-accent">
          <Icon className="h-5 w-5" />
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
            checked
              ? 'bg-emerald-500/15 text-emerald-200'
              : 'bg-slate-700 text-slate-300'
          }`}
        >
          {checked ? 'On' : 'Off'}
        </span>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-300">{description}</p>
    </button>
  );
}
