'use client';

import React, { useEffect, useState } from 'react';
import { Toaster, ToastBar, toast, type ToastOptions } from 'react-hot-toast';
import { CheckCircle2, CircleAlert, Info, TriangleAlert } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** Toasts close themselves after 5 seconds unless a call overrides `duration`. */
export const TOAST_DEFAULT_DURATION = 5000;

const BASE_CLASS =
  'cursor-pointer rounded-xl border px-3 py-2 text-sm shadow-lg transition-opacity hover:opacity-90';

/** Type-specific colours; the icon makes the type clear without relying on colour. */
export const TOAST_TYPE_CLASSES: Record<ToastType, string> = {
  success: `${BASE_CLASS} border-green-300 bg-green-50 text-green-900`,
  error: `${BASE_CLASS} border-red-300 bg-red-50 text-red-900`,
  warning: `${BASE_CLASS} border-amber-300 bg-amber-50 text-amber-900`,
  info: `${BASE_CLASS} border-blue-300 bg-blue-50 text-blue-900`,
};

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: (
    <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-green-600" />
  ),
  error: <CircleAlert aria-hidden="true" className="h-5 w-5 text-red-600" />,
  warning: (
    <TriangleAlert aria-hidden="true" className="h-5 w-5 text-amber-600" />
  ),
  info: <Info aria-hidden="true" className="h-5 w-5 text-blue-600" />,
};

/** Options for a toast of `type`: 5s default duration, icon and type styling, caller overrides win. */
export function getToastOptions(
  type: ToastType,
  options?: ToastOptions,
): ToastOptions {
  return {
    duration: TOAST_DEFAULT_DURATION,
    icon: TOAST_ICONS[type],
    className: TOAST_TYPE_CLASSES[type],
    ...options,
  };
}

/**
 * Mount once near the root. Toasts stack vertically (newest at the bottom of
 * the stack), auto-dismiss after {@link TOAST_DEFAULT_DURATION}, and a click
 * (or Enter / Space / Escape on the focused toast) closes them.
 */
export function ToastProvider() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Toaster
      position="bottom-right"
      gutter={8}
      toastOptions={{ duration: TOAST_DEFAULT_DURATION }}
      containerClassName="!bottom-5 !right-5"
    >
      {(t) => (
        <div
          role="button"
          tabIndex={0}
          aria-label="Dismiss notification"
          onClick={() => toast.dismiss(t.id)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' ||
              event.key === ' ' ||
              event.key === 'Escape'
            ) {
              event.preventDefault();
              toast.dismiss(t.id);
            }
          }}
        >
          <ToastBar toast={t} />
        </div>
      )}
    </Toaster>
  );
}

export const notify = {
  success: (message: string, options?: ToastOptions) =>
    toast.success(message, getToastOptions('success', options)),
  error: (message: string, options?: ToastOptions) =>
    toast.error(message, getToastOptions('error', options)),
  warning: (message: string, options?: ToastOptions) =>
    toast(message, getToastOptions('warning', options)),
  info: (message: string, options?: ToastOptions) =>
    toast(message, getToastOptions('info', options)),
  loading: (message: string, options?: ToastOptions) =>
    toast.loading(message, {
      duration: TOAST_DEFAULT_DURATION,
      className: BASE_CLASS,
      ...options,
    }),
  dismiss: (toastId?: string) => toast.dismiss(toastId),
};
