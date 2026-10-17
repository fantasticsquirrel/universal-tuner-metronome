import originalYin from '@audio/pitch-yin';

import type { DetectorProfile } from '@/types';

import { createYinPitchDetector, detectPitchYin, generateSine, pitchFrameSize } from '../yin';
import { incrementalYin } from '../yinKernel';
import { baselineDetectPitchYin, baselineYin } from './yinBaseline';

function noise(length: number, seed = 17): Float32Array {
  let state = seed;
  return Float32Array.from({ length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000 * 2 - 1;
  });
}

function tone(frequency: number, sampleRate: number, length: number, phase: number, kind: string): Float32Array {
  const random = noise(length);
  return Float32Array.from({ length }, (_, index) => {
    const angle = 2 * Math.PI * frequency * index / sampleRate + phase;
    if (kind === 'square') return Math.sin(angle) >= 0 ? 0.7 : -0.7;
    if (kind === 'harmonics') return 0.5 * (Math.sin(angle) + 0.45 * Math.sin(angle * 2) + 0.2 * Math.sin(angle * 3));
    if (kind === 'noisy') return 0.5 * Math.sin(angle) + 0.12 * random[index]!;
    return 0.8 * Math.sin(angle);
  });
}

// Independent full-range normalization for boundary construction, never used
// by production or by the frozen reference detector.
function fullCmndf(samples: Float32Array): number[] {
  const half = samples.length >> 1;
  const result = [1];
  let running = 0;
  for (let lag = 1; lag < half; lag += 1) {
    let differenceSum = 0;
    for (let index = 0; index < half; index += 1) {
      const delta = samples[index]! - samples[index + lag]!;
      differenceSum += delta * delta;
    }
    running += differenceSum;
    result[lag] = running > 0 ? differenceSum * lag / running : 1;
  }
  return result;
}

function adjacentPositiveDouble(value: number, direction: 1 | -1): number {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value);
  bytes.setBigUint64(0, bytes.getBigUint64(0) + BigInt(direction));
  return bytes.getFloat64(0);
}

beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(123456789));
afterEach(() => jest.restoreAllMocks());

describe('fallback YIN exact full-scan parity', () => {
  it('keeps the frozen kernel oracle equivalent to the installed 1.0.5 package', () => {
    // Fail visibly when an intentional dependency update needs a new oracle.
    const { createHash } = jest.requireActual('crypto');
    const { readFileSync } = jest.requireActual('fs');
    // Keep Node-only test bindings local; the application intentionally uses
    // React Native's ambient types rather than global Node types.
    const nodeRequire = require as typeof require & { resolve(name: string): string };
    expect(jest.requireActual('@audio/pitch-yin/package.json').version).toBe('1.0.5');
    expect(createHash('sha256').update(readFileSync(nodeRequire.resolve('@audio/pitch-yin'))).digest('hex'))
      .toBe('7b88e2cccdd4122822d328b5728b9954b9c59cf306383345bdadf400636a8753');
    // This checks the independent fixture, not just two paths into production.
    for (const samples of [noise(63), noise(2048), generateSine(440, 24000, 2048), new Float32Array(128)]) {
      for (const options of [undefined, {}, { fs: 24000, minFreq: 48, maxFreq: 2200 }, { fs: 0, threshold: 1.1 }]) {
        expect(baselineYin(samples, options)).toStrictEqual(originalYin(samples, options));
      }
    }
  });

  it.each([
    ['low', [24.9, 25, 27.5, 30.87, 41.2, 55, 110, 249, 499, 500, 501]],
    ['general', [47.9, 48, 55, 110, 220, 440, 880, 1760, 2199, 2200, 2201]],
    ['high', [149, 150, 220, 440, 880, 1760, 3520, 4400, 4499, 4500, 4501]],
  ] as const)('preserves complete %s-profile snapshots across range edges and waveforms', (profile, frequencies) => {
    const detector = createYinPitchDetector();
    for (const sampleRate of [44100, 48000]) {
      for (const frequency of frequencies) {
        for (const [phase, kind] of [[0, 'sine'], [0.7, 'harmonics'], [2.3, 'noisy'], [1.1, 'square']] as const) {
          const samples = tone(frequency, sampleRate, pitchFrameSize(profile), phase, kind);
          const options = { sampleRate, profile, threshold: 0.19, minimumRms: 0.0008 };
          expect(detector.detect(samples, options)).toStrictEqual(baselineDetectPitchYin(samples, options));
        }
      }
    }
  });

  it('preserves unusual sample rates, short/odd frame lengths and strict gate settings', () => {
    const detector = createYinPitchDetector();
    for (const sampleRate of [8000, 16000, 22050, 24000, 32000, 96000]) {
      for (const length of [0, 1, 7, 8, 9, 63, 1023, 2048]) {
        for (const threshold of [0, 0.05, 0.15, 0.3, 1, 1.0001, Number.NaN]) {
          const samples = tone(440, sampleRate, length, 0.3, 'harmonics');
          const options = { sampleRate, threshold, minimumRms: 0 };
          expect(detector.detect(samples, options)).toStrictEqual(baselineDetectPitchYin(samples, options));
        }
      }
    }
  });

  it('retains repeated-frame, changed-profile, clipping, silence, DC and noise behavior', () => {
    const detector = createYinPitchDetector();
    const profiles: DetectorProfile[] = ['low', 'general', 'high'];
    for (let frame = 0; frame < 360; frame += 1) {
      const profile = profiles[Math.floor(frame / 7) % profiles.length]!;
      const sampleRate = [48000, 44100, 24000][Math.floor(frame / 29) % 3]!;
      const length = pitchFrameSize(profile) - frame % 3;
      let samples: Float32Array;
      if (frame % 13 === 0) samples = new Float32Array(length);
      else if (frame % 17 === 0) samples = new Float32Array(length).fill(0.1);
      else if (frame % 11 === 0) samples = noise(length, frame);
      else samples = tone(profile === 'low' ? 41.2 : profile === 'high' ? 3520 : 440, sampleRate, length, frame * 0.11, 'noisy');
      if (frame % 9 === 0 && samples.length) samples[0] = 1;
      const options = { sampleRate, profile, threshold: [0.08, 0.15, 0.19, 0.3][frame % 4], minimumRms: frame % 5 === 0 ? 0.8 : 0.0008 };
      expect(detector.detect(samples, options)).toStrictEqual(baselineDetectPitchYin(samples, options));
    }
  });

  it.each(['low', 'general', 'high'] as const)(
    'retains per-frame %s decisions through plucks, decay, note changes and abrupt silence',
    (profile) => {
      const detector = createYinPitchDetector();
      const frequency = profile === 'low' ? 41.2 : profile === 'high' ? 1760 : 220;
      for (const sampleRate of [44100, 48000]) {
        let detected = 0;
        let rejected = 0;
        for (let frame = 0; frame < 45; frame += 1) {
          const length = pitchFrameSize(profile);
          const random = noise(length, frame + 1);
          const samples = Float32Array.from({ length }, (_, index) => {
            // 50 ms sliding captures preserve the original profile window.
            const time = (frame * Math.round(sampleRate * 0.05) + index) / sampleRate;
            if (frame === 24 || time < 0.12 || (time >= 1.1 && time < 1.3) || time >= 2.05) return 0;
            const onset = time < 0.65 ? 0.12 : time < 1.1 ? 0.65 : 1.3;
            const hz = time < 0.65 || time >= 1.3 ? frequency : frequency * 2;
            const age = time - onset;
            const envelope = 0.6 * Math.min(1, age / 0.008) * Math.exp(-5 * age);
            const phase = 2 * Math.PI * hz * age;
            return envelope * (Math.sin(phase) + 0.5 * Math.sin(phase * 2) + 0.25 * Math.sin(phase * 3))
              + random[index]! * 0.001;
          });
          const options = { sampleRate, profile, threshold: [0.08, 0.15, 0.25][frame % 3], minimumRms: 0.0008 };
          const expected = baselineDetectPitchYin(samples, options);
          const actual = detector.detect(samples, options);
          expect(actual).toStrictEqual(expected);
          if (expected) detected += 1;
          else rejected += 1;
          if (frame === 24) {
            expect(actual).toBeNull();
            expect(detector.stats.comparisons).toBe(0);
          }
        }
        expect(detected).toBeGreaterThan(0);
        expect(rejected).toBeGreaterThan(0);
      }
    },
  );

  it('preserves exact RMS and clipping boundary decisions and the functional API', () => {
    const samples = generateSine(440, 48000, 4096, 0.004);
    const ungated = baselineDetectPitchYin(samples, { sampleRate: 48000, minimumRms: 0 })!;
    for (const minimumRms of [0, ungated.rms, ungated.rms * (1 + Number.EPSILON), 0.008]) {
      const options = { sampleRate: 48000, minimumRms };
      expect(detectPitchYin(samples, options)).toStrictEqual(baselineDetectPitchYin(samples, options));
    }
    for (const peak of [0.989, 0.99, 1]) {
      const clipped = generateSine(440, 48000, 4096);
      clipped[17] = peak;
      const options = { sampleRate: 48000 };
      expect(detectPitchYin(clipped, options)).toStrictEqual(baselineDetectPitchYin(clipped, options));
    }
  });
});

describe('fallback YIN bounded work and instance ownership', () => {
  it.each([['low', 41.2, 0.65], ['general', 440, 0.15], ['high', 4400, 0.08]] as const)(
    'stops the %s lag search only after the first threshold trough and its right neighbor',
    (profile, frequency, budgetFraction) => {
      const detector = createYinPitchDetector();
      const samples = generateSine(frequency, 48000, pitchFrameSize(profile));
      const options = { sampleRate: 48000, profile };
      expect(detector.detect(samples, options)).toStrictEqual(baselineDetectPitchYin(samples, options));
      expect(detector.stats.comparisons).toBeGreaterThan(0);
      expect(detector.stats.comparisons).toBeLessThan(detector.stats.fullComparisons * budgetFraction);
    },
  );

  it('still scans the complete range for no-hit inputs and skips gated frames', () => {
    const detector = createYinPitchDetector();
    for (const samples of [noise(4096), new Float32Array(4096), new Float32Array(4096).fill(0.3)]) {
      expect(detector.detect(samples, { sampleRate: 48000, minimumRms: 0 })).toBeNull();
      expect(detector.stats.comparisons).toBe(detector.stats.fullComparisons);
      expect(detector.stats.comparisons).toBeGreaterThan(0);
    }
    detector.detect(new Float32Array(4096), { sampleRate: 48000 });
    expect(detector.stats.comparisons).toBe(0);
    expect(detector.stats.fullComparisons).toBe(0);
  });

  it('reuses per-profile decimation buffers without sharing state or retaining frame snapshots', () => {
    const first = createYinPitchDetector();
    const second = createYinPitchDetector();
    const profiles: DetectorProfile[] = ['low', 'general', 'high'];
    const frames = profiles.map((profile) => generateSine(profile === 'low' ? 55 : 440, 48000, pitchFrameSize(profile)));
    const saved = first.detect(frames[1]!, { sampleRate: 48000 });
    const snapshot = saved ? { ...saved } : null;
    for (let frame = 0; frame < 180; frame += 1) {
      const index = frame % 3;
      const options = { sampleRate: 48000, profile: profiles[index]! };
      expect(first.detect(frames[index]!, options)).toStrictEqual(baselineDetectPitchYin(frames[index]!, options));
    }
    expect(first.stats.analysisBufferAllocations).toBe(3);
    expect(second.stats.analysisBufferAllocations).toBe(0);
    expect(second.stats.comparisons).toBe(0);
    expect(saved).toStrictEqual(snapshot);
    const direct = generateSine(440, 24000, 2048);
    expect(second.detect(direct, { sampleRate: 24000 })).toStrictEqual(baselineDetectPitchYin(direct, { sampleRate: 24000 }));
    expect(second.stats.analysisBufferAllocations).toBe(0);
  });

  it('keeps strict threshold equality and the two adjacent representable Doubles', () => {
    const samples = tone(997, 8000, 64, 0.37, 'noisy');
    const trace = fullCmndf(samples);
    const trough = trace.findIndex((value, lag) => lag >= 2
      && value < trace[lag - 1]! && value <= trace[lag + 1]!);
    expect(trough).toBeGreaterThan(1);
    const threshold = trace[trough]!;
    const below = adjacentPositiveDouble(threshold, -1);
    const above = adjacentPositiveDouble(threshold, 1);
    const equalResult = baselineYin(samples, { fs: 8000, threshold });
    const aboveResult = baselineYin(samples, { fs: 8000, threshold: above });
    // This is a real decision boundary, not vacuous oracle agreement.
    expect(aboveResult).not.toBeNull();
    expect(equalResult).not.toStrictEqual(aboveResult);
    expect(baselineYin(samples, { fs: 8000, threshold: below })).toStrictEqual(equalResult);
    for (const candidateThreshold of [below, threshold, above]) {
      const options = { fs: 8000, threshold: candidateThreshold };
      expect(incrementalYin(samples, options)).toStrictEqual(baselineYin(samples, options));
    }
    const work = { comparisons: 0, fullComparisons: 0 };
    incrementalYin(samples, { fs: 8000, threshold: above }, work);
    expect(work.comparisons).toBe((trough + 1) * (samples.length >> 1));
  });

  it('uses the terminal lag only as a right interpolation neighbor and stops on equal plateaus', () => {
    const samples = generateSine(8000 / 7, 8000, 16);
    const trace = fullCmndf(samples);
    expect(trace[6]).toBeGreaterThan(0.15);
    expect(trace[7]).toBeLessThan(0.15);
    expect(baselineYin(samples, { fs: 8000, threshold: 0.15 })).toBeNull();
    expect(incrementalYin(samples, { fs: 8000, threshold: 0.15 })).toBeNull();
    const threshold = (trace[5]! + trace[6]!) / 2;
    const options = { fs: 8000, threshold };
    const work = { comparisons: 0, fullComparisons: 0 };
    expect(baselineYin(samples, options)).not.toBeNull();
    expect(incrementalYin(samples, options, work)).toStrictEqual(baselineYin(samples, options));
    expect(work.comparisons).toBe(7 * 8);
    const plateau = new Float32Array(32);
    const plateauOptions = { fs: 8000, threshold: 1.1 };
    expect(incrementalYin(plateau, plateauOptions, work)).toStrictEqual({ freq: 4000, clarity: 0 });
    expect(work.comparisons).toBe(3 * 16);
  });

  it('preserves terminal-lag exclusion, a zero threshold and nonfinite samples', () => {
    for (const length of [8, 9, 16, 63, 128]) {
      const samples = tone(1000, 8000, length, 0.3, 'sine');
      for (const threshold of [0, Number.MIN_VALUE, 0.15, 0.99, 1, 1.01]) {
        const options = { fs: 8000, threshold };
        expect(incrementalYin(samples, options)).toStrictEqual(baselineYin(samples, options));
      }
    }
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const samples = new Float32Array(32).fill(value);
      expect(incrementalYin(samples)).toStrictEqual(baselineYin(samples));
    }
  });
});
