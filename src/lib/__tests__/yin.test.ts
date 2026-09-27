import {
  calculateRms,
  detectPitchYin,
  generateSine,
  pitchFrameSize,
  preparePitchAnalysis,
} from '../yin';
import { effectiveNoiseGate, yinThreshold } from '../pitch';

describe('YIN detector', () => {
  it.each([55, 110, 220, 440, 880])('detects a clean %i Hz sine', (frequency) => {
    const sampleRate = 48_000;
    const profile = frequency < 100 ? 'low' : 'general';
    const samples = generateSine(frequency, sampleRate, pitchFrameSize(profile));
    const detected = detectPitchYin(samples, { sampleRate, profile });
    expect(detected).not.toBeNull();
    expect(Math.abs(detected!.frequency - frequency)).toBeLessThan(frequency < 100 ? 0.6 : 0.1);
    expect(detected!.confidence).toBeGreaterThan(0.85);
  });

  it.each([1760, 3520, 4400])('detects a high-profile %i Hz sine with its short frame', (frequency) => {
    const sampleRate = 48_000;
    const samples = generateSine(frequency, sampleRate, pitchFrameSize('high'));
    const detected = detectPitchYin(samples, { sampleRate, profile: 'high' });
    expect(detected).not.toBeNull();
    expect(Math.abs(1200 * Math.log2(detected!.frequency / frequency))).toBeLessThan(0.5);
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

  it.each([25, 27.5, 30.87, 36.71, 41.2, 55])('preserves low-note accuracy after decimation at %f Hz', (frequency) => {
    const sampleRate = 48_000;
    const samples = new Float32Array(pitchFrameSize('low'));
    for (let index = 0; index < samples.length; index += 1) {
      const phase = 2 * Math.PI * frequency * index / sampleRate;
      samples[index] = 0.004 * (
        Math.sin(phase)
        + 0.45 * Math.sin(phase * 2)
        + 0.2 * Math.sin(phase * 3)
      );
    }
    const detected = detectPitchYin(samples, {
      sampleRate,
      profile: 'low',
      threshold: yinThreshold(65),
      minimumRms: effectiveNoiseGate(0.008, 65),
    });
    expect(detected).not.toBeNull();
    expect(Math.abs(detected!.frequency - frequency)).toBeLessThan(0.15);
  });

  it('bounds low-profile YIN work while retaining the full observation window', () => {
    const frameSize = pitchFrameSize('low');
    const prepared = preparePitchAnalysis(new Float32Array(frameSize), 48_000, 'low');
    const approximateComparisons = prepared.samples.length
      * Math.ceil(prepared.sampleRate / 25);

    expect(frameSize).toBe(8192);
    expect(prepared.downsampleFactor).toBe(4);
    expect(prepared.sampleRate).toBe(12_000);
    expect(prepared.samples).toHaveLength(2048);
    expect(approximateComparisons).toBeLessThan(1_000_000);
  });
});
