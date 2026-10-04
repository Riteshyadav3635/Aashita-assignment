import type { Server as HttpServer } from 'node:http';
import IORedis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccessToken } from './auth.js';
import { eventPublisher, type DomainEvent } from './events.js';
import { prisma } from './prisma.js';
import { logger } from '../logger.js';

interface SocketRedisClient {
  status: string;
  on(event: 'error', listener: (error: unknown) => void): void;
  duplicate(options?: Record<string, unknown>): SocketRedisClient;
  connect(): Promise<void>;
  quit(): Promise<'OK'>;
  disconnect(): void;
}

const RedisClientCtor = IORedis as unknown as new (
  connection: string,
  options?: Record<string, unknown>,
) => SocketRedisClient;
const redisClients = new WeakMap<Server, [SocketRedisClient, SocketRedisClient]>();

function broadcastEvent(io: Server, event: DomainEvent) {
  const normalizedEventName = event.type.replace('.', ':');

  io.to(`workspace:${event.workspaceId}`).emit(normalizedEventName, event);

  if (event.type === 'member.removed' || event.type === 'member.role_changed') {
    void io.in(`workspace:${event.workspaceId}`).fetchSockets().then((sockets) => {
      for (const socket of sockets) {
        if (socket.data.userId !== event.userId) continue;
        if (event.type === 'member.removed') {
          socket.disconnect(true);
        } else {
          for (const room of socket.rooms) {
            if (room === `workspace:${event.workspaceId}` || room.startsWith('board:')) {
              void socket.leave(room);
            }
          }
        }
      }
    }).catch(() => undefined);
  }

  if ('boardId' in event && typeof event.boardId === 'string') {
    io.to(`board:${event.boardId}`).emit(normalizedEventName, event);
  }
}

export function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.FRONTEND_URL,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  const pubClient = new RedisClientCtor(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: (attempt: number) => Math.min(attempt * 250, 5000),
  });
  const subClient = pubClient.duplicate({ lazyConnect: true });
  redisClients.set(io, [pubClient, subClient]);
  io.adapter(createAdapter(pubClient, subClient));
  pubClient.on('error', (error: unknown) => logger.warn({ err: error }, 'Socket.IO Redis publisher unavailable'));
  subClient.on('error', (error: unknown) => logger.warn({ err: error }, 'Socket.IO Redis subscriber unavailable'));
  void Promise.all([pubClient.connect(), subClient.connect()]).catch((error: unknown) => {
    logger.warn({ err: error }, 'Socket.IO Redis adapter connection failed; local broadcasts remain available');
  });

  io.use((socket, next) => {
    const handshakeToken = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : typeof socket.handshake.headers.authorization === 'string'
        ? socket.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
        : null;

    if (!handshakeToken) {
      return next(new Error('UNAUTHENTICATED'));
    }

    try {
      const payload = verifyAccessToken(handshakeToken);
      socket.data.userId = payload.sub;
      socket.data.tokenExpiresAt = payload.exp;
      return next();
    } catch {
      return next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const expiresAt = socket.data.tokenExpiresAt as number | undefined;
    if (expiresAt) {
      const expiryTimer = globalThis.setTimeout(() => socket.disconnect(true), Math.max(0, expiresAt * 1000 - Date.now()));
      expiryTimer.unref();
      socket.once('disconnect', () => globalThis.clearTimeout(expiryTimer));
    }

    socket.on('workspace:join', async ({ workspaceId }: { workspaceId: string }, callback?: (response: { ok: boolean; workspaceId?: string; code?: string }) => void) => {
      try {
        const membership = await prisma.membership.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId: socket.data.userId,
            },
          },
        });

        if (!membership) {
          callback?.({ ok: false, workspaceId, code: 'NOT_FOUND' });
          return;
        }

        await socket.join(`workspace:${workspaceId}`);
        callback?.({ ok: true, workspaceId });
      } catch {
        callback?.({ ok: false, workspaceId, code: 'INTERNAL_ERROR' });
      }
    });

    socket.on('board:join', async ({ workspaceId, boardId }: { workspaceId: string; boardId: string }, callback?: (response: { ok: boolean; workspaceId?: string; boardId?: string; code?: string }) => void) => {
      try {
        const [board, membership] = await Promise.all([
          prisma.board.findFirst({
            where: {
              id: boardId,
              workspaceId,
            },
          }),
          prisma.membership.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId,
                userId: socket.data.userId,
              },
            },
          }),
        ]);

        if (!board || !membership) {
          callback?.({ ok: false, workspaceId, boardId, code: 'NOT_FOUND' });
          return;
        }

        await socket.join(`workspace:${workspaceId}`);
        await socket.join(`board:${boardId}`);
        callback?.({ ok: true, workspaceId, boardId });
      } catch {
        callback?.({ ok: false, workspaceId, boardId, code: 'INTERNAL_ERROR' });
      }
    });
  });

  const subscribeBroadcast = <T extends DomainEvent['type']>(eventType: T) => {
    eventPublisher.subscribe(eventType, (event: Extract<DomainEvent, { type: T }>) => {
      broadcastEvent(io, event as DomainEvent);
    });
  };

  subscribeBroadcast('workspace.created');
  subscribeBroadcast('member.invited');
  subscribeBroadcast('member.joined');
  subscribeBroadcast('member.removed');
  subscribeBroadcast('member.role_changed');
  subscribeBroadcast('board.created');
  subscribeBroadcast('board.updated');
  subscribeBroadcast('board.deleted');
  subscribeBroadcast('list.created');
  subscribeBroadcast('list.updated');
  subscribeBroadcast('list.moved');
  subscribeBroadcast('list.deleted');
  subscribeBroadcast('task.created');
  subscribeBroadcast('task.updated');
  subscribeBroadcast('task.moved');
  subscribeBroadcast('task.deleted');
  subscribeBroadcast('invitation.revoked');
  subscribeBroadcast('label.created');
  subscribeBroadcast('label.updated');
  subscribeBroadcast('label.deleted');

  return io;
}

export async function closeSocketServer(io: Server) {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  const clients = redisClients.get(io);
  redisClients.delete(io);
  if (clients) {
    await Promise.all(clients.map(async (client) => {
      if (client.status === 'ready') await client.quit();
      else client.disconnect();
    }));
  }
}
