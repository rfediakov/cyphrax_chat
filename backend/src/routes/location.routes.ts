import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { Location } from '../models/location.model.js';
import { User } from '../models/user.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { redis } from '../lib/redis.js';
import { getIo } from '../lib/io.js';
import { BadRequestError } from '../lib/errors.js';
import { getGlobalLiveLocations } from '../services/location.service.js';

/**
 * Haversine distance in metres between two lat/lng points.
 */
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check geofences for a user and emit events if entry/exit detected.
 */
async function checkGeofences(userId: string, lat: number, lng: number): Promise<void> {
  const user = await User.findById(userId).select('geofences guardianIds').lean();
  if (!user || !user.geofences?.length) return;

  const io = getIo();
  if (!io) return;

  const prevKey = `geofence:prev:${userId}`;
  const prevRaw = await redis.get(prevKey);
  const prevInside: Record<string, boolean> = prevRaw ? (JSON.parse(prevRaw) as Record<string, boolean>) : {};
  const nowInside: Record<string, boolean> = {};

  for (const zone of user.geofences) {
    const zoneId = (zone as typeof zone & { _id: { toString(): string } })._id.toString();
    const dist = haversineMetres(lat, lng, zone.lat, zone.lng);
    const inside = dist <= zone.radiusMetres;
    nowInside[zoneId] = inside;

    const wasInside = prevInside[zoneId] ?? null;

    if (wasInside === true && !inside && zone.alertOnExit) {
      const payload = { userId, zoneId, zoneName: zone.name, lat, lng };
      io.to(`user:${userId}`).emit('geofence_exit', payload);
      for (const gId of user.guardianIds) {
        io.to(`user:${gId.toString()}`).emit('geofence_exit', payload);
      }
    }
    if (wasInside === false && inside && zone.alertOnEntry) {
      const payload = { userId, zoneId, zoneName: zone.name, lat, lng };
      io.to(`user:${userId}`).emit('geofence_entry', payload);
      for (const gId of user.guardianIds) {
        io.to(`user:${gId.toString()}`).emit('geofence_entry', payload);
      }
    }
  }

  await redis.setex(prevKey, 3600, JSON.stringify(nowInside));
}

const router = Router();

router.use(requireAuth);

// POST / — record a location update
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const {
      lat,
      lng,
      accuracy = 0,
      speed = null,
      heading = null,
      altitude = null,
      roomId = null,
      source = 'gps',
    } = req.body as {
      lat?: number;
      lng?: number;
      accuracy?: number;
      speed?: number | null;
      heading?: number | null;
      altitude?: number | null;
      roomId?: string | null;
      source?: 'gps' | 'network' | 'passive' | 'manual';
    };

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return next(new BadRequestError('lat and lng are required numbers'));
    }

    const locationPayload = {
      userId: new Types.ObjectId(userId),
      roomId: roomId ? new Types.ObjectId(roomId) : null,
      lat,
      lng,
      accuracy,
      speed,
      heading,
      altitude,
      source,
      recordedAt: new Date(),
    };

    // Always cache latest location in Redis (5 min TTL)
    const cacheKey = `loc:${userId}`;
    const cacheValue = JSON.stringify({
      userId,
      lat,
      lng,
      accuracy,
      speed,
      heading,
      updatedAt: Date.now(),
    });
    await redis.setex(cacheKey, 300, cacheValue);

    // Persist to MongoDB at most once every 30s per user
    const persistKey = `loc:persist:${userId}`;
    const alreadyPersisted = await redis.exists(persistKey);
    if (!alreadyPersisted) {
      await Location.create(locationPayload);
      await redis.setex(persistKey, 30, '1');
    }

    const io = getIo();
    const livePoint = { userId, lat, lng, accuracy, speed, heading, updatedAt: Date.now() };

    // Emit to room if specified
    if (roomId && io) {
      io.to(`room:${roomId}`).emit('location_batch', [livePoint]);
    }

    // App-wide map channel
    if (io) {
      const user = await User.findById(userId).select('username locationSharingActive').lean();
      if (user?.locationSharingActive) {
        io.to('app:map').emit('location_batch', [
          { ...livePoint, username: user.username },
        ]);
      }
    }

    // Update last activity timestamp
    await User.findByIdAndUpdate(userId, { lastActivityAt: new Date() });

    // Check geofences asynchronously (non-blocking)
    checkGeofences(String(userId), lat, lng).catch((e) =>
      console.error('[Geofence check error]', e),
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /live/global — live locations for all shareable users (app-wide map)
router.get('/live/global', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.user!._id;
    const locations = await getGlobalLiveLocations(requesterId);
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

// GET /live?roomId= — get live locations for a room (excluding self)
router.get('/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.user!._id;
    const { roomId } = req.query as { roomId?: string };

    if (!roomId) {
      return next(new BadRequestError('roomId is required'));
    }

    // Caller must actually be in the room to read its members' positions.
    const requesterMembership = await RoomMember.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(requesterId),
    }).lean();
    if (!requesterMembership) {
      return next(new BadRequestError('Not a member of this room'));
    }

    const members = await RoomMember.find({ roomId: new Types.ObjectId(roomId) })
      .populate<{ userId: { _id: Types.ObjectId; username: string; privacyLocation: string } }>(
        'userId',
        '_id username privacyLocation',
      )
      .lean();

    const locations: unknown[] = [];

    for (const m of members) {
      const uid = m.userId._id.toString();
      if (uid === requesterId) continue;
      if (m.userId.privacyLocation === 'nobody') continue;

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

      locations.push({ ...parsed, username: m.userId.username });
    }

    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

// GET /history?from=&to=&limit= — own location history
router.get('/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const { from, to, limit = '50' } = req.query as { from?: string; to?: string; limit?: string };

    const query: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      query.recordedAt = dateFilter;
    }

    const locations = await Location.find(query)
      .sort({ recordedAt: -1 })
      .limit(Math.min(parseInt(limit, 10), 200))
      .lean();

    res.json({ locations });
  } catch (err) {
    next(err);
  }
});

// PATCH /sharing — toggle location sharing
router.patch('/sharing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const { active, roomIds } = req.body as { active?: boolean; roomIds?: string[] };

    if (typeof active !== 'boolean') {
      return next(new BadRequestError('active (boolean) is required'));
    }

    const update: Record<string, unknown> = { locationSharingActive: active };
    if (roomIds !== undefined) {
      update.locationSharingRooms = roomIds.map((id) => new Types.ObjectId(id));
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true }).lean();
    if (!user) {
      return next(new BadRequestError('User not found'));
    }

    res.json({
      locationSharingActive: user.locationSharingActive,
      locationSharingRooms: user.locationSharingRooms,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
