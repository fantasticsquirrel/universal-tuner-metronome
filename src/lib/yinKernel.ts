/*
 * Derived from @audio/pitch-yin 1.0.5.
 * Upstream notice: https://github.com/audiojs/pitch/blob/main/LICENSE
 *
 * MIT License
 *
 * Copyright (c) Dmitry Iv
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * ---
 * This work is offered under the Krishnized License (https://github.com/krishnized/license).
 */

/**
 * Work counts cover only YIN's lag-search sample comparisons, not RMS,
 * decimation, refinement or peak measurement. They are deterministic, not time.
 */
export interface YinWork {
  comparisons: number;
  fullComparisons: number;
}

export interface YinKernelOptions {
  fs?: number;
  threshold?: number;
  minFreq?: number;
  maxFreq?: number;
}

export interface YinEstimate {
  freq: number;
  clarity: number;
}

/**
 * Incremental equivalent of @audio/pitch-yin 1.0.5 (MIT, Dmitry Iv.).
 *
 * The difference sum and cumulative normalization retain the original Float64
 * operation order. Only the first below-threshold trough can be selected, so
 * later lags cannot affect its answer. Compute its right neighbor before
 * stopping, including the terminal lag when necessary for interpolation.
 * Three scalar CMNDF values suffice; no lag-sized scratch arrays are needed.
 * Bounds, fixed comparison window and strict comparisons are unchanged.
 */
export function incrementalYin(
  data: Float32Array | Float64Array,
  params?: YinKernelOptions,
  work?: YinWork,
): YinEstimate | null {
  const fs = params?.fs || 44100;
  const threshold = params?.threshold ?? 0.15;
  const minFreq = params?.minFreq;
  const maxFreq = params?.maxFreq;
  const len = data.length;
  const half = len >> 1;
  const bounded = Number.isFinite(minFreq) && minFreq! > 0;
  const limit = bounded ? Math.min(half, Math.ceil(fs / minFreq!) + 2) : half;
  const window = bounded ? len - (limit - 1) : half;
  if (work) {
    work.comparisons = 0;
    work.fullComparisons = limit < 4 || window < 1 ? 0 : (limit - 1) * window;
  }
  if (limit < 4 || window < 1) return null;
  let running = 0;
  let previous2 = 1;
  let previous = 1;
  let foundTrough = false;
  for (let tau = 1; tau < limit; tau += 1) {
    let sum = 0;
    for (let index = 0; index < window; index += 1) {
      const difference = data[index]! - data[index + tau]!;
      sum += difference * difference;
    }
    if (work) work.comparisons += window;
    running += sum;
    const current = running > 0 ? sum * tau / running : 1;

    if (foundTrough) {
      // The final lag is interpolation-only, even when it is still descending.
      // Negated strict < also preserves the original behavior for NaN.
      if (tau === limit - 1 || !(current < previous)) {
        const denominator = previous2 - 2 * previous + current;
        const shift = denominator !== 0 ? (previous2 - current) / (2 * denominator) : 0;
        const frequency = fs / (tau - 1 + shift);
        if (bounded && frequency < minFreq!) return null;
        if (Number.isFinite(maxFreq) && maxFreq! > 0 && frequency > maxFreq!) return null;
        return { freq: frequency, clarity: 1 - previous };
      }
    } else if (tau >= 2 && tau < limit - 1 && current < threshold) {
      foundTrough = true;
    }
    previous2 = previous;
    previous = current;
  }
  return null;
}
