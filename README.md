# Universal Offline Tuner & Metronome

Implementation plan for a private, offline-first tuner and metronome for phones and tablets. The product is intended to tune nearly any monophonic acoustic or electric instrument, support transposing instruments and alternate temperaments, and provide a reliable low-latency practice metronome without accounts, ads, analytics, or a network dependency.

## Plan documents

- [Competitive research](docs/competitive-research.md)
- [Product requirements](docs/product-requirements.md)
- [Touch UX specification](docs/ux-spec.md)
- [Technical architecture](docs/technical-architecture.md)
- [Instrument and tuning model](docs/instrument-library.md)
- [Implementation roadmap](docs/implementation-roadmap.md)
- [Verification strategy](docs/verification-plan.md)

## Recommended product shape

Build a React Native application using the New Architecture for shared UI and navigation, with a C++ DSP core and thin Swift/Kotlin audio adapters. Keep microphone capture, pitch analysis, and metronome scheduling off the JavaScript thread. Render the tuner with Skia/Reanimated and persist all settings locally.

The first release should be a focused utility: chromatic and guided instrument tuning, transposition, reference pitch, temperament support, tone generation, and a dependable metronome. Recording, practice analytics, MIDI, cloud sync, AI coaching, and social features are deliberately deferred.

## Product principles

1. Works completely offline after installation.
2. Opens directly into a usable tuner.
3. Common actions require one tap; expert controls stay nearby but out of the way.
4. Accuracy and stable note acquisition matter more than decorative animation.
5. Every instrument preset is data, not hard-coded UI.
6. Tuner and metronome can run together.
7. Phone and tablet layouts use the same mental model.

## Initial success targets

- First usable pitch result within 500 ms after a stable note begins.
- Stable tracking from approximately 27.5 Hz (A0) through 4,186 Hz (C8), device microphone permitting.
- Display resolution to 0.1 cent; practical accuracy target within ±1 cent for clean sustained tones after device calibration.
- Metronome range 20–400 BPM with sample-accurate native scheduling and no drift over a 30-minute session.
- Cold start to tuner in under 2 seconds on supported midrange devices.
- No network permission required for core operation.

## Status

This repository contains planning and architecture only. No application code has been started.
