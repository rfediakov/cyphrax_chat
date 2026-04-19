import { Socket } from 'socket.io';

interface TypingPayload {
  roomId?: string;
  dialogId?: string;
}

/**
 * Registers the `typing` event handler.
 * Broadcasts the typing indicator to the relevant room or dialog, excluding the sender.
 */
export function registerTypingHandler(socket: Socket): void {
  socket.on('typing', (payload: TypingPayload) => {
    const userId = socket.data.userId as string;
    const { roomId, dialogId } = payload ?? {};

    let target: string | null = null;
    if (roomId) {
      target = `room:${roomId}`;
    } else if (dialogId) {
      target = `dialog:${dialogId}`;
    }

    if (!target) return;

    socket.to(target).emit('typing', { userId, roomId, dialogId });
  });
}
