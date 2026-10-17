# JavaScript fallback YIN regression checks and host benchmark

This covers the JS fallback used by web/iOS or when Android native input is
unavailable. It does not claim to measure native Android, Hermes, microphone
capture, battery use or the rendering pipeline.

## Run

After installing the lockfile dependencies, from the repository root:

```sh
node node_modules/jest/bin/jest.js src/lib/__tests__/yin.test.ts src/lib/__tests__/yinParity.test.ts --runInBand
node node_modules/typescript/bin/tsc --noEmit
node tools/js-pitch/benchmark.mjs
```

The benchmark transpiles the **real production TypeScript detector** and frozen
reference into a temporary directory, loads them, checks every result for exact
numerical equality outside the timing window (only wall-clock timestamps are
excluded), and removes the temporary files. It needs only existing project
Node/TypeScript dependencies. It does not download dependencies, invoke native
build tools, publish anything, or impose a timing pass/fail threshold.

## Preserved behavior

- Profile frame sizes, rates and frequency bounds are unchanged: low
  8192 samples / 12 kHz / 25–500 Hz; general 4096 / 24 kHz / 48–2200 Hz;
  high 2048 / 24 kHz / 150–4500 Hz. These are the existing capture-frame sizes
  and target decimation rates, not the native detector's profile layout.
- The same fixed comparison window, cumulative Float64 arithmetic order,
  strict threshold and local-minimum comparisons, terminal-lag exclusion,
  interpolation, full-rate refinement, RMS gate, confidence and clipping remain.
- Incremental calculation stops only after the original first below-threshold
  trough's right neighbor has been calculated. No-hit input still scans the
  complete lag range. Gated frames still skip YIN entirely.
- Three scalar normalized-difference values replace the two per-call Float64
  lag arrays. `createYinPitchDetector()` owns reusable per-profile Float32
  decimation buffers. Every retained buffer element is overwritten on every
  call; there is no retained signal-history decision state. A profile's buffer
  is replaced when its output length changes. The cache retains at most three
  buffers, rather than growing for every observed shape.
- `detectPitchYin()` remains a stateless compatibility API. Live input should
  retain one factory instance per hook/session. The counters describe lag-search
  sample comparisons and explicitly owned decimation-buffer allocations, not
  all JavaScript allocations or total DSP work.

## Independent reference and tests

`src/lib/__tests__/yinBaseline.ts` freezes the original complete JS wrapper from
commit `642e4fd` and the full-scan kernel from installed `@audio/pitch-yin` 1.0.5.
Their source SHA-256 hashes are recorded in the fixture. No production helpers
are shared with it. The tests assert the installed dependency's exact version
and kernel hash, then check fixture output against that installed dependency.
An intentional dependency update must revisit the oracle explicitly. Exact
parity preserves baseline misses and inaccuracies; it is not an accuracy fix.
The MIT copyright and full upstream license notice are retained in
`src/lib/yinKernel.ts`.

The focused suites contain 37 tests, including:

- 264 range-edge, phase and waveform cases across the three profiles at
  44.1/48 kHz, including harmonics, square waves and deterministic noisy tones.
- 336 combinations of additional sample rates (8/16/22.05/24/32/96 kHz),
  zero/short/odd frame lengths and thresholds.
- 360 repeated calls with profile/rate/length/threshold/gate changes, clipping,
  silence, DC and deterministic noise, compared as complete snapshots with
  fixed timestamps.
- 270 sliding capture frames through pluck/onset/decay, note changes, brief
  dropouts and abrupt silence at 44.1/48 kHz. Exact decisions are compared on
  each original-length frame; there is no added averaging or delayed result.
- 180 calls through rotating warmed profiles with a constant allocation count;
  independent detector instances and retained snapshots; stateless API parity.
- A non-vacuous threshold test comparing a noisy trough's exact Float64 value
  and its two adjacent representable Doubles. Crossing it changes the oracle's
  selected pitch. Equality remains strict.
- Terminal interpolation-neighbor and excluded-terminal-candidate cases, equal
  plateaus, no-hit full scans, gated zero work, RMS equality and nonfinite input.
- Existing accuracy, default-sensitivity, low-gain and observation-window tests.

### Observed RED → GREEN

Before changing the full-scan kernel, the factory, counters and new checks ran:
10 tests passed (parity/ownership/no-hit) and 3 savings tests failed. Their work
counts were the complete budgets: 753727 low, 775047 general and 138943 high.
After implementing incremental early exit, all three savings checks passed with
all parity checks unchanged. Explicit threshold/terminal cases were then added.

## Observed advisory host measurement

One run on Linux x64, Node v24.19.0. Each scenario had 600 warm-up pairs and 1500
timed pairs, alternating reference/candidate order over 32 prebuilt frames.
Signal preparation and exact result comparisons are outside the timed calls.
These are warmed Node measurements, **not Android/device performance promises**.

| Profile / signal | Full → early comparisons | Baseline p50 ms | Candidate p50 ms | Baseline / candidate p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Low / harmonic 41.2 Hz | 753727 → 457564 | 0.7532 | 0.4492 | 0.8890 / 0.5455 |
| General / harmonic 440 Hz | 775047 → 86632 | 0.7661 | 0.1009 | 0.9693 / 0.1511 |
| High / harmonic 4400 Hz | 138943 → 5178 | 0.1413 | 0.0174 | 0.1754 / 0.0186 |
| General / noise | 775047 → 775047 | 0.7322 | 0.6929 | 0.8880 / 0.8505 |
| General / gated silence | 0 → 0 | 0.0034 | 0.0034 | 0.0034 / 0.0034 |

All scenarios allocated zero additional decimation buffers after warm-up and
had zero result mismatches. Periodic lag-search comparisons were reduced by
about 39%, 89% and 96% respectively. Noise remains the original worst-case
search budget. The runner also prints p99, CPU/elapsed loop time and allocation
counts so subsequent runs can be compared without treating host timing as a CI
gate. Lower-end devices still need sustained live-input/lifecycle and UI tests.
