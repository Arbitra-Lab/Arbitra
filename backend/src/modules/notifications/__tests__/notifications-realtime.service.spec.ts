import { Server } from 'socket.io';
import {
  NotificationsRealtimeService,
  REALTIME_EVENTS,
} from '../notifications-realtime.service';
import {
  publishRealtimeEvent,
  realtimeEvents,
  resetRealtimeEventBus,
} from '../realtime-event-bus';
import { Notification } from '../entities/notification.entity';

function stubServer() {
  const to = jest.fn().mockReturnThis();
  const emit = jest.fn().mockReturnThis();
  const server = { to, emit } as unknown as Server;
  return { server, to, emit };
}

function notification(): Notification {
  return {
    id: 'n1',
    title: 'Hello',
    message: 'World',
    isRead: false,
    type: 'message',
    createdAt: new Date('2026-11-22T10:00:00Z'),
  } as Notification;
}

describe('NotificationsRealtimeService (#12)', () => {
  let service: NotificationsRealtimeService;

  beforeEach(() => {
    resetRealtimeEventBus();
    service = new NotificationsRealtimeService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    resetRealtimeEventBus();
  });

  it('emits notifications to the user room only', () => {
    const { server, to, emit } = stubServer();
    service.registerServer(server);

    service.emitToUser('user-1', notification());

    expect(to).toHaveBeenCalledWith('user:user-1');
    expect(emit).toHaveBeenCalledWith(
      REALTIME_EVENTS.notification,
      expect.objectContaining({ id: 'n1', title: 'Hello' }),
    );
  });

  it('publishes domain events from the bus to every listed user', () => {
    const { server, to, emit } = stubServer();
    service.registerServer(server);

    realtimeEvents.disputeStatus({
      userIds: ['a', 'b'],
      disputeId: 'D-1',
      status: 'UNDER_REVIEW',
    });

    expect(to).toHaveBeenCalledWith('user:a');
    expect(to).toHaveBeenCalledWith('user:b');
    expect(emit).toHaveBeenCalledWith(
      'dispute:status',
      expect.objectContaining({ disputeId: 'D-1', status: 'UNDER_REVIEW' }),
    );
  });

  it('rate limits bursts per user and event type', () => {
    const { emit } = stubServer();
    const server = {
      to: jest.fn().mockReturnThis(),
      emit,
    } as unknown as Server;
    service.registerServer(server);

    for (let i = 0; i < 20; i++) {
      publishRealtimeEvent(REALTIME_EVENTS.voteCast, {
        userIds: ['u1'],
        voteId: i,
      });
    }
    expect(emit).toHaveBeenCalledTimes(20);

    const decision = service.emitDomainEvent('u1', REALTIME_EVENTS.voteCast, {
      voteId: 21,
    });
    expect(decision.allowed).toBe(false);
    expect(emit).toHaveBeenCalledTimes(20);

    // A different user, or a different event for the same user, is unaffected.
    expect(
      service.emitDomainEvent('u2', REALTIME_EVENTS.voteCast, {}).allowed,
    ).toBe(true);
    expect(
      service.emitDomainEvent('u1', REALTIME_EVENTS.escrowReleased, {}).allowed,
    ).toBe(true);
  });

  it('does not throw before a server is registered', () => {
    expect(() =>
      realtimeEvents.appealSubmitted({ userIds: ['u1'], disputeId: 'D-2' }),
    ).not.toThrow();
  });

  it('stops forwarding events after teardown', () => {
    const { emit } = stubServer();
    service.registerServer({
      to: jest.fn().mockReturnThis(),
      emit,
    } as unknown as Server);
    service.onModuleDestroy();

    realtimeEvents.disputeStatus({ userIds: ['u1'] });
    expect(emit).not.toHaveBeenCalled();
  });
});
