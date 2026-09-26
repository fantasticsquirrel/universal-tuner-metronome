import yin from '@audio/pitch-yin';

import type { DetectorProfile, PitchSnapshot } from '@/types';

const PROFILE_RANGE: Record<DetectorProfile, { minFreq: number; maxFreq: number }> = {
  low: { minFreq: 25, maxFreq: 500 },
  general: { minFreq: 48, maxFreq: 2200 },
  high: { minFreq: 150, maxFreq: 4500 },
};

export interface YinDetectionOptions {
  sampleRate: number;
  profile?: DetectorProfile;
  threshold?: number;
  minimumRms?: number;
}

export function calculateRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index]!;
    sum += value * value;
  }
  return Math.sqrt(sum / samples.length);
}

export function detectPitchYin(samples: Float32Array, options: YinDetectionOptions): PitchSnapshot | null {
  const rms = calculateRms(samples);
  if (rms < (options.minimumRms ?? 0.008)) return null;
  const range = PROFILE_RANGE[options.profile ?? 'general'];
  const result = yin(samples, {
    fs: options.sampleRate,
    threshold: options.threshold ?? 0.15,
    minFreq: range.minFreq,
    maxFreq: range.maxFreq,
  });
  if (!result || !Number.isFinite(result.freq) || result.freq <= 0) return null;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]!));
  return {
    frequency: result.freq,
    confidence: Math.max(0, Math.min(1, result.clarity)),
    rms,
    clipping: peak >= 0.99,
    timestamp: Date.now(),
  };
}

export function generateSine(frequency: number, sampleRate: number, length: number, amplitude = 0.8): Float32Array {
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
  }
  return output;
}
