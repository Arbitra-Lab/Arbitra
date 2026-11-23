'use client';

import { io, type Socket } from 'socket.io-client';
import { getSocketUrl } from './manager';

export interface MessagingConnection {
  socket: Socket;
  dispose: () => void;
}

export function createMessagingConnection(
  token: string,
  userId: string,
): MessagingConnection {
  const socket = io(`${getSocketUrl()}/messaging`, {
    auth: { token },
    query: { userId },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
    timeout: 20_000,
  });

  const heartbeat = setInterval(() => {
    if (socket.connected)
      socket.emit('session:ping', { timestamp: Date.now() });
  }, 25_000);

  return {
    socket,
    dispose: () => {
      clearInterval(heartbeat);
      socket.removeAllListeners();
      socket.disconnect();
    },
  };
}
