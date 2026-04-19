import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { Session } from '../models/session.model.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { Types } from 'mongoose';

const router = Router();

// GET /api/v1/sessions — list active sessions for the current user
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = new Types.ObjectId(req.user!._id);
    const sessions = await Session.find({
      userId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select('-tokenHash')
      .lean();

    const data = sessions.map((s) => ({
      id: String(s._id),
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      isCurrent: String(s._id) === req.user!.sessionId,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/sessions/:id — revoke a specific session
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = new Types.ObjectId(req.user!._id);

    const session = await Session.findOne({ _id: id, userId });
    if (!session) {
      throw new NotFoundError('Session not found');
    }

    if (String(session._id) === req.user!.sessionId) {
      throw new ForbiddenError('Use /auth/logout to revoke the current session');
    }

    session.revokedAt = new Date();
    await session.save();

    res.json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
});

export default router;
