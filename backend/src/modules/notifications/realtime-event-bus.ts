/**
 * Tiny typed in-process event bus for realtime domain notifications (#12).
 *
 * It exists so services can publish a domain event without adding another
 * constructor dependency to already-large services. The
 * `NotificationsRealtimeService` is the only subscriber and forwards events to
 * the connected user rooms through the rate-limited socket channel.
 *
 * This is deliberately in-process only. Multi-instance fan-out would require a
 * real broker (Redis pub/sub) and is documented as a follow-up.
 */

import {
  RealtimeDomainEvent,
  REALTIME_EVENTS,
} from './notifications-realtime.service';

export interface RealtimeEventPayload {
  /** User IDs that should receive the event. */
  userIds: string[];
  /** Human-readable summary used by the client notification centre. */
  title?: string;
  message?: string;
  /** Domain identifiers, e.g. disputeId, voteId, escrowId. */
  [key: string]: unknown;
}

type Handler = (
  event: RealtimeDomainEvent,
  payload: RealtimeEventPayload,
) => void;

const handlers = new Set<Handler>();

/** Publish a domain event to all subscribed realtime publishers. */
export function publishRealtimeEvent(
  event: RealtimeDomainEvent,
  payload: RealtimeEventPayload,
): void {
  if (!Array.isArray(payload.userIds) || payload.userIds.length === 0) return;
  handlers.forEach((handler) => {
    try {
      handler(event, payload);
    } catch {
      // A broken subscriber must never break the originating transaction.
    }
  });
}

/** Subscribe to domain events. Returns an unsubscribe function. */
export function subscribeToRealtimeEvents(handler: Handler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/** Test-only helper to drop all subscribers. */
export function resetRealtimeEventBus(): void {
  handlers.clear();
}

/** Convenience publishers keep call sites explicit and typed. */
export const realtimeEvents = {
  disputeStatus: (payload: RealtimeEventPayload) =>
    publishRealtimeEvent(REALTIME_EVENTS.disputeStatus, payload),
  voteCast: (payload: RealtimeEventPayload) =>
    publishRealtimeEvent(REALTIME_EVENTS.voteCast, payload),
  escrowReleased: (payload: RealtimeEventPayload) =>
    publishRealtimeEvent(REALTIME_EVENTS.escrowReleased, payload),
  appealSubmitted: (payload: RealtimeEventPayload) =>
    publishRealtimeEvent(REALTIME_EVENTS.appealSubmitted, payload),
};
