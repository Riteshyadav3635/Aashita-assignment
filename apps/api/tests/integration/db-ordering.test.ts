import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { disconnectDb, resetDb } from '../helpers/db.js';

const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
});

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await Promise.all([disconnectDb(), prisma.$disconnect()]);
});

describe('database ordering checks', () => {
  it('uses C collation and keeps positions unique during concurrent moves', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Ordering Owner', email: 'ordering@example.com', password: 'Password123' });
    const token = signup.body.accessToken as string;
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'ordering@example.com' } });

    const workspace = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ordering workspace' });
    const workspaceId = workspace.body.workspace.id as string;
    const board = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ordering board' });
    const boardId = board.body.board.id as string;
    const list = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Backlog' });
    const listId = list.body.list.id as string;

    const tasks = await Promise.all(['First', 'Second', 'Third'].map(async (title) => {
      const response = await request(app)
        .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/tasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title });
      expect(response.status).toBe(201);
      return response.body.task as { id: string; position: string };
    }));

    const [column] = await prisma.$queryRaw<Array<{ collation: string }>>`
      SELECT coll.collname AS collation
      FROM pg_attribute attr
      JOIN pg_class tbl ON tbl.oid = attr.attrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      JOIN pg_collation coll ON coll.oid = attr.attcollation
      WHERE ns.nspname = 'public' AND tbl.relname = 'Task' AND attr.attname = 'position'
    `;
    expect(column?.collation).toBe('C');

    const moves = await Promise.all([
      request(app)
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${tasks[0]!.id}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({ listId, afterTaskId: tasks[2]!.id }),
      request(app)
        .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${tasks[1]!.id}/move`)
        .set('Authorization', `Bearer ${token}`)
        .send({ listId, afterTaskId: tasks[2]!.id }),
    ]);
    expect(moves.map((response) => response.status)).toEqual([200, 200]);

    const finalTasks = await prisma.task.findMany({ where: { listId }, orderBy: { position: 'asc' } });
    const finalPositions = finalTasks.map((task) => task.position);
    expect(new Set(finalPositions).size).toBe(finalTasks.length);
    expect(finalTasks).toHaveLength(3);

    await expect(prisma.task.create({
      data: {
        workspaceId,
        boardId,
        listId,
        title: 'Duplicate position',
        status: 'TODO',
        position: finalPositions[0]!,
        createdById: user.id,
      },
    })).rejects.toMatchObject({ code: 'P2002' });
  });
});
