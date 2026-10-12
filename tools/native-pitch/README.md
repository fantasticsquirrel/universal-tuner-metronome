# Native pitch host regression tests and benchmark

## Run locally or in CI

Prerequisites: **Python 3.9+ and JDK 17+ (`java` on PATH)**. No Android SDK,
Expo prebuild, Gradle invocation, Node dependencies, or installed `kotlinc`
required. The runner uses Kotlin's real CLI compiler, not a translated detector.

From the repository root, including on a clean CI worker:

```sh
python3 tools/native-pitch/run.py test --download-deps
```

This explicitly downloads missing Maven Central artifacts into the ignored
`tools/native-pitch/.deps/` directory. Versions and SHA-256 digests are pinned;
cached and downloaded jars are both verified. Cache this directory in CI.
There are no Python package dependencies.

- Kotlin compiler, stdlib, script runtime and reflect: **2.1.20**
- JUnit: **4.13.2**; Hamcrest: **1.3**
- Compiler support: annotations **13.0**, trove4j **1.0.20200330**,
  kotlinx-coroutines-core-jvm **1.8.0**
- Compilation target: **JVM 17**

Offline after that first download:

```sh
python3 tools/native-pitch/run.py test --jars-dir tools/native-pitch/.deps
python3 tools/native-pitch/run.py benchmark --jars-dir tools/native-pitch/.deps
```

Without flags, the runner instead uses the existing
`$GRADLE_USER_HOME/caches/modules-2/files-2.1` cache (default `~/.gradle`).
It never invokes Gradle. `--test-class app.tunera.pitch.NativeCapturePlanTest`
selects a focused JUnit class; repeat the flag to select multiple classes.
All `*Test.kt` classes under this module's test sources run by default.
Temporary compiled classes are cleaned up even when a test fails.

The host runner deliberately excludes `TuneraPitchModule.kt`, which needs
Android/Expo. It compiles the **real production detector and capture plan** and
the same JUnit test files used by the native module. Android adapter compilation,
AudioRecord execution, microphone permissions, lifecycle behavior, event delivery,
and actual device timing require the separate Android build/device gates.

## Capture change

`NativeCapturePlan` separates recorder safety capacity from blocking read size.
The AudioRecord allocation remains `max(minimumBufferBytes, 3840) * 2` bytes.
The capture loop now requests **480 mono PCM16 samples at 48 kHz (10 ms)**,
independent of the device's minimum buffer size. Five ideal reads permit the
existing monotonic **50 ms** gate to run on time, instead of rounding to 80 ms
with the old minimum 1920-sample (40 ms) reads. The reusable array stays local
to the capture thread; no extra per-read thread, timer, or audio payload is added.

This does **not** shrink any analysis window: all profiles retain 2048 analysis
samples at 12/24/48 kHz for low/general/high. In ideal regular-arrival simulation,
the first complete frames arrive at 180/90/50 ms with the new quantum (previously
200/120/80 ms at 1920 samples), followed by 50 ms gaps. Tests cover several
recorder minimum capacities plus partial/late arrival and no catch-up bursts.
The 10 ms read is a scheduling opportunity, **not an Android deadline guarantee**:
DSP still shares the capture thread, OS scheduling may delay reads, and the UI
may coalesce events. More frequent reads can also affect energy usage; measure
that on target devices rather than inferring it from the host benchmark.

## YIN equivalence and regression coverage

The production detector incrementally calculates squared differences and CMNDF,
then stops at the original first below-threshold trough **after computing its
right neighbor**. It retains Float rounding before the Double cumulative sum,
Float multiplication before division, strict `<` comparisons, the fixed lag
window, terminal-lag exclusion, and the unchanged interpolation/refinement.
No-hit inputs still scan the full range; the RMS gate still skips it entirely.
`lastYinComparisonCount` counts actual lag-search sample comparisons only,
not RMS or the additional three refinement sums, and adds one increment per lag.
`estimatedComparisonCount()` remains the unchanged worst-case search budget.

`BaselinePitchDetector0a88025.kt` is a **test-only**, versioned full-scan oracle
from `0a88025be4832fd62b2362fdc56e46247d7189e5`. Its source hash is recorded in
its header. Only detector/profile type names changed and the result DTO was
removed in favor of the shared value type. Its profiles, gates, arithmetic,
configuration behavior, and lag search are independent of production. Do not
optimize this fixture or change it to make parity assertions pass. No legacy
algorithm is duplicated in production.

The tests compare raw Double bits for frequency, confidence and RMS, plus exact
clipping/timestamps and null decisions:

- 4500 streaming calls (4488 completed analyses) across all profiles and three
  thresholds: silence, deterministic noise, harmonics, noisy and square waves.
- 1600 irregular configuration/chunk calls (748 completed analyses): profile
  resets, fallback names, same-profile updates, threshold/RMS clamping, retained
  decimation remainders, short/empty/clamped read lengths and clock gates.
- 116 broad frequency/phase/harmonic cases including profile boundaries.
  **16 baseline cases are null or over one cent off**; this optimization preserves
  those outputs rather than attempting an unrelated accuracy repair.
- Strict threshold equality and adjacent representable Doubles at a noisy trough
  whose selected pitch really changes; terminal search, RMS equality/clipping,
  full-scan noise/DC/zero-energy fallback, and periodic comparison savings.

## Observed RED → GREEN evidence

1. Extracted the old capacity/read policy unchanged into the production capture
   plan used by `TuneraPitchModule`; ran:

   ```sh
   python3 tools/native-pitch/run.py test --test-class app.tunera.pitch.NativeCapturePlanTest
   ```

   **RED: 3 tests, 2 failures**: expected analysis gaps `[50]`, actual `[80]`;
   expected read size `480`, actual `1920`. Switching only the plan's read quantum
   to 480 made these pass without reducing recorder capacity.

2. Added a per-lag work counter to the still-full-scan detector, the frozen oracle,
   and behavioral tests; ran `python3 tools/native-pitch/run.py test`.
   **RED: 13 tests, 1 failure**: low-profile work `753727` equaled the full budget,
   instead of meeting the requested savings. All parity characterizations and
   capture tests passed before implementing early exit.

3. Implemented early exit: **GREEN: 13 tests**. Added the non-vacuous exact-threshold
   boundary test, then exercised CI bootstrapping with an empty dependency cache:
   `python3 tools/native-pitch/run.py test --download-deps` downloaded and verified
   every dependency and returned **OK (14 tests)**, with zero parity mismatches.

## Host measurement (advisory, not a CI timing gate)

Command actually run:

```sh
python3 tools/native-pitch/run.py benchmark --jars-dir tools/native-pitch/.deps
```

Host x86_64, OpenJDK 17.0.20.1, Kotlin 2.1.20. Per profile: 600 warm-up pairs,
1500 timed pairs, alternating baseline/candidate order; exact output equality
checked outside timing. Retained filled frames isolate analysis cost rather
than audio capture. One observed run:

| Profile / tone | Full → early comparisons | Baseline p50 ms | Early p50 ms | Ratio | Baseline / early p95 ms |
|---|---:|---:|---:|---:|---:|
| Low / 41.2 Hz | 753727 → 457564 | 0.7942 | 0.4749 | 1.67× | 1.3055 / 0.7162 |
| General / 440 Hz | 775047 → 86632 | 0.7956 | 0.0945 | 8.42× | 1.1432 / 0.1272 |
| High / 4400 Hz | 554367 → 20724 | 0.5787 | 0.0305 | 18.99× | 0.9024 / 0.0515 |

These are warmed JVM host measurements, **not Android ART speedups**, capture
latency, battery measurements, or end-to-end UI results. No connected device was
available. This lane did not run Expo prebuild or Gradle; Android build verification
belongs to the parent workflow. The frozen oracle gives reproducible behavioral
characterization, not an exhaustive proof over all possible PCM streams.
