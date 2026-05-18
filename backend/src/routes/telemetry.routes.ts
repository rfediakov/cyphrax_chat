import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { Telemetry } from '../models/telemetry.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { User } from '../models/user.model.js';
import { redis } from '../lib/redis.js';
import { getIo } from '../lib/io.js';
import { sendPushToUser } from '../services/push.service.js';
import { BadRequestError } from '../lib/errors.js';

const router = Router();

router.use(requireAuth);

const REDIS_TTL = 120; // seconds
const LOW_BATTERY_THRESHOLD = 0.15;

/** Cache key for a user's latest telemetry. */
function cacheKey(userId: string): string {
  return `battery:${userId}`;
}

// POST / — upsert telemetry; cache in Redis; emit socket event; push if low battery
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = new Types.ObjectId(req.user!._id);
    const { battery, network, recordedAt } = req.body as {
      battery?: {
        level: number | null;
        charging: boolean | null;
        chargingTime: number | null;
        dischargingTime: number | null;
      };
      network?: {
        online: boolean;
        effectiveType: string;
        downlink: number | null;
        saveData: boolean;
      };
      recordedAt?: string;
    };

    if (!battery && !network) {
      return next(new BadRequestError('At least one of battery or network is required'));
    }

    const ts = recordedAt ? new Date(recordedAt) : new Date();

    // Persist to MongoDB (latest snapshot per user — upsert by userId)
    await Telemetry.findOneAndUpdate(
      { userId },
      {
        $set: {
          battery: battery ?? { level: null, charging: null, chargingTime: null, dischargingTime: null },
          network: network ?? { online: true, effectiveType: 'unknown', downlink: null, saveData: false },
          recordedAt: ts,
        },
      },
      { upsert: true, new: true },
    );

    const payload = {
      userId: userId.toString(),
      battery: battery ?? null,
      network: network ?? null,
      recordedAt: ts.toISOString(),
    };

    // Cache in Redis with TTL
    await redis.setex(cacheKey(userId.toString()), REDIS_TTL, JSON.stringify(payload));

    // Emit to room members who share a room with this user
    const io = getIo();
    if (io) {
      const memberships = await RoomMember.find({ userId }).distinct('roomId');
      for (const roomId of memberships) {
        io.to(roomId.toString()).emit('telemetry_update', payload);
      }
    }

    // Low battery push notification (< 15%, discharging)
    if (
      battery?.level !== null &&
      battery?.level !== undefined &&
      battery.level < LOW_BATTERY_THRESHOLD &&
      battery.charging === false
    ) {
      const user = await User.findById(userId).lean();
      const username = user?.username ?? 'A member';

      // Notify all room members who have the user in their room
      const memberships2 = await RoomMember.find({ userId }).distinct('roomId');
      const memberUserIds = await RoomMember.find({
        roomId: { $in: memberships2 },
        userId: { $ne: userId },
      }).distinct('userId');

      const pct = Math.round((battery.level ?? 0) * 100);
      await Promise.allSettled(
        memberUserIds.map((memberId) =>
          sendPushToUser(memberId, {
            title: 'Low Battery Warning',
            body: `${username}'s battery is at ${pct}%`,
            tag: `low-battery:${userId}`,
            icon: '/icons/pwa-192.png',
            data: { type: 'low_battery', userId: userId.toString() },
          }),
        ),
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /live?roomId= — latest telemetry for visible room members
router.get('/live', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const currentUserId = new Types.ObjectId(req.user!._id);
    const { roomId } = req.query as { roomId?: string };

    if (!roomId) {
      return next(new BadRequestError('roomId is required'));
    }

    // Verify the requester is a member of the room
    const membership = await RoomMember.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: currentUserId,
    }).lean();

    if (!membership) {
      return next(new BadRequestError('Not a member of this room'));
    }

    // Get all member userIds in the room
    const memberDocs = await RoomMember.find({
      roomId: new Types.ObjectId(roomId),
    })
      .populate<{ userId: { _id: Types.ObjectId; username: string; privacyBattery: string } }>(
        'userId',
        'username privacyBattery',
      )
      .lean();

    const results: Record<string, unknown>[] = [];

    for (const m of memberDocs) {
      const user = m.userId as { _id: Types.ObjectId; username: string; privacyBattery: string };
      if (!user?._id) continue;

      // Respect privacy setting
      if (user.privacyBattery === 'nobody') continue;
      // 'contacts' check could be expanded here; for now treat same as 'everyone'

      const uid = user._id.toString();
      const cached = await redis.get(cacheKey(uid));

      if (cached) {
        results.push({ userId: uid, username: user.username, ...JSON.parse(cached) });
      } else {
        // Fall back to MongoDB latest
        const doc = await Telemetry.findOne({ userId: user._id })
          .sort({ recordedAt: -1 })
          .lean();
        if (doc) {
          results.push({
            userId: uid,
            username: user.username,
            battery: doc.battery,
            network: doc.network,
            recordedAt: doc.recordedAt,
          });
        }
      }
    }

    res.json({ telemetry: results });
  } catch (err) {
    next(err);
  }
});

export default router;
