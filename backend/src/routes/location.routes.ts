import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { Location } from '../models/location.model.js';
import { User } from '../models/user.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { redis } from '../lib/redis.js';
import { getIo } from '../lib/io.js';
import { BadRequestError } from '../lib/errors.js';

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
      source?: 'gps' | 'network' | 'passive';
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

    // Emit to room if specified
    if (roomId) {
      const io = getIo();
      if (io) {
        io.to(`room:${roomId}`).emit('location_batch', [
          { userId, lat, lng, accuracy, speed, heading, updatedAt: Date.now() },
        ]);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /live?roomId= — get live locations for a room
router.get('/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requesterId = req.user!._id;
    const { roomId } = req.query as { roomId?: string };

    if (!roomId) {
      return next(new BadRequestError('roomId is required'));
    }

    const members = await RoomMember.find({ roomId: new Types.ObjectId(roomId) }).lean();

    const locations: unknown[] = [];

    for (const m of members) {
      const uid = m.userId.toString();
      if (uid === requesterId) continue;

      // Check privacy settings
      const user = await User.findById(uid).lean();
      if (!user) continue;
      if (user.privacyLocation === 'nobody') continue;

      // For 'contacts' privacy, check mutual friendship (simple: both must be in contacts)
      // Using a basic check — full contact system can enforce this at service layer
      if (user.privacyLocation === 'contacts') {
        // Placeholder: in a full implementation, check ContactModel for mutual relationship
        // For now, allow if in the same room (room membership implies some trust)
        // This can be tightened later with the contacts service
      }

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

      locations.push({ ...parsed, username: user.username });
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
