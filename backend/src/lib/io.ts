import { Server } from 'socket.io';

let ioInstance: Server | null = null;

export function setIo(io: Server): void {
  ioInstance = io;
}

/**
 * Returns the Socket.IO server instance.
 * Returns null if Socket.IO has not been initialized yet (e.g. before bootstrap completes).
 * Routes should guard against null when emitting — if io is not ready, events are silently skipped.
 */
export function getIo(): Server | null {
  return ioInstance;
}
