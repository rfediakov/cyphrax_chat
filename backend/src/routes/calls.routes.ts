import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.middleware.js';
import { config } from '../config.js';
import { Call } from '../models/call.model.js';

const router = Router();

/**
 * GET /api/v1/calls/ice-config
 *
 * Returns ICE server configuration with time-limited TURN credentials
 * generated via HMAC-SHA1 (RFC 5766 §7).
 */
router.get('/ice-config', requireAuth, (_req: Request, res: Response, next: NextFunction) => {
  try {
    const ttl = config.turnTtlSeconds;
    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:safegroup`;
    const credential = crypto
      .createHmac('sha1', config.turnSecret)
      .update(username)
      .digest('base64');

    const iceServers: RTCIceServer[] = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ];

    // Only include TURN if a real host is configured
    if (config.turnHost !== 'localhost') {
      iceServers.push({
        urls: `turn:${config.turnHost}:${config.turnPort}`,
        username,
        credential,
      });
    }

    res.json({ iceServers });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/calls/history?limit=20&offset=0
 *
 * Returns the call history for the authenticated user.
 */
router.get('/history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!._id;
    const limit = Math.min(parseInt((req.query.limit as string) ?? '20', 10), 100);
    const offset = parseInt((req.query.offset as string) ?? '0', 10);

    const calls = await Call.find({
      $or: [{ callerId: userId }, { calleeId: userId }, { participants: userId }],
    })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('callerId', 'username')
      .populate('calleeId', 'username')
      .lean();

    res.json({ calls });
  } catch (err) {
    next(err);
  }
});

export default router;
