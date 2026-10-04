import IORedis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../logger.js';

interface RedisLike {
  on(event: 'error', listener: (error: unknown) => void): void;
  quit(): Promise<'OK'> | void;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
}

const RedisClientCtor = IORedis as unknown as new (
  connection: string,
  options?: Record<string, unknown>,
) => RedisLike;

export const redis: RedisLike = new RedisClientCtor(env.REDIS_URL, {
  lazyConnect: true,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  maxRetriesPerRequest: null,
  connectTimeout: 1500,
  commandTimeout: 1500,
  retryStrategy() {
    return null;
  },
});

redis.on('error', (error: unknown) => {
  logger.warn({ err: error, redisUrl: env.REDIS_URL }, 'Redis unavailable; cache and queue fallbacks are active');
});

export async function isRedisAvailable() {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

export async function withRedis<T>(operation: (client: RedisLike) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation(redis);
  } catch (error: unknown) {
    logger.warn({ err: error }, 'Redis call failed; using fallback value');
    return fallback;
  }
}
