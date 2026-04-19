import { Redis } from 'ioredis';
import { Server } from 'socket.io';
import { getRedisClient } from '../lib/redis.js';
import { RoomMember } from '../models/roomMember.model.js';
import { Dialog } from '../models/dialog.model.js';

const AFK_THRESHOLD_MS = 60_000;
const PRESENCE_TTL_S = 90;
const PRESENCE_CHANNEL = 'presence_updates';

export type PresenceStatus = 'online' | 'afk' | 'offline';

/**
 * Evaluates user presence based on all open socket tabs and their last-activity timestamps.
 * - If no tabs: offline
 * - If any tab has activity within the last 60 s: online
 * - Otherwise: afk
 */
export function evaluatePresence(tabs: Record<string, number>): PresenceStatus {
  const timestamps = Object.values(tabs);
  if (timestamps.length === 0) return 'offline';
  const mostRecent = Math.max(...timestamps);
  return Date.now() - mostRecent < AFK_THRESHOLD_MS ? 'online' : 'afk';
}

/** Record a heartbeat for a specific socket connection. */
export async function updatePresenceHeartbeat(userId: string, socketId: string): Promise<void> {
  const redis = getRedisClient();
  const key = `presence:${userId}`;
  await redis.hset(key, socketId, Date.now());
  await redis.expire(key, PRESENCE_TTL_S);
}

/** Remove a socket from the presence hash (on disconnect). */
export async function removePresenceSocket(userId: string, socketId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.hdel(`presence:${userId}`, socketId);
}

/** Fetch all socket→timestamp entries for a user. */
export async function getPresenceTabs(userId: string): Promise<Record<string, number>> {
  const redis = getRedisClient();
  const raw = await redis.hgetall(`presence:${userId}`);
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) {
    result[k] = Number(v);
  }
  return result;
}

/** Publish a presence status change to the Redis pub/sub channel. */
export async function publishPresenceChange(userId: string, status: PresenceStatus): Promise<void> {
  const redis = getRedisClient();
  await redis.publish(PRESENCE_CHANNEL, JSON.stringify({ userId, status }));
}

/**
 * Subscribe to the presence_updates channel on a dedicated sub client.
 * On each message, emits Socket.IO "presence" events to all rooms/dialogs the user belongs to.
 */
export function subscribePresence(subClient: Redis, io: Server): void {
  subClient.subscribe(PRESENCE_CHANNEL, (err) => {
    if (err) {
      console.error('[Presence] Failed to subscribe to presence_updates:', err);
    } else {
      console.log('[Presence] Subscribed to presence_updates channel');
    }
  });

  subClient.on('message', async (_channel, message) => {
    try {
      const { userId, status } = JSON.parse(message) as { userId: string; status: PresenceStatus };

      const [memberships, dialogs] = await Promise.all([
        RoomMember.find({ userId }).lean(),
        Dialog.find({ participants: userId }).lean(),
      ]);

      const roomTargets = memberships.map((m) => `room:${m.roomId}`);
      const dialogTargets = dialogs.map((d) => `dialog:${d._id}`);
      const targets = [...new Set([...roomTargets, ...dialogTargets, `user:${userId}`])];

      for (const target of targets) {
        io.to(target).emit('presence', { userId, status });
      }
    } catch (err) {
      console.error('[Presence] Error processing presence update:', err);
    }
  });
}

/**
 * Returns the current computed presence status for each of the given userIds
 * by reading Redis directly, without publishing any events.
 */
export async function getPresenceStatuses(
  userIds: string[]
): Promise<Record<string, PresenceStatus>> {
  const result: Record<string, PresenceStatus> = {};
  await Promise.all(
    userIds.map(async (userId) => {
      const tabs = await getPresenceTabs(userId);
      result[userId] = evaluatePresence(tabs);
    })
  );
  return result;
}

/**
 * Compute the current presence status for a user and publish it if it has changed
 * from the last known status stored in Redis.
 */
export async function evaluateAndBroadcastPresence(userId: string): Promise<void> {
  const tabs = await getPresenceTabs(userId);
  const status = evaluatePresence(tabs);

  const redis = getRedisClient();
  const lastStatusKey = `presence:${userId}:status`;
  const lastStatus = await redis.get(lastStatusKey);

  if (lastStatus !== status) {
    await redis.set(lastStatusKey, status, 'EX', PRESENCE_TTL_S * 2);
    await publishPresenceChange(userId, status);
  }
}
