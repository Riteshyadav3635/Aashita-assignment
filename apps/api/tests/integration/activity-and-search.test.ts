import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app.js';
import { disconnectDb, resetDb } from '../helpers/db.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('workspace activity and task search', () => {
  it('returns recent activity entries in the workspace', async () => {
    const ownerResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Owner User',
        email: 'owner@example.com',
        password: 'Password123',
      });

    expect(ownerResponse.status).toBe(201);
    const ownerToken = ownerResponse.body.accessToken;

    const workspaceResponse = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Marketing Workspace' });

    expect(workspaceResponse.status).toBe(201);
    const workspaceId = workspaceResponse.body.workspace.id;

    const boardResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Launch Board' });

    const boardId = boardResponse.body.board.id;

    const listResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'To Do' });

    const listId = listResponse.body.list.id;

    await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Fix login bug', description: 'Investigate OAuth redirect loop' });

    const activityResponse = await request(app)
      .get(`/api/workspaces/${workspaceId}/activity`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ limit: 10, action: 'task.created' });

    expect(activityResponse.status).toBe(200);
    expect(activityResponse.body.items.length).toBeGreaterThan(0);
    expect(activityResponse.body.items.some((entry: { action: string }) => entry.action === 'task.created')).toBe(true);
  });

  it('searches tasks by text and filters by status and board', async () => {
    const ownerResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Owner User',
        email: 'owner2@example.com',
        password: 'Password123',
      });

    expect(ownerResponse.status).toBe(201);
    const ownerToken = ownerResponse.body.accessToken;

    const workspaceResponse = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Ops Workspace' });

    const workspaceId = workspaceResponse.body.workspace.id;

    const boardResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Support Board' });

    const boardId = boardResponse.body.board.id;

    const listResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Backlog' });

    const listId = listResponse.body.list.id;

    await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Fix login bug', description: 'investigate auth bug', status: 'TODO' });

    await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Document onboarding', description: 'write docs', status: 'DONE' });

    const searchResponse = await request(app)
      .get(`/api/workspaces/${workspaceId}/search`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .query({ q: 'login', boardId: boardId, status: 'TODO', page: 1, pageSize: 20 });

    expect(searchResponse.status).toBe(200);
    expect(searchResponse.body.total).toBe(1);
    expect(searchResponse.body.items[0].title).toBe('Fix login bug');
  });
});
