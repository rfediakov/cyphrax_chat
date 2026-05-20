import { crc32 } from './crc';

/**
 * SafeGroup mesh frame format (v1). See `docs/ROOMS_AND_MESH_PLAN.md` §4.2.
 *
 *   +--------+--------+--------+--------+--------+----+----------+--------+
 *   | PREAM  | SYNC   | VER+TYPE | LEN  | MID   | TTL| PAYLOAD  | CRC32  |
 *   | 24 bit | 16 bit | 1 byte   | 2 B  | 4 B   | 1 B|  …       |  4 B   |
 *   +--------+--------+--------+--------+--------+----+----------+--------+
 *
 * The PREAMBLE (`0xAA AA AA`) is *only* present on transports that need bit
 * synchronisation (audio, BLE). For online transports (WebSocket, WebRTC) we
 * still emit it so a single decoder can be shared end-to-end — the cost is
 * 5 bytes per frame.
 */

export const FRAME_VERSION = 1;
export const PREAMBLE = Uint8Array.of(0xaa, 0xaa, 0xaa);
export const SYNC = Uint8Array.of(0x1a, 0xcf);
export const MAX_PAYLOAD_BYTES = 1024;
export const DEFAULT_TTL = 4;

export const FRAME_TYPES = {
  text: 0,
  binary: 1,
  telemetry: 2,
  ack: 3,
  control: 4,
  image_chunk: 5,
} as const;

export type FrameType = keyof typeof FRAME_TYPES;

const TYPE_NAMES: Record<number, FrameType> = {
  0: 'text',
  1: 'binary',
  2: 'telemetry',
  3: 'ack',
  4: 'control',
  5: 'image_chunk',
};

export interface MeshFrame {
  /** Protocol version (1 today). */
  version: number;
  /** Frame type — drives how `payload` is interpreted. */
  type: FrameType;
  /** Random 32-bit message id, used for dedup at the router. */
  mid: number;
  /** Hop budget. Decremented at every relay; the frame is dropped at 0. */
  ttl: number;
  payload: Uint8Array;
}

export interface DecodedFrame extends MeshFrame {
  /** Raw bytes of this frame including preamble — useful for rebroadcast. */
  raw: Uint8Array;
}

export class FrameDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameDecodeError';
  }
}

/** Generate a fresh, non-zero 32-bit random message id. */
export function randomMid(): number {
  // crypto.getRandomValues is available in browser + Node 18+
  const buf = new Uint32Array(1);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buf);
  } else {
    // Fallback for environments without WebCrypto.
    buf[0] = Math.floor(Math.random() * 0xffffffff);
  }
  // Avoid `0` so consumers can use it as a sentinel.
  return buf[0] === 0 ? 1 : buf[0] >>> 0;
}

export interface EncodeOptions {
  type: FrameType;
  payload: Uint8Array;
  ttl?: number;
  mid?: number;
}

/**
 * Encode a frame into bytes. Throws `RangeError` if the payload exceeds
 * `MAX_PAYLOAD_BYTES` — callers must chunk larger blobs themselves (the
 * `image_chunk` type exists exactly for this).
 */
export function encodeFrame(opts: EncodeOptions): Uint8Array {
  const payload = opts.payload;
  if (payload.length > MAX_PAYLOAD_BYTES) {
    throw new RangeError(
      `Frame payload (${payload.length} B) exceeds MAX_PAYLOAD_BYTES (${MAX_PAYLOAD_BYTES})`,
    );
  }
  const ttl = opts.ttl ?? DEFAULT_TTL;
  const mid = opts.mid ?? randomMid();
  const typeCode = FRAME_TYPES[opts.type];
  if (typeCode === undefined) {
    throw new RangeError(`Unknown frame type: ${opts.type}`);
  }

  // Header: 3 PREAMBLE + 2 SYNC + 1 VER/TYPE + 2 LEN + 4 MID + 1 TTL = 13
  const headerLen = PREAMBLE.length + SYNC.length + 1 + 2 + 4 + 1;
  const out = new Uint8Array(headerLen + payload.length + 4); // +4 for CRC32

  let o = 0;
  out.set(PREAMBLE, o); o += PREAMBLE.length;
  out.set(SYNC, o); o += SYNC.length;
  // CRC starts immediately *after* the sync word — we don't include preamble
  // (lost to AGC at the receiver) or sync (would just confirm the literal we
  // already matched on). Both sides agree on this start byte; see decodeFrame.
  const crcStart = o;
  out[o++] = ((FRAME_VERSION & 0x0f) << 4) | (typeCode & 0x0f);
  out[o++] = (payload.length >>> 8) & 0xff;
  out[o++] = payload.length & 0xff;
  out[o++] = (mid >>> 24) & 0xff;
  out[o++] = (mid >>> 16) & 0xff;
  out[o++] = (mid >>> 8) & 0xff;
  out[o++] = mid & 0xff;
  out[o++] = ttl & 0xff;
  out.set(payload, o); o += payload.length;

  const crc = crc32(out, crcStart, o - crcStart);
  out[o++] = (crc >>> 24) & 0xff;
  out[o++] = (crc >>> 16) & 0xff;
  out[o++] = (crc >>> 8) & 0xff;
  out[o++] = crc & 0xff;

  return out;
}

/**
 * Decode a single frame from `bytes`, starting the search for the sync word at
 * `start`. Returns the decoded frame and the index immediately *after* the
 * frame's CRC (so callers streaming bytes can pick up where we left off).
 *
 * On any structural failure throws `FrameDecodeError`. On bad CRC the same
 * error is thrown — there is no "best effort" recovery here (FEC happens one
 * layer down).
 */
export function decodeFrame(bytes: Uint8Array, start = 0): { frame: DecodedFrame; nextOffset: number } {
  const syncIdx = findSync(bytes, start);
  if (syncIdx < 0) {
    throw new FrameDecodeError('No sync word found');
  }

  let o = syncIdx + SYNC.length;
  if (bytes.length - o < 1 + 2 + 4 + 1 + 4) {
    throw new FrameDecodeError('Truncated frame header');
  }

  const verType = bytes[o++];
  const version = (verType >>> 4) & 0x0f;
  const typeCode = verType & 0x0f;
  const typeName = TYPE_NAMES[typeCode];
  if (!typeName) {
    throw new FrameDecodeError(`Unknown frame type code: ${typeCode}`);
  }
  if (version !== FRAME_VERSION) {
    throw new FrameDecodeError(`Unsupported frame version: ${version}`);
  }

  const payloadLen = (bytes[o++] << 8) | bytes[o++];
  if (payloadLen > MAX_PAYLOAD_BYTES) {
    throw new FrameDecodeError(`Frame claims oversize payload: ${payloadLen}`);
  }

  const mid =
    ((bytes[o++] << 24) >>> 0) |
    (bytes[o++] << 16) |
    (bytes[o++] << 8) |
    bytes[o++];

  const ttl = bytes[o++];

  if (bytes.length - o < payloadLen + 4) {
    throw new FrameDecodeError('Truncated payload');
  }
  const payload = bytes.slice(o, o + payloadLen);
  o += payloadLen;

  // Read CRC as unsigned 32-bit; the `>>> 0` after the OR is critical because
  // JavaScript's `|` returns a signed int.
  const expectedCrc =
    (((bytes[o++] << 24) >>> 0) |
      (bytes[o++] << 16) |
      (bytes[o++] << 8) |
      bytes[o++]) >>> 0;

  // CRC covers verType .. end-of-payload — see encodeFrame for the matching range.
  const crcStart = syncIdx + SYNC.length;
  const actualCrc = crc32(bytes, crcStart, o - 4 - crcStart);
  if (actualCrc !== expectedCrc) {
    throw new FrameDecodeError(
      `Bad CRC: expected ${expectedCrc.toString(16)}, got ${actualCrc.toString(16)}`,
    );
  }

  // Re-pack a clean copy starting at preamble (if there's one) — this is what
  // gets relayed onto other transports.
  const rawStart = Math.max(0, syncIdx - PREAMBLE.length);
  const raw = bytes.slice(rawStart, o);

  return {
    frame: { version, type: typeName, mid: mid >>> 0, ttl, payload, raw },
    nextOffset: o,
  };
}

/** Find the SYNC word starting at `start`. Returns -1 if not present. */
function findSync(bytes: Uint8Array, start: number): number {
  if (SYNC.length === 0) return start;
  const end = bytes.length - SYNC.length;
  for (let i = start; i <= end; i++) {
    let ok = true;
    for (let j = 0; j < SYNC.length; j++) {
      if (bytes[i + j] !== SYNC[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

/** Convenience: encode a UTF-8 string as a `text` frame. */
export function encodeTextFrame(text: string, opts: Omit<EncodeOptions, 'type' | 'payload'> = {}): Uint8Array {
  return encodeFrame({ ...opts, type: 'text', payload: new TextEncoder().encode(text) });
}

/** Convenience: read a `text` frame's payload as UTF-8. */
export function decodeText(frame: MeshFrame): string {
  return new TextDecoder().decode(frame.payload);
}
