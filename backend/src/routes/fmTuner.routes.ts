import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { BadRequestError, ForbiddenError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';
import { RoomMember } from '../models/roomMember.model.js';
import * as fmTuner from '../services/roomTypes/fmTuner.service.js';

/**
 * Routes that power the FM Tuner room type.
 *
 * Mounted under `/api/v1/rooms` AFTER the generic rooms router so the more
 * specific `/:id/widgets/fm/...` paths still resolve correctly (Express picks
 * the first matching handler — generic `:id` routes don't match because of
 * the literal `widgets` prefix on every path here).
 *
 * Every endpoint requires authentication and that the caller is a member of
 * the room. We re-implement the membership gate per-handler (mirrors the
 * `getMembers` pattern in room.service) instead of forking shared middleware,
 * so room-scoped error semantics stay co-located with the routes.
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

// ── Stations directory ─────────────────────────────────────────────────────

// GET /api/v1/rooms/:id/widgets/fm/stations?q=&page=
router.get(
  '/:id/widgets/fm/stations',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const q = (req.query.q as string) ?? '';
      const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
      const result = await fmTuner.listStations({ q, page });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/rooms/:id/widgets/fm/stations
router.post(
  '/:id/widgets/fm/stations',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const { name, streamUrl, tags } = req.body as {
        name?: string;
        streamUrl?: string;
        tags?: unknown;
      };
      if (typeof name !== 'string' || typeof streamUrl !== 'string') {
        throw new BadRequestError('name and streamUrl are required');
      }

      const station = await fmTuner.proposeStation(req.user!._id, {
        name,
        streamUrl,
        tags: Array.isArray(tags) ? (tags as string[]) : undefined,
      });
      res.status(201).json({ station });
    } catch (err) {
      next(err);
    }
  },
);

// ── Vote + now-playing ─────────────────────────────────────────────────────

// GET /api/v1/rooms/:id/widgets/fm/now-playing
router.get(
  '/:id/widgets/fm/now-playing',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const [nowPlaying, tally, myStationId] = await Promise.all([
        fmTuner.getNowPlaying(id),
        fmTuner.getRoomTally(id),
        fmTuner.getUserVote(id, req.user!._id),
      ]);
      res.json({ nowPlaying, tally, myStationId });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/rooms/:id/widgets/fm/vote
router.post(
  '/:id/widgets/fm/vote',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const { stationId } = req.body as { stationId?: string };
      if (typeof stationId !== 'string' || stationId.length === 0) {
        throw new BadRequestError('stationId is required');
      }

      const result = await fmTuner.castVote(id, req.user!._id, stationId);

      res.json({ totals: result.totals, nowPlaying: result.nowPlaying });
      emitVoteUpdates(id, stationId, result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/rooms/:id/widgets/fm/vote
router.delete(
  '/:id/widgets/fm/vote',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await ensureMember(id, req.user!._id);

      const result = await fmTuner.clearVote(id, req.user!._id);

      res.json({ totals: result.totals, nowPlaying: result.nowPlaying });
      emitVoteUpdates(id, null, result);
    } catch (err) {
      next(err);
    }
  },
);

// ── Deck ───────────────────────────────────────────────────────────────────

// POST /api/v1/rooms/:id/widgets/fm/deck
router.post(
  '/:id/widgets/fm/deck',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      // Membership check happens implicitly via the admin/owner gate inside
      // takeDeck, but we still validate the id format eagerly.
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid room id');
      }

      const { stationId, durationSec } = req.body as {
        stationId?: string;
        durationSec?: number;
      };
      if (typeof stationId !== 'string' || stationId.length === 0) {
        throw new BadRequestError('stationId is required');
      }

      const result = await fmTuner.takeDeck(
        id,
        req.user!._id,
        stationId,
        typeof durationSec === 'number' ? durationSec : undefined,
      );

      res.json(result);
      emitDeckChanged(id, result.deckStationId, result.deckUntil, result.nowPlaying);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/rooms/:id/widgets/fm/deck
router.delete(
  '/:id/widgets/fm/deck',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestError('Invalid room id');
      }
      const result = await fmTuner.releaseDeck(id, req.user!._id);

      res.json(result);
      emitDeckChanged(id, result.deckStationId, result.deckUntil, result.nowPlaying);
    } catch (err) {
      next(err);
    }
  },
);

// ── Socket fan-out helpers ─────────────────────────────────────────────────
// All emits live here so the wire shape stays in one place and matches the
// frontend listener exactly.

function emitVoteUpdates(
  roomId: string,
  stationId: string | null,
  result: fmTuner.FmVoteResult,
): void {
  const io = getIo();
  if (!io) return;
  const channel = `room:${roomId}`;

  io.to(channel).emit('room_widget:fm:station_voted', {
    roomId,
    stationId,
    totals: result.totals,
  });

  const newWinnerId = result.nowPlaying?.stationId ?? null;
  if (newWinnerId !== result.previousWinnerStationId) {
    io.to(channel).emit('room_widget:fm:now_playing', {
      roomId,
      stationId: newWinnerId,
      station: result.nowPlaying?.station ?? null,
      source: result.nowPlaying?.source ?? null,
    });
  }
}

function emitDeckChanged(
  roomId: string,
  deckStationId: string | null,
  deckUntil: string | null,
  nowPlaying: fmTuner.FmNowPlaying | null,
): void {
  const io = getIo();
  if (!io) return;
  const channel = `room:${roomId}`;

  io.to(channel).emit('room_widget:fm:deck_changed', {
    roomId,
    deckStationId,
    deckUntil,
  });

  // Deck activation/release always changes the effective now-playing source,
  // so we always emit the now-playing update too.
  io.to(channel).emit('room_widget:fm:now_playing', {
    roomId,
    stationId: nowPlaying?.stationId ?? null,
    station: nowPlaying?.station ?? null,
    source: nowPlaying?.source ?? null,
  });
}

export default router;
