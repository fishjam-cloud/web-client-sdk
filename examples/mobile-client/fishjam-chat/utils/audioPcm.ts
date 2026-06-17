import type { AudioTrackData } from '@fishjam-cloud/react-native-webrtc';

/**
 * Converts a raw PCM batch from a WebRTC audio track into the format
 * react-native-executorch's useSpeechToText expects: 16 kHz, mono, Float32.
 *
 * Input is base64 little-endian int16, interleaved at `channels`, at `sampleRate`
 * (observed: 48000 Hz mono). Output is normalized mono Float32 at 16 kHz.
 */
export const TARGET_SAMPLE_RATE = 16000;

const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP = (() => {
  const lookup = new Uint8Array(256);
  for (let i = 0; i < B64_CHARS.length; i++) {
    lookup[B64_CHARS.charCodeAt(i)] = i;
  }
  return lookup;
})();

/** Decode a base64 string to bytes without relying on atob/Buffer (Hermes-safe). */
function base64ToBytes(base64: string): Uint8Array {
  let len = base64.length;
  if (len === 0) return new Uint8Array(0);

  let padding = 0;
  if (base64[len - 1] === '=') padding++;
  if (base64[len - 2] === '=') padding++;

  const byteLength = (len * 3) / 4 - padding;
  const bytes = new Uint8Array(byteLength);

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = B64_LOOKUP[base64.charCodeAt(i)];
    const e1 = B64_LOOKUP[base64.charCodeAt(i + 1)];
    const e2 = B64_LOOKUP[base64.charCodeAt(i + 2)];
    const e3 = B64_LOOKUP[base64.charCodeAt(i + 3)];

    if (p < byteLength) bytes[p++] = (e0 << 2) | (e1 >> 4);
    if (p < byteLength) bytes[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (p < byteLength) bytes[p++] = ((e2 & 3) << 6) | e3;
  }
  return bytes;
}

/** Interpret bytes as little-endian int16 and downmix to a mono Float32 in [-1, 1]. */
function int16BytesToMonoFloat32(
  bytes: Uint8Array,
  channels: number,
): Float32Array {
  const totalSamples = Math.floor(bytes.length / 2);
  const frames = Math.floor(totalSamples / channels);
  const out = new Float32Array(frames);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let ch = 0; ch < channels; ch++) {
      const sample = view.getInt16((frame * channels + ch) * 2, true);
      sum += sample / 32768;
    }
    out[frame] = sum / channels;
  }
  return out;
}

/** Linear-interpolation resampler. */
function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;

  const ratio = fromRate / toRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = input[idx];
    const b = idx + 1 < input.length ? input[idx + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * Full pipeline: a single {@link AudioTrackData} batch → 16 kHz mono Float32.
 */
export function audioTrackDataToFloat32(data: AudioTrackData): Float32Array {
  const bytes = base64ToBytes(data.data);
  const mono = int16BytesToMonoFloat32(bytes, Math.max(1, data.channels));
  return resampleLinear(mono, data.sampleRate, TARGET_SAMPLE_RATE);
}
