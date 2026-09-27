import type { AudioDataEvent } from '@siteed/audio-studio';

function pcm16ToFloat32(samples: Int16Array): Float32Array {
  const output = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = samples[index]! / 32768;
  }
  return output;
}

function wavDataOffset(bytes: Uint8Array): number {
  if (
    bytes.length < 12
    || bytes[0] !== 0x52
    || bytes[1] !== 0x49
    || bytes[2] !== 0x46
    || bytes[3] !== 0x46
    || bytes[8] !== 0x57
    || bytes[9] !== 0x41
    || bytes[10] !== 0x56
    || bytes[11] !== 0x45
  ) return 0;

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkSize = (
      bytes[offset + 4]!
      | (bytes[offset + 5]! << 8)
      | (bytes[offset + 6]! << 16)
      | (bytes[offset + 7]! << 24)
    ) >>> 0;
    if (
      bytes[offset] === 0x64
      && bytes[offset + 1] === 0x61
      && bytes[offset + 2] === 0x74
      && bytes[offset + 3] === 0x61
    ) return offset + 8;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  return 0;
}

function base64Value(code: number): number {
  if (code >= 0x41 && code <= 0x5a) return code - 0x41;
  if (code >= 0x61 && code <= 0x7a) return code - 0x61 + 26;
  if (code >= 0x30 && code <= 0x39) return code - 0x30 + 52;
  if (code === 0x2b) return 62;
  if (code === 0x2f) return 63;
  return 0;
}

function decodeBase64(encoded: string): Uint8Array {
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const output = new Uint8Array(Math.floor(encoded.length * 3 / 4) - padding);
  let outputIndex = 0;
  for (let index = 0; index < encoded.length; index += 4) {
    const bits = (
      (base64Value(encoded.charCodeAt(index)) << 18)
      | (base64Value(encoded.charCodeAt(index + 1)) << 12)
      | (base64Value(encoded.charCodeAt(index + 2)) << 6)
      | base64Value(encoded.charCodeAt(index + 3))
    );
    if (outputIndex < output.length) output[outputIndex++] = bits >> 16;
    if (outputIndex < output.length) output[outputIndex++] = bits >> 8;
    if (outputIndex < output.length) output[outputIndex++] = bits;
  }
  return output;
}

function decodeBase64Pcm16(encoded: string): Float32Array {
  const bytes = decodeBase64(encoded);
  const offset = wavDataOffset(bytes);
  const sampleCount = Math.floor((bytes.length - offset) / 2);
  const output = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    const byteOffset = offset + index * 2;
    const value = ((bytes[byteOffset + 1]! << 8) | bytes[byteOffset]!) << 16 >> 16;
    output[index] = value / 32768;
  }
  return output;
}

/**
 * Normalize audio-studio's documented stream payloads to mono Float32 PCM.
 * Native raw streams are base64 PCM16; web raw streams can be Int16/Float32.
 */
export function audioStreamSamples(event: AudioDataEvent): Float32Array {
  if (event.data instanceof Float32Array) return event.data;
  if (event.data instanceof Int16Array) return pcm16ToFloat32(event.data);
  if (typeof event.data === 'string') return decodeBase64Pcm16(event.data);
  return new Float32Array(event.data as ArrayLike<number>);
}
