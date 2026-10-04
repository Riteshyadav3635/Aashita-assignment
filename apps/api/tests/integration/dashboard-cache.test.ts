import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app.js';
import { redis } from '../../src/lib/redis.js';
import { disconnectDb, resetDb } from '../helpers/db.js';

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.spyOn(redis, 'get').mockRejectedValue(new Error('Redis unavailable'));
  vi.spyOn(redis, 'set').mockRejectedValue(new Error('Redis unavailable'));
  vi.spyOn(redis, 'del').mockResolvedValue(1);
  vi.spyOn(redis, 'ping').mockRejectedValue(new Error('Redis unavailable'));
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('workspace dashboard cache', () => {
  it('returns aggregated workspace stats with a cache header', async () => {
    const ownerResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Dashboard User',
        email: 'dashboard@example.com',
        password: 'Password123',
      });

    const token = ownerResponse.body.accessToken;
    const workspaceResponse = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dashboard workspace' });

    const workspaceId = workspaceResponse.body.workspace.id;

    const boardResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dashboard board' });

    const boardId = boardResponse.body.board.id;

    const listResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Planned' });

    await request(app)
      .post(`/api/workspaces/${workspaceId}/boards/${boardId}/lists/${listResponse.body.list.id}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ship release', status: 'TODO' });

    const dashboardResponse = await request(app)
      .get(`/api/workspaces/${workspaceId}/dashboard`)
      .set('Authorization', `Bearer ${token}`);

    expect(dashboardResponse.status).toBe(200);
    expect(['MISS', 'BYPASS']).toContain(dashboardResponse.headers['x-cache']);
    expect(dashboardResponse.body.totalTasks).toBe(1);
    expect(dashboardResponse.body.byStatus.TODO).toBe(1);
  });
});
