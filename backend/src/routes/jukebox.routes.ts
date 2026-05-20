import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { BadRequestError, ForbiddenError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';
import { RoomMember } from '../models/roomMember.model.js';
import { Room } from '../models/room.model.js';
import * as jukebox from '../services/roomTypes/jukebox.service.js';

/**
 * Routes that power the Music Jukebox room type.
 *
 * Mounted under `/api/v1/rooms` AFTER the generic rooms router so the more
 * specific `/:id/widgets/juke/...` paths still resolve correctly (Express
 * matches by exact path; the generic `:id` routes in `rooms.routes.ts` don't
 * shadow these because every path here carries the literal `widgets/juke`
 * prefix).
 *
 * Every endpoint requires authentication + room membership. Membership is
 * checked per-handler with `ensureMember` to keep error semantics co-located
 * with the routes (mirrors the FM Tuner router).
 */
const router = Router();

async function ensureMember(roomId: string, userId: string): Promise<Types.ObjectId> {
  if (!Types.ObjectId.isValid(roomId)) {
    throw new BadRequestError('Invalid room id');
  }
  const roomObjectId = new Types.ObjectId(roomId);
  const member = await RoomMember.findOne({
    roomId: roomObjectId,
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!member) {
    throw new ForbiddenError('You are not a member of this room');
  }
  return roomObjectId;
}

async function ensureAdminOrOwner(roomId: string, userId: string): Promise<void> {
  if (!Types.ObjectId.isValid(roomId)) {
    throw new BadRequestError('Invalid room id');
  }
  const room = await Room.findById(roomId).lean();
  if (!room) throw new BadRequestError('Room not found');
  if (room.ownerId.toString() === userId) return;
  const member = await RoomMember.findOne({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!member || member.role !== 'admin') {
    throw new ForbiddenError('Admin or owner privileges required');
  }
}

// ── Queue read ─────────────────────────────────────────────────────────────

// GET /api/v1/rooms/:id/widgets/juke/queue
router.get(
  '/:id/widgets/juke/queue',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);
      const snapshot = await jukebox.getQueue(id);
      const total = await jukebox.getRoomMemberCount(id);
      res.json({ ...snapshot, memberCount: total });
    } catch (err) {
      next(err);
    }
  },
);

// ── Enqueue ────────────────────────────────────────────────────────────────

// POST /api/v1/rooms/:id/widgets/juke/queue
router.post(
  '/:id/widgets/juke/queue',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const { title, artist, attachmentId, externalUrl, durationSec } = req.body as {
        title?: string;
        artist?: string;
        attachmentId?: string;
        externalUrl?: string;
        durationSec?: number;
      };

      if (typeof title !== 'string') {
        throw new BadRequestError('title is required');
      }

      const { track, snapshot, trackChanged } = await jukebox.enqueue(id, req.user!._id, {
        title,
        artist,
        attachmentId,
        externalUrl,
        durationSec,
      });

      res.status(201).json({ track, ...snapshot });
      emitQueueUpdated(id, snapshot);
      if (trackChanged && snapshot.playing) {
        emitTrackChanged(id, snapshot.playing);
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── Remove ─────────────────────────────────────────────────────────────────

// DELETE /api/v1/rooms/:id/widgets/juke/queue/:trackId
router.delete(
  '/:id/widgets/juke/queue/:trackId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, trackId } = req.params as { id: string; trackId: string };
      await ensureMember(id, req.user!._id);

      const { snapshot, trackChanged } = await jukebox.removeTrack(id, req.user!._id, trackId);
      res.json(snapshot);
      emitQueueUpdated(id, snapshot);
      if (trackChanged) {
        emitTrackChanged(id, snapshot.playing);
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── Reorder ────────────────────────────────────────────────────────────────

// PATCH /api/v1/rooms/:id/widgets/juke/queue/:trackId
router.patch(
  '/:id/widgets/juke/queue/:trackId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, trackId } = req.params as { id: string; trackId: string };
      await ensureMember(id, req.user!._id);

      const { position } = req.body as { position?: number };
      if (typeof position !== 'number') {
        throw new BadRequestError('position must be a number');
      }

      const snapshot = await jukebox.reorderTrack(id, req.user!._id, trackId, position);
      res.json(snapshot);
      emitQueueUpdated(id, snapshot);
    } catch (err) {
      next(err);
    }
  },
);

// ── Skip vote ──────────────────────────────────────────────────────────────

// POST /api/v1/rooms/:id/widgets/juke/skip
router.post(
  '/:id/widgets/juke/skip',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const result = await jukebox.castSkipVote(id, req.user!._id);

      res.json({
        ratio: result.ratio,
        advanced: result.advanced,
        trackId: result.trackId,
        ...result.snapshot,
      });

      emitSkipVoted(id, result.trackId, result.ratio, result.advanced);
      if (result.advanced) {
        emitQueueUpdated(id, result.snapshot);
        emitTrackChanged(id, result.snapshot.playing);
      }
    } catch (err) {
      next(err);
    }
  },
);

// ── Vote next ──────────────────────────────────────────────────────────────

// POST /api/v1/rooms/:id/widgets/juke/vote-next
router.post(
  '/:id/widgets/juke/vote-next',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const { trackId } = req.body as { trackId?: string };
      if (typeof trackId !== 'string') {
        throw new BadRequestError('trackId is required');
      }

      const snapshot = await jukebox.castVoteNext(id, req.user!._id, trackId);
      res.json(snapshot);
      emitQueueUpdated(id, snapshot);
    } catch (err) {
      next(err);
    }
  },
);

// ── Manual advance (admin/owner) ────────────────────────────────────────────

// POST /api/v1/rooms/:id/widgets/juke/advance
//
// Two callers use this endpoint:
//  1. Room admins/owners who want to manually skip to the next track.
//  2. The frontend `<audio>` `ended` listener, which calls this to advance
//     when a track finishes playing naturally.
//
// Case (2) means a regular member must also be able to call this — otherwise
// only admins could ever "let a track finish". We therefore require room
// membership rather than admin/owner here.
router.post(
  '/:id/widgets/juke/advance',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);
      // `force=true` lets admins skip past a still-playing track. Without it
      // we only advance when there's no current track or the caller is an
      // admin/owner — keeps a single regular member from short-circuiting
      // playback for everyone else.
      const { force } = req.body as { force?: boolean };
      if (force === true) {
        await ensureAdminOrOwner(id, req.user!._id);
      }
      await jukebox.advance(id);
      const snapshot = await jukebox.getQueue(id);
      res.json(snapshot);
      emitQueueUpdated(id, snapshot);
      emitTrackChanged(id, snapshot.playing);
    } catch (err) {
      next(err);
    }
  },
);

// ── Socket fan-out helpers ─────────────────────────────────────────────────

function emitQueueUpdated(roomId: string, snapshot: jukebox.QueueSnapshot): void {
  const io = getIo();
  if (!io) return;
  io.to(`room:${roomId}`).emit('room_widget:juke:queue_updated', {
    roomId,
    playing: snapshot.playing,
    queue: snapshot.queue,
  });
}

function emitTrackChanged(
  roomId: string,
  playing: jukebox.JukeboxTrackPublic | null,
): void {
  const io = getIo();
  if (!io) return;
  io.to(`room:${roomId}`).emit('room_widget:juke:track_changed', {
    roomId,
    playing,
  });
}

function emitSkipVoted(
  roomId: string,
  trackId: string | null,
  ratio: { votes: number; total: number },
  advanced: boolean,
): void {
  const io = getIo();
  if (!io) return;
  io.to(`room:${roomId}`).emit('room_widget:juke:skip_voted', {
    roomId,
    trackId,
    ratio,
    advanced,
  });
}

export default router;
