import { Socket, Server } from 'socket.io';
import { Types } from 'mongoose';
import { User } from '../../models/user.model.js';
import { Location } from '../../models/location.model.js';
import { RoomMember } from '../../models/roomMember.model.js';
import { redis } from '../../lib/redis.js';
import { buildLivePayloadForUser } from '../../services/location.service.js';

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
    const members = await RoomMember.find({ roomId: new Types.ObjectId(roomId) })
      .populate<{ userId: { _id: Types.ObjectId; username: string } }>('userId', '_id username')
      .lean();
    const batch: unknown[] = [];

    for (const m of members) {
      const uid = m.userId._id.toString();
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
      batch.push({ ...parsed, username: m.userId.username });
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

      // Determine which rooms to broadcast to.
      //  - If the client supplied a specific roomId, only broadcast to that one
      //    (and only if the user is a member — preventing location spray).
      //  - Otherwise, fan out to every room the user belongs to so a single
      //    location update keeps every group's map in sync.
      const userObjectId = new Types.ObjectId(userId);
      const roomsToBroadcast: string[] = [];

      if (roomId) {
        if (!Types.ObjectId.isValid(roomId)) return;
        const member = await RoomMember.findOne({
          roomId: new Types.ObjectId(roomId),
          userId: userObjectId,
        }).lean();
        if (!member) return;
        roomsToBroadcast.push(roomId);
      } else {
        const memberships = await RoomMember.find({ userId: userObjectId }).lean();
        for (const m of memberships) roomsToBroadcast.push(m.roomId.toString());
      }

      for (const rid of roomsToBroadcast) {
        const existing = batchTimers.get(rid);
        if (existing) clearTimeout(existing);
        const timer = setTimeout(() => {
          batchTimers.delete(rid);
          void broadcastLocationBatch(io, rid);
        }, 500);
        batchTimers.set(rid, timer);
      }

      // Fan out to everyone on the common map (privacy checked on read via REST;
      // live updates only when sharing is active).
      const globalPayload = await buildLivePayloadForUser(userId);
      if (globalPayload) {
        io.to('app:map').emit('location_batch', [globalPayload]);
      }
    } catch (err) {
      console.error('[LocationHandler] location_update error:', err);
    }
  });
}
