'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const handleInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt,
      );
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (!visible || !deferredPrompt) return null;

  const onInstall = async () => {
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setVisible(false);
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[70] md:left-auto md:w-[420px]">
      <div className="rounded-2xl border border-white/10 bg-slate-900/95 backdrop-blur-xl p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">
              Install Arbitra App
            </p>
            <p className="text-xs text-neutral-200/70 mt-1">
              Add Arbitra to your home screen for faster access and better
              offline support.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="p-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white"
            aria-label="Dismiss install prompt"
          >
            <X size={14} />
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onInstall}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-blue/30 hover:bg-brand-blue/40 border border-brand-blue/30 text-neutral-100 text-sm font-semibold"
          >
            <Download size={14} />
            Install
          </button>
          <button
            type="button"
            onClick={() => setVisible(false)}
            className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
