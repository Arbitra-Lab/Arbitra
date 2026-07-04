'use client';

import React, { useEffect } from 'react';
import { X, AlertCircle, AlertTriangle, Info, XCircle } from 'lucide-react';
import type { GlobalError, GlobalErrorSeverity } from '@/store/errorStore';

interface ErrorToastProps {
  error: GlobalError;
  onRemove: (id: string) => void;
}

const SEVERITY_STYLES: Record<
  GlobalErrorSeverity,
  { bg: string; border: string; icon: React.ReactNode; text: string }
> = {
  info: {
    bg: 'bg-brand-accent/10',
    border: 'border-brand-accent/20',
    text: 'text-brand-accent',
    icon: <Info size={16} className="text-brand-accent shrink-0 mt-0.5" />,
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: (
      <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
    ),
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-800',
    icon: <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />,
  },
  critical: {
    bg: 'bg-red-100',
    border: 'border-red-400',
    text: 'text-red-900',
    icon: <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />,
  },
};

export function ErrorToast({ error, onRemove }: ErrorToastProps) {
  const styles = SEVERITY_STYLES[error.severity];

  useEffect(() => {
    if (!error.autoDismissMs) return;
    const timer = setTimeout(() => onRemove(error.id), error.autoDismissMs);
    return () => clearTimeout(timer);
  }, [error.id, error.autoDismissMs, onRemove]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-md text-sm max-w-sm w-full ${styles.bg} ${styles.border}`}
    >
      {styles.icon}
      <p className={`flex-1 leading-snug ${styles.text}`}>{error.message}</p>
      <button
        onClick={() => onRemove(error.id)}
        aria-label="Dismiss error"
        className={`shrink-0 p-0.5 rounded hover:opacity-70 transition-opacity ${styles.text}`}
      >
        <X size={14} />
      </button>
    </div>
  );
}
