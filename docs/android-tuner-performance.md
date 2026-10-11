# Android tuner performance changes

Baseline: `0a88025be4832fd62b2362fdc56e46247d7189e5` (0.2.2). These changes do not alter version/signing metadata or authorize release.

## Implemented

- **No render-time PCM history allocation:** the native backend never constructs the JavaScript fallback frame buffer. The fallback constructs one buffer per profile and reuses it across snapshots, parent renders and start/stop. The pitch tracker is initialized once per mounted hook. Regression tests wrap the real constructors and exercise the real hook.
- **Capture cadence:** a 480-sample/10 ms blocking read is independent of unchanged recorder safety-buffer capacity. Regular-arrival simulations exercise the production plan/detector and yield 50 ms gaps instead of 80 ms. Actual device timing is not established by this simulation.
- **Early-exit YIN:** calculate only through the accepted trough's right neighbor. Preserve existing sample rates, windows, normalization order, interpolation and confidence. A frozen, test-only full-scan oracle checks exact result bits. See [native tests and benchmark](../tools/native-pitch/README.md).
- **Live UI isolation:** `LiveTuner` owns pitch snapshots, lock/haptics, input errors and current-note tone selection; screen-owned guided-string elements retain identity. Closed sheets are not constructed. Separate controls and pulse contexts stop metronome clock updates from invalidating tuner consumers. The old full-runtime hook remains compatible.
- **Gauge:** measured-width `translateX` uses the native animation driver, with cancellation, resize handling and reduced-motion behavior. Numerical/accessibility text and lock decisions still use each incoming snapshot.

## Executed regression coverage

`npm run typecheck`, `npm run lint`, `npm test -- --ci` passed: **18 suites / 88 tests** on the integrated implementation.

Measured React-render assertions after initial mount:

- 20 independent pitch emissions: screen 0, metronome 0, live tuner 20 (previously screen/metronome each 20).
- 16 independent metronome pulses: control consumer 0, pulse consumer 16.
- Actual integrated tuner/metronome consumers over those pulses: screen 0, live tuner 0, metronome mini 16.

`python3 tools/native-pitch/run.py test --download-deps` (or offline `--jars-dir tools/native-pitch/.deps`) runs **14 JUnit tests**. Streaming/configuration/frequency characterizations contain 4500 + 1600 + 116 calls/cases with zero mismatches, plus threshold/work/gate cases. Nulls before full windows are included in the call counts; test output distinguishes completed analyses.

Allocation regressions were observed failing before the hook correction (repeated constructors, including native-backend allocations), then passing. UI behavior was characterized before extraction; render-isolation expectations failed on the old screen/context structure. The native README records capture and operation-count RED→GREEN evidence. Timing ratios are advisory host measurements, not flaky CI thresholds.

## Reproduce build gates

```sh
npm ci --legacy-peer-deps --no-audit --no-fund
npm run typecheck
npm run lint
npm test -- --ci
python3 tools/native-pitch/run.py test --download-deps
CI=1 npx expo prebuild --platform android --no-install
cd android
./gradlew :tunera-pitch:testReleaseUnitTest :app:assembleRelease \
  --no-daemon --max-workers=2 -Dorg.gradle.parallel=false \
  -PreactNativeArchitectures=armeabi-v7a,arm64-v8a
```

The generated Android directory is ignored. The new GitHub Actions workflow runs JavaScript checks, a standalone checksum-pinned native host gate, and ARM release-mode compilation/native Gradle tests. A generated local release-mode APK is **build evidence**, not an approved production-signed release.

## Explicit limits and unchanged behavior

- No connected low-end Android device was available during implementation. React-render counts, Animated API assertions and JVM timings do not establish native frame rate, microphone latency, battery or thermal improvements.
- The broad baseline accuracy sweep still has **16/116 null or >1-cent cases**, including boundary and harmonic-rich signals. This is a separately tracked characterization, not an acceptable new accuracy target. Optimizing the search does not fix those pre-existing outputs.
- Off-tab microphone behavior, metronome WAV preparation, bridge timestamp semantics and capture/DSP thread ownership are unchanged. Those audit suggestions depend on device profiling or a separate behavior contract; they were not part of the four prioritized changes.
- Before promotion, test a release APK on the affected hardware: instrument low/high ranges, sustained and plucked notes/noise, lock/auto-advance, rotation/reduced motion, permission/background/resume, simultaneous metronome, CPU/GC/frame timing and sustained thermal/energy behavior. Preserve the installed user's app data/signing identity.
