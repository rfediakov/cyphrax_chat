import type { Socket } from 'socket.io-client';
import type { MeshTransport } from '../transport';

/**
 * `room_widget:radio:frame` is the canonical Socket.IO event for mesh frame
 * exchange (see `docs/ROOMS_AND_MESH_PLAN.md` §3.4). The payload is:
 *
 *   { roomId: string; frame: number[] }
 *
 * `frame` is sent as a plain number array because Socket.IO's binary
 * transport doesn't always round-trip ArrayBuffers cleanly between clients
 * once the Redis adapter is in the loop. The cost is ~3× the bandwidth, which
 * is irrelevant at ≤ 1 kB frames over a LAN/WAN socket.
 */

export const RADIO_FRAME_EVENT = 'room_widget:radio:frame';

export interface RadioFramePayload {
  roomId: string;
  frame: number[];
  /** Optional transport metadata reported by the relayer (e.g. SNR proxy). */
  meta?: Record<string, unknown>;
}

export interface WsTransportOptions {
  socket: Socket;
  roomId: string;
}

/**
 * WebSocket mesh transport. Sends/receives frames scoped to a single room.
 * The router owns this instance and switches transports out when the user
 * navigates to a different room.
 */
export function createWsTransport({ socket, roomId }: WsTransportOptions): MeshTransport {
  const handlers = new Set<(frame: Uint8Array, meta?: Record<string, unknown>) => void>();

  const onWire = (payload: RadioFramePayload) => {
    if (!payload || payload.roomId !== roomId) return;
    if (!Array.isArray(payload.frame)) return;
    const bytes = new Uint8Array(payload.frame);
    for (const h of handlers) {
      try {
        h(bytes, payload.meta);
      } catch (err) {
        console.error('[ws transport] handler threw:', err);
      }
    }
  };

  socket.on(RADIO_FRAME_EVENT, onWire);

  return {
    id: 'ws',
    capabilities: {
      // Socket.IO frames can be much bigger, but we cap at the mesh max so the
      // same chunking logic works across every transport.
      maxFrameBytes: 1024 + 32,
      nominalBps: 256_000,
      halfDuplex: false,
    },
    async isAvailable() {
      return socket.connected;
    },
    async send(frame: Uint8Array) {
      if (!socket.connected) {
        throw new Error('Socket disconnected');
      }
      // Convert to a plain array; see header comment for the reason.
      const arr = Array.from(frame);
      socket.emit(RADIO_FRAME_EVENT, { roomId, frame: arr } satisfies RadioFramePayload);
    },
    onFrame(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    dispose() {
      socket.off(RADIO_FRAME_EVENT, onWire);
      handlers.clear();
    },
  };
}
