import { Schema, model, Document, Types } from 'mongoose';

/**
 * Persistent log of every mesh frame the server has *seen* (or relayed) for a
 * room. Used for the radio room's QSO log, frame inspector dev tool, and
 * (later) the BeaconWidget map history.
 *
 * Frames are stored as `Buffer` (Mongoose maps `Buffer` to BSON binary), not
 * as base64 strings — keeps the on-disk footprint close to the wire size.
 */

export type MeshTransportId = 'ws' | 'webrtc' | 'audio' | 'ble' | 'qr' | 'nfc';

export interface IRadioFrame extends Document {
  roomId: Types.ObjectId;
  senderUserId: Types.ObjectId | null;
  /** Which transport this frame *originated* on (per the sending client). */
  transportId: MeshTransportId;
  /** Free-form per-transport metadata (RSSI, FEC stats, …). */
  transportMeta: Record<string, unknown>;
  /** Frame version (parsed from the header before storage). */
  version: number;
  /** Frame type (`text`, `binary`, `telemetry`, `ack`, `control`, `image_chunk`). */
  type: string;
  /** 32-bit mid for dedup queries. */
  mid: number;
  ttl: number;
  /** Raw frame bytes (preamble + sync + header + payload + CRC). */
  bytes: Buffer;
  /** Best-effort decoded payload — for `text` frames this is the UTF-8 string. */
  decodedPayload: string | null;
  createdAt: Date;
}

const RadioFrameSchema = new Schema<IRadioFrame>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    transportId: {
      type: String,
      enum: ['ws', 'webrtc', 'audio', 'ble', 'qr', 'nfc'],
      required: true,
    },
    transportMeta: { type: Schema.Types.Mixed, default: {} },
    version: { type: Number, required: true },
    type: { type: String, required: true },
    mid: { type: Number, required: true },
    ttl: { type: Number, required: true },
    bytes: { type: Buffer, required: true },
    decodedPayload: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

RadioFrameSchema.index({ roomId: 1, createdAt: -1 });
// Dedup helper: same room + mid within a short window means duplicate frame.
RadioFrameSchema.index({ roomId: 1, mid: 1, createdAt: -1 });

export const RadioFrame = model<IRadioFrame>('RadioFrame', RadioFrameSchema);
