import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import app from '../../src/app.js';
import { disconnectDb, resetDb } from '../helpers/db.js';

beforeEach(async () => {
  process.env.EXPOSE_INVITE_LINKS = 'true';
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('auth and workspace RBAC', () => {
  it('creates a user workspace and restricts member permissions', async () => {
    const ownerResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Owner User',
        email: 'owner@example.com',
        password: 'Password123',
      });

    expect(ownerResponse.status).toBe(201);
    const ownerToken = ownerResponse.body.accessToken;
    const ownerId = ownerResponse.body.user.id;

    const createWorkspaceResponse = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Team Workspace' });

    expect(createWorkspaceResponse.status).toBe(201);
    const workspaceId = createWorkspaceResponse.body.workspace.id;

    const memberResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Member User',
        email: 'member@example.com',
        password: 'Password123',
      });

    expect(memberResponse.status).toBe(201);
    const memberToken = memberResponse.body.accessToken;
    const memberId = memberResponse.body.user.id;

    await prisma.membership.create({
      data: {
        workspaceId,
        userId: memberId,
        role: 'MEMBER',
      },
    });

    const memberWorkspaceResponse = await request(app)
      .get(`/api/workspaces/${workspaceId}`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(memberWorkspaceResponse.status).toBe(200);
    expect(memberWorkspaceResponse.body.workspace.id).toBe(workspaceId);

    const memberInviteResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ email: 'viewer@example.com', role: 'VIEWER' });

    expect(memberInviteResponse.status).toBe(403);
    expect(memberInviteResponse.body.error.code).toBe('FORBIDDEN');

    const ownerMembersResponse = await request(app)
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(ownerMembersResponse.status).toBe(200);
    expect(ownerMembersResponse.body.members.some((member: { userId: string }) => member.userId === ownerId)).toBe(true);
    expect(ownerMembersResponse.body.members.some((member: { userId: string }) => member.userId === memberId)).toBe(true);
  });

  it('rotates refresh tokens and revokes the family when a token is reused', async () => {
    const signup = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Refresh User', email: 'refresh@example.com', password: 'Password123' });
    expect(signup.status).toBe(201);
    const originalCookie = (signup.headers['set-cookie'] as string[])[0]!.split(';')[0]!;

    const rotation = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie);
    expect(rotation.status).toBe(200);
    const rotatedCookie = (rotation.headers['set-cookie'] as string[])[0]!.split(';')[0]!;

    const reused = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', originalCookie);
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('TOKEN_REUSED');

    const revokedFamilyToken = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', rotatedCookie);
    expect(revokedFamilyToken.status).toBe(401);
    expect(revokedFamilyToken.body.error.code).toBe('TOKEN_REUSED');
  });

  it('creates and accepts an invite using the hashed token flow', async () => {
    const ownerResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Owner User',
        email: 'owner-invite@example.com',
        password: 'Password123',
      });

    expect(ownerResponse.status).toBe(201);
    const ownerToken = ownerResponse.body.accessToken;

    const workspaceResponse = await request(app)
      .post('/api/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Invite Workspace' });

    expect(workspaceResponse.status).toBe(201);
    const workspaceId = workspaceResponse.body.workspace.id;

    const guestResponse = await request(app)
      .post('/api/auth/signup')
      .send({
        name: 'Guest User',
        email: 'guest-invite@example.com',
        password: 'Password123',
      });

    expect(guestResponse.status).toBe(201);
    const guestToken = guestResponse.body.accessToken;

    const inviteResponse = await request(app)
      .post(`/api/workspaces/${workspaceId}/invitations`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: 'guest-invite@example.com', role: 'MEMBER' });

    expect(inviteResponse.status).toBe(201);
    expect(inviteResponse.body.invitation.email).toBe('guest-invite@example.com');
    expect(inviteResponse.body.token).toBeTruthy();

    const acceptResponse = await request(app)
      .post('/api/invitations/accept')
      .set('Authorization', `Bearer ${guestToken}`)
      .send({ token: inviteResponse.body.token });

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.membership.workspaceId).toBe(workspaceId);

    const memberListResponse = await request(app)
      .get(`/api/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(memberListResponse.status).toBe(200);
    expect(memberListResponse.body.members.some((member: { email?: string }) => member.email === 'guest-invite@example.com')).toBe(true);
  });
});
