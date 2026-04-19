import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getRedisClient } from '../lib/redis.js';
import { setIo } from '../lib/io.js';
import { RoomMember } from '../models/roomMember.model.js';
import { Dialog } from '../models/dialog.model.js';
import {
  updatePresenceHeartbeat,
  removePresenceSocket,
  evaluateAndBroadcastPresence,
  subscribePresence,
} from '../presence/presence.manager.js';
import { registerActivityHandler } from './handlers/activity.handler.js';
import { registerTypingHandler } from './handlers/typing.handler.js';
import { registerReadHandler } from './handlers/read.handler.js';

interface JwtPayload {
  sub: string;
  sessionId: string;
}

export function initSocket(httpServer: HttpServer): Server {
  const pubClient = getRedisClient();

  // Dedicated subscriber client — ioredis clients in subscriber mode cannot run other commands
  const subClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  });

  // Separate client for presence pub/sub subscription (isolated from adapter sub)
  const presenceSubClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 200, 5000);
    },
  });

  const io = new Server(httpServer, {
    cors: {
      origin: config.frontendUrl,
      credentials: true,
    },
  });

  io.adapter(createAdapter(pubClient, subClient));

  setIo(io);
  subscribePresence(presenceSubClient, io);

  // ── Auth middleware ─────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('Unauthorized'));
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret) as JwtPayload;
      socket.data.userId = payload.sub;
      socket.data.sessionId = payload.sessionId;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string;
    console.log(`[Socket] Connected: userId=${userId} socketId=${socket.id}`);

    try {
      // §5.3.1 — join personal room
      await socket.join(`user:${userId}`);

      // §5.3.2 — join all room channels the user is a member of
      const memberships = await RoomMember.find({ userId }).lean();
      for (const m of memberships) {
        await socket.join(`room:${m.roomId}`);
      }

      // §5.3.3 — join all dialog channels the user participates in
      const dialogs = await Dialog.find({ participants: userId }).lean();
      for (const d of dialogs) {
        await socket.join(`dialog:${d._id}`);
      }

      // §5.3.4 — record initial presence heartbeat
      await updatePresenceHeartbeat(userId, socket.id);
      await evaluateAndBroadcastPresence(userId);
    } catch (err) {
      console.error(`[Socket] Error during connect setup for userId=${userId}:`, err);
    }

    // Register event handlers
    registerActivityHandler(socket);
    registerTypingHandler(socket);
    registerReadHandler(socket);

    // Server-side presence evaluation every 30 s per connected socket
    const presenceInterval = setInterval(async () => {
      try {
        await evaluateAndBroadcastPresence(userId);
      } catch (err) {
        console.error(`[Socket] Presence interval error for userId=${userId}:`, err);
      }
    }, 30_000);

    // ── Disconnect handler ────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`[Socket] Disconnected: userId=${userId} socketId=${socket.id}`);
      clearInterval(presenceInterval);

      try {
        // §5.6.1 — remove this socket from the presence hash
        await removePresenceSocket(userId, socket.id);
        // §5.6.2 — re-evaluate and broadcast new status
        await evaluateAndBroadcastPresence(userId);
      } catch (err) {
        console.error(`[Socket] Error during disconnect cleanup for userId=${userId}:`, err);
      }
    });
  });

  console.log('[Socket] Socket.IO server initialized');
  return io;
}
