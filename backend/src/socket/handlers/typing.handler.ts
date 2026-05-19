import { Socket } from 'socket.io';
import { User } from '../../models/user.model.js';

interface TypingPayload {
  roomId?: string;
  dialogId?: string;
}

// Small in-memory cache so we don't hit Mongo on every keystroke.
// Cache entries live for 5 minutes — long enough to be useful while
// still picking up username changes within a reasonable window.
const USERNAME_TTL_MS = 5 * 60 * 1000;
const usernameCache = new Map<string, { username: string; expiresAt: number }>();

async function resolveUsername(userId: string): Promise<string> {
  const cached = usernameCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.username;

  const user = await User.findById(userId).select('username').lean();
  const username = user?.username ?? 'Someone';
  usernameCache.set(userId, { username, expiresAt: Date.now() + USERNAME_TTL_MS });
  return username;
}

/**
 * Registers the `typing` event handler.
 * Broadcasts the typing indicator to the relevant room or dialog, excluding the sender.
 *
 * The payload sent to clients (`{ userId, username, contextId }`) matches the
 * field names the React typing tracker expects.
 */
export function registerTypingHandler(socket: Socket): void {
  socket.on('typing', async (payload: TypingPayload) => {
    const userId = socket.data.userId as string;
    const { roomId, dialogId } = payload ?? {};

    let target: string | null = null;
    let contextId: string | null = null;
    if (roomId) {
      target = `room:${roomId}`;
      contextId = roomId;
    } else if (dialogId) {
      target = `dialog:${dialogId}`;
      contextId = dialogId;
    }

    if (!target || !contextId) return;

    try {
      const username = await resolveUsername(userId);
      socket.to(target).emit('typing', { userId, username, contextId });
    } catch (err) {
      console.error('[Typing] Failed to broadcast typing indicator:', err);
    }
  });
}
