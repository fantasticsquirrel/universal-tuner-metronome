import { calculateRms, detectPitchYin, generateSine } from '../yin';
import { effectiveNoiseGate, yinThreshold } from '../pitch';

describe('YIN detector', () => {
  it.each([55, 110, 220, 440, 880])('detects a clean %i Hz sine', (frequency) => {
    const sampleRate = 48_000;
    const samples = generateSine(frequency, sampleRate, 8192);
    const detected = detectPitchYin(samples, { sampleRate, profile: frequency < 100 ? 'low' : 'general' });
    expect(detected).not.toBeNull();
    expect(Math.abs(detected!.frequency - frequency)).toBeLessThan(frequency < 100 ? 0.6 : 0.1);
    expect(detected!.confidence).toBeGreaterThan(0.85);
  });

  it('gates silence and exposes signal level', () => {
    expect(detectPitchYin(new Float32Array(4096), { sampleRate: 48_000 })).toBeNull();
    expect(calculateRms(generateSine(440, 48_000, 4096, 0.5))).toBeCloseTo(0.354, 2);
  });

  it('accepts a clear low-gain tablet microphone signal at the default sensitivity', () => {
    const samples = generateSine(440, 48_000, 4096, 0.004);
    expect(detectPitchYin(samples, {
      sampleRate: 48_000,
      threshold: yinThreshold(65),
      minimumRms: 0.008,
    })).toBeNull();

    const detected = detectPitchYin(samples, {
      sampleRate: 48_000,
      threshold: yinThreshold(65),
      minimumRms: effectiveNoiseGate(0.008, 65),
    });
    expect(detected?.frequency).toBeCloseTo(440, 0);
    expect(detected?.confidence).toBeGreaterThan(0.9);
  });
});
