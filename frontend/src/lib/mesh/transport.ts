/**
 * Common interface that every mesh transport implements. Concrete
 * implementations live in `./transports/<id>.ts`.
 */
export type TransportId = 'ws' | 'webrtc' | 'audio' | 'ble' | 'qr' | 'nfc';

export interface TransportCapabilities {
  /** Maximum number of bytes the transport can carry in a single frame. */
  maxFrameBytes: number;
  /** Approximate goodput in bits per second. */
  nominalBps: number;
  /** True for transports that cannot transmit and receive at the same time. */
  halfDuplex: boolean;
}

export interface MeshTransport {
  id: TransportId;
  /** Cheap probe: is this transport actually usable right now? */
  isAvailable(): Promise<boolean>;
  /** Encode + ship one frame. Resolves once the transport has handed off the bytes. */
  send(frame: Uint8Array): Promise<void>;
  /** Subscribe to inbound frames. Returns an unsubscribe handle. */
  onFrame(handler: (frame: Uint8Array, meta?: Record<string, unknown>) => void): () => void;
  capabilities: TransportCapabilities;
  /** Optional: release all underlying resources (sockets, audio nodes, …). */
  dispose?(): void;
}

/** Preferred order when choosing where to send. First-available wins. */
export const TRANSPORT_PRIORITY: TransportId[] = ['ws', 'webrtc', 'audio', 'ble', 'qr', 'nfc'];
