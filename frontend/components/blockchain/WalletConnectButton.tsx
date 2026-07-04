'use client';

import React, { useCallback, useState } from 'react';
import { getFreighterPublicKey } from '@/lib/stellar-auth';
import { StellarLogo } from '@/components/icons/StellarLogo';
import { Loader2, LogOut } from 'lucide-react';

function truncateMiddle(s: string, left = 6, right = 4): string {
  if (s.length <= left + right + 1) return s;
  return `${s.slice(0, left)}…${s.slice(-right)}`;
}

export interface WalletConnectButtonProps {
  /** Called after Freighter returns a public key */
  onConnect?: (publicKey: string) => void;
  /** Called when user clears the session in-app */
  onDisconnect?: () => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'px-3 py-2 text-sm gap-2',
  md: 'px-4 py-2.5 text-sm gap-2.5',
  lg: 'px-5 py-3 text-base gap-3',
};

export function WalletConnectButton({
  onConnect,
  onDisconnect,
  className = '',
  size = 'md',
}: WalletConnectButtonProps) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const pk = await getFreighterPublicKey();
      setPublicKey(pk);
      onConnect?.(pk);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Could not connect to Freighter';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [onConnect]);

  const disconnect = useCallback(() => {
    setPublicKey(null);
    setError(null);
    onDisconnect?.();
  }, [onDisconnect]);

  if (publicKey) {
    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center gap-2 ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
          <StellarLogo size={18} className="shrink-0 text-brand-accent" />
          <span className="font-mono truncate" title={publicKey}>
            {truncateMiddle(publicKey)}
          </span>
        </div>
        <button
          type="button"
          onClick={disconnect}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 hover:bg-white/10 transition-colors"
        >
          <LogOut size={16} />
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => void connect()}
        disabled={loading}
        className={`inline-flex items-center justify-center font-semibold rounded-xl bg-gradient-to-r from-brand-blue to-brand-blue-dark text-white shadow-lg shadow-brand-blue-dark/30 hover:from-brand-blue-dark hover:to-brand-blue disabled:opacity-60 transition-all ${SIZE_CLASSES[size]}`}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" size={18} />
            Connecting…
          </>
        ) : (
          <>
            <StellarLogo size={20} className="text-white" />
            Connect Freighter
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-400 max-w-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
