/**
 * Public surface of the SafeGroup mesh layer.
 *
 * - `frame.ts` — binary frame codec (v1, §4.2 of ROOMS_AND_MESH_PLAN).
 * - `router.ts` — TTL/dedup/relay logic across N transports.
 * - `transports/*` — concrete transports (WS today; audio/BLE/QR to come).
 */
export {
  FRAME_VERSION,
  FRAME_TYPES,
  MAX_PAYLOAD_BYTES,
  DEFAULT_TTL,
  FrameDecodeError,
  encodeFrame,
  decodeFrame,
  encodeTextFrame,
  decodeText,
  randomMid,
  type FrameType,
  type MeshFrame,
  type DecodedFrame,
  type EncodeOptions,
} from './frame';

export { crc32 } from './crc';

export {
  MeshRouter,
  DEFAULT_DEDUP_WINDOW_MS,
  withDecrementedTtl,
  type RouterEvent,
  type RouterOptions,
} from './router';

export type { MeshTransport, TransportId, TransportCapabilities } from './transport';
export { TRANSPORT_PRIORITY } from './transport';

export { createWsTransport, RADIO_FRAME_EVENT } from './transports/ws';
export type { RadioFramePayload, WsTransportOptions } from './transports/ws';
