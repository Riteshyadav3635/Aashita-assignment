import { createHash, randomBytes } from 'node:crypto';
import { type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export function getAccessSecret() {
  return process.env.JWT_ACCESS_SECRET ?? process.env.JWT_SECRET ?? env.JWT_ACCESS_SECRET;
}

export function getRefreshSecret() {
  return process.env.JWT_REFRESH_SECRET ?? env.JWT_REFRESH_SECRET;
}

export function issueAccessToken(user: SessionUser): string {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, getAccessSecret(), {
    algorithm: 'HS256',
    expiresIn: '15m',
    issuer: 'workspace-api',
  });
}

export function verifyAccessToken(token: string) {
  return jwt.verify(token, getAccessSecret(), {
    algorithms: ['HS256'],
    issuer: 'workspace-api',
  }) as { sub: string; email: string; name: string; iat?: number; exp?: number };
}

export function generateRefreshToken() {
  return randomBytes(32).toString('base64url');
}

export function generateInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function hashRefreshToken(token: string) {
  return hashToken(token);
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie('refresh_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie('refresh_token', { path: '/api/auth', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
}

export function getRefreshTokenFromRequest(req: Request) {
  const cookieToken = req.cookies?.refresh_token;
  if (typeof cookieToken === 'string' && cookieToken.length > 0) return cookieToken;
  const headerToken = req.headers['x-refresh-token'];
  if (typeof headerToken === 'string' && headerToken.length > 0) return headerToken;
  return null;
}

export function toPublicUser(user: { id: string; email: string; name: string }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
