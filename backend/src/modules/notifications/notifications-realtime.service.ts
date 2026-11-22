import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { Notification } from './entities/notification.entity';
import {
  RateLimitResult,
  SlidingWindowRateLimiter,
} from '../../common/utils/ws-rate-limiter';
import { subscribeToRealtimeEvents } from './realtime-event-bus';

/** Server-sent realtime event names shared with the frontend client (#12). */
export const REALTIME_EVENTS = {
  notification: 'notification',
  disputeStatus: 'dispute:status',
  voteCast: 'vote:cast',
  escrowReleased: 'escrow:released',
  appealSubmitted: 'appeal:submitted',
} as const;

export type RealtimeDomainEvent =
  | typeof REALTIME_EVENTS.disputeStatus
  | typeof REALTIME_EVENTS.voteCast
  | typeof REALTIME_EVENTS.escrowReleased
  | typeof REALTIME_EVENTS.appealSubmitted;

/** Per user+event burst ceiling: 20 events per 10 seconds. */
const DOMAIN_EVENT_MAX = 20;
const DOMAIN_EVENT_WINDOW_MS = 10_000;

@Injectable()
export class NotificationsRealtimeService {
  private readonly logger = new Logger(NotificationsRealtimeService.name);
  private server: Server | null = null;
  private readonly limiter = new SlidingWindowRateLimiter(
    DOMAIN_EVENT_MAX,
    DOMAIN_EVENT_WINDOW_MS,
  );
  private readonly unsubscribeBus: () => void;

  constructor() {
    this.unsubscribeBus = subscribeToRealtimeEvents((event, payload) => {
      for (const userId of new Set(payload.userIds)) {
        const { userIds: _ignored, ...body } = payload;
        void _ignored;
        this.emitDomainEvent(userId, event, body);
      }
    });
  }

  /** Release the in-process bus subscription (used during shutdown/tests). */
  onModuleDestroy(): void {
    this.unsubscribeBus();
  }

  registerServer(server: Server) {
    this.server = server;
    this.logger.log('Notification realtime server registered');
  }

  emitToUser(userId: string, notification: Notification) {
    this.emit(userId, REALTIME_EVENTS.notification, {
      id: notification.id,
      title: notification.title,
      message: notification.message,
      isRead: notification.isRead,
      type: notification.type,
      createdAt: notification.createdAt,
    });
  }

  /**
   * Emit a domain event to a single user's room. Events are rate limited per
   * user and event type so a burst of dispute/vote updates cannot flood a
   * client (or trigger a React Query refetch storm).
   */
  emitDomainEvent(
    userId: string,
    event: RealtimeDomainEvent,
    payload: Record<string, unknown>,
  ): RateLimitResult {
    const decision = this.limiter.check(`${userId}:${event}`);
    if (!decision.allowed) {
      this.logger.warn(
        `Realtime event ${event} rate limited for user ${userId}; retry in ${decision.retryAfterMs}ms`,
      );
      return decision;
    }

    this.emit(userId, event, payload);
    return decision;
  }

  /** Number of user+event keys currently tracked by the rate limiter. */
  get trackedEventKeys(): number {
    return this.limiter.trackedKeys;
  }

  private emit(userId: string, event: string, payload: unknown) {
    if (!this.server) {
      this.logger.warn(
        `Realtime server not ready; skipped live emit of ${event} for user ${userId}`,
      );
      return;
    }

    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }
}
