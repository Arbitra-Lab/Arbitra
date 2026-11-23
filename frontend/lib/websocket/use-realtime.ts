'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import * as ws from './manager';
import { EventBatcher } from './event-batcher';
import { queryKeys } from '@/lib/query/keys';
import { notify } from '@/components/ui/toast';
import { toastForEvent } from './toast-events';
import type { Notification } from '@/components/notifications/types';

const SETTINGS_STORAGE_KEY = 'arbitra_user_preferences';

/** Server event names, kept in sync with NotificationsRealtimeService. */
const DOMAIN_EVENTS = {
  disputeStatus: 'dispute:status',
  voteCast: 'vote:cast',
  escrowReleased: 'escrow:released',
  appealSubmitted: 'appeal:submitted',
} as const;

type CacheDomain =
  | 'notifications'
  | 'properties'
  | 'payments'
  | 'maintenance'
  | 'agreements';

const INVALIDATION_KEYS: Record<CacheDomain, readonly string[]> = {
  notifications: queryKeys.notifications.all,
  properties: queryKeys.properties.all,
  payments: queryKeys.payments.all,
  maintenance: queryKeys.maintenance.all,
  agreements: queryKeys.agreements.all,
};

/** Show the toast for a server event, if it has one (#149). */
function showEventToast(event: string, payload: unknown) {
  const spec = toastForEvent(event, payload);
  if (spec) notify[spec.type](spec.message);
}

function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return true;

    const parsed = JSON.parse(raw) as {
      notifications?: { push?: { criticalAlerts?: boolean } };
    };

    return parsed.notifications?.push?.criticalAlerts ?? true;
  } catch {
    return true;
  }
}

function playNotificationSound() {
  if (typeof window === 'undefined' || !isSoundEnabled()) return;

  const withWebkit = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioCtx = window.AudioContext || withWebkit.webkitAudioContext;
  if (!AudioCtx) return;

  const audioContext = new AudioCtx();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.04;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.12);
}

interface DomainEventPayload {
  disputeId?: string;
  voteId?: string | number;
  agreementId?: string | number;
  status?: string;
  title?: string;
  message?: string;
}

function domainNotification(
  fallbackTitle: string,
  payload: DomainEventPayload,
): Notification {
  return {
    id:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `ws-${Date.now()}-${Math.random()}`,
    type:
      payload.status === 'RESOLVED' || payload.status === 'UNDER_REVIEW'
        ? 'payment'
        : 'message',
    title: payload.title ?? fallbackTitle,
    body: payload.message ?? '',
    read: false,
    createdAt: new Date().toISOString(),
    link: payload.disputeId ? `/disputes/${payload.disputeId}` : undefined,
  };
}

/**
 * Hook that bridges the WebSocket connection with Zustand stores and
 * React Query caches. Call once in the root layout — it will:
 *
 * 1. Connect/disconnect based on auth state (with automatic reconnection in
 *    the manager).
 * 2. Push incoming notifications into the Zustand store.
 * 3. Micro-batch and dedupe cache invalidations on server events (#12).
 */
export function useRealtime(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      ws.disconnect();
      return;
    }

    ws.connect({
      token: accessToken,
      namespace: '/notifications',
      pingEvent: 'session:ping',
    });

    // #12 — collapse bursts of events of the same type into one refetch.
    const batcher = new EventBatcher<CacheDomain>(100, (events) => {
      const domains = new Set(events.map((event) => event.value));
      domains.forEach((domain) => {
        void queryClient.invalidateQueries({
          queryKey: INVALIDATION_KEYS[domain],
        });
      });
    });

    const unsubs: Array<() => void> = [];
    const on = (event: string, handler: (raw: unknown) => void) => {
      unsubs.push(ws.on(event, handler));
    };
    const queue = (domain: CacheDomain) => batcher.add(domain, domain);

    // Incoming notification → update Zustand store immediately, batch the
    // React Query invalidation.
    on('notification', (raw) => {
      const serverNotification = raw as {
        id?: string;
        title?: string;
        message?: string;
        isRead?: boolean;
        type?: string;
        createdAt?: string;
      };

      const notification: Notification = {
        id: serverNotification.id ?? crypto.randomUUID(),
        type:
          serverNotification.type === 'maintenance' ||
          serverNotification.type === 'payment'
            ? serverNotification.type
            : 'message',
        title: serverNotification.title ?? 'Notification',
        body: serverNotification.message ?? '',
        read: Boolean(serverNotification.isRead),
        createdAt: serverNotification.createdAt ?? new Date().toISOString(),
      };

      addNotification(notification);
      playNotificationSound();
      queue('notifications');
    });

    on('property:updated', () => queue('properties'));
    on('payment:completed', (raw) => {
      showEventToast('payment:completed', raw);
      queue('payments');
    });
    on('maintenance:updated', () => queue('maintenance'));

    // #12 — domain events for disputes, votes, escrow and appeals.
    const domainHandlers: Array<[string, string, CacheDomain]> = [
      [DOMAIN_EVENTS.disputeStatus, 'Dispute status updated', 'agreements'],
      [DOMAIN_EVENTS.voteCast, 'Vote cast', 'agreements'],
      [DOMAIN_EVENTS.escrowReleased, 'Escrow released', 'payments'],
      [DOMAIN_EVENTS.appealSubmitted, 'Appeal submitted', 'agreements'],
    ];
    domainHandlers.forEach(([event, title, domain]) => {
      on(event, (raw) => {
        addNotification(domainNotification(title, raw as DomainEventPayload));
        showEventToast(event, raw);
        queue(domain);
        queue('notifications');
      });
    });

    return () => {
      unsubs.forEach((fn) => fn());
      batcher.dispose();
      ws.disconnect();
    };
  }, [isAuthenticated, accessToken, addNotification, queryClient]);
}
