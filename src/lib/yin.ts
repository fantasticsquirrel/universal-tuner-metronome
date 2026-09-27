import yin from '@audio/pitch-yin';

import type { DetectorProfile, PitchSnapshot } from '@/types';

const PROFILE_RANGE: Record<DetectorProfile, { minFreq: number; maxFreq: number }> = {
  low: { minFreq: 25, maxFreq: 500 },
  general: { minFreq: 48, maxFreq: 2200 },
  high: { minFreq: 150, maxFreq: 4500 },
};

const PROFILE_ANALYSIS: Record<DetectorProfile, { frameSize: number; sampleRate: number }> = {
  // Keep more than four cycles at 25 Hz, but do not make YIN compare the
  // oversampled 48 kHz waveform. The low-pass-by-averaging decimation keeps
  // the bass fundamental while cutting the detector's hot loop by ~16x.
  low: { frameSize: 8192, sampleRate: 12_000 },
  general: { frameSize: 4096, sampleRate: 24_000 },
  high: { frameSize: 2048, sampleRate: 24_000 },
};

export interface YinDetectionOptions {
  sampleRate: number;
  profile?: DetectorProfile;
  threshold?: number;
  minimumRms?: number;
}

export interface PreparedPitchAnalysis {
  samples: Float32Array;
  sampleRate: number;
  downsampleFactor: number;
}

export function pitchFrameSize(profile: DetectorProfile): number {
  return PROFILE_ANALYSIS[profile].frameSize;
}

/**
 * Reduce oversampling before YIN. Pitch only needs twice the profile's highest
 * frequency; processing at the capture rate adds quadratic work without
 * adding useful pitch information.
 */
export function preparePitchAnalysis(
  samples: Float32Array,
  sampleRate: number,
  profile: DetectorProfile,
): PreparedPitchAnalysis {
  const targetRate = PROFILE_ANALYSIS[profile].sampleRate;
  const downsampleFactor = Math.max(1, Math.round(sampleRate / targetRate));
  if (downsampleFactor === 1) {
    return { samples, sampleRate, downsampleFactor };
  }

  const outputLength = Math.floor(samples.length / downsampleFactor);
  const output = new Float32Array(outputLength);
  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const inputOffset = outputIndex * downsampleFactor;
    let sum = 0;
    for (let index = 0; index < downsampleFactor; index += 1) {
      sum += samples[inputOffset + index]!;
    }
    output[outputIndex] = sum / downsampleFactor;
  }
  return {
    samples: output,
    sampleRate: sampleRate / downsampleFactor,
    downsampleFactor,
  };
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

function refineFrequency(
  samples: Float32Array,
  sampleRate: number,
  roughFrequency: number,
): number {
  const center = Math.round(sampleRate / roughFrequency);
  if (center < 2 || center + 2 >= samples.length) return roughFrequency;
  const window = samples.length - (center + 2);
  const differences = [center - 1, center, center + 1].map((lag) => {
    let sum = 0;
    for (let index = 0; index < window; index += 1) {
      const difference = samples[index]! - samples[index + lag]!;
      sum += difference * difference;
    }
    return sum;
  });
  const [left, middle, right] = differences as [number, number, number];
  const denominator = left - 2 * middle + right;
  const shift = denominator === 0 ? 0 : (left - right) / (2 * denominator);
  if (!Number.isFinite(shift) || Math.abs(shift) > 1) return roughFrequency;
  return sampleRate / (center + shift);
}

export function detectPitchYin(samples: Float32Array, options: YinDetectionOptions): PitchSnapshot | null {
  const rms = calculateRms(samples);
  if (rms < (options.minimumRms ?? 0.008)) return null;
  const profile = options.profile ?? 'general';
  const range = PROFILE_RANGE[profile];
  const analysis = preparePitchAnalysis(samples, options.sampleRate, profile);
  const result = yin(analysis.samples, {
    fs: analysis.sampleRate,
    threshold: options.threshold ?? 0.15,
    minFreq: range.minFreq,
    maxFreq: range.maxFreq,
  });
  if (!result || !Number.isFinite(result.freq) || result.freq <= 0) return null;
  const refinedFrequency = refineFrequency(samples, options.sampleRate, result.freq);
  // The coarse YIN result already passed the profile bounds. Clamp tiny
  // interpolation drift at an exact boundary (notably 25 Hz) back into range.
  const frequency = Math.max(range.minFreq, Math.min(range.maxFreq, refinedFrequency));
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) peak = Math.max(peak, Math.abs(samples[index]!));
  return {
    frequency,
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
