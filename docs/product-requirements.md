# Product requirements

## Product statement

An offline, privacy-respecting tuner and metronome that lets a musician select any common instrument or use a fully chromatic mode, account for transposition and temperament, and begin tuning or practicing within seconds on a phone or tablet.

## Users

- Beginner string player who needs guided string-by-string tuning.
- Guitarist or bassist using alternate and custom tunings.
- Orchestral wind/brass player who thinks in a transposed key.
- String, voice, or ensemble musician who needs chromatic pitch tracking.
- Keyboard/early-music user who needs non-equal temperaments and custom reference pitch.
- Teacher using a tablet with large, visible feedback.
- Advanced user checking intonation with exact frequency/cents.

## Core user journeys

1. Launch, grant microphone permission, play a note, and see note/cents feedback.
2. Pick an instrument and tuning, then tune each target note in sequence.
3. Select a transposing key and see written note plus concert pitch.
4. Change A4 reference frequency or temperament and save it as a preset.
5. Start a metronome, alter BPM/subdivision/meter without stopping, and continue using the tuner.
6. Create a custom string tuning or custom cent-offset temperament offline.
7. Reopen the app and resume the previous setup immediately.

## Version 1 requirements

### Tuner

- Chromatic auto-detection and manual target-note modes.
- Guided instrument/string mode with auto-advance and manual selection.
- Large note name, octave, cents deviation, sharp/flat direction, and confidence state.
- Optional exact frequency and target frequency.
- Gauge view plus precision/strobe-inspired view.
- Selectable tolerance bands: beginner ±5 cents, standard ±3 cents, precise ±1 cent, custom.
- Concert A calibration from 390–490 Hz, default 440 Hz.
- Transposition from concert pitch to common written keys, including C, Bb, A, Eb, F, G, and custom semitone offset.
- Equal temperament plus a curated set of public-domain historical temperaments.
- Custom temperament with 12 pitch-class cent offsets.
- Noise gate, input sensitivity, note hold time, and low/high range profile.
- Reference tone generator by note, octave, frequency, waveform, and volume.
- Microphone route/error recovery after interruption or device changes.

### Instrument presets

- Instrument family, name, written key, practical sounding range, preferred detector range, strings/courses, default tuning, alternates, and aliases.
- Initial families: guitar, bass, ukulele, bowed strings, orchestral strings, mandolin-family, banjo, fretted folk instruments, brass, woodwinds, keyboards, percussion with definite pitch, voice, and unrestricted chromatic.
- Search, recent instruments, favorites, and custom instruments.
- Left/right handed string-order display where applicable.
- Capo offset and whole-instrument detune offset.

### Metronome

- 20–400 BPM with buttons, slider/wheel, numeric entry, and tap tempo.
- Time signatures with 1–32 beats per bar and denominators 2, 4, 8, or 16.
- Subdivisions: quarter, eighth, triplet, sixteenth, dotted/equivalent common patterns.
- Per-beat accent editing and mute.
- Multiple bundled click sounds with independent accent/subdivision volume.
- Visual pulse and optional screen flash.
- Haptic pulse with capability warning when exact synchronization is device-limited.
- Count-in, practice timer, and automatic speed trainer.
- Save, name, reorder, and favorite presets.
- Continue while tuner is visible; prevent screen sleep during an active session when enabled.

### Offline/privacy

- No login or cloud dependency.
- No ads, trackers, or third-party analytics SDKs.
- Core app works in airplane mode.
- Settings, presets, and history stay on-device.
- Export/import user presets as a local JSON file is allowed but not required for V1.
- Microphone audio is analyzed in memory and is not recorded unless a future recording feature is explicitly enabled.

### Accessibility

- Minimum 48 × 48 dp/pt touch targets for primary controls.
- Never use color as the only sharp/flat/in-tune signal.
- Dynamic type/font scaling, screen-reader labels, reduced-motion mode, and high-contrast theme.
- Haptic confirmation for start/stop and optional in-tune lock.
- Landscape and portrait support.

## Explicitly deferred

- Practice recording and waveform playback.
- Accounts, cloud sync, collaboration, or teacher dashboards.
- AI coaching or automatic instrument classification.
- Polyphonic guitar tuning and piano-wide simultaneous pitch detection.
- MIDI input/output, Ableton Link, Bluetooth foot pedals, and wearables.
- Chord/scale libraries, sheet music, and lessons.
- Proprietary “sweetened” tuning tables.

## Non-functional requirements

- Supported initial OS floor: iOS 16+ and Android 10+; revisit from device analytics only after release.
- No real-time work, allocation, file I/O, locks, or network activity in audio callbacks.
- Graceful behavior on Bluetooth routes, while warning that Bluetooth input/output latency can impair metronome alignment.
- All DSP and tuning math must be deterministic and covered by fixture tests.
- Battery target: less than 10% drain per hour on a representative midrange device with screen at 50% brightness; measure rather than promise before release.
- Localized note naming policy supports English letter names first and leaves room for solfège/German naming.

## Success metrics without tracking users

Use opt-in diagnostics only if ever added. Before that, measure in lab/device testing:

- Note acquisition time and octave-error rate across instrument fixtures.
- Cents accuracy against generated and recorded reference tones.
- Metronome drift, jitter, underruns, and interruption recovery.
- Task completion in moderated usability tests: first tune, change instrument, set transposition, create custom tuning, start speed trainer.
