# Implementation roadmap

Estimates assume one experienced engineer with periodic design/testing help. They are planning ranges, not commitments.

## Phase 0 — Feasibility spikes (1–2 weeks)

Deliverables:

- Minimal iOS and Android microphone capture.
- Portable C++ YIN implementation created independently from the paper.
- Generated-tone benchmark from A0 through C8.
- Native click scheduler running for 30 minutes with measured drift/jitter.
- Skia gauge receiving throttled native snapshots.
- Decision record confirming React Native/New Architecture or documenting a switch to fully native/Kotlin Multiplatform.

Exit criteria:

- Pitch pipeline works on at least two iOS and four Android devices.
- No raw PCM transfer through the JavaScript event bridge.
- The metronome does not depend on JavaScript timers.
- Low-note acquisition and battery/thermal behavior are understood.

## Phase 1 — Core vertical slice (2–3 weeks)

- App shell, themes, navigation, permissions, and interruption states.
- Chromatic tuner with note/octave/cents/frequency/confidence.
- Equal temperament, A4 calibration, auto/manual target.
- Basic 20–300 BPM metronome, meter, accents, tap tempo.
- Local settings persistence.
- Automated DSP fixtures and metronome timing harness.

Milestone: a musician can install the app offline, tune chromatically, and practice with a basic metronome.

## Phase 2 — Instruments and approachable UX (2–3 weeks)

- Versioned instrument/tuning schemas and curated initial catalog.
- Guided string tuning, auto-advance, target mismatch handling.
- Search, recents, favorites, custom tunings, capo/detune.
- Transposing-instrument written/concert labels.
- Phone portrait/landscape and tablet focus layouts.
- Usability tests with beginner, guitar/bass, orchestral, and teacher participants.

Milestone: common instruments and keys work without expert knowledge.

## Phase 3 — Advanced pitch tools (2–3 weeks)

- Historical and custom temperaments.
- Range/input sensitivity/noise controls.
- Reference-tone generator.
- Precision/strobe-inspired display.
- Custom instruments and per-target cent offsets.
- JSON preset import/export.

Milestone: advanced users can configure pitch behavior without compromising the simple default screen.

## Phase 4 — Full metronome and tablet practice mode (2–3 weeks)

- Subdivision patterns and per-beat accent/mute editor.
- Sound/volume mix, count-in, timer, visual flash, haptics.
- Speed trainer and saved presets.
- Simultaneous tuner + metronome mini-player.
- Tablet split view.
- Route latency warnings and robust audio-session coordination.

Milestone: the app replaces a dedicated tuner and metronome for normal practice.

## Phase 5 — Hardening and release (2–4 weeks)

- Physical-device matrix and long-session tests.
- Accessibility audit and screen-reader pass.
- Battery, thermal, startup, memory, and package-size profiling.
- Store assets, privacy disclosures, offline verification, and support documentation.
- Dependency/license audit and OWASP MASVS-informed security review.
- Beta feedback triage and regression suite.

Release gate:

- No known critical pitch, timing, crash, privacy, or accessibility defects.
- Published tested frequency/device limits.
- All user-facing claims backed by measurements.

## Post-V1 candidates

Prioritize from user evidence, not competitor checklists:

1. Intonation mode comparing open/fretted or harmonic notes.
2. Practice history stored locally.
3. Recorder and pitch timeline.
4. MIDI/external controls and preset sequencing.
5. Polyphonic experiments as a separate technical track.
6. Optional encrypted device-to-device preset sync.

## Work breakdown

Each phase should use vertical stories that include DSP/native code, UI, accessibility, tests, and documentation. Avoid building the complete DSP engine before musicians can test the interaction.

Definition of done for each story:

- Acceptance criteria met on iOS and Android.
- Unit/fixture tests added.
- Real-device behavior verified.
- Accessibility labels and reduced-motion behavior included.
- No new network dependency or unreviewed data collection.
- Documentation/data schema updated.

## Initial backlog priority

**P0:** audio engine, DSP benchmark, chromatic UI, calibration, core metronome, interruption recovery, persistence, fixture tests.

**P1:** instrument model/catalog, guided tuning, transposition, alternate/custom tunings, subdivisions, tap tempo, tablet layout, accessibility.

**P2:** temperaments, precision display, tone generator, speed trainer, import/export, advanced input controls.

**Later:** recording, analytics/history, MIDI, cloud, lessons, polyphonic tuning.
