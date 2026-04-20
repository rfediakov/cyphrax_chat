import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { getPresenceStatuses } from '../presence/presence.manager.js';

const router = Router();

/**
 * GET /api/v1/presence?userIds=id1,id2,id3
 * Returns the current presence status for each requested userId.
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const raw = req.query.userIds as string | undefined;

  if (!raw || raw.trim() === '') {
    res.status(400).json({ error: 'userIds query param is required' });
    return;
  }

  const userIds = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (userIds.length === 0) {
    res.status(400).json({ error: 'userIds must not be empty' });
    return;
  }

  if (userIds.length > 200) {
    res.status(400).json({ error: 'Too many userIds (max 200)' });
    return;
  }

  const statuses = await getPresenceStatuses(userIds);
  res.json({ statuses });
});

export default router;
