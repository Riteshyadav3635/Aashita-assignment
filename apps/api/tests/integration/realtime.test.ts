import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as Client } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { issueAccessToken } from '../../src/lib/auth.js';
import { eventPublisher } from '../../src/lib/events.js';
import { prisma } from '../../src/lib/prisma.js';
import { closeSocketServer, createSocketServer } from '../../src/lib/socket.js';
import { disconnectDb, resetDb } from '../helpers/db.js';

describe('socket realtime board events', () => {
  let httpServer: ReturnType<typeof createServer>;
  let socketServer: ReturnType<typeof createSocketServer>;
  let client: ReturnType<typeof Client>;
  let workspaceId: string;
  let boardId: string;
  let listId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDb();

    const user = await prisma.user.create({
      data: {
        email: 'socket-user@example.com',
        name: 'Socket User',
        passwordHash: 'hashed-password',
      },
    });

    userId = user.id;

    const workspace = await prisma.workspace.create({
      data: { name: 'Realtime Workspace' },
    });
    workspaceId = workspace.id;

    await prisma.membership.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: 'OWNER',
      },
    });

    const board = await prisma.board.create({
      data: {
        workspaceId: workspace.id,
        name: 'Realtime Board',
        description: 'Board for socket tests',
        createdById: user.id,
      },
    });
    boardId = board.id;

    const list = await prisma.list.create({
      data: {
        workspaceId: workspace.id,
        boardId: board.id,
        name: 'Backlog',
        position: 'a0',
      },
    });
    listId = list.id;

    httpServer = createServer();
    socketServer = createSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;
    const accessToken = issueAccessToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: accessToken },
    });

    await new Promise<void>((resolve, reject) => {
      client.once('connect', () => resolve());
      client.once('connect_error', (error) => reject(error));
    });
  });

  afterEach(async () => {
    client.close();
    await closeSocketServer(socketServer);
    await disconnectDb();
  });

  it('joins a board room and receives task.created events', async () => {
    const joinAck = await new Promise<{ ok: boolean; workspaceId?: string; boardId?: string }>((resolve) => {
      client.emit('board:join', { workspaceId, boardId }, resolve);
    });

    expect(joinAck.ok).toBe(true);

    const eventPromise = new Promise<{ type: string; taskId: string }>((resolve) => {
      client.once('task:created', (event) => resolve(event));
    });

    eventPublisher.publish({
      type: 'task.created',
      workspaceId,
      boardId,
      listId,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: userId,
    });

    const event = await eventPromise;
    expect(event.type).toBe('task.created');
    expect(event.taskId).toBe('11111111-1111-4111-8111-111111111111');
  });
});
