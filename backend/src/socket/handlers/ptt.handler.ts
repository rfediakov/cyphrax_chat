import { Socket, Server } from 'socket.io';
import { redis } from '../../lib/redis.js';
import { RoomMember } from '../../models/roomMember.model.js';

const PTT_TTL_SECONDS = 30;

function pttKey(roomId: string) {
  return `ptt:${roomId}`;
}

interface PttLockData {
  userId: string;
  sessionId: string;
}

async function getPttLock(roomId: string): Promise<PttLockData | null> {
  const raw = await redis.get(pttKey(roomId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PttLockData;
  } catch {
    return null;
  }
}

async function isRoomMember(userId: string, roomId: string): Promise<boolean> {
  const member = await RoomMember.findOne({ userId, roomId }).lean();
  return member !== null;
}

export function registerPttHandler(socket: Socket, io: Server): void {
  const userId = socket.data.userId as string;

  socket.on('ptt_start', async ({ roomId, sessionId }: { roomId: string; sessionId: string }) => {
    try {
      const member = await isRoomMember(userId, roomId);
      if (!member) return;

      // Only allow if no active PTT session in this room
      const existing = await getPttLock(roomId);
      if (existing && existing.userId !== userId) {
        socket.emit('ptt_busy', { roomId, userId: existing.userId });
        return;
      }

      await redis.set(pttKey(roomId), JSON.stringify({ userId, sessionId }), 'EX', PTT_TTL_SECONDS);

      // Notify all room members (except sender) that PTT started
      socket.to(`room:${roomId}`).emit('ptt_start', { roomId, userId, sessionId });
    } catch (err) {
      console.error('[PTT] ptt_start error:', err);
    }
  });

  socket.on('ptt_chunk', async ({ roomId, sessionId, chunk }: { roomId: string; sessionId: string; chunk: ArrayBuffer }) => {
    try {
      const lock = await getPttLock(roomId);
      if (!lock || lock.userId !== userId || lock.sessionId !== sessionId) return;

      // Refresh TTL on each chunk so session stays alive
      await redis.expire(pttKey(roomId), PTT_TTL_SECONDS);

      socket.to(`room:${roomId}`).emit('ptt_chunk', { sessionId, senderId: userId, chunk });
    } catch (err) {
      console.error('[PTT] ptt_chunk error:', err);
    }
  });

  socket.on('ptt_end', async ({ roomId, sessionId }: { roomId: string; sessionId: string }) => {
    try {
      const lock = await getPttLock(roomId);
      if (!lock || lock.userId !== userId || lock.sessionId !== sessionId) return;

      await redis.del(pttKey(roomId));

      socket.to(`room:${roomId}`).emit('ptt_end', { roomId, userId, sessionId });
    } catch (err) {
      console.error('[PTT] ptt_end error:', err);
    }
  });

  // Cleanup if socket disconnects mid-transmission
  socket.on('disconnect', async () => {
    try {
      // Find any rooms where this user holds the PTT lock
      // We iterate over socket rooms to release any active locks
      const rooms = [...socket.rooms].filter((r) => r.startsWith('room:'));
      for (const room of rooms) {
        const roomId = room.replace('room:', '');
        const lock = await getPttLock(roomId);
        if (lock && lock.userId === userId) {
          await redis.del(pttKey(roomId));
          io.to(`room:${roomId}`).emit('ptt_end', { roomId, userId, sessionId: lock.sessionId });
        }
      }
    } catch (err) {
      console.error('[PTT] disconnect cleanup error:', err);
    }
  });
}
