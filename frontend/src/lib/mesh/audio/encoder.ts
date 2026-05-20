/**
 * PCM encoder for the BFSK / AFSK family.
 *
 * Pipeline (see `docs/ROOMS_AND_MESH_PLAN.md` §4.3):
 *
 *   frame bytes ─► UART bits (start/8 data LSB-first/stop)
 *               ─► symbol stream (mark = 1, space = 0)
 *               ─► continuous-phase tone generator
 *               ─► raw Float32 PCM (mono, scaled to ~0.6 to leave headroom)
 *
 * Forward error correction (Reed–Solomon 255/223) is *optional* in v1 and is
 * deliberately omitted here — the BFSK 300 air rate is so low that adding 32
 * parity bytes costs another ~1 s per text frame and pushes the demo over
 * the patience budget. The hook is documented in `audioTransport.ts`.
 */

import {
  bitsToSymbols,
  byteArrayToBits,
  samplesPerSymbol,
  type ModeParams,
} from './bfsk';

export interface EncodeOpts {
  /** Output peak amplitude in [0..1]. Defaults to 0.6 to leave headroom. */
  amplitude?: number;
  /** Extra dead-carrier preamble length override (ms). */
  preambleMs?: number;
  /** Extra dead-carrier tail length override (ms). */
  tailMs?: number;
}

/**
 * Encode a fully-formed mesh frame (preamble + sync + header + payload + CRC)
 * into a PCM waveform. Returns a Float32Array of `mono` samples scaled to
 * `[-amp, +amp]` ready to be wrapped in an `AudioBuffer`.
 */
export function encodeFrameToPcm(
  frameBytes: Uint8Array,
  mode: ModeParams,
  sampleRate: number,
  opts: EncodeOpts = {},
): Float32Array {
  const amp = opts.amplitude ?? 0.6;
  const preambleMs = opts.preambleMs ?? mode.preambleMs;
  const tailMs = opts.tailMs ?? mode.tailMs;
  const spS = samplesPerSymbol(mode, sampleRate);

  const bits = byteArrayToBits(frameBytes);
  const symbols = bitsToSymbols(bits);

  const preambleSamples = Math.floor((preambleMs / 1000) * sampleRate);
  const tailSamples = Math.floor((tailMs / 1000) * sampleRate);
  const dataSamples = symbols.length * spS;
  const total = preambleSamples + dataSamples + tailSamples;

  const out = new Float32Array(total);

  // Continuous-phase tone generator: track phase across symbol boundaries so
  // there are no audible clicks (and the receiver doesn't lose timing on a
  // sudden discontinuity in the analytic signal).
  let phase = 0;
  let o = 0;

  const writeTone = (freq: number, sampleCount: number) => {
    const phaseInc = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < sampleCount; i++) {
      out[o++] = Math.sin(phase) * amp;
      phase += phaseInc;
      if (phase >= 2 * Math.PI) phase -= 2 * Math.PI;
    }
  };

  // Preamble: solid mark carrier — gives the receiver AGC time to settle and
  // the bit-clock recovery a known reference.
  writeTone(mode.markHz, preambleSamples);

  // Data symbols.
  for (let i = 0; i < symbols.length; i++) {
    writeTone(symbols[i] ? mode.markHz : mode.spaceHz, spS);
  }

  // Tail: mark carrier so VOX-keyed radios catch the last bit cleanly.
  writeTone(mode.markHz, tailSamples);

  return out;
}

/** Convenience: how long (in ms) `encodeFrameToPcm` will take on the wire. */
export function estimateDurationMs(
  frameBytes: Uint8Array,
  mode: ModeParams,
  opts: EncodeOpts = {},
): number {
  const preambleMs = opts.preambleMs ?? mode.preambleMs;
  const tailMs = opts.tailMs ?? mode.tailMs;
  // 10 bits per byte (start + 8 + stop).
  const dataMs = (frameBytes.length * 10 * 1000) / mode.baud;
  return preambleMs + dataMs + tailMs;
}
