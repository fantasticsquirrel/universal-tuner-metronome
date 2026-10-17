import type { DetectorProfile, PitchSnapshot } from '@/types';

/**
 * Frozen full-scan oracle, not production code. Do not optimize or share helpers
 * with the candidate. Baseline app source: 642e4fd, src/lib/yin.ts.
 * Wrapper SHA-256: fc1216e3c7e215da00abc9d67b3c6bf11b94e1754368fbabcd96fbffbcf8bc3e
 * Kernel: @audio/pitch-yin 1.0.5, yin.js. Copyright (c) Dmitry Iv.
 * MIT license and full upstream notice are reproduced in ../yinKernel.ts.
 * Kernel SHA-256: 7b88e2cccdd4122822d328b5728b9954b9c59cf306383345bdadf400636a8753
 * Only exported names, type annotations and type-import placement differ.
 */
interface BaselineYinOptions {
  fs?: number;
  threshold?: number;
  minFreq?: number;
  maxFreq?: number;
}

/**
 * YIN pitch detection (de Cheveigné & Kawahara, 2002).
 * Difference fn → cumulative mean normalized difference → threshold → parabolic interpolation.
 *
 * @param {Float32Array | Float64Array} data - audio samples (single window, eg. 2048 samples)
 * @param {{fs?: number, threshold?: number, minFreq?: number, maxFreq?: number}} [params]
 * @returns {{freq: number, clarity: number} | null}
 */
export function baselineYin(data: Float32Array | Float64Array, params?: BaselineYinOptions) {
  let fs = params?.fs || 44100
  let threshold = params?.threshold ?? 0.15
  let minFreq = params?.minFreq
  let maxFreq = params?.maxFreq
  let len = data.length
  let half = len >> 1

  // With a known lower bound we only need lags through fs/minFreq. Use the
  // remaining samples as a longer fixed comparison window, which materially
  // improves low-pitch detection near an onset without adding latency.
  let bounded = Number.isFinite(minFreq) && minFreq! > 0
  let limit = bounded ? Math.min(half, Math.ceil(fs / minFreq!) + 2) : half
  let window = bounded ? len - (limit - 1) : half
  if (limit < 4 || window < 1) return null

  // step 1-2: difference function
  let d = new Float64Array(limit)
  for (let tau = 1; tau < limit; tau++) {
    let sum = 0
    for (let i = 0; i < window; i++) {
      let diff = data[i]! - data[i + tau]!
      sum += diff * diff
    }
    d[tau] = sum
  }

  // step 3: cumulative mean normalized difference
  let cmndf = new Float64Array(limit)
  cmndf[0] = 1
  let running = 0
  for (let tau = 1; tau < limit; tau++) {
    running += d[tau]!
    cmndf[tau] = running > 0 ? d[tau]! * tau / running : 1
  }

  // step 4: absolute threshold — find first dip below threshold
  let tau = 2
  while (tau < limit - 1) {
    if (cmndf[tau]! < threshold) {
      // find local minimum
      while (tau + 1 < limit - 1 && cmndf[tau + 1]! < cmndf[tau]!) tau++
      break
    }
    tau++
  }
  if (tau >= limit - 1) return null

  // step 5: parabolic interpolation
  let s0 = cmndf[tau - 1]!, s1 = cmndf[tau]!, s2 = cmndf[tau + 1]!
  let denom = s0 - 2 * s1 + s2
  let shift = denom !== 0 ? (s0 - s2) / (2 * denom) : 0
  let period = tau + shift
  let freq = fs / period

  if (bounded && freq < minFreq!) return null
  if (Number.isFinite(maxFreq) && maxFreq! > 0 && freq > maxFreq!) return null
  return { freq, clarity: 1 - s1 }
}




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

export function baselineDetectPitchYin(samples: Float32Array, options: YinDetectionOptions): PitchSnapshot | null {
  const rms = calculateRms(samples);
  if (rms < (options.minimumRms ?? 0.008)) return null;
  const profile = options.profile ?? 'general';
  const range = PROFILE_RANGE[profile];
  const analysis = preparePitchAnalysis(samples, options.sampleRate, profile);
  const result = baselineYin(analysis.samples, {
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
