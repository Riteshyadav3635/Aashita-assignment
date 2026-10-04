import app from './app.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { registerDailyDigestJob, startEmailWorker } from './lib/queue.js';
import { emailQueue } from './lib/queue.js';
import { redis } from './lib/redis.js';
import { closeSocketServer, createSocketServer } from './lib/socket.js';
import { prisma } from './lib/prisma.js';

const port = env.PORT;
const host = process.env.HOST ?? '0.0.0.0';

const server = app.listen(port, host, () => {
  logger.info(`API listening on http://${host}:${port}`);
});

const io = createSocketServer(server);
let worker: ReturnType<typeof startEmailWorker> | undefined;

if (env.NODE_ENV !== 'test' && process.env.RUN_WORKER === 'true') {
  worker = startEmailWorker();
  void registerDailyDigestJob();
  logger.info('BullMQ email worker started');
}

let shuttingDown = false;

const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn({ signal }, 'Shutting down server');
  void (async () => {
    try {
      await Promise.all([closeSocketServer(io), worker?.close(), emailQueue.close()]);
      await Promise.all([prisma.$disconnect(), Promise.resolve(redis.quit())]);
      logger.info('Server closed cleanly');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exitCode = 1;
      process.exit(1);
    }
  })();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  process.exitCode = 1;
  shutdown('unhandledRejection');
});
process.on('uncaughtException', (error) => {
  logger.error({ error }, 'Uncaught exception');
  process.exitCode = 1;
  shutdown('uncaughtException');
});

export { server };
