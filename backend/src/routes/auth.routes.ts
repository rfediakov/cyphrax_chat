import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import { User } from '../models/user.model.js';
import { BadRequestError } from '../lib/errors.js';

const router = Router();

const REFRESH_COOKIE = 'refreshToken';
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    path: '/',
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
}

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, username, password } = req.body as {
      email?: string;
      username?: string;
      password?: string;
    };
    if (!email || !username || !password) {
      throw new BadRequestError('email, username, and password are required');
    }
    const registeredUser = await authService.register({ email, username, password });
    const meta = { userAgent: req.headers['user-agent'], ipAddress: req.ip };
    const { accessToken, refreshToken } = await authService.login({ email, password }, meta);
    setRefreshCookie(res, refreshToken);
    res.status(201).json({
      accessToken,
      user: { _id: registeredUser.id, email: registeredUser.email, username: registeredUser.username },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      throw new BadRequestError('email and password are required');
    }
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
    const { accessToken, refreshToken } = await authService.login({ email, password }, meta);
    setRefreshCookie(res, refreshToken);
    const user = await User.findOne({ email: email.toLowerCase(), deletedAt: null })
      .select('_id email username')
      .lean();
    res.json({
      accessToken,
      user: { _id: String(user!._id), email: user!.email, username: user!.username },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await authService.logout(req.user!.sessionId);
    clearRefreshCookie(res);
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawRefreshToken = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!rawRefreshToken) {
      throw new BadRequestError('Refresh token cookie missing');
    }
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
    const { accessToken, refreshToken } = await authService.refreshTokens(rawRefreshToken, meta);
    setRefreshCookie(res, refreshToken);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/password/reset-request
router.post(
  '/password/reset-request',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email?: string };
      if (!email) {
        throw new BadRequestError('email is required');
      }
      await authService.requestPasswordReset(email);
      // Always return success to avoid email enumeration
      res.json({ message: 'If that email is registered, a reset link has been sent' });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/password/reset
router.post('/password/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword) {
      throw new BadRequestError('token and newPassword are required');
    }
    await authService.resetPassword(token, newPassword);
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/auth/password/change
router.put(
  '/password/change',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || !newPassword) {
        throw new BadRequestError('currentPassword and newPassword are required');
      }
      await authService.changePassword(req.user!._id, currentPassword, newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /api/v1/auth/account
router.delete(
  '/account',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await authService.deleteAccount(req.user!._id);
      clearRefreshCookie(res);
      res.json({ message: 'Account deleted' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
