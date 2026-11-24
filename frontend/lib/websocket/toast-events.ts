/**
 * Maps real-time server events to user-facing toasts (#149).
 *
 * Pure and framework-free so the mapping can be unit tested; `use-realtime.ts`
 * feeds it every event and shows whatever it returns.
 */

import type { ToastType } from '@/components/ui/toast';

export interface ToastSpec {
  type: ToastType;
  message: string;
}

const MAX_DETAIL_LENGTH = 60;

/** Statuses on `dispute:status` that mean "a dispute was just opened". */
const DISPUTE_OPENED_STATUSES = new Set(['OPEN', 'OPENED', 'CREATED', 'FILED']);

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
}

/** A short, single-line, printable detail from a server string; server text is untrusted. */
function cleanDetail(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > MAX_DETAIL_LENGTH
    ? `${text.slice(0, MAX_DETAIL_LENGTH)}…`
    : text;
}

function paymentMessage(payload: Record<string, unknown>): string {
  const amount = cleanDetail(payload.amount);
  const currency = cleanDetail(payload.currency ?? payload.asset);
  if (!amount) return 'Payment received';
  return `Payment received: ${currency ? `${amount} ${currency}` : amount}`;
}

/**
 * The toast for a server event, or `null` when the event should not show one
 * (unknown events and chatty ones such as individual votes).
 */
export function toastForEvent(
  event: string,
  payload: unknown,
): ToastSpec | null {
  const data = asRecord(payload);

  switch (event) {
    case 'payment:completed':
      return { type: 'success', message: paymentMessage(data) };

    case 'dispute:status': {
      const status = cleanDetail(data.status)?.toUpperCase() ?? '';
      if (DISPUTE_OPENED_STATUSES.has(status)) {
        return { type: 'warning', message: 'A dispute was opened' };
      }
      if (status === 'RESOLVED') {
        return { type: 'success', message: 'A dispute was resolved' };
      }
      return { type: 'info', message: 'A dispute status changed' };
    }

    case 'escrow:released':
      return { type: 'success', message: 'Escrow funds were released' };

    case 'appeal:submitted':
      return { type: 'info', message: 'An appeal was submitted' };

    default:
      return null;
  }
}
