import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../lib/errors.js';
import { clearRefreshCookie, getRefreshTokenFromRequest, hashRefreshToken, setRefreshCookie, toPublicUser } from '../../lib/auth.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireAuth } from './middleware.js';
import { loginUser, revokeRefreshFamily, revokeUserSessions, rotateRefreshToken, signupUser } from './service.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication requests' } },
});

const signupSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const logoutHandler = async (req: Request, res: Response) => {
  const refreshToken = getRefreshTokenFromRequest(req);
  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (record) {
      await revokeRefreshFamily(record.familyId);
    }
  }

  if (req.user?.id) {
    await revokeUserSessions(req.user.id);
  }

  clearRefreshCookie(res);
  res.status(200).json({ success: true });
};

export const authRouter = Router();

authRouter.post('/signup', authLimiter, async (req: Request, res: Response, next) => {
  try {
    const payload = signupSchema.parse(req.body);
    const result = await signupUser(payload);
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      user: result.user,
      accessToken: result.accessToken,
      token: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', authLimiter, async (req: Request, res: Response, next) => {
  try {
    const payload = loginSchema.parse(req.body);
    const result = await loginUser(payload);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      user: result.user,
      accessToken: result.accessToken,
      token: result.accessToken,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req: Request, res: Response, next) => {
  try {
    const refreshToken = getRefreshTokenFromRequest(req);
    if (!refreshToken) {
      throw new AppError(401, 'MISSING_REFRESH_TOKEN', 'Refresh token is required');
    }

    const result = await rotateRefreshToken(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    res.status(200).json({
      user: result.user,
      accessToken: result.accessToken,
      token: result.accessToken,
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
});

authRouter.post('/logout', async (req: Request, res: Response, next) => {
  try {
    await logoutHandler(req, res);
  } catch (error) {
    next(error);
  }
});

authRouter.delete('/logout', async (req: Request, res: Response, next) => {
  try {
    await logoutHandler(req, res);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticate, requireAuth, (req: Request, res: Response) => {
  const user = req.user ? toPublicUser(req.user) : null;
  res.status(200).json({ user });
});
