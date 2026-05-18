import { Socket, Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { Types } from 'mongoose';
import { User } from '../../models/user.model.js';
import type { ConsentDuration } from '../../models/remoteAccessLog.model.js';
import {
  isGuardianOf,
  logDeniedRequest,
  logAllowedRequest,
  closeAccessLog,
} from '../../services/remote.service.js';

/** In-memory map: sessionId → { guardianId, targetId, endsAt, timer } */
const activeSessions = new Map<
  string,
  { guardianId: string; targetId: string; endsAt: number; timer: ReturnType<typeof setTimeout> }
>();

/** Pending requests waiting for child consent: targetId → { sessionId, guardianId, timer } */
const pendingRequests = new Map<
  string,
  { sessionId: string; guardianId: string; timer: ReturnType<typeof setTimeout> }
>();

const DENY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
/** In-memory deny cooldown: targetId → expiresAt epoch ms */
const denyCooldowns = new Map<string, number>();

export function registerRemoteHandler(socket: Socket, io: Server): void {
  const userId = socket.data.userId as string;

  // ── remote_view_request: guardian requests to view child's camera ────────────
  socket.on(
    'remote_view_request',
    async ({ targetUserId }: { targetUserId: string }) => {
      try {
        if (!Types.ObjectId.isValid(targetUserId)) return;

        const guardian = await isGuardianOf(userId, targetUserId);
        if (!guardian) {
          socket.emit('remote_view_error', {
            message: 'You are not a guardian of this user.',
          });
          return;
        }

        // Check cooldown (only applies if target previously denied)
        const cooldownExpiry = denyCooldowns.get(targetUserId);
        if (cooldownExpiry && Date.now() < cooldownExpiry) {
          socket.emit('remote_view_error', {
            message: `Request blocked — cooldown active for ${Math.ceil((cooldownExpiry - Date.now()) / 60000)} more minute(s).`,
          });
          return;
        }

        // Cancel any existing pending request for this target (re-request scenario)
        const existing = pendingRequests.get(targetUserId);
        if (existing) {
          clearTimeout(existing.timer);
          pendingRequests.delete(targetUserId);
        }

        const sessionId = uuidv4();

        // Auto-deny after 30 seconds
        const timer = setTimeout(async () => {
          pendingRequests.delete(targetUserId);
          await logDeniedRequest(userId, targetUserId);
          io.to(`user:${userId}`).emit('remote_view_consent_result', {
            sessionId,
            granted: false,
            reason: 'auto_denied',
          });
        }, 30_000);

        pendingRequests.set(targetUserId, { sessionId, guardianId: userId, timer });

        // Get guardian username for the consent modal
        const guardianUser = await User.findById(userId).select('username').lean();
        const guardianUsername = guardianUser?.username ?? userId;

        io.to(`user:${targetUserId}`).emit('remote_view_request', {
          sessionId,
          guardianId: userId,
          guardianUsername,
        });

        socket.emit('remote_view_request_sent', { sessionId });
      } catch (err) {
        console.error('[Remote] remote_view_request error:', err);
      }
    },
  );

  // ── remote_view_consent: child grants or denies the request ──────────────────
  socket.on(
    'remote_view_consent',
    async ({
      sessionId,
      granted,
      duration,
    }: {
      sessionId: string;
      granted: boolean;
      duration?: ConsentDuration;
    }) => {
      try {
        const pending = pendingRequests.get(userId);
        if (!pending || pending.sessionId !== sessionId) return;

        clearTimeout(pending.timer);
        pendingRequests.delete(userId);

        const now = new Date();

        if (!granted) {
          // Apply 5-minute cooldown
          denyCooldowns.set(userId, Date.now() + DENY_COOLDOWN_MS);
          setTimeout(() => denyCooldowns.delete(userId), DENY_COOLDOWN_MS);

          await logDeniedRequest(pending.guardianId, userId);

          io.to(`user:${pending.guardianId}`).emit('remote_view_consent_result', {
            sessionId,
            granted: false,
            reason: 'denied',
          });
          return;
        }

        // Granted
        const durationMinutes: ConsentDuration = duration === 5 ? 5 : 1;
        const durationMs = durationMinutes * 60 * 1000;

        const log = await logAllowedRequest({
          guardianId: pending.guardianId,
          targetId: userId,
          durationMinutes,
        });

        // Auto-end session after consent duration
        const timer = setTimeout(async () => {
          const session = activeSessions.get(sessionId);
          if (!session) return;
          activeSessions.delete(sessionId);

          await closeAccessLog(session.guardianId, session.targetId, 'timeout');

          io.to(`user:${session.guardianId}`).emit('remote_view_ended', {
            sessionId,
            reason: 'timeout',
          });
          io.to(`user:${session.targetId}`).emit('remote_view_ended', {
            sessionId,
            reason: 'timeout',
          });
          activeSessions.delete(sessionId);
        }, durationMs);

        activeSessions.set(sessionId, {
          guardianId: pending.guardianId,
          targetId: userId,
          endsAt: Date.now() + durationMs,
          timer,
        });

        io.to(`user:${pending.guardianId}`).emit('remote_view_consent_result', {
          sessionId,
          granted: true,
          targetUserId: userId,
          durationMinutes,
          logId: log._id.toString(),
        });

        socket.emit('remote_view_session_active', {
          sessionId,
          guardianId: pending.guardianId,
          durationMinutes,
        });
      } catch (err) {
        console.error('[Remote] remote_view_consent error:', err);
      }
    },
  );

  // ── remote_view_stop: either party ends the session ──────────────────────────
  socket.on('remote_view_stop', async ({ sessionId }: { sessionId: string }) => {
    try {
      const session = activeSessions.get(sessionId);
      if (!session) return;

      // Only allow guardian or target to stop
      if (session.guardianId !== userId && session.targetId !== userId) return;

      clearTimeout(session.timer);
      activeSessions.delete(sessionId);

      const endedBy = userId === session.targetId ? 'target' : 'requester';

          await closeAccessLog(session.guardianId, session.targetId, endedBy);

          const otherId = userId === session.guardianId ? session.targetId : session.guardianId;
          io.to(`user:${otherId}`).emit('remote_view_ended', {
        sessionId,
        reason: 'stopped',
        stoppedBy: userId,
      });
      socket.emit('remote_view_ended', { sessionId, reason: 'stopped', stoppedBy: userId });
    } catch (err) {
      console.error('[Remote] remote_view_stop error:', err);
    }
  });

  // ── Cleanup on disconnect ─────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    // End any active session this user is part of
    for (const [sessionId, session] of activeSessions) {
      if (session.guardianId === userId || session.targetId === userId) {
        clearTimeout(session.timer);
        activeSessions.delete(sessionId);

        const endedBy = userId === session.targetId ? 'target' : 'requester';
        const otherId = userId === session.guardianId ? session.targetId : session.guardianId;

        await closeAccessLog(session.guardianId, session.targetId, endedBy).catch(() => {});

        io.to(`user:${otherId}`).emit('remote_view_ended', {
          sessionId,
          reason: 'disconnect',
        });
      }
    }

    // Cancel any pending request this user was waiting to respond to
    const pending = pendingRequests.get(userId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(userId);

      await logDeniedRequest(pending.guardianId, userId).catch(() => {});

      io.to(`user:${pending.guardianId}`).emit('remote_view_consent_result', {
        sessionId: pending.sessionId,
        granted: false,
        reason: 'disconnect',
      });
    }
  });
}
