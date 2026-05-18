import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { PushSubscription } from '../models/pushSubscription.model.js';
import { sendPushToUser, getVapidPublicKey } from '../services/push.service.js';
import { AppError } from '../lib/errors.js';

const router = Router();

/**
 * GET /api/v1/push/vapid-public-key
 * Returns the VAPID public key for client-side subscription setup.
 */
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const key = getVapidPublicKey();
  res.json({ vapidPublicKey: key });
});

/**
 * POST /api/v1/push/subscribe
 * Save or update a push subscription for the authenticated user.
 */
router.post('/subscribe', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const { endpoint, keys, userAgent } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    throw new AppError(400, 'endpoint and keys (p256dh, auth) are required');
  }

  await PushSubscription.findOneAndUpdate(
    { userId, endpoint },
    { userId, endpoint, keys, userAgent: userAgent ?? '' },
    { upsert: true, new: true },
  );

  res.status(201).json({ ok: true });
});

/**
 * DELETE /api/v1/push/subscribe
 * Remove push subscription for the authenticated user (current device).
 */
router.delete('/subscribe', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  const { endpoint } = req.body as { endpoint?: string };

  if (endpoint) {
    await PushSubscription.deleteOne({ userId, endpoint });
  } else {
    // Remove all subscriptions for this user
    await PushSubscription.deleteMany({ userId });
  }

  res.json({ ok: true });
});

/**
 * POST /api/v1/push/test
 * Send a test notification to the authenticated user.
 */
router.post('/test', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!._id;
  await sendPushToUser(userId, {
    title: 'SafeGroup',
    body: 'Push notifications are working!',
    tag: 'test',
  });
  res.json({ ok: true });
});

export default router;
