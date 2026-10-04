import { logger } from '../logger.js';
import { redis } from './redis.js';

const singleFlight = new Map<string, Promise<unknown>>();

export function workspaceDashboardKey(workspaceId: string) {
  return `cache:v1:ws:${workspaceId}:dashboard`;
}

export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<{ value: T; cacheStatus: 'HIT' | 'MISS' | 'BYPASS' }> {
  let redisReadFailed = false;

  try {
    const cached = await redis.get(key);
    if (cached !== null) {
      return { value: JSON.parse(cached) as T, cacheStatus: 'HIT' };
    }
  } catch (error: unknown) {
    redisReadFailed = true;
    logger.warn({ err: error, key }, 'Redis read failed; bypassing read-through cache');
  }

  if (redisReadFailed) {
    const value = await loader();
    return { value, cacheStatus: 'BYPASS' };
  }

  const inFlight = singleFlight.get(key);
  if (inFlight) {
    const value = (await inFlight) as T;
    return { value, cacheStatus: 'MISS' };
  }

  const promise = (async () => {
    const value = await loader();

    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error: unknown) {
      logger.warn({ err: error, key }, 'Redis write failed; dashboard cache stays bypassed');
      return { value, cacheStatus: 'BYPASS' as const };
    }

    return { value, cacheStatus: 'MISS' as const };
  })();

  singleFlight.set(key, promise);

  try {
    const result = await promise;
    return result;
  } finally {
    singleFlight.delete(key);
  }
}

export async function invalidateWorkspaceDashboard(workspaceId: string) {
  await redis.del(workspaceDashboardKey(workspaceId)).catch((error: unknown) => {
    logger.warn({ err: error, workspaceId }, 'Redis invalidation failed; continuing without cache eviction');
  });
}
