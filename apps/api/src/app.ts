import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './lib/errors.js';
import { prisma } from './lib/prisma.js';
import { redis } from './lib/redis.js';
import { authRouter } from './modules/auth/router.js';
import { invitationsRouter } from './modules/invitations/router.js';
import workspacesRouter from './modules/workspaces/router.js';

const app = express();

app.set('trust proxy', 1);
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  }),
);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use(pinoHttp({
  logger,
  genReqId: () => globalThis.crypto.randomUUID(),
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.socket?.remoteAddress,
    }),
  },
}));

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/health/ready', async (_req: Request, res: Response) => {
  let dbReady = false;
  let redisReady = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
  } catch (error) {
    logger.error({ err: error }, 'Database health check failed');
  }

  try {
    await redis.ping();
    redisReady = true;
  } catch (error) {
    logger.warn({ err: error }, 'Redis health check failed; API remains degraded but available');
  }

  if (!dbReady) {
    return res.status(503).json({ status: 'not_ready', db: 'down', redis: redisReady ? 'up' : 'down' });
  }

  return res.status(200).json({ status: 'ready', db: 'up', redis: redisReady ? 'up' : 'down' });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api/auth', authRouter);
app.use('/api/invitations', invitationsRouter);
app.use('/api/workspaces', workspacesRouter);

app.use(notFoundHandler);
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  void next;
  errorHandler(err, req, res);
});

export default app;
