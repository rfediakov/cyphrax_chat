import type { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { RoomMember } from '../../models/roomMember.model.js';
import { RoomBan } from '../../models/roomBan.model.js';
import { RadioFrame, type MeshTransportId } from '../../models/radioFrame.model.js';

/**
 * Socket.IO bridge for the SafeGroup mesh frame protocol.
 *
 * The server's only job is to:
 *  1. validate the caller is allowed to broadcast in this room (member, not banned),
 *  2. enforce a per-user, per-room rate limit (10 frames/s — §R-4),
 *  3. persist the frame to `RadioFrame` for the QSO log + frame inspector,
 *  4. fan the payload out to every other member of the room.
 *
 * The server does *not* parse or trust the frame body — that's the client's
 * job. We only sniff the header bytes that fit into our fixed-shape schema.
 */

export const RADIO_FRAME_EVENT = 'room_widget:radio:frame';

interface IncomingFramePayload {
  roomId?: string;
  /** Frame bytes as a plain number array (see frontend transports/ws.ts). */
  frame?: number[];
  /** Per-transport metadata supplied by the sender (RSSI proxy, FEC stats, …). */
  meta?: Record<string, unknown>;
  /** Origin transport — defaults to `ws` if absent. */
  transport?: MeshTransportId;
}

// ── Rate limit ─────────────────────────────────────────────────────────────
// Sliding-window counter per (userId, roomId). 10 frames per 1 s.

const RATE_WINDOW_MS = 1_000;
const RATE_LIMIT = 10;

const rateBuckets = new Map<string, number[]>();

function checkRateLimit(userId: string, roomId: string): boolean {
  const key = `${userId}:${roomId}`;
  const now = Date.now();
  const timestamps = rateBuckets.get(key) ?? [];
  const fresh = timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_LIMIT) {
    rateBuckets.set(key, fresh);
    return false;
  }
  fresh.push(now);
  rateBuckets.set(key, fresh);

  // Periodic GC so the bucket map doesn't grow without bound when users idle.
  if (rateBuckets.size > 500) {
    for (const [k, ts] of rateBuckets) {
      const live = ts.filter((t) => now - t < RATE_WINDOW_MS);
      if (live.length === 0) rateBuckets.delete(k);
    }
  }
  return true;
}

// ── Frame header sniff ─────────────────────────────────────────────────────
// Layout (see frontend/src/lib/mesh/frame.ts): preamble(3) + sync(2) + verType(1)
// + len(2) + mid(4) + ttl(1) + payload + crc(4).

const PREAMBLE_LEN = 3;
const SYNC_LEN = 2;
const HEADER_OFFSET = PREAMBLE_LEN + SYNC_LEN;

const TYPE_NAMES: Record<number, string> = {
  0: 'text',
  1: 'binary',
  2: 'telemetry',
  3: 'ack',
  4: 'control',
  5: 'image_chunk',
};

interface HeaderPeek {
  version: number;
  type: string;
  payloadLen: number;
  mid: number;
  ttl: number;
  decodedText: string | null;
}

function peekFrameHeader(bytes: Uint8Array): HeaderPeek | null {
  if (bytes.length < HEADER_OFFSET + 1 + 2 + 4 + 1 + 4) return null;
  let o = HEADER_OFFSET;
  const verType = bytes[o++];
  const version = (verType >>> 4) & 0x0f;
  const typeCode = verType & 0x0f;
  const type = TYPE_NAMES[typeCode] ?? 'unknown';
  const payloadLen = (bytes[o++] << 8) | bytes[o++];
  const mid =
    ((bytes[o++] << 24) >>> 0) |
    (bytes[o++] << 16) |
    (bytes[o++] << 8) |
    bytes[o++];
  const ttl = bytes[o++];

  if (bytes.length < o + payloadLen + 4) return null;

  let decodedText: string | null = null;
  if (type === 'text') {
    try {
      decodedText = new TextDecoder('utf-8', { fatal: false }).decode(
        bytes.subarray(o, o + payloadLen),
      );
    } catch {
      decodedText = null;
    }
  }

  return { version, type, payloadLen, mid: mid >>> 0, ttl, decodedText };
}

export function registerRadioFrameHandler(socket: Socket, io: Server): void {
  const userId = socket.data.userId as string;

  socket.on(RADIO_FRAME_EVENT, async (payload: IncomingFramePayload) => {
    const roomId = payload?.roomId;
    const frameArr = payload?.frame;
    if (!roomId || !Array.isArray(frameArr) || frameArr.length === 0) {
      return;
    }
    if (!Types.ObjectId.isValid(roomId)) return;

    // §R-2 / R-4 — only members of the room may broadcast.
    const member = await RoomMember.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId),
    }).lean();
    if (!member) {
      return;
    }

    const banned = await RoomBan.findOne({
      roomId: new Types.ObjectId(roomId),
      userId: new Types.ObjectId(userId),
    }).lean();
    if (banned) return;

    if (!checkRateLimit(userId, roomId)) {
      socket.emit('room_widget:radio:rate_limited', { roomId });
      return;
    }

    // Defensive copy + size cap (preamble + sync + header + payload + crc ≈ 1100 B max).
    const bytes = Uint8Array.from(frameArr.slice(0, 1100));
    const header = peekFrameHeader(bytes);

    // Persist (best-effort — a write failure shouldn't block fan-out).
    try {
      await RadioFrame.create({
        roomId: new Types.ObjectId(roomId),
        senderUserId: new Types.ObjectId(userId),
        transportId: payload.transport ?? 'ws',
        transportMeta:
          payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
            ? payload.meta
            : {},
        version: header?.version ?? 0,
        type: header?.type ?? 'unknown',
        mid: header?.mid ?? 0,
        ttl: header?.ttl ?? 0,
        bytes: Buffer.from(bytes),
        decodedPayload: header?.decodedText ?? null,
      });
    } catch (err) {
      console.error('[radio.handler] failed to persist frame:', err);
    }

    // Fan out to everyone else in the room. We re-emit the canonical
    // payload shape so clients all use the same decoder path.
    socket.to(`room:${roomId}`).emit(RADIO_FRAME_EVENT, {
      roomId,
      frame: frameArr,
      meta: { ...(payload.meta ?? {}), relayedBy: userId },
    });
  });

  void io;
}
