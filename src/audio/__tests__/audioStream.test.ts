import type { AudioDataEvent } from '@siteed/audio-studio';

import { audioStreamSamples } from '../audioStream';

function event(data: AudioDataEvent['data']): AudioDataEvent {
  return {
    data,
    position: 0,
    fileUri: '',
    eventDataSize: typeof data === 'string' ? data.length : data.byteLength,
    totalSize: 0,
  } as AudioDataEvent;
}

function base64(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

describe('audio stream sample conversion', () => {
  it('keeps documented Float32 stream samples unchanged', () => {
    const samples = new Float32Array([-1, -0.25, 0, 0.25, 1]);
    expect(audioStreamSamples(event(samples))).toBe(samples);
  });

  it('normalizes web Int16 PCM samples', () => {
    expect([...audioStreamSamples(event(new Int16Array([-32768, 0, 16384, 32767])))])
      .toEqual([-1, 0, 0.5, 32767 / 32768]);
  });

  it('decodes native raw base64 PCM16 and skips audio-studio WAV headers', () => {
    const header = [
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0,
      0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 16, 0, 0, 0,
      1, 0, 1, 0, 0x80, 0xbb, 0, 0,
      0, 0x77, 1, 0, 2, 0, 16, 0,
      0x64, 0x61, 0x74, 0x61, 0, 0, 0, 0,
    ];
    const pcm = [0, 0x80, 0, 0, 0xff, 0x7f];
    expect([...audioStreamSamples(event(base64([...header, ...pcm])))])
      .toEqual([-1, 0, 32767 / 32768]);
  });
});
