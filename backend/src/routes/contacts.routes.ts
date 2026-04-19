import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as contactService from '../services/contact.service.js';
import { BadRequestError } from '../lib/errors.js';
import { getIo } from '../lib/io.js';

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
    const { toUserId } = await contactService.sendFriendRequest(req.user!._id, toUsername, message);
    res.status(201).json({ message: 'Friend request sent' });

    getIo()
      ?.to(`user:${toUserId}`)
      .emit('friend_request', { fromUserId: req.user!._id });
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
      await contactService.respondToFriendRequest(req.user!._id, id, action);
      res.json({ message: `Friend request ${action}ed` });
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
