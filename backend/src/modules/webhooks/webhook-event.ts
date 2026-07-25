export const WEBHOOK_EVENTS = [
  'payment.received',
  'payment.failed',
  'deposit.received',
  'deposit.released',
  'agreement.activated',
  'agreement.expired',
  'dispute.created',
  'transaction.indexed',
  'screening.completed',
  'screening.failed',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_DELIVERY_STATUSES = [
  'pending',
  'delivered',
  'retrying',
  'dead_letter',
] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/** After this many attempts a delivery stops retrying and moves to the DLQ. */
export const WEBHOOK_MAX_DELIVERY_ATTEMPTS = 6;

export const WEBHOOK_BASE_BACKOFF_MS = 30_000; // 30s
export const WEBHOOK_MAX_BACKOFF_MS = 30 * 60_000; // 30m ceiling

export interface WebhookBackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** Injectable source of randomness in [0, 1) for deterministic tests. */
  random?: () => number;
}

/**
 * Exponential backoff with equal jitter: delay is always within
 * [50%, 100%] of the exponential value, so retries thin out over time
 * without ever colliding at exactly the same instant (thundering herd)
 * or firing immediately (jitter floor).
 */
export function computeWebhookBackoffMs(
  attempt: number,
  options: WebhookBackoffOptions = {},
): number {
  const baseMs = options.baseMs ?? WEBHOOK_BASE_BACKOFF_MS;
  const maxMs = options.maxMs ?? WEBHOOK_MAX_BACKOFF_MS;
  const random = options.random ?? Math.random;

  const safeAttempt = Math.max(1, attempt);
  const exponential = baseMs * Math.pow(2, safeAttempt - 1);
  const capped = Math.min(exponential, maxMs);
  const half = capped / 2;

  return Math.floor(half + random() * half);
}
