/**
 * Stateful streaming BFSK / AFSK decoder.
 *
 *   raw PCM samples (Float32Array, mono)
 *     ─► ring buffer of the last `spS` samples
 *     ─► block Goertzel @ mark + space tones (every `step` samples)
 *     ─► soft bit decision (mark-power vs space-power)
 *     ─► simple bit-clock recovery (transition-tracking nudge)
 *     ─► UART de-framing (start bit / 8 data LSB-first / stop bit)
 *     ─► sync-word scan over the byte stream
 *     ─► `decodeFrame` from `../frame.ts`
 *
 * Notes / trade-offs:
 *
 *  - We run a fresh *block* Goertzel of length `spS` (samples-per-symbol)
 *    on the most recent samples every `step = spS/8` input samples. That's
 *    8× over-sampled relative to the symbol clock, which gives the phase
 *    nudge enough granularity to lock in within one or two symbols.
 *  - Bit-clock recovery is a *transition-tracking* heuristic: when the soft
 *    decision crosses zero, we move the next centre-sample to fall half a
 *    symbol after the transition. This is good enough for BFSK 300 at the
 *    loopback SNRs we ship with; Mueller–Müller can be slotted in later.
 *  - We keep a small ring buffer (~2 KB) of recently demodulated bytes and
 *    re-scan for the sync word on every byte. Lost framing recovers within
 *    a byte or two without reset.
 *  - Reed–Solomon FEC is intentionally not wired up in v1; see encoder.ts.
 */

import { decodeFrame, FrameDecodeError, PREAMBLE, SYNC, type DecodedFrame } from '../frame';
import { samplesPerSymbol, type ModeParams } from './bfsk';

/** Largest mesh frame we expect to see on-air (matches `MAX_PAYLOAD_BYTES`). */
const MAX_FRAME_BYTES = 1100;
/** Ring buffer of recently demodulated bytes used for sync hunting. */
const BYTE_RING_SIZE = 2048;
/** How many over-samples per symbol we evaluate (8× → 8 phase candidates). */
const OVERSAMPLE = 8;

interface ToneCoeff {
  freq: number;
  coeff: number;
}

function toneCoeff(freq: number, sampleRate: number, winSize: number): ToneCoeff {
  const k = Math.round((winSize * freq) / sampleRate);
  const omega = (2 * Math.PI * k) / winSize;
  return { freq, coeff: 2 * Math.cos(omega) };
}

/** Block Goertzel over the last `winSize` samples of `ring`, starting from `ringIdx`. */
function blockGoertzel(
  ring: Float32Array,
  ringIdx: number,
  winSize: number,
  coeff: number,
): number {
  let s1 = 0;
  let s2 = 0;
  const n = ring.length;
  // Walk forward in time: oldest sample first, newest last.
  let idx = ringIdx; // ringIdx points to the oldest (next-to-overwrite) sample.
  for (let i = 0; i < winSize; i++) {
    const s0 = ring[idx] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
    idx += 1;
    if (idx >= n) idx = 0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

export interface BfskDecoderOptions {
  mode: ModeParams;
  sampleRate: number;
  /**
   * Optional minimum *combined* tone power below which we treat the line as
   * silent and skip the bit decision. Defaults to a small constant relative
   * to the unit-amplitude expected from the encoder.
   */
  silenceThreshold?: number;
  /** Called whenever a complete, CRC-passing frame is decoded. */
  onFrame: (frame: DecodedFrame) => void;
  /** Optional hook for decode errors. */
  onError?: (err: Error) => void;
}

interface UartState {
  /** Bits collected after the start bit. */
  data: number[];
  /** True while we're inside a byte (between start bit and stop bit). */
  inByte: boolean;
}

/**
 * Streaming BFSK/AFSK decoder. Feed PCM samples in with `pushSamples`; the
 * `onFrame` callback fires once per decoded mesh frame.
 */
export class BfskDecoder {
  private readonly silenceThreshold: number;
  private readonly onFrame: (frame: DecodedFrame) => void;
  private readonly onError?: (err: Error) => void;

  private readonly spS: number;
  /** Step between Goertzel evaluations, in samples (= spS/OVERSAMPLE). */
  private readonly step: number;
  private readonly markCoeff: number;
  private readonly spaceCoeff: number;

  /** Circular buffer of the last `spS` samples. */
  private readonly ring: Float32Array;
  /** Oldest-sample index in the ring (where the next write goes). */
  private ringIdx = 0;
  /** Total samples written into the ring so far (saturates at `spS`). */
  private ringFill = 0;

  /** Samples until the next bit decision should fire (counts down from `spS`). */
  private samplesUntilNext = 0;
  /** Samples until the next Goertzel evaluation (counts down from `step`). */
  private samplesUntilEval = 0;

  private prevSoft = 0;

  private readonly uart: UartState = { data: [], inByte: false };

  /** Ring of recently demodulated bytes used for sync-word hunting. */
  private readonly byteRing = new Uint8Array(BYTE_RING_SIZE);
  private byteRingWrite = 0;
  private byteRingFill = 0;

  constructor(opts: BfskDecoderOptions) {
    this.silenceThreshold = opts.silenceThreshold ?? 1e-4;
    this.onFrame = opts.onFrame;
    this.onError = opts.onError;
    this.spS = samplesPerSymbol(opts.mode, opts.sampleRate);
    this.step = Math.max(1, Math.floor(this.spS / OVERSAMPLE));
    this.markCoeff = toneCoeff(opts.mode.markHz, opts.sampleRate, this.spS).coeff;
    this.spaceCoeff = toneCoeff(opts.mode.spaceHz, opts.sampleRate, this.spS).coeff;
    this.ring = new Float32Array(this.spS);
    this.samplesUntilNext = this.spS; // first decision after we've filled the window once
    this.samplesUntilEval = this.spS;
  }

  reset(): void {
    this.ring.fill(0);
    this.ringIdx = 0;
    this.ringFill = 0;
    this.samplesUntilNext = this.spS;
    this.samplesUntilEval = this.spS;
    this.prevSoft = 0;
    this.uart.data.length = 0;
    this.uart.inByte = false;
    this.byteRingWrite = 0;
    this.byteRingFill = 0;
  }

  pushSamples(samples: Float32Array): void {
    const spS = this.spS;
    const step = this.step;

    for (let n = 0; n < samples.length; n++) {
      // 1. Write the sample into the ring (oldest is overwritten).
      this.ring[this.ringIdx] = samples[n];
      this.ringIdx = (this.ringIdx + 1) % spS;
      if (this.ringFill < spS) this.ringFill += 1;

      // We can't evaluate until the ring has spS samples in it.
      if (this.ringFill < spS) {
        this.samplesUntilEval = Math.max(0, this.samplesUntilEval - 1);
        this.samplesUntilNext = Math.max(0, this.samplesUntilNext - 1);
        continue;
      }

      // 2. Every `step` samples, run a block Goertzel for both tones and
      //    refresh the soft decision. The ring's `ringIdx` already points
      //    at the *next* slot to write — which equals the *oldest* sample,
      //    so `blockGoertzel` walks oldest → newest correctly.
      this.samplesUntilEval -= 1;
      let soft = this.prevSoft;
      if (this.samplesUntilEval <= 0) {
        this.samplesUntilEval = step;
        const m = blockGoertzel(this.ring, this.ringIdx, spS, this.markCoeff);
        const s = blockGoertzel(this.ring, this.ringIdx, spS, this.spaceCoeff);
        const total = m + s;
        soft = total < this.silenceThreshold ? 0 : (m - s) / total;

        // Phase nudge: on a zero-crossing of the soft decision, slide the
        // next bit centre to half a symbol later — i.e. lock to the new edge.
        if (
          this.prevSoft !== 0 &&
          soft !== 0 &&
          Math.sign(this.prevSoft) !== Math.sign(soft)
        ) {
          // Move `samplesUntilNext` so that the next centre lands ~spS/2 from now.
          const target = Math.floor(spS / 2);
          // Only pull forward; never push the next sample backwards.
          if (target > 0 && target < this.samplesUntilNext) {
            this.samplesUntilNext = target;
          }
        }
        this.prevSoft = soft;
      }

      // 3. When the symbol-clock countdown hits zero, emit a bit decision.
      this.samplesUntilNext -= 1;
      if (this.samplesUntilNext <= 0) {
        this.samplesUntilNext = spS;
        const bit = soft >= 0 ? 1 : 0;
        this.feedBit(bit);
      }
    }
  }

  // ── UART de-framing ────────────────────────────────────────────────────

  private feedBit(bit: number): void {
    if (!this.uart.inByte) {
      // Look for a start bit (0). Anything else is idle/preamble noise.
      if (bit === 0) {
        this.uart.inByte = true;
        this.uart.data.length = 0;
      }
      return;
    }

    this.uart.data.push(bit);
    if (this.uart.data.length === 9) {
      const stop = this.uart.data[8];
      if (stop === 1) {
        let byte = 0;
        for (let k = 0; k < 8; k++) {
          if (this.uart.data[k]) byte |= 1 << k;
        }
        this.pushByte(byte);
      }
      // Whether or not the stop bit was valid, we're done with this byte;
      // the next iteration hunts for a fresh start bit.
      this.uart.inByte = false;
      this.uart.data.length = 0;
    }
  }

  // ── Byte ring + sync hunting ───────────────────────────────────────────

  private pushByte(byte: number): void {
    this.byteRing[this.byteRingWrite] = byte;
    this.byteRingWrite = (this.byteRingWrite + 1) % this.byteRing.length;
    if (this.byteRingFill < this.byteRing.length) this.byteRingFill += 1;

    this.scanForFrames();
  }

  /**
   * Look for `SYNC` anywhere in the ring buffer and try to decode a complete
   * frame starting from each candidate.
   *
   * We deliberately *don't* memoise a "last scan position" cursor: a sync
   * candidate that failed earlier with `Truncated …` should be re-attempted
   * the moment more bytes arrive. With `MAX_FRAME_BYTES ≈ 1100` the loop is
   * a few thousand byte comparisons per inbound byte — negligible.
   */
  private scanForFrames(): void {
    if (this.byteRingFill < SYNC.length + 8) return;

    const linear = this.linearise();

    for (let from = 0; from <= linear.length - (SYNC.length + 8); from += 1) {
      if (linear[from] !== SYNC[0] || linear[from + 1] !== SYNC[1]) continue;

      const startWithPreamble = Math.max(0, from - PREAMBLE.length);
      const slice = linear.subarray(startWithPreamble);
      try {
        const { frame, nextOffset } = decodeFrame(slice, from - startWithPreamble);
        this.onFrame(frame);
        const consumedEnd = startWithPreamble + nextOffset;
        this.discardBefore(consumedEnd);
        return;
      } catch (err) {
        if (err instanceof FrameDecodeError) {
          if (err.message.startsWith('Truncated')) {
            // Not enough bytes yet — abandon the scan and wait for the next
            // byte to arrive (which will retry this exact candidate).
            return;
          }
          this.onError?.(err);
          continue;
        }
        throw err;
      }
    }

    // Bound memory: drop the oldest half if we've stashed too much without
    // finding a frame.
    if (linear.length > MAX_FRAME_BYTES * 2) {
      this.discardBefore(linear.length - MAX_FRAME_BYTES);
    }
  }

  /** Returns the ring as a single contiguous Uint8Array (oldest → newest). */
  private linearise(): Uint8Array {
    const out = new Uint8Array(this.byteRingFill);
    if (this.byteRingFill === 0) return out;
    const start =
      (this.byteRingWrite - this.byteRingFill + this.byteRing.length) %
      this.byteRing.length;
    if (start + this.byteRingFill <= this.byteRing.length) {
      out.set(this.byteRing.subarray(start, start + this.byteRingFill), 0);
    } else {
      const firstChunk = this.byteRing.length - start;
      out.set(this.byteRing.subarray(start, this.byteRing.length), 0);
      out.set(this.byteRing.subarray(0, this.byteRingFill - firstChunk), firstChunk);
    }
    return out;
  }

  /** Drop bytes older than `n` (relative to the linearised ring). */
  private discardBefore(n: number): void {
    if (n <= 0) return;
    if (n >= this.byteRingFill) {
      this.byteRingFill = 0;
      this.byteRingWrite = 0;
      return;
    }
    const keep = this.linearise().subarray(n);
    this.byteRing.fill(0);
    this.byteRing.set(keep, 0);
    this.byteRingFill = keep.length;
    this.byteRingWrite = keep.length % this.byteRing.length;
  }
}
