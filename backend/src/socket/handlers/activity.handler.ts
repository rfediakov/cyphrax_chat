import { Socket } from 'socket.io';
import {
  updatePresenceHeartbeat,
  evaluateAndBroadcastPresence,
} from '../../presence/presence.manager.js';

/**
 * Registers handlers for `activity` and `ping` events.
 * Both reset the heartbeat TTL and re-evaluate the user's presence status.
 */
export function registerActivityHandler(socket: Socket): void {
  const handler = async () => {
    const userId = socket.data.userId as string;
    try {
      await updatePresenceHeartbeat(userId, socket.id);
      await evaluateAndBroadcastPresence(userId);
    } catch (err) {
      console.error('[Activity] Error updating presence:', err);
    }
  };

  socket.on('activity', handler);
  socket.on('ping', handler);
}
