import { Socket, Server } from 'socket.io';
import { Types } from 'mongoose';
import { User } from '../../models/user.model.js';
import { Location } from '../../models/location.model.js';
import { RoomMember } from '../../models/roomMember.model.js';
import { redis } from '../../lib/redis.js';

interface LocationUpdateData {
  lat?: unknown;
  lng?: unknown;
  accuracy?: unknown;
  speed?: unknown;
  heading?: unknown;
  roomId?: unknown;
}

// Debounce timers keyed by roomId — batches location updates per room
const batchTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function broadcastLocationBatch(io: Server, roomId: string): Promise<void> {
  try {
    const members = await RoomMember.find({ roomId: new Types.ObjectId(roomId) }).lean();
    const batch: unknown[] = [];

    for (const m of members) {
      const uid = m.userId.toString();
      const cached = await redis.get(`loc:${uid}`);
      if (!cached) continue;
      const parsed = JSON.parse(cached) as {
        userId: string;
        lat: number;
        lng: number;
        accuracy: number;
        speed: number | null;
        heading: number | null;
        updatedAt: number;
      };
      batch.push(parsed);
    }

    if (batch.length > 0) {
      io.to(`room:${roomId}`).emit('location_batch', batch);
    }
  } catch (err) {
    console.error('[LocationHandler] broadcastLocationBatch error:', err);
  }
}

export function registerLocationHandler(socket: Socket, io: Server): void {
  socket.on('location_update', async (data: LocationUpdateData) => {
    const userId = socket.data.userId as string;

    // Validate payload
    if (typeof data?.lat !== 'number' || typeof data?.lng !== 'number') return;

    const { lat, lng } = data;
    const accuracy = typeof data.accuracy === 'number' ? data.accuracy : 0;
    const speed = typeof data.speed === 'number' ? data.speed : null;
    const heading = typeof data.heading === 'number' ? data.heading : null;
    const roomId = typeof data.roomId === 'string' ? data.roomId : null;

    try {
      // Check if user has location sharing enabled
      const user = await User.findById(userId).lean();
      if (!user?.locationSharingActive) return;

      // Cache latest location
      const cacheKey = `loc:${userId}`;
      await redis.setex(
        cacheKey,
        300,
        JSON.stringify({ userId, lat, lng, accuracy, speed, heading, updatedAt: Date.now() }),
      );

      // Persist to MongoDB at most once every 30s
      const persistKey = `loc:persist:${userId}`;
      const alreadyPersisted = await redis.exists(persistKey);
      if (!alreadyPersisted) {
        await Location.create({
          userId: new Types.ObjectId(userId),
          roomId: roomId ? new Types.ObjectId(roomId) : null,
          lat,
          lng,
          accuracy,
          speed,
          heading,
          altitude: null,
          source: 'gps',
          recordedAt: new Date(),
        });
        await redis.setex(persistKey, 30, '1');
      }

      // Debounce batch broadcast per room (500ms) — only if the user is
      // actually a member, otherwise anyone could spray locations into any
      // room they know the id of.
      if (roomId) {
        if (!Types.ObjectId.isValid(roomId)) return;
        const member = await RoomMember.findOne({
          roomId: new Types.ObjectId(roomId),
          userId: new Types.ObjectId(userId),
        }).lean();
        if (!member) return;

        const existing = batchTimers.get(roomId);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          batchTimers.delete(roomId);
          void broadcastLocationBatch(io, roomId);
        }, 500);
        batchTimers.set(roomId, timer);
      }
    } catch (err) {
      console.error('[LocationHandler] location_update error:', err);
    }
  });
}
