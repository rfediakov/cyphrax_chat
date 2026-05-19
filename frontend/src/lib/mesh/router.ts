import { crc32 } from './crc';
import { decodeFrame, encodeFrame, FrameDecodeError, type DecodedFrame, type EncodeOptions } from './frame';
import type { MeshTransport, TransportId } from './transport';
import { TRANSPORT_PRIORITY } from './transport';

/**
 * Mesh Router — see `docs/ROOMS_AND_MESH_PLAN.md` §4.5.
 *
 *  - Picks the highest-priority *available* transport when sending.
 *  - Drops duplicate frames (`mid` seen in the last `DEDUP_WINDOW_MS`).
 *  - Decrements TTL on relay; drops at 0.
 *  - When a frame arrives from one transport and *another* transport is
 *    available, the router re-emits it there. That's the "bridge" property:
 *    a single user with both internet and radio glues the room together.
 */

export const DEFAULT_DEDUP_WINDOW_MS = 60_000;

export interface RouterEvent {
  /** The decoded frame (after CRC pass). */
  frame: DecodedFrame;
  /** Transport the frame came in on. */
  sourceTransport: TransportId;
  /** True when the router *also* relayed the frame on at least one other transport. */
  relayed: boolean;
}

type FrameListener = (event: RouterEvent) => void;

export interface RouterOptions {
  dedupWindowMs?: number;
  /** Override the transport priority order (useful in tests). */
  priority?: TransportId[];
  /** Hook called when a frame is decoded but its CRC check fails. */
  onDecodeError?: (err: Error, raw: Uint8Array, sourceTransport: TransportId) => void;
}

export class MeshRouter {
  private readonly transports = new Map<TransportId, MeshTransport>();
  private readonly transportUnsubs = new Map<TransportId, () => void>();
  private readonly listeners = new Set<FrameListener>();
  private readonly seenAt = new Map<number, number>(); // mid -> timestamp ms
  private readonly priority: TransportId[];
  private readonly dedupWindowMs: number;
  private readonly onDecodeError?: RouterOptions['onDecodeError'];

  constructor(options: RouterOptions = {}) {
    this.priority = options.priority ?? TRANSPORT_PRIORITY;
    this.dedupWindowMs = options.dedupWindowMs ?? DEFAULT_DEDUP_WINDOW_MS;
    this.onDecodeError = options.onDecodeError;
  }

  /** Register a transport. Subsequent `send` calls may use it; inbound frames are wired up here. */
  addTransport(transport: MeshTransport): void {
    if (this.transports.has(transport.id)) {
      this.removeTransport(transport.id);
    }
    this.transports.set(transport.id, transport);

    const unsub = transport.onFrame((bytes) => {
      void this.handleInbound(bytes, transport.id);
    });
    this.transportUnsubs.set(transport.id, unsub);
  }

  removeTransport(id: TransportId): void {
    this.transportUnsubs.get(id)?.();
    this.transportUnsubs.delete(id);
    const t = this.transports.get(id);
    this.transports.delete(id);
    t?.dispose?.();
  }

  /** Tear down every transport and clear listeners. */
  dispose(): void {
    for (const id of [...this.transports.keys()]) {
      this.removeTransport(id);
    }
    this.listeners.clear();
    this.seenAt.clear();
  }

  /** Subscribe to *decoded* frames (after dedup, CRC pass). */
  onFrame(listener: FrameListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Encode and send. Resolves with the list of transport ids actually used. */
  async send(opts: EncodeOptions): Promise<TransportId[]> {
    const bytes = encodeFrame(opts);
    // Record our own mid so a relay loop can't bounce it back to us.
    if (opts.mid !== undefined) this.markSeen(opts.mid);

    return this.broadcast(bytes, null);
  }

  /** Send already-encoded bytes (used for relay). */
  async sendRaw(bytes: Uint8Array): Promise<TransportId[]> {
    return this.broadcast(bytes, null);
  }

  /** Number of transports currently registered. */
  get transportCount(): number {
    return this.transports.size;
  }

  /** Snapshot of registered transport ids in priority order. */
  listTransports(): TransportId[] {
    return this.priority.filter((id) => this.transports.has(id));
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async handleInbound(bytes: Uint8Array, source: TransportId): Promise<void> {
    let decoded: DecodedFrame;
    try {
      decoded = decodeFrame(bytes).frame;
    } catch (err) {
      if (err instanceof FrameDecodeError) {
        this.onDecodeError?.(err, bytes, source);
        return;
      }
      throw err;
    }

    // Dedup: same mid within window? Drop without re-emitting.
    if (this.hasSeen(decoded.mid)) {
      return;
    }
    this.markSeen(decoded.mid);

    // TTL=0 means the frame stops here (local-only).
    let relayed = false;
    if (decoded.ttl > 0) {
      const relayBytes = withDecrementedTtl(decoded.raw, decoded.ttl - 1);
      const used = await this.broadcast(relayBytes, source);
      relayed = used.length > 0;
    }

    const event: RouterEvent = { frame: decoded, sourceTransport: source, relayed };
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        // One listener shouldn't take down the others.
        console.error('[MeshRouter] Listener threw:', err);
      }
    }
  }

  /** Broadcast bytes on every *available* transport except `skip`. */
  private async broadcast(bytes: Uint8Array, skip: TransportId | null): Promise<TransportId[]> {
    const used: TransportId[] = [];
    for (const id of this.priority) {
      if (id === skip) continue;
      const t = this.transports.get(id);
      if (!t) continue;
      // We trust the transport's send() to fail fast if not actually available;
      // an explicit isAvailable() probe per send would double round-trips.
      try {
        await t.send(bytes);
        used.push(id);
      } catch (err) {
        console.warn(`[MeshRouter] transport=${id} send failed:`, err);
      }
    }
    return used;
  }

  private hasSeen(mid: number): boolean {
    this.evictExpired();
    return this.seenAt.has(mid);
  }

  private markSeen(mid: number): void {
    this.seenAt.set(mid, Date.now());
  }

  /** Drop ids that fell out of the dedup window. Called lazily. */
  private evictExpired(): void {
    const cutoff = Date.now() - this.dedupWindowMs;
    // Map preserves insertion order, but updating timestamps reorders nothing,
    // so we iterate the whole thing. With < 1000 mids in flight this is fine.
    for (const [mid, ts] of this.seenAt) {
      if (ts < cutoff) this.seenAt.delete(mid);
    }
  }
}

/**
 * Return a copy of `raw` (a fully-encoded frame including preamble + sync)
 * with the TTL byte replaced and the CRC32 recomputed. Used during relay.
 */
export function withDecrementedTtl(raw: Uint8Array, newTtl: number): Uint8Array {
  // The TTL byte sits at PREAMBLE(3) + SYNC(2) + verType(1) + len(2) + mid(4) = 12.
  const TTL_OFFSET = 12;
  // CRC is the last 4 bytes; covers everything from SYNC onward.
  if (raw.length < TTL_OFFSET + 1 + 4) {
    throw new Error('Frame too small to relay');
  }
  const out = new Uint8Array(raw);
  out[TTL_OFFSET] = newTtl & 0xff;

  // Recompute CRC across the same bytes encodeFrame originally covered:
  // immediately after the sync word, up to (but not including) the CRC bytes.
  const PREAMBLE_LEN = 3;
  const SYNC_LEN = 2;
  const crcStart = PREAMBLE_LEN + SYNC_LEN;
  const crcEnd = out.length - 4;
  const crc = crc32(out, crcStart, crcEnd - crcStart);
  out[out.length - 4] = (crc >>> 24) & 0xff;
  out[out.length - 3] = (crc >>> 16) & 0xff;
  out[out.length - 2] = (crc >>> 8) & 0xff;
  out[out.length - 1] = crc & 0xff;
  return out;
}
