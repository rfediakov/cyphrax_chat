/**
 * CRC-32 (IEEE 802.3 polynomial, reflected) — the same variant used by
 * Ethernet, gzip, PNG, ZIP. We pre-compute the 256-entry table once so the
 * inner loop is one XOR + one shift per byte (≈ 5 ns / byte on a modern CPU).
 *
 * This is *integrity*, not security. Encryption is handled (optionally) at a
 * higher layer.
 */

const POLY = 0xedb88320;

const TABLE: number[] = (() => {
  const t = new Array<number>(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? POLY ^ (c >>> 1) : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
})();

/** Compute CRC32 of the entire buffer. */
export function crc32(bytes: Uint8Array, offset = 0, length = bytes.length - offset): number {
  let c = 0xffffffff;
  const end = offset + length;
  for (let i = offset; i < end; i++) {
    c = (TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}
