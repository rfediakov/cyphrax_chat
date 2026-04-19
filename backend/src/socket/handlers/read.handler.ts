import { Socket } from 'socket.io';
import { LastRead } from '../../models/lastRead.model.js';
import { Types } from 'mongoose';

interface ReadPayload {
  roomId?: string;
  dialogId?: string;
}

/**
 * Registers the `read` event handler.
 * Upserts a LastRead record for the given context (room or dialog).
 */
export function registerReadHandler(socket: Socket): void {
  socket.on('read', async (payload: ReadPayload) => {
    const userId = socket.data.userId as string;
    const { roomId, dialogId } = payload ?? {};

    if (!roomId && !dialogId) return;

    try {
      const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
      const update: Record<string, unknown> = {
        userId: new Types.ObjectId(userId),
        lastReadAt: new Date(),
      };

      if (roomId) {
        filter.roomId = new Types.ObjectId(roomId);
        update.roomId = new Types.ObjectId(roomId);
        update.dialogId = null;
      } else if (dialogId) {
        filter.dialogId = new Types.ObjectId(dialogId);
        update.dialogId = new Types.ObjectId(dialogId);
        update.roomId = null;
      }

      await LastRead.findOneAndUpdate(filter, update, { upsert: true });
    } catch (err) {
      console.error('[Read] Error upserting LastRead:', err);
    }
  });
}
