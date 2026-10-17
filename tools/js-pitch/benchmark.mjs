#!/usr/bin/env node
/** Advisory host-Node benchmark. No timing pass/fail gate or device claims. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tunera-yin-'));
try {
  // Compile the real production source and the frozen test-only full-scan
  // oracle. This runner never contains its own translated candidate detector.
  for (const [source, output] of [
    ['src/lib/yin.ts', 'yin.js'],
    ['src/lib/yinKernel.ts', 'yinKernel.js'],
    ['src/lib/__tests__/yinBaseline.ts', 'baseline.js'],
  ]) {
    const compiled = ts.transpileModule(fs.readFileSync(path.join(root, source), 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      fileName: source,
    });
    fs.writeFileSync(path.join(temporary, output), compiled.outputText);
  }
  const require = createRequire(import.meta.url);
  const { createYinPitchDetector, pitchFrameSize } = require(path.join(temporary, 'yin.js'));
  const { baselineDetectPitchYin } = require(path.join(temporary, 'baseline.js'));
  const stable = (result) => {
    if (!result) return result;
    const { timestamp, ...measurements } = result;
    assert.equal(typeof timestamp, 'number');
    return measurements;
  };
  function makeFrame(profile, frequency, kind, phase, seed) {
    let random = seed;
    return Float32Array.from({ length: pitchFrameSize(profile) }, (_, index) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      if (kind === 'silence') return 0;
      if (kind === 'noise') return random / 0x100000000 * 2 - 1;
      const angle = 2 * Math.PI * frequency * index / 48000 + phase;
      return 0.5 * (Math.sin(angle) + 0.45 * Math.sin(2 * angle) + 0.2 * Math.sin(3 * angle));
    });
  }
  const warmup = 600;
  const iterations = 1500;
  console.log(`HOST_BENCH Node=${process.version} platform=${process.platform} arch=${process.arch} NOT Android/Hermes/device latency, energy or audio capture`);
  for (const [profile, hz, kind] of [
    ['low', 41.2, 'harmonics'],
    ['general', 440, 'harmonics'],
    ['high', 4400, 'harmonics'],
    ['general', 440, 'noise'],
    ['general', 440, 'silence'],
  ]) {
    const candidate = createYinPitchDetector();
    const options = { sampleRate: 48000, profile, threshold: 0.19, minimumRms: 0.0008 };
    const frames = Array.from({ length: 32 }, (_, index) => makeFrame(profile, hz, kind, index * 0.13, 17 + index));
    for (let index = 0; index < warmup; index += 1) {
      const samples = frames[index % frames.length];
      assert.deepEqual(stable(candidate.detect(samples, options)), stable(baselineDetectPitchYin(samples, options)));
    }
    const allocationsBefore = candidate.stats.analysisBufferAllocations;
    const before = [];
    const after = [];
    let comparisons = 0;
    let fullComparisons = 0;
    const cpuStart = process.cpuUsage();
    const elapsedStart = process.hrtime.bigint();
    for (let index = 0; index < iterations; index += 1) {
      const samples = frames[index % frames.length];
      let baselineResult;
      let candidateResult;
      const baseline = () => {
        const start = process.hrtime.bigint();
        baselineResult = baselineDetectPitchYin(samples, options);
        before.push(Number(process.hrtime.bigint() - start) / 1e6);
      };
      const optimized = () => {
        const start = process.hrtime.bigint();
        candidateResult = candidate.detect(samples, options);
        after.push(Number(process.hrtime.bigint() - start) / 1e6);
      };
      if (index % 2 === 0) { baseline(); optimized(); }
      else { optimized(); baseline(); }
      // Assertions and allocations for these comparisons are outside timing.
      assert.deepEqual(stable(candidateResult), stable(baselineResult));
      comparisons += candidate.stats.comparisons;
      fullComparisons += candidate.stats.fullComparisons;
    }
    const cpu = process.cpuUsage(cpuStart);
    const elapsed = Number(process.hrtime.bigint() - elapsedStart) / 1e9;
    before.sort((a, b) => a - b);
    after.sort((a, b) => a - b);
    const percentile = (values, fraction) => values[Math.floor((values.length - 1) * fraction)];
    const summary = (values) => `p50=${percentile(values, 0.5).toFixed(4)}ms p95=${percentile(values, 0.95).toFixed(4)}ms p99=${percentile(values, 0.99).toFixed(4)}ms`;
    console.log(`BENCH profile=${profile} hz=${hz} signal=${kind} warmup=${warmup} pairs=${iterations} baseline[${summary(before)}] optimized[${summary(after)}] p50_ratio=${(percentile(before, 0.5) / percentile(after, 0.5)).toFixed(2)} comparisons_mean=${(comparisons / iterations).toFixed(0)} full_mean=${(fullComparisons / iterations).toFixed(0)} new_decimation_buffers_after_warmup=${candidate.stats.analysisBufferAllocations - allocationsBefore} loop_elapsed_s=${elapsed.toFixed(2)} loop_cpu_ms=${((cpu.user + cpu.system) / 1000).toFixed(1)}`);
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
