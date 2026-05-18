import { Router, Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { User } from '../models/user.model.js';
import { RemoteAccessLog } from '../models/remoteAccessLog.model.js';
import { BadRequestError } from '../lib/errors.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/v1/remote/wards
 * Returns users who have the current user listed as their guardian.
 * Includes presence hint (via user.lastActivityAt) and battery from telemetry.
 */
router.get('/wards', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const guardianId = req.user!._id;

    const wards = await User.find({ guardianIds: new Types.ObjectId(guardianId) })
      .select('_id username email restrictedMode lastActivityAt')
      .lean();

    res.json({
      wards: wards.map((w) => ({
        _id: w._id.toString(),
        username: w.username,
        email: w.email,
        restrictedMode: w.restrictedMode,
        lastActivityAt: w.lastActivityAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/remote/access-log
 * Returns remote access log entries for the authenticated user.
 * As guardian: entries where requesterId === me
 * As target:   entries where targetUserId === me
 * Query param ?role=guardian|target (default: both, most recent 50)
 */
router.get('/access-log', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const role = req.query.role as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    let filter: Record<string, unknown>;
    if (role === 'guardian') {
      filter = { requesterId: new Types.ObjectId(userId) };
    } else if (role === 'target') {
      filter = { targetUserId: new Types.ObjectId(userId) };
    } else {
      filter = {
        $or: [
          { requesterId: new Types.ObjectId(userId) },
          { targetUserId: new Types.ObjectId(userId) },
        ],
      };
    }

    const logs = await RemoteAccessLog.find(filter)
      .sort({ requestedAt: -1 })
      .limit(limit)
      .populate('requesterId', 'username')
      .populate('targetUserId', 'username')
      .lean();

    res.json({
      logs: logs.map((l) => ({
        _id: l._id.toString(),
        requester: {
          _id: (l.requesterId as unknown as { _id: unknown; username: string })._id?.toString() ?? l.requesterId.toString(),
          username: (l.requesterId as unknown as { username?: string }).username ?? '',
        },
        target: {
          _id: (l.targetUserId as unknown as { _id: unknown; username: string })._id?.toString() ?? l.targetUserId.toString(),
          username: (l.targetUserId as unknown as { username?: string }).username ?? '',
        },
        requestedAt: l.requestedAt,
        consentGiven: l.consentGiven,
        consentDuration: l.consentDuration,
        sessionStartedAt: l.sessionStartedAt,
        sessionEndedAt: l.sessionEndedAt,
        endedBy: l.endedBy,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/remote/access-log/:targetUserId
 * Guardian views access log for a specific ward.
 */
router.get('/access-log/:targetUserId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const guardianId = req.user!._id;
    const targetUserId = req.params.targetUserId as string;

    if (!Types.ObjectId.isValid(targetUserId)) {
      return next(new BadRequestError('Invalid targetUserId'));
    }

    const target = await User.findById(targetUserId).select('guardianIds').lean();
    const isGuardian = target?.guardianIds.some((id) => id.toString() === guardianId);
    if (!isGuardian) {
      return res.status(403).json({ error: 'Not authorised' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const logs = await RemoteAccessLog.find({
      requesterId: new Types.ObjectId(guardianId as string),
      targetUserId: new Types.ObjectId(targetUserId),
    })
      .sort({ requestedAt: -1 })
      .limit(limit)
      .lean();

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

export default router;
