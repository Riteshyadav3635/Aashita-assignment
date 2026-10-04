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

describe('board and list workflow', () => {
  it('creates a board, list and task, then reorders task within a list', async () => {
    const ownerResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Board Owner',
        email: 'boardowner@example.com',
        password: 'Password123',
      });

    expect(ownerResponse.status).toBe(201);
    const token = ownerResponse.body.accessToken;

    const workspaceResponse = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Board workspace' });

    expect(workspaceResponse.status).toBe(201);
    const workspaceId = workspaceResponse.body.workspace.id;

    const boardResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sprint board', description: 'Example board' });

    expect(boardResponse.status).toBe(201);
    const boardId = boardResponse.body.board.id;

    const listResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Todo' });

    expect(listResponse.status).toBe(201);
    const listId = listResponse.body.list.id;

    const firstTaskResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'First task', description: 'Alpha' });

    expect(firstTaskResponse.status).toBe(201);
    const firstTaskId = firstTaskResponse.body.task.id;

    const secondTaskResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Second task', description: 'Beta' });

    expect(secondTaskResponse.status).toBe(201);
    const secondTaskId = secondTaskResponse.body.task.id;

    const moveResponse = await request(app)
      .patch(`/api/workspaces/${workspaceId}/boards/${boardId}/tasks/${firstTaskId}/move`)
      .set('Authorization', `Bearer ${token}`)
      .send({ listId, afterTaskId: secondTaskId });

    expect(moveResponse.status).toBe(200);
    expect(moveResponse.body.task.id).toBe(firstTaskId);

    const listFetch = await request(app)
      .get(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .set('Authorization', `Bearer ${token}`);

    expect(listFetch.status).toBe(200);
    expect(listFetch.body.lists[0].tasks.map((task: { id: string }) => task.id)).toContain(firstTaskId);
    expect(listFetch.body.lists[0].tasks.map((task: { id: string }) => task.id)).toContain(secondTaskId);
  });
});
