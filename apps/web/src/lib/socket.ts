import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from './api';

export function createSocketConnection(): Socket {
  return io(process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000', {
    // Realtime board updates use WebSockets only; reconnect handlers resync snapshots.
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    auth: (callback) => callback({ token: getAccessToken() }),
  });
}
