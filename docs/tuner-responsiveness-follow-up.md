# Tuner responsiveness follow-up

Base: `642e4fdc35f7f637680a4f9ea666eb7abd95bf04` (Tunera 0.2.3). This pass builds on the previously merged Android DSP and render-isolation work. The requested release candidate is 0.2.4 / Android versionCode 7. Signing configuration, package dependencies and workflows are unchanged.

## Changes

### Bound Android delivery through JavaScript consumption

Previously the Android main-handler task cleared the pending-event flag before sending `onPitch`. That coalesced a delayed main thread, but did not bound the pitch events waiting for a busy JavaScript thread. The bridge adapter also replaced every native analysis timestamp with receipt time.

The new opt-in `deliveryMode: 'latest'` uses a single-result mailbox. Capture overwrites that slot while one `onPitchAvailable` wake is outstanding. When JavaScript handles the wake, the synchronous `takeLatestPitch(session)` method retrieves the newest result and permits the next wake. No polling interval, timer catch-up, raw PCM transfer or additional smoothing is introduced.

- The getter holds only a short mailbox lock. It never waits for pitch analysis or microphone I/O.
- Capture sessions tag producers and wakes. Stop/restart invalidates old frames and wakes; an old capture worker cannot mark a replacement session stopped.
- Native monotonic `ageMs` is converted to the JavaScript clock without refreshing stale results. Readings at or beyond the existing 200 ms miss grace are discarded.
- Older installed native modules keep the previous `onPitch` adapter path. New modules default to legacy push unless the caller explicitly opts in.
- Native YIN arithmetic, analysis windows, sample rates, microphone configuration, 50 ms cadence and pitch-tracker smoothing remain unchanged.

### Reduce JavaScript fallback detector work

The fallback previously ran the complete `@audio/pitch-yin` lag scan and allocated its scratch arrays on every analysis. The incremental kernel stops after the selected trough's right neighbor, preserving the original threshold search and Float64 arithmetic order. Full-search noise still scans the original range.

Each fallback input hook owns one detector instance. Its decimation buffers are reused across frames and start/stop, with bounded per-profile storage. The Android native path does not construct this detector. The existing functional detector API remains available.

The comparison oracle retains the pre-change wrapper and installed, lockfile-pinned `@audio/pitch-yin` implementation. Tests compare exact outputs, not merely note names or widened accuracy tolerances.

## Verification and limits

Final local gates after the 0.2.4 metadata update passed: TypeScript, ESLint (no warnings), **20 Jest suites / 115 tests**, and **19 native host tests**. The JavaScript suite includes 270 sliding capture frames through plucks, onset/decay, note changes, dropouts and abrupt silence. An independent review also compared 12,000 seeded kernel cases and 1,000 reused-wrapper cases against the frozen oracle with no mismatches.

The [reproducible fallback benchmark](../tools/js-pitch/README.md) records both periodic and worst-case nonperiodic inputs. Periodic lag-search comparisons fell by approximately 39% / 89% / 96% for the sampled low/general/high tones. Noise retained its full 775,047-comparison budget; silence remained gated. All sampled scenarios reused their warmed decimation buffers without additional allocations. Host timing is advisory and varies with concurrent load.

The native mailbox tests include 10,000 queued analyses producing one wake and returning the newest result, session replacement, misses versus absent results, monotonic age, concurrent producer/consumer operation, and the drain/publish race. All pre-existing native DSP parity cases are retained.

The JavaScript adapter tests cover the new handshake, old-binary compatibility, stale-session wakes, missed detections and expiry. Hook tests guard retained fallback ownership and zero fallback allocations on the native backend. The prior live-tuner render-isolation tests remain in the full suite.

Reproduce from the repository root:

```sh
npm ci --legacy-peer-deps --no-audit --no-fund
npm run typecheck
npm run lint
npm test -- --ci
python3 tools/native-pitch/run.py test --download-deps
CI=1 npx expo prebuild --platform android --no-install
CI=1 npx expo export --platform android
```

The pure Kotlin host runner compiles the real detector, mailbox and native tests, but excludes the Android/Expo adapter. Expo prebuild and JavaScript export do not compile that adapter into an APK. Native Android compilation and physical-device microphone/bridge checks are separate gates.

No affected phone/tablet was available. Host work counts, exact parity, JVM/Node timings and synthetic queue tests do not establish Android frame rate, acoustic latency, battery use, thermal behavior or that a reported device freeze is fixed.

Unchanged limitations from the previous pass include full-scan above-gate noise, known boundary/harmonic accuracy misses, and a possible 500 ms worker join during native stop/lifecycle cleanup. Those are not hidden by a lower sampling rate or stronger smoothing in this pass.

## Target-device check before release

Use a locally built development/release candidate on the affected device, preserving the installed app's signing identity and data. Check:

1. Low notes, higher notes, plucks, sustained tones, noisy-room input and silence. Confirm no range or acquisition regression.
2. Move through controls while tuning; briefly stall the JS thread in a profiling build, then verify the display resumes with the current note rather than replaying old readings.
3. Repeated start/stop, profile changes, background/resume and permission interruptions. Old sessions must not blank or replace the new reading.
4. Lock/haptics/auto-advance, simultaneous metronome/reference tone and practice timer.
5. Sustained CPU, GC, dropped frames and thermal behavior on the slowest supported hardware.

This change has not been merged, deployed or submitted to a paid build service. A separately authorized local APK/release build must use this exact reviewed source and satisfy the build/signing gates. Opening a pull request or pushing `main` triggers the repository's verification workflow; a separate branch can be prepared without those triggers when publication is authorized.
