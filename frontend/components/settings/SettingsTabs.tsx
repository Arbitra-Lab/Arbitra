'use client';

import { useRef } from 'react';

export const SETTINGS_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'payments', label: 'Payments' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'security', label: 'Security' },
  { id: 'referrals', label: 'Referrals' },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export function isSettingsTab(value: unknown): value is SettingsTabId {
  return SETTINGS_TABS.some((tab) => tab.id === value);
}

export const settingsTabId = (id: SettingsTabId) => `settings-tab-${id}`;
export const settingsPanelId = (id: SettingsTabId) => `settings-panel-${id}`;

interface SettingsTabsProps {
  active: SettingsTabId;
  onChange: (tab: SettingsTabId) => void;
}

/** Accessible tab list: arrow keys, Home and End move between tabs. */
export function SettingsTabs({ active, onChange }: SettingsTabsProps) {
  const refs = useRef<Partial<Record<SettingsTabId, HTMLButtonElement | null>>>(
    {},
  );

  const moveTo = (index: number) => {
    const next =
      SETTINGS_TABS[(index + SETTINGS_TABS.length) % SETTINGS_TABS.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key === 'ArrowRight') moveTo(index + 1);
    else if (event.key === 'ArrowLeft') moveTo(index - 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(SETTINGS_TABS.length - 1);
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1"
    >
      {SETTINGS_TABS.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            id={settingsTabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={settingsPanelId(tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              selected
                ? 'bg-white/15 text-white'
                : 'text-neutral-200/70 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
