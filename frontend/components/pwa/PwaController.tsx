'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCcw, BellRing, X } from 'lucide-react';
import toast from 'react-hot-toast';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isIosInstallable() {
  if (typeof window === 'undefined') {
    return false;
  }

  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

  return isIos && !isStandalone;
}

export default function PwaController() {
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [updateReady, setUpdateReady] =
    useState<ServiceWorkerRegistration | null>(null);
  const [dismissedIosPrompt, setDismissedIosPrompt] = useState(false);
  const [requestingInstall, setRequestingInstall] = useState(false);
  const [requestingNotifications, setRequestingNotifications] = useState(false);
  const showIosPrompt = !dismissedIosPrompt && isIosInstallable();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstallEvent(null);
      setDismissedIosPrompt(true);
      toast.success('Arbitra is installed and ready offline.');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    let reloading = false;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          if (registration.waiting) {
            setUpdateReady(registration);
          }

          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) {
              return;
            }

            installingWorker.addEventListener('statechange', () => {
              if (
                installingWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                setUpdateReady(registration);
              }
            });
          });
        })
        .catch(() => {
          toast.error('Could not enable offline support on this device.');
        });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) {
          return;
        }

        reloading = true;
        window.location.reload();
      });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const installApp = async () => {
    if (!installEvent) {
      return;
    }

    setRequestingInstall(true);
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setRequestingInstall(false);

    if (choice.outcome === 'accepted') {
      setInstallEvent(null);
      toast.success(
        'Install started. Arbitra will appear on your home screen.',
      );
      return;
    }

    toast('Install dismissed. You can install Arbitra later from this banner.');
  };

  const applyUpdate = () => {
    if (!updateReady?.waiting) {
      return;
    }

    updateReady.waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  const requestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      toast.error('Notifications are not supported on this device.');
      return;
    }

    setRequestingNotifications(true);
    const permission = await Notification.requestPermission();
    setRequestingNotifications(false);

    if (permission === 'granted') {
      toast.success('Notifications enabled for Arbitra.');
      return;
    }

    toast('Notifications were not enabled.');
  };

  if (updateReady) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-brand-accent/30 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-accent">Update ready</p>
            <p className="mt-1 text-sm text-slate-200">
              A newer version of Arbitra is available.
            </p>
          </div>
          <button
            aria-label="Dismiss update prompt"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            onClick={() => setUpdateReady(null)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
            onClick={applyUpdate}
            type="button"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh app
          </button>
          <button
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            onClick={() => setUpdateReady(null)}
            type="button"
          >
            Later
          </button>
        </div>
      </div>
    );
  }

  if (installEvent) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold text-emerald-300">
          Install Arbitra
        </p>
        <p className="mt-1 text-sm text-slate-200">
          Add Arbitra to your home screen for faster launches and offline
          access.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
            disabled={requestingInstall}
            onClick={installApp}
            type="button"
          >
            <Download className="h-4 w-4" />
            {requestingInstall ? 'Installing...' : 'Install app'}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 disabled:opacity-60"
            disabled={requestingNotifications}
            onClick={requestNotifications}
            type="button"
          >
            <BellRing className="h-4 w-4" />
            {requestingNotifications ? 'Please wait...' : 'Enable alerts'}
          </button>
          <button
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            onClick={() => setInstallEvent(null)}
            type="button"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (showIosPrompt) {
    return (
      <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-2xl border border-amber-500/30 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur">
        <p className="text-sm font-semibold text-amber-300">
          Install on iPhone or iPad
        </p>
        <p className="mt-1 text-sm text-slate-200">
          Open the Share menu in Safari, then choose{' '}
          <span className="font-semibold">Add to Home Screen</span>.
        </p>
        <div className="mt-4">
          <button
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            onClick={() => setDismissedIosPrompt(true)}
            type="button"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return null;
}
