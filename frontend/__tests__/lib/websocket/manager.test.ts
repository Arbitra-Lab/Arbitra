import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
const socket = {
  connected: false,
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    const list = socketHandlers.get(event) ?? [];
    list.push(handler);
    socketHandlers.set(event, list);
    return socket;
  }),
  off: vi.fn(() => socket),
  emit: vi.fn(() => socket),
  removeAllListeners: vi.fn(() => socket),
  disconnect: vi.fn(() => socket),
  connect: vi.fn(() => socket),
};

const io = vi.fn(() => socket);

vi.mock('socket.io-client', () => ({
  io: (...args: unknown[]) => io(...args),
}));

import * as ws from '@/lib/websocket/manager';

function fire(event: string, ...args: unknown[]) {
  (socketHandlers.get(event) ?? []).forEach((handler) => handler(...args));
}

describe('WebSocket connection manager (#12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketHandlers.clear();
    socket.connected = false;
    ws.disconnect();
    vi.clearAllMocks();
  });

  it('enables reconnection with bounded backoff', () => {
    ws.connect({ token: 't1', namespace: '/notifications' });
    expect(io).toHaveBeenCalledTimes(1);
    expect(io).toHaveBeenCalledWith(
      expect.stringContaining('/notifications'),
      expect.objectContaining({
        auth: { token: 't1' },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1_000,
        reconnectionDelayMax: 5_000,
      }),
    );
  });

  it('reports connection status and retries a server-side disconnect', () => {
    const statuses: string[] = [];
    const unsubscribe = ws.onStatusChange((s) => statuses.push(s));

    ws.connect({ token: 't1' });
    expect(statuses).toContain('connecting');

    fire('connect');
    expect(statuses).toContain('connected');

    fire('disconnect', 'io server disconnect');
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('disconnected');

    unsubscribe();
    ws.disconnect();
  });

  it('persists domain listeners across connect calls', () => {
    const handler = vi.fn();
    const unsubscribe = ws.on('vote:cast', handler);

    ws.connect({ token: 't1' });
    expect(socket.on).toHaveBeenCalledWith('vote:cast', handler);

    fire('vote:cast', { disputeId: 'D-1' });
    expect(handler).toHaveBeenCalledWith({ disputeId: 'D-1' });

    unsubscribe();
    ws.disconnect();
  });
});
