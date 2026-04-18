import { Redis } from 'ioredis';
import { config } from '../config.js';

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (redisClient) return redisClient;

  const client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 5000);
      console.warn(`[Redis] Reconnecting... attempt ${times}, next retry in ${delay}ms`);
      return delay;
    },
  });

  client.on('connect', () => console.log('[Redis] Connected'));
  client.on('ready', () => console.log('[Redis] Ready'));
  client.on('error', (err: Error) => console.error('[Redis] Error:', err.message));
  client.on('close', () => console.warn('[Redis] Connection closed'));
  client.on('reconnecting', () => console.warn('[Redis] Reconnecting...'));

  redisClient = client;
  return client;
}

export const redis = getRedisClient();
