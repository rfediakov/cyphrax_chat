/**
 * Goertzel tone detector — magnitude-squared at a single bin.
 *
 * Pure JS, no dependencies. The function form below is the "block" variant
 * (consume N samples, return one magnitude); the streaming demodulator
 * inlines the same 3-coefficient recurrence per sample for speed.
 *
 * Reference: G. Goertzel, "An algorithm for the evaluation of finite
 * trigonometric series" (1958). See also any DSP textbook chapter on
 * "single-bin DFT".
 */

/**
 * Compute |X(k)|² for a target frequency over a window of `N` samples.
 *
 * Equivalent to a 1-bin DFT but with O(N) work and only 2 multiplies/add
 * per sample. We return the unnormalised magnitude squared because the caller
 * always compares two bin powers against each other (mark vs space) — the
 * absolute scaling cancels out.
 */
export function goertzelPower(
  samples: Float32Array,
  sampleRate: number,
  freq: number,
  N: number,
): number {
  if (N <= 0 || samples.length < N) return 0;
  const k = Math.round((N * freq) / sampleRate);
  const omega = (2 * Math.PI * k) / N;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < N; n++) {
    s0 = samples[n] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  // |X(k)|² = s1² + s2² - coeff·s1·s2
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/**
 * Same as `goertzelPower` but accepts an offset + length window into a
 * larger buffer. Saves a copy in the streaming decoder's hot path.
 */
export function goertzelPowerSlice(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
  freq: number,
): number {
  if (length <= 0 || start < 0 || start + length > samples.length) return 0;
  const k = Math.round((length * freq) / sampleRate);
  const omega = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let n = 0; n < length; n++) {
    const s0 = samples[start + n] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}
