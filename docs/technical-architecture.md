# Technical architecture

## Decision

Use React Native with TypeScript for application UI, navigation, local state, and preset management; React Native Skia/Reanimated for tuner visualization; a portable C++20 DSP library for pitch detection and metronome timing primitives; Swift/AVAudioEngine on iOS; and Kotlin/JNI with Oboe on Android.

This is deliberately not a pure JavaScript/Web Audio design. Reliable low-frequency detection and drift-free metronome output require control of native audio callbacks, buffering, timestamps, and interruption handling.

## Runtime layers

### UI/application layer

- React Native New Architecture.
- TypeScript domain models generated from JSON schemas where practical.
- React Navigation or Expo Router after a short prototype comparison.
- Zustand or an equivalently small state store; avoid a large global framework.
- Skia/Reanimated values fed by throttled pitch snapshots, not raw audio buffers.
- SQLite or a simple versioned key-value store for settings/presets; JSON export/import.

### Native audio layer

**iOS:** AVAudioSession + AVAudioEngine input tap for microphone capture; AVAudioSourceNode/AVAudioPlayerNode or Audio Units for metronome/tone output. Handle route changes, interruptions, sample-rate changes, and permission states.

**Android:** Oboe full-duplex stream where supported, low-latency performance mode, callback-based I/O, device-native sample rate, and dynamic buffer tuning. JNI passes control messages and low-rate snapshots, not per-sample objects.

Google recommends Oboe/AAudio, callback I/O, native sample rates, and avoiding blocking work in callbacks for low latency. Source: [Android low-latency audio guidance](https://developer.android.com/games/sdk/oboe/low-latency-audio), [Oboe overview](https://developer.android.com/games/sdk/oboe).

Apple's AVAudioEngine provides real-time input/output nodes, and input taps expose PCM buffers for analysis. Source: [AVAudioEngine](https://developer.apple.com/documentation/avfaudio/avaudioengine), [installTap documentation](https://developer.apple.com/documentation/avfaudio/avaudionode/installtap%28onbus%3Abuffersize%3Aformat%3Ablock%3A%29).

### DSP core

One C++ library, unit-testable on desktop, owns:

- PCM normalization and optional channel mixdown.
- DC removal and high-pass filtering.
- RMS/peak measurement and adaptive noise gate.
- Windowing and ring-buffer/frame management.
- YIN pitch candidate estimation with parabolic interpolation.
- Confidence/aperiodicity output.
- Range-constrained candidate selection and octave-error suppression.
- Temporal smoothing with attack/release behavior appropriate to tuning.
- Frequency-to-note/target/cents conversion using the active temperament and reference pitch.
- Native metronome event timeline and tone oscillator/envelope.

YIN is a suitable baseline because it is designed for fundamental-frequency estimation, supports a broad range, and exposes an aperiodicity measure. Source: [YIN project page](https://labrosa.ee.columbia.edu/doc/yin.html), [original paper](https://iro.umontreal.ca/~pift6080/H09/documents/papers/yin_pitch_tracker.pdf).

## Pitch pipeline

1. Capture mono float PCM at the device's native rate, normally 48 kHz.
2. Add samples to a preallocated lock-free ring buffer.
3. Select frame length based on active minimum frequency; low notes require longer windows.
4. Apply gate/filter/window and run YIN on a worker or real-time-safe analysis path.
5. Generate multiple plausible candidates around the estimated period when confidence is marginal.
6. Score candidates using periodicity, prior pitch, instrument range, and selected target notes.
7. Smooth only the displayed estimate; never conceal a deliberate note change for cosmetic stability.
8. Publish a compact snapshot at 30–60 Hz: frequency, cents, note, octave, confidence, RMS, clipping, timestamp.

Use detector profiles rather than one universal frame:

- Low: approximately 20–300 Hz for bass, tuba, low strings.
- General: approximately 55–2,000 Hz for most instruments.
- High: approximately 200–5,000 Hz for piccolo/high harmonics.
- Guided: narrow search around selected strings/targets.

The exact bounds and thresholds must be derived from fixture tests, not assumed constants.

## Pitch math

For 12-tone equal temperament with reference frequency `a4`:

`midi = 69 + 12 × log2(frequency / a4)`

`cents = 1200 × log2(frequency / targetFrequency)`

Temperaments are represented as 12 pitch-class offsets in cents relative to equal temperament, plus an optional root/key. Instrument tuning profiles may add per-target cent offsets after temperament calculation.

Transposition affects labels, not detected acoustic frequency. Always retain concert MIDI/frequency internally and derive the written note by the instrument's semitone offset.

## Metronome engine

- Schedule audio events using native sample-frame timestamps, never JavaScript timers.
- Generate or decode click samples ahead of time.
- Use a rolling schedule horizon and monotonic host time.
- Accent/mute/subdivision changes become immutable pattern snapshots swapped at a bar boundary or next beat.
- The visual beat follows audio timestamps with output-latency compensation.
- Haptics are best-effort and must not be represented as sample-accurate.
- Track underruns and late callbacks in debug diagnostics.

Tempo automation is a sequence of segments: start BPM, target BPM, increment, bars or seconds per increment, repeat count, and optional rest bars.

## Offline and security design

- Do not request network permission for V1 unless the build/update ecosystem requires platform defaults; core runtime makes no requests.
- Do not bundle analytics, advertising, remote config, or crash-reporting SDKs initially.
- Validate imported JSON against a versioned schema, size limits, finite numeric ranges, and enum allowlists.
- Store no microphone samples by default.
- Keep exported files user-initiated and free of device identifiers.
- Perform an OWASP MASVS-informed review before release: permissions, local storage, dependency integrity, exported Android components, URL/file handling, and logging.

## Suggested repository layout for implementation

```text
apps/mobile/                 React Native app
packages/domain/             tuning, instrument, preset TypeScript models
packages/ui/                 reusable controls and themes
native/dsp/                  portable C++ DSP library
native/ios-audio/            AVAudioEngine adapter
native/android-audio/        Oboe/JNI adapter
fixtures/audio/              generated and licensed test recordings
specs/                       versioned JSON schemas/data
tools/                       fixture generation and analysis scripts
docs/                        product and engineering decisions
```

## Key risks and mitigations

- **Low-note latency:** use range-aware window sizes and show confidence/acquisition state honestly.
- **Octave errors:** candidate tracking, harmonic checks, target-aware scoring, and broad fixture tests.
- **Android device variation:** Oboe, conservative fallback buffers, xrun telemetry in local diagnostics, physical-device matrix.
- **Bluetooth latency/routes:** prefer built-in microphone for tuning, warn on delayed metronome output, recover cleanly on route changes.
- **UI overload:** progressive disclosure and separate pitch-setup sheet.
- **“All instruments” claim:** define broad monophonic support, publish tested ranges, and avoid claiming reliable polyphonic tuning.
- **Reference-code licensing:** implement DSP and modules independently from papers/platform docs; do not copy Tuneo's restricted code.
