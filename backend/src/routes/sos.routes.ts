import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { SOSEvent } from '../models/sosEvent.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { AppError } from '../lib/errors.js';

const router = Router();

/**
 * POST /api/v1/sos
 * REST fallback for offline-queued SOS triggers (used by offline sync flush).
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const { roomId, lat, lng, message } = req.body as {
    roomId?: string;
    lat?: number;
    lng?: number;
    message?: string;
  };

  if (!roomId || typeof lat !== 'number' || typeof lng !== 'number') {
    throw new AppError(400, 'roomId, lat and lng are required');
  }

  const membership = await RoomMember.findOne({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(userId),
  }).lean();

  if (!membership) throw new AppError(403, 'Not a member of this room');

  const { User } = await import('../models/user.model.js');
  const user = await User.findById(userId).lean();
  const username = user?.username ?? 'Unknown';

  const sosEvent = await SOSEvent.create({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(userId),
    username,
    lat,
    lng,
    message: message ?? "I'm in danger",
    status: 'active',
  });

  res.status(201).json({
    _id: (sosEvent._id as Types.ObjectId).toString(),
    roomId,
    userId,
    username,
    lat,
    lng,
    message: sosEvent.message,
    status: sosEvent.status,
    createdAt: sosEvent.createdAt.toISOString(),
  });
});

/**
 * GET /api/v1/sos
 * Returns all active SOS events for rooms the authenticated user belongs to.
 * Called on app load to hydrate the SOS store.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;

  // Find all rooms where this user is a member
  const memberships = await RoomMember.find({ userId: new Types.ObjectId(userId) }).lean();
  const roomIds = memberships.map((m) => m.roomId);

  if (roomIds.length === 0) {
    res.json({ sosEvents: [] });
    return;
  }

  const activeEvents = await SOSEvent.find({
    roomId: { $in: roomIds },
    status: 'active',
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    sosEvents: activeEvents.map((e) => ({
      _id: e._id.toString(),
      roomId: e.roomId.toString(),
      userId: e.userId.toString(),
      username: e.username,
      lat: e.lat,
      lng: e.lng,
      message: e.message,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
    })),
  });
});

/**
 * GET /api/v1/sos/history
 * Returns SOS history (both active and resolved) for rooms the user belongs to.
 */
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 100);

  const memberships = await RoomMember.find({ userId: new Types.ObjectId(userId) }).lean();
  const roomIds = memberships.map((m) => m.roomId);

  if (roomIds.length === 0) {
    res.json({ sosEvents: [] });
    return;
  }

  const events = await SOSEvent.find({ roomId: { $in: roomIds } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    sosEvents: events.map((e) => ({
      _id: e._id.toString(),
      roomId: e.roomId.toString(),
      userId: e.userId.toString(),
      username: e.username,
      lat: e.lat,
      lng: e.lng,
      message: e.message,
      status: e.status,
      createdAt: e.createdAt.toISOString(),
      resolvedAt: e.resolvedAt?.toISOString() ?? null,
    })),
  });
});

/**
 * DELETE /api/v1/sos/:id
 * REST-based resolve (for admin use or offline catch-up).
 */
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const { id } = req.params;

  const sosEvent = await SOSEvent.findById(id);
  if (!sosEvent) throw new AppError(404, 'SOS event not found');

  const isOwner = sosEvent.userId.toString() === userId;
  const isAdmin = await RoomMember.findOne({
    roomId: sosEvent.roomId,
    userId: new Types.ObjectId(userId),
    role: 'admin',
  }).lean();

  if (!isOwner && !isAdmin) throw new AppError(403, 'Not authorized');

  sosEvent.status = 'resolved';
  sosEvent.resolvedAt = new Date();
  await sosEvent.save();

  res.json({ success: true });
});

export default router;
