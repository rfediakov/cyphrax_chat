/**
 * BFSK 300 baud mode parameters and bit helpers.
 *
 * See `docs/ROOMS_AND_MESH_PLAN.md` §4.3 — the "default" HF mode.
 *
 *   mark  (logical 1) = 1200 Hz
 *   space (logical 0) = 2200 Hz
 *   symbol rate       = 300 baud
 *   framing           = 1 start bit (space) + 8 data bits LSB-first + 1 stop bit (mark)
 *
 * The Bell-103-style tone pair is robust against narrow-band SSB radios and
 * sample-rate independent: the encoder/decoder both derive their sample-per-
 * symbol counts from the live `AudioContext.sampleRate` rather than assuming
 * a fixed 48 kHz.
 *
 * NOTE: A future AFSK 1200 mode can re-use this file by changing the symbol
 * rate to 1200 (same tone pair). It's parameterised on purpose.
 */

export interface ModeParams {
  id: 'bfsk300' | 'afsk1200';
  /** Mark (logical 1) frequency in Hz. */
  markHz: number;
  /** Space (logical 0) frequency in Hz. */
  spaceHz: number;
  /** Baud rate (symbols per second). */
  baud: number;
  /** Bytes between dead-carrier preamble and tail. */
  preambleMs: number;
  tailMs: number;
}

export const BFSK_300: ModeParams = {
  id: 'bfsk300',
  markHz: 1200,
  spaceHz: 2200,
  baud: 300,
  preambleMs: 250,
  tailMs: 250,
};

export const AFSK_1200: ModeParams = {
  id: 'afsk1200',
  markHz: 1200,
  spaceHz: 2200,
  baud: 1200,
  preambleMs: 200,
  tailMs: 200,
};

export const DEFAULT_MODE: ModeParams = BFSK_300;

export const AVAILABLE_MODES: Record<ModeParams['id'], ModeParams> = {
  bfsk300: BFSK_300,
  afsk1200: AFSK_1200,
};

/** Look a mode up by id; falls back to BFSK 300 on unknown ids. */
export function getMode(id: string | undefined | null): ModeParams {
  if (!id) return DEFAULT_MODE;
  return AVAILABLE_MODES[id as ModeParams['id']] ?? DEFAULT_MODE;
}

// ── Bit helpers ─────────────────────────────────────────────────────────────

/**
 * Expand a byte stream into a flat array of UART-style bits, LSB-first:
 *   [ start(=0), b0, b1, b2, b3, b4, b5, b6, b7, stop(=1), … ]
 *
 * The receiver uses the same framing in the opposite direction.
 */
export function byteArrayToBits(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length * 10);
  let o = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    out[o++] = 0; // start bit (space)
    for (let k = 0; k < 8; k++) out[o++] = (b >>> k) & 1;
    out[o++] = 1; // stop bit (mark)
  }
  return out;
}

/**
 * Reassemble bytes from a UART-style bit stream. Drops any leading bits that
 * don't sit on a valid start/stop boundary. Returns the bytes in order.
 *
 * Strict mode: if a stop bit isn't `1`, the framing is considered broken and
 * we resync by advancing a single bit (the receiver's bit-clock recovery
 * already handles most jitter, so this is only used by the test path).
 */
export function bitsToByteArray(bits: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i + 10 <= bits.length) {
    if (bits[i] !== 0) {
      i += 1;
      continue;
    }
    if (bits[i + 9] !== 1) {
      i += 1;
      continue;
    }
    let b = 0;
    for (let k = 0; k < 8; k++) b |= (bits[i + 1 + k] & 1) << k;
    out.push(b);
    i += 10;
  }
  return Uint8Array.from(out);
}

/**
 * Map a flat bit stream into a per-bit symbol decision (true=mark, false=space).
 * Used by the encoder to drive the tone generator.
 */
export function bitsToSymbols(bits: Uint8Array): boolean[] {
  const out = new Array<boolean>(bits.length);
  for (let i = 0; i < bits.length; i++) out[i] = bits[i] !== 0;
  return out;
}

/** Samples per symbol for a given baud rate at a given sample rate. */
export function samplesPerSymbol(mode: ModeParams, sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / mode.baud));
}
