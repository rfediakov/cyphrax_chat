import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { UnauthorizedError } from '../lib/errors.js';

interface AccessTokenPayload {
  sub: string;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { _id: string; sessionId: string };
    }
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  const cookieToken = req.cookies?.accessToken as string | undefined;
  return cookieToken ?? null;
}

function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AccessTokenPayload;
    return payload;
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    return next(new UnauthorizedError('No access token provided'));
  }
  const payload = verifyAccessToken(token);
  req.user = { _id: payload.sub, sessionId: payload.sessionId };
  next();
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = verifyAccessToken(token);
      req.user = { _id: payload.sub, sessionId: payload.sessionId };
    } catch {
      // Non-fatal — continue without user context
    }
  }
  next();
}
