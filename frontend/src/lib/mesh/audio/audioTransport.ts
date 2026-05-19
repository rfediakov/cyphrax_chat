/**
 * Audio mesh transport — `MeshTransport.id = 'audio'`.
 *
 * Lifecycle:
 *
 *  1. On creation we register the transport but do *not* touch the mic; the
 *     decoder only spins up after `open()` is called explicitly (the UI gates
 *     this behind an explicit "Open mic" toggle for safety + battery).
 *  2. `send(frame)` synthesises a PCM waveform and plays it through a fresh
 *     `AudioBufferSourceNode`. We resolve when the source's `onended` fires so
 *     callers can sequentially fire frames without overlap.
 *  3. RX: a `MediaStreamSource` is wired into a `ScriptProcessorNode` (4096
 *     mono samples). Each block is handed to the `BfskDecoder` which emits
 *     framed bytes via the transport's `onFrame` listeners.
 *
 * Why `ScriptProcessorNode` and not `AudioWorklet`?
 *  - The plan §8 risk register calls out iOS Safari `AudioWorklet` gaps. SPN
 *    is deprecated but available on every browser we care about. The TODO is
 *    to migrate once we ship a service-worker bundler for the worklet code.
 *
 * Why no FEC?
 *  - Reed–Solomon (255,223) is listed as optional in the spec. For BFSK 300 +
 *    a normal loopback (speaker → mic on the same device) the CRC32 alone
 *    catches everything that survives the sync hunt. We can layer FEC in
 *    later without changing this file's surface.
 */

import type { MeshTransport, TransportCapabilities } from '../transport';
import type { DecodedFrame } from '../frame';
import { BfskDecoder } from './decoder';
import { encodeFrameToPcm, estimateDurationMs } from './encoder';
import { DEFAULT_MODE, type ModeParams } from './bfsk';

// ── Type aliases (ScriptProcessor was removed from the strict DOM lib) ───

interface ScriptProcessorNodeLike extends AudioNode {
  onaudioprocess: ((ev: AudioProcessingEvent) => void) | null;
  bufferSize: number;
}

interface AudioContextWithScriptProcessor extends AudioContext {
  createScriptProcessor(bufferSize?: number, numInputs?: number, numOutputs?: number): ScriptProcessorNodeLike;
}

export interface AudioTransportOptions {
  /** Pre-existing AudioContext. The transport never closes the context. */
  audioContext: AudioContext;
  /** Initial mode; can be swapped with `setMode`. */
  mode?: ModeParams;
  /** Override the `getUserMedia` constraints used for the mic. */
  micConstraints?: MediaStreamConstraints;
  /** Optional callback fired whenever a frame decodes (in addition to `onFrame`). */
  onFrameDecoded?: (frame: DecodedFrame) => void;
  /** Optional callback fired on TX progress updates (0..1). */
  onTxProgress?: (progress: number) => void;
  /** Optional callback fired when TX state changes. */
  onTxStateChange?: (txState: 'idle' | 'transmitting') => void;
  /** Optional callback fired when RX state changes. */
  onRxStateChange?: (rxState: 'closed' | 'listening' | 'error') => void;
}

export interface AudioMeshTransport extends MeshTransport {
  id: 'audio';
  /** Acquire the mic and start the decoder. Resolves when listening. */
  open(): Promise<void>;
  /** Stop listening and release the mic. Safe to call multiple times. */
  close(): void;
  /** True when the decoder is running. */
  isOpen(): boolean;
  /** Swap the active mode (mark/space/baud). Restarts the decoder. */
  setMode(mode: ModeParams): void;
  /** Currently active mode. */
  getMode(): ModeParams;
  /** Underlying `AnalyserNode` for waterfall / level meter UIs (RX side). */
  getRxAnalyser(): AnalyserNode | null;
  /** True while a transmission is currently playing through the speaker. */
  isTransmitting(): boolean;
}

const DEFAULT_MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    // Critical: any of these will mangle our narrow tones.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    // 48 kHz is the safest constant across desktop + iOS Safari; the encoder
    // adapts to whatever the AudioContext actually delivers.
    channelCount: 1,
  },
  video: false,
};

const SCRIPT_BUFFER_SIZE = 4096;

const DEFAULT_CAPABILITIES: TransportCapabilities = {
  maxFrameBytes: 256,
  // 300 baud × 0.8 (10-bit UART framing per byte) ≈ 240 bps after framing.
  nominalBps: 240,
  halfDuplex: true,
};

export function createAudioTransport(options: AudioTransportOptions): AudioMeshTransport {
  const { audioContext } = options;
  let mode: ModeParams = options.mode ?? DEFAULT_MODE;

  let mediaStream: MediaStream | null = null;
  let micSource: MediaStreamAudioSourceNode | null = null;
  let processor: ScriptProcessorNodeLike | null = null;
  let analyser: AnalyserNode | null = null;
  let decoder: BfskDecoder | null = null;
  let transmitting = false;

  const frameHandlers = new Set<(frame: Uint8Array, meta?: Record<string, unknown>) => void>();

  const emitFrame = (frame: DecodedFrame) => {
    options.onFrameDecoded?.(frame);
    // The router speaks raw bytes, not DecodedFrame — re-emit the raw form
    // (includes preamble, sync, …) so the router can decode it itself and
    // also so the bridge property works (this is the same shape the WS
    // transport hands the router).
    for (const h of frameHandlers) {
      try {
        h(frame.raw, { transport: 'audio' });
      } catch (err) {
        console.error('[audio transport] frame handler threw:', err);
      }
    }
  };

  const buildDecoder = () => {
    decoder = new BfskDecoder({
      mode,
      sampleRate: audioContext.sampleRate,
      onFrame: emitFrame,
      onError: () => {
        // CRC misses on false syncs are *expected* while hunting; swallow.
      },
    });
  };

  const teardownRx = () => {
    if (processor) {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
      } catch {
        // ignore — disconnecting a node already torn down throws on some browsers
      }
      processor = null;
    }
    if (micSource) {
      try {
        micSource.disconnect();
      } catch {
        // ignore
      }
      micSource = null;
    }
    if (analyser) {
      try {
        analyser.disconnect();
      } catch {
        // ignore
      }
      analyser = null;
    }
    if (mediaStream) {
      for (const track of mediaStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      mediaStream = null;
    }
    decoder = null;
    options.onRxStateChange?.('closed');
  };

  const open = async (): Promise<void> => {
    if (mediaStream) return; // already open

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        // ignore — resume only works after a user gesture; the caller is
        // responsible for triggering this transport from a click handler.
      }
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      options.onRxStateChange?.('error');
      throw new Error('getUserMedia is not available in this environment');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(
        options.micConstraints ?? DEFAULT_MIC_CONSTRAINTS,
      );
    } catch (err) {
      options.onRxStateChange?.('error');
      throw err;
    }

    mediaStream = stream;
    micSource = audioContext.createMediaStreamSource(stream);

    // Analyser for the waterfall / level meter UIs.
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    micSource.connect(analyser);

    // ScriptProcessorNode (deprecated, but ubiquitous). 4096-sample mono blocks.
    // TODO(R-3+): migrate to AudioWorkletNode once iOS Safari coverage is sufficient.
    const ctxWithSP = audioContext as AudioContextWithScriptProcessor;
    processor = ctxWithSP.createScriptProcessor(SCRIPT_BUFFER_SIZE, 1, 1);
    buildDecoder();

    processor.onaudioprocess = (ev: AudioProcessingEvent) => {
      if (!decoder) return;
      const ch = ev.inputBuffer.getChannelData(0);
      // Defensive copy because the underlying buffer can be reused.
      decoder.pushSamples(new Float32Array(ch));
    };
    micSource.connect(processor);
    // ScriptProcessor only ticks while connected to an output sink — but we
    // don't want to monitor the mic out loud. Route through a muted gain.
    const sink = audioContext.createGain();
    sink.gain.value = 0;
    processor.connect(sink);
    sink.connect(audioContext.destination);

    options.onRxStateChange?.('listening');
  };

  const close = (): void => {
    teardownRx();
  };

  const send = async (frame: Uint8Array): Promise<void> => {
    if (frame.length === 0) return;
    if (frame.length > DEFAULT_CAPABILITIES.maxFrameBytes + 50) {
      // 50 B header padding tolerance.
      throw new Error(
        `Audio transport frame too big: ${frame.length} B > ${DEFAULT_CAPABILITIES.maxFrameBytes}`,
      );
    }

    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch {
        // ignore — caller must invoke from a user gesture
      }
    }

    const pcm = encodeFrameToPcm(frame, mode, audioContext.sampleRate);
    const buf = audioContext.createBuffer(1, pcm.length, audioContext.sampleRate);
    // `copyToChannel` is strictly typed against `Float32Array<ArrayBuffer>`
    // in the TS DOM lib — but the channel data writer accepts any Float32
    // view. Use the per-sample API on browsers that ship a stricter type.
    buf.getChannelData(0).set(pcm);

    const src = audioContext.createBufferSource();
    src.buffer = buf;
    src.connect(audioContext.destination);

    transmitting = true;
    options.onTxStateChange?.('transmitting');

    // Drive the optional progress callback. We approximate it from wall-clock
    // because `AudioBufferSourceNode` doesn't surface playback position.
    const durMs = estimateDurationMs(frame, mode);
    const startedAt = performance.now();
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    if (options.onTxProgress) {
      options.onTxProgress(0);
      progressTimer = setInterval(() => {
        const p = Math.min(1, (performance.now() - startedAt) / Math.max(1, durMs));
        options.onTxProgress?.(p);
      }, 50);
    }

    await new Promise<void>((resolve) => {
      src.onended = () => {
        if (progressTimer) clearInterval(progressTimer);
        options.onTxProgress?.(1);
        transmitting = false;
        options.onTxStateChange?.('idle');
        try {
          src.disconnect();
        } catch {
          // ignore — already disconnected
        }
        resolve();
      };
      try {
        src.start();
      } catch (err) {
        if (progressTimer) clearInterval(progressTimer);
        transmitting = false;
        options.onTxStateChange?.('idle');
        resolve();
        console.error('[audio transport] source start failed:', err);
      }
    });
  };

  const setMode = (nextMode: ModeParams): void => {
    mode = nextMode;
    // If we're listening, restart the decoder with the new mode.
    if (decoder && mediaStream) {
      buildDecoder();
    }
  };

  return {
    id: 'audio',
    capabilities: DEFAULT_CAPABILITIES,
    async isAvailable() {
      return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
    },
    send,
    onFrame(handler) {
      frameHandlers.add(handler);
      return () => frameHandlers.delete(handler);
    },
    dispose() {
      teardownRx();
      frameHandlers.clear();
    },

    open,
    close,
    isOpen: () => !!mediaStream,
    setMode,
    getMode: () => mode,
    getRxAnalyser: () => analyser,
    isTransmitting: () => transmitting,
  };
}
