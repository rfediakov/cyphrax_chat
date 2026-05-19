/**
 * Audio modem submodule — BFSK 300 (and the AFSK 1200 stub).
 *
 * Public re-exports for the rest of the app. Consumers should import from
 * here rather than reaching into individual files.
 */
export {
  BFSK_300,
  AFSK_1200,
  DEFAULT_MODE,
  AVAILABLE_MODES,
  getMode,
  bitsToSymbols,
  byteArrayToBits,
  bitsToByteArray,
  samplesPerSymbol,
  type ModeParams,
} from './bfsk';

export { goertzelPower, goertzelPowerSlice } from './goertzel';

export { encodeFrameToPcm, estimateDurationMs, type EncodeOpts } from './encoder';

export { BfskDecoder, type BfskDecoderOptions } from './decoder';

export {
  createAudioTransport,
  type AudioMeshTransport,
  type AudioTransportOptions,
} from './audioTransport';
