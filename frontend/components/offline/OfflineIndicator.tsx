/**
 * Enhanced offline indicator with sync status and queue information.
 */

'use client';

import { useEffect, useState } from 'react';
import { useOfflineStatus, useSync } from '@/lib/offline/hooks';
import { FiWifi, FiWifiOff, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';

export function OfflineIndicator() {
  const { isOnline, queueSize, hasConflicts } = useOfflineStatus();
  const { sync, isSyncing, lastSyncResult } = useSync();
  const [showDetails, setShowDetails] = useState(false);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queueSize > 0) {
      sync();
    }
  }, [isOnline, queueSize, sync]);

  if (isOnline && queueSize === 0 && !hasConflicts) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className="rounded-lg border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-xl">
        {/* Main indicator */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-3 px-4 py-3 text-sm text-white hover:bg-white/5 transition-colors"
        >
          {isOnline ? (
            <FiWifi className="h-5 w-5 text-emerald-400" />
          ) : (
            <FiWifiOff className="h-5 w-5 text-amber-400" />
          )}

          <div className="text-left">
            <div className="font-medium text-white">
              {isOnline ? 'Online' : 'Offline Mode'}
            </div>
            {queueSize > 0 && (
              <div className="text-xs text-neutral-200/60">
                {queueSize} pending {queueSize === 1 ? 'action' : 'actions'}
              </div>
            )}
          </div>

          {hasConflicts && <FiAlertCircle className="h-5 w-5 text-red-400" />}
        </button>

        {/* Details panel */}
        {showDetails && (
          <div className="border-t border-white/5 px-4 py-3">
            <div className="space-y-2 text-sm">
              {queueSize > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-200/60">Sync queue:</span>
                  <span className="font-medium text-white">{queueSize}</span>
                </div>
              )}

              {hasConflicts && (
                <div className="flex items-center gap-2 text-red-400">
                  <FiAlertCircle className="h-4 w-4" />
                  <span>Conflicts detected</span>
                </div>
              )}

              {lastSyncResult && (
                <div className="text-xs text-neutral-200/40">
                  Last sync: {lastSyncResult.processed} processed,{' '}
                  {lastSyncResult.failed} failed
                </div>
              )}

              {isOnline && queueSize > 0 && (
                <button
                  onClick={() => sync()}
                  disabled={isSyncing}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-blue-dark px-3 py-2 text-white hover:from-brand-blue-dark hover:to-brand-blue-dark disabled:opacity-50 transition-all"
                >
                  <FiRefreshCw
                    className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
