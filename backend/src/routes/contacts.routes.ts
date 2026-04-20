import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as contactService from '../services/contact.service.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';
import { User } from '../models/user.model.js';
import { FriendRequest } from '../models/friendRequest.model.js';
import { Dialog } from '../models/dialog.model.js';
import { getPresenceStatuses } from '../presence/presence.manager.js';

const router = Router();

// GET /api/v1/contacts
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contacts = await contactService.getFriends(req.user!._id);
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/contacts/request
router.post('/request', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { toUsername, message } = req.body as { toUsername?: string; message?: string };
    if (!toUsername) {
      throw new BadRequestError('toUsername is required');
    }
    const { toUserId, requestId } = await contactService.sendFriendRequest(req.user!._id, toUsername, message);
    res.status(201).json({ message: 'Friend request sent' });

    const from = await User.findById(req.user!._id).select('username email').lean();
    getIo()?.to(`user:${toUserId}`).emit('friend_request', {
      requestId,
      fromUser: { _id: req.user!._id, username: from?.username ?? 'Someone', email: from?.email ?? '' },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/contacts/requests
router.get('/requests', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const requests = await contactService.getPendingRequests(req.user!._id);
    res.json({ requests });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/contacts/requests/:id
router.put(
  '/requests/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params as { id: string };
      const { action } = req.body as { action?: string };
      if (action !== 'accept' && action !== 'reject') {
        throw new BadRequestError('action must be "accept" or "reject"');
      }

      // Fetch request before responding so we have fromUserId for socket work
      const friendRequest = await FriendRequest.findOne({
        _id: id,
        toUser: new Types.ObjectId(req.user!._id),
        status: 'pending',
      }).lean();
      if (!friendRequest) throw new NotFoundError('Friend request not found');

      await contactService.respondToFriendRequest(req.user!._id, id, action);
      res.json({ message: `Friend request ${action}ed` });

      if (action === 'accept') {
        const fromUserId = friendRequest.fromUser.toString();
        const toUserId = req.user!._id;

        // Create the dialog eagerly so both sockets can join the room now
        const sorted = [new Types.ObjectId(fromUserId), new Types.ObjectId(toUserId)].sort(
          (a, b) => a.toString().localeCompare(b.toString()),
        );
        const dialog = await Dialog.findOneAndUpdate(
          { participants: sorted },
          { participants: sorted },
          { upsert: true, new: true },
        ).lean();
        const dialogId = dialog!._id.toString();

        // Fetch accepting user's info for the notification payload
        const acceptor = await User.findById(toUserId).select('username').lean();

        const io = getIo();
        if (io) {
          // Join both users' live sockets into the new dialog room
          await io.in(`user:${fromUserId}`).socketsJoin(`dialog:${dialogId}`);
          await io.in(`user:${toUserId}`).socketsJoin(`dialog:${dialogId}`);

          // Immediately push current presence of both users to each other.
          // evaluateAndBroadcastPresence only fires when status *changes*, so if
          // both users are already online their presence would never be delivered
          // to the newly created dialog room without this explicit push.
          const statuses = await getPresenceStatuses([fromUserId, toUserId]);
          io.to(`user:${toUserId}`).emit('presence', {
            userId: fromUserId,
            status: statuses[fromUserId] ?? 'offline',
          });
          io.to(`user:${fromUserId}`).emit('presence', {
            userId: toUserId,
            status: statuses[toUserId] ?? 'offline',
          });

          // Notify User-A that their request was accepted and a dialog is ready
          io.to(`user:${fromUserId}`).emit('friend_request_accepted', {
            acceptedBy: {
              id: toUserId,
              username: acceptor?.username ?? 'Someone',
            },
            dialogId,
          });
        }
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/contacts/ban/:userId  — must be before DELETE /:userId
router.post(
  '/ban/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      await contactService.banUser(req.user!._id, userId);
      res.json({ message: 'User banned' });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/contacts/ban/:userId  — must be before DELETE /:userId
router.delete(
  '/ban/:userId',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params as { userId: string };
      await contactService.unbanUser(req.user!._id, userId);
      res.json({ message: 'User unbanned' });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/contacts/:userId
router.delete('/:userId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.params as { userId: string };
    await contactService.removeFriend(req.user!._id, userId);
    res.json({ message: 'Friend removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
