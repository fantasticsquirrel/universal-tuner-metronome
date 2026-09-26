import {
  getMetronomeFrameLayout,
  metronomeLoopCacheKey,
  renderMetronomeWav,
  type MetronomeLoopSettings,
} from '../metronomeWav';

const SETTINGS: MetronomeLoopSettings = {
  bpm: 120,
  beats: 4,
  denominator: 4 as const,
  subdivision: 2 as const,
  accents: ['accent', 'normal', 'mute', 'normal'],
};

describe('metronome WAV rendering', () => {
  it('places pulses deterministically at the nearest sample frame', () => {
    const layout = getMetronomeFrameLayout(SETTINGS, 8_000);

    expect(layout.frameCount).toBe(16_000);
    expect(layout.framesPerPulse).toBe(2_000);
    expect(layout.events.map(({ pulse, frame, kind, volume }) => ({ pulse, frame, kind, volume })))
      .toEqual([
        { pulse: 0, frame: 0, kind: 'accent', volume: 1 },
        { pulse: 1, frame: 2_000, kind: 'subdivision', volume: 0.28 },
        { pulse: 2, frame: 4_000, kind: 'normal', volume: 0.72 },
        { pulse: 3, frame: 6_000, kind: 'subdivision', volume: 0.28 },
        { pulse: 5, frame: 10_000, kind: 'subdivision', volume: 0.28 },
        { pulse: 6, frame: 12_000, kind: 'normal', volume: 0.72 },
        { pulse: 7, frame: 14_000, kind: 'subdivision', volume: 0.28 },
      ]);
  });

  it('accounts for the denominator and rounds fractional frame positions without drift', () => {
    const layout = getMetronomeFrameLayout({
      bpm: 137,
      beats: 3,
      denominator: 8,
      subdivision: 3,
      accents: ['accent', 'normal', 'normal'],
    }, 44_100);

    const exactFramesPerPulse = 44_100 * (60 / 137) * (4 / 8) / 3;
    expect(layout.frameCount).toBe(Math.round(exactFramesPerPulse * 9));
    expect(layout.events.map((event) => event.frame)).toEqual(
      Array.from({ length: 9 }, (_, pulse) => Math.round(exactFramesPerPulse * pulse)),
    );
  });

  it('writes a valid mono 16-bit PCM WAV header and the exact data length', () => {
    const rendered = renderMetronomeWav(SETTINGS, 8_000);
    const view = new DataView(rendered.bytes.buffer);
    const ascii = (offset: number, length: number) => String.fromCharCode(
      ...rendered.bytes.slice(offset, offset + length),
    );

    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(rendered.frameCount * 2);
    expect(rendered.bytes.byteLength).toBe(44 + rendered.frameCount * 2);
    expect(view.getUint32(4, true)).toBe(rendered.bytes.byteLength - 8);
  });

  it('produces stable audio bytes and cache keys, while audio changes alter the key', () => {
    const first = renderMetronomeWav(SETTINGS, 8_000).bytes;
    const second = renderMetronomeWav(SETTINGS, 8_000).bytes;

    expect(second).toEqual(first);
    expect(metronomeLoopCacheKey(SETTINGS, 8_000)).toBe(
      metronomeLoopCacheKey({ ...SETTINGS }, 8_000),
    );
    expect(metronomeLoopCacheKey(SETTINGS, 8_000)).not.toBe(
      metronomeLoopCacheKey({ ...SETTINGS, bpm: 121 }, 8_000),
    );
    expect(metronomeLoopCacheKey(SETTINGS, 8_000)).not.toBe(
      metronomeLoopCacheKey({ ...SETTINGS, accents: ['mute', 'normal', 'mute', 'normal'] }, 8_000),
    );
  });
});
