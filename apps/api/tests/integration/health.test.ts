import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app.js';

describe('GET /health', () => {
  it('returns ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns a validation error for invalid auth input', async () => {
    const response = await request(app).post('/api/auth/login').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
    });
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ['email'] }),
        expect.objectContaining({ path: ['password'] }),
      ]),
    );
  });
});
