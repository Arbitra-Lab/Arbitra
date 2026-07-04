'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import * as ws from './manager';
import { queryKeys } from '@/lib/query/keys';
import type { Notification } from '@/components/notifications/types';

const SETTINGS_STORAGE_KEY = 'arbitra_user_preferences';

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

/**
 * Hook that bridges the WebSocket connection with Zustand stores and
 * React Query caches. Call once in the root layout — it will:
 *
 * 1. Connect/disconnect based on auth state.
 * 2. Push incoming notifications into the Zustand store.
 * 3. Invalidate relevant React Query caches on server events.
 */
export function useRealtime(): void {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const queryClient = useQueryClient();
  const cleanupRef = useRef<Array<() => void>>([]);

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

    const unsubs: Array<() => void> = [];

    // Incoming notification → update Zustand store + invalidate RQ cache
    unsubs.push(
      ws.on('notification', (raw: unknown) => {
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
        queryClient.invalidateQueries({
          queryKey: queryKeys.notifications.all,
        });
      }),
    );

    // Property-related events → invalidate property caches
    unsubs.push(
      ws.on('property:updated', () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.properties.all,
        });
      }),
    );

    // Payment events → invalidate payment caches
    unsubs.push(
      ws.on('payment:completed', () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.payments.all,
        });
      }),
    );

    // Maintenance events → invalidate maintenance caches
    unsubs.push(
      ws.on('maintenance:updated', () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.maintenance.all,
        });
      }),
    );

    cleanupRef.current = unsubs;

    return () => {
      unsubs.forEach((fn) => fn());
      ws.disconnect();
    };
  }, [isAuthenticated, accessToken, addNotification, queryClient]);
}
