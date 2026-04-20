import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as roomService from '../services/room.service.js';
import { createSystemRoomMessage } from '../services/message.service.js';
import { BadRequestError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';
import { RoomMember } from '../models/roomMember.model.js';
import { getPresenceStatuses } from '../presence/presence.manager.js';

/**
 * After a user joins a room socket room:
 * 1. Pushes the new member's current presence to everyone already in the room.
 * 2. Pushes every existing member's current presence to the new member.
 * This bypasses the change-detection gate in evaluateAndBroadcastPresence.
 */
async function pushPresenceOnRoomJoin(roomId: string, newUserId: string): Promise<void> {
  const io = getIo();
  if (!io) return;

  const memberships = await RoomMember.find({ roomId: new Types.ObjectId(roomId) }).lean();
  const memberUserIds = memberships.map((m) => m.userId.toString());

  const statuses = await getPresenceStatuses(memberUserIds);

  // All existing members (and the new member themselves via the room socket) see the new member
  io.to(`room:${roomId}`).emit('presence', {
    userId: newUserId,
    status: statuses[newUserId] ?? 'offline',
  });

  // New member sees every current member's presence
  for (const [uid, status] of Object.entries(statuses)) {
    io.to(`user:${newUserId}`).emit('presence', { userId: uid, status });
  }
}

const router = Router();

// GET /api/v1/rooms/mine — rooms the current user is a member of
router.get('/mine', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await roomService.getMyRooms(req.user!._id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/rooms/public?q=&page=
router.get('/public', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string) ?? '';
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const result = await roomService.getPublicRooms(q, page);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/rooms/invitations/pending — pending invitations for current user
router.get('/invitations/pending', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const invitations = await roomService.getPendingInvitations(req.user!._id);
    res.json({ invitations });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/rooms
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, visibility } = req.body as {
      name?: string;
      description?: string;
      visibility?: 'public' | 'private';
    };
    if (!name) {
      throw new BadRequestError('name is required');
    }
    const userId = req.user!._id;
    const room = await roomService.createRoom(userId, { name, description, visibility });
    res.status(201).json({ room });

    // Join the creator's live sockets to the new room channel so they receive
    // real-time events (member_joined etc.) without needing a page reload.
    await getIo()?.in(`user:${userId}`).socketsJoin(`room:${room.id}`);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/rooms/:id
router.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const room = await roomService.getRoom(id);
    res.json({ room });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/rooms/:id
router.put('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const { name, description, visibility } = req.body as {
      name?: string;
      description?: string;
      visibility?: 'public' | 'private';
    };
    const room = await roomService.updateRoom(id, req.user!._id, { name, description, visibility });
    res.json({ room });

    getIo()?.to(`room:${id}`).emit('room_event', { event: 'updated', room });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/rooms/:id
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    // Emit before deletion so members still in the socket room receive the event
    getIo()?.to(`room:${id}`).emit('room_event', { event: 'deleted', roomId: id });
    await roomService.deleteRoom(id, req.user!._id);
    res.json({ message: 'Room deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/rooms/:id/join
router.post('/:id/join', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const userId = req.user!._id;
    await roomService.joinRoom(id, userId);
    res.json({ message: 'Joined room' });

    const io = getIo();
    if (io) {
      // Add all of the user's live sockets to the room channel
      await io.in(`user:${userId}`).socketsJoin(`room:${id}`);
      io.to(`room:${id}`).emit('room_event', { event: 'member_joined', userId, roomId: id });
      await pushPresenceOnRoomJoin(id, userId);

      // Post a system message so all members see "X joined the room" in chat
      const systemMsg = await createSystemRoomMessage(id, userId);
      io.to(`room:${id}`).emit('message', { message: systemMsg });
    }
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/rooms/:id/leave
router.delete(
  '/:id/leave',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      await roomService.leaveRoom(id, req.user!._id);
      res.json({ message: 'Left room' });

      getIo()
        ?.to(`room:${id}`)
        .emit('room_event', { event: 'member_left', userId: req.user!._id, roomId: id });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/rooms/:id/members
router.get(
  '/:id/members',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const members = await roomService.getMembers(id, req.user!._id);
      res.json({ members });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/rooms/:id/admins/:userId
router.post(
  '/:id/admins/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId } = req.params as { id: string; userId: string };
      await roomService.promoteAdmin(id, req.user!._id, userId);
      res.json({ message: 'User promoted to admin' });

      getIo()
        ?.to(`room:${id}`)
        .emit('room_event', { event: 'admin_promoted', userId, roomId: id });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/rooms/:id/admins/:userId
router.delete(
  '/:id/admins/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId } = req.params as { id: string; userId: string };
      await roomService.demoteAdmin(id, req.user!._id, userId);
      res.json({ message: 'User demoted to member' });

      getIo()
        ?.to(`room:${id}`)
        .emit('room_event', { event: 'admin_demoted', userId, roomId: id });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/rooms/:id/ban/:userId
router.post(
  '/:id/ban/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId } = req.params as { id: string; userId: string };
      await roomService.banMember(id, req.user!._id, userId);
      res.json({ message: 'User banned from room' });

      getIo()
        ?.to(`room:${id}`)
        .emit('room_event', { event: 'member_banned', userId, roomId: id });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/rooms/:id/ban/:userId
router.delete(
  '/:id/ban/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, userId } = req.params as { id: string; userId: string };
      await roomService.unbanMember(id, req.user!._id, userId);
      res.json({ message: 'User unbanned from room' });

      getIo()
        ?.to(`room:${id}`)
        .emit('room_event', { event: 'member_unbanned', userId, roomId: id });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/rooms/:id/bans
router.get('/:id/bans', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const bans = await roomService.getBans(id, req.user!._id);
    res.json({ bans });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/rooms/:id/invitations
router.post(
  '/:id/invitations',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { username } = req.body as { username?: string };
      if (!username) {
        throw new BadRequestError('username is required');
      }
      const { invitedUserId, invitationId, roomName, isPrivate } = await roomService.sendInvitation(
        id,
        req.user!._id,
        username,
      );
      res.status(201).json({ message: 'Invitation sent' });

      // Notify the invited user directly on their personal room channel
      getIo()
        ?.to(`user:${invitedUserId}`)
        .emit('room_event', { event: 'invited', roomId: id, invitationId, roomName, isPrivate });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/rooms/:id/invitations/:invId
router.put(
  '/:id/invitations/:invId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, invId } = req.params as { id: string; invId: string };
      const { action } = req.body as { action?: string };
      if (action !== 'accept' && action !== 'reject') {
        throw new BadRequestError('action must be "accept" or "reject"');
      }
      const userId = req.user!._id;
      const { accepted } = await roomService.respondToInvitation(id, userId, invId, action);
      res.json({ message: `Invitation ${action}ed` });

      if (accepted) {
        const io = getIo();
        if (io) {
          // Add all of the accepting user's live sockets to the room channel
          await io.in(`user:${userId}`).socketsJoin(`room:${id}`);
          io.to(`room:${id}`).emit('room_event', { event: 'member_joined', userId, roomId: id });
          await pushPresenceOnRoomJoin(id, userId);

          // Post a system message so all members see "X joined the room" in chat
          const systemMsg = await createSystemRoomMessage(id, userId);
          io.to(`room:${id}`).emit('message', { message: systemMsg });
        }
      }
    } catch (err) {
      next(err);
    }
  },
);

export default router;
