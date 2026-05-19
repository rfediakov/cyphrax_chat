import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { MapMarker, MAP_MARKER_KINDS, type MapMarkerKind } from '../models/mapMarker.model.js';
import { RoomMember } from '../models/roomMember.model.js';
import { User } from '../models/user.model.js';
import { getIo } from '../lib/io.js';
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from '../lib/errors.js';

function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function isValidKind(value: unknown): value is MapMarkerKind {
  return typeof value === 'string' && (MAP_MARKER_KINDS as readonly string[]).includes(value);
}

function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value);
}

interface MarkerDTO {
  _id: string;
  roomId: string;
  userId: string;
  username: string;
  kind: MapMarkerKind;
  label: string;
  description: string;
  lat: number;
  lng: number;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

function toDTO(doc: {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  userId: Types.ObjectId;
  username: string;
  kind: MapMarkerKind;
  label: string;
  description: string;
  lat: number;
  lng: number;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}): MarkerDTO {
  return {
    _id: doc._id.toString(),
    roomId: doc.roomId.toString(),
    userId: doc.userId.toString(),
    username: doc.username,
    kind: doc.kind,
    label: doc.label,
    description: doc.description,
    lat: doc.lat,
    lng: doc.lng,
    color: doc.color,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

async function assertRoomMember(userId: string, roomId: string): Promise<void> {
  if (!Types.ObjectId.isValid(roomId)) {
    throw new BadRequestError('Invalid roomId');
  }
  const member = await RoomMember.findOne({
    roomId: new Types.ObjectId(roomId),
    userId: new Types.ObjectId(userId),
  }).lean();
  if (!member) throw new ForbiddenError('Not a member of this room');
}

const router = Router();
router.use(requireAuth);

/**
 * GET /api/v1/markers?roomId=<id>
 * List active markers for a room. Caller must be a member.
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!._id;
    const { roomId } = req.query as { roomId?: string };
    if (!roomId) throw new BadRequestError('roomId is required');

    await assertRoomMember(userId, roomId);

    const markers = await MapMarker.find({ roomId: new Types.ObjectId(roomId) })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ markers: markers.map(toDTO) });
  }),
);

/**
 * POST /api/v1/markers
 * Create a new marker pinned to a room. Broadcasts `marker_created` to
 * every socket joined to that room channel.
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!._id;
    const {
      roomId,
      kind,
      label,
      description = '',
      lat,
      lng,
      color = null,
    } = req.body as {
      roomId?: string;
      kind?: unknown;
      label?: string;
      description?: string;
      lat?: number;
      lng?: number;
      color?: string | null;
    };

    if (!roomId) throw new BadRequestError('roomId is required');
    if (!isValidKind(kind)) {
      throw new BadRequestError(
        `kind must be one of: ${MAP_MARKER_KINDS.join(', ')}`,
      );
    }
    if (!label || typeof label !== 'string' || label.trim().length === 0) {
      throw new BadRequestError('label is required');
    }
    if (!isValidLatLng(lat, lng)) {
      throw new BadRequestError('lat/lng must be valid finite numbers');
    }
    if (color !== null && color !== undefined && !isHexColor(color)) {
      throw new BadRequestError('color must be a hex string like #3b82f6');
    }

    await assertRoomMember(userId, roomId);

    const user = await User.findById(userId).select('username').lean();
    const username = user?.username ?? 'Unknown';

    const marker = await MapMarker.create({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId),
      username,
      kind,
      label: label.trim().slice(0, 80),
      description: (description ?? '').trim().slice(0, 500),
      lat,
      lng,
      color: color ?? null,
    });

    const dto = toDTO(marker.toObject() as Parameters<typeof toDTO>[0]);

    const io = getIo();
    if (io) {
      io.to(`room:${roomId}`).emit('marker_created', dto);
    }

    res.status(201).json({ marker: dto });
  }),
);

/**
 * PATCH /api/v1/markers/:id
 * Update a marker's label / description / kind / color. Owner-only.
 */
router.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!._id;
    const { id } = req.params as { id: string };
    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid id');

    const marker = await MapMarker.findById(id);
    if (!marker) throw new NotFoundError('Marker not found');
    if (marker.userId.toString() !== userId) {
      throw new ForbiddenError('Only the author can edit this marker');
    }

    const { kind, label, description, color } = req.body as {
      kind?: unknown;
      label?: string;
      description?: string;
      color?: string | null;
    };

    if (kind !== undefined) {
      if (!isValidKind(kind)) {
        throw new BadRequestError(
          `kind must be one of: ${MAP_MARKER_KINDS.join(', ')}`,
        );
      }
      marker.kind = kind;
    }
    if (label !== undefined) {
      if (typeof label !== 'string' || label.trim().length === 0) {
        throw new BadRequestError('label cannot be empty');
      }
      marker.label = label.trim().slice(0, 80);
    }
    if (description !== undefined) {
      if (typeof description !== 'string') {
        throw new BadRequestError('description must be a string');
      }
      marker.description = description.trim().slice(0, 500);
    }
    if (color !== undefined) {
      if (color !== null && !isHexColor(color)) {
        throw new BadRequestError('color must be a hex string like #3b82f6');
      }
      marker.color = color;
    }

    await marker.save();
    const dto = toDTO(marker.toObject() as Parameters<typeof toDTO>[0]);

    const io = getIo();
    if (io) {
      io.to(`room:${marker.roomId.toString()}`).emit('marker_updated', dto);
    }

    res.json({ marker: dto });
  }),
);

/**
 * DELETE /api/v1/markers/:id
 * Owner or room admin may delete. Broadcasts `marker_deleted`.
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!._id;
    const { id } = req.params as { id: string };
    if (!Types.ObjectId.isValid(id)) throw new BadRequestError('Invalid id');

    const marker = await MapMarker.findById(id);
    if (!marker) throw new NotFoundError('Marker not found');

    const isOwner = marker.userId.toString() === userId;
    let isAdmin = false;
    if (!isOwner) {
      const adminMembership = await RoomMember.findOne({
        roomId: marker.roomId,
        userId: new Types.ObjectId(userId),
        role: 'admin',
      }).lean();
      isAdmin = !!adminMembership;
    }
    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('Not authorized to delete this marker');
    }

    const roomIdStr = marker.roomId.toString();
    const markerIdStr = (marker._id as Types.ObjectId).toString();
    await marker.deleteOne();

    const io = getIo();
    if (io) {
      io.to(`room:${roomIdStr}`).emit('marker_deleted', {
        markerId: markerIdStr,
        roomId: roomIdStr,
      });
    }

    res.json({ ok: true });
  }),
);

// Surface unknown errors as 500
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) return next(err);
  console.error('[markers.routes] Unhandled error:', err);
  next(err);
});

export default router;
