import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/errors.js';
import { verifyAccessToken } from '../../lib/auth.js';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const rawToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : req.cookies?.access_token ?? null;

  if (!rawToken) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }

  try {
    const payload = verifyAccessToken(rawToken);
    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
    };
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Authentication token is invalid or expired'));
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    return;
  }

  next();
}
