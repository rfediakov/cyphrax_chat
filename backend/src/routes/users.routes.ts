import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { User } from '../models/user.model.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';

const router = Router();

// GET /api/v1/users/me — own profile
router.get('/me', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findOne({ _id: req.user!._id, deletedAt: null })
      .select('-passwordHash -deletedAt')
      .lean();

    if (!user) {
      throw new NotFoundError('User not found');
    }

    res.json({
      id: String(user._id),
      email: user.email,
      username: user.username,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

// Escape characters that have special meaning in a regular expression.
// Without this, user-supplied queries (e.g. `(a+)+b`) would let callers
// craft pathological regexes that crash or hang the Mongo query engine.
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/v1/users/search?q= — prefix match on username, max 20 results
router.get('/search', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      throw new BadRequestError('Query parameter "q" is required');
    }

    const users = await User.find({
      username: { $regex: `^${escapeRegExp(q)}`, $options: 'i' },
      deletedAt: null,
      _id: { $ne: req.user!._id },
    })
      .select('username createdAt')
      .limit(20)
      .lean();

    // Intentionally never expose `email` here — that turns search into a
    // free email enumeration endpoint.
    const data = users.map((u) => ({
      id: String(u._id),
      username: u.username,
    }));

    res.json({ data });
  } catch (err) {
    next(err);
  }
});

export default router;
