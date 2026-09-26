# Competitive research

Research date: 2026-09-26

## Executive summary

The market divides into three useful patterns:

- **Simple tuners** prioritize immediate note recognition and a large cents gauge. Tuneo and Pano Tuner are strong references.
- **Instrument-guided tuners** reduce beginner confusion with string-by-string targets and tuning presets. Fender Tune is the clearest example.
- **Practice suites** combine tuning, metronome, tone generation, recording, and analysis. TonalEnergy and Soundcorset set the upper feature ceiling, but their density should not define the default interface.

The proposed app should combine Tuneo's technically efficient rendering, Pano's broad chromatic/temperament support, Fender's guided tuning, Peterson's professional calibration concepts, and Soundcorset/TonalEnergy's metronome depth. It should avoid accounts, subscriptions, ads, cloud-first features, and overloaded launch screens.

## Product comparisons

### Tuneo

Tuneo is an open-source guitar tuner built with React Native's New Architecture. It uses native Swift/Kotlin microphone modules, a shared C++ YIN pitch detector, and Skia/Reanimated for responsive visualization. It demonstrates that a shared cross-platform UI can coexist with native real-time audio and DSP.

Useful lessons:

- A shared TypeScript UI is viable when the real-time path stays native/C++.
- Skia is appropriate for a smooth gauge or strobe-like display.
- YIN is a practical monophonic baseline.
- Raw buffers should not make unnecessary round trips through JavaScript in the proposed architecture.

License warning: Tuneo's license restricts redistribution as a competing commercial app. Treat it as an architectural reference only; do not copy code or assets.

Source: [Tuneo repository](https://github.com/DonBraulio/tuneo), [Expo engineering article](https://expo.dev/blog/real-time-audio-processing-with-expo-and-native-code)

### Pano Tuner

Pano emphasizes a broad frequency range, exact frequency and cents, transposition, non-equal temperaments, and custom temperament support. It presents a simple chromatic surface while retaining expert options.

Useful lessons:

- Chromatic mode must not assume guitar-family instruments.
- Frequency, cents, and octave should remain available without dominating beginner mode.
- Historical and custom temperaments are meaningful differentiators for keyboard, early-music, and ensemble users.

Source: [Pano Tuner on Google Play](https://play.google.com/store/apps/details?id=com.soundlim.panotuner), [Pano Tuner on the App Store](https://apps.apple.com/gb/app/pano-tuner-chromatic-tuner/id348094874)

### Fender Tune

Fender provides guided tuning for guitar, bass, and ukulele, alternate/custom tunings, a pro tuner with cents and hertz, reference-pitch selection, and rhythm/metronome tools. Its guided string workflow is more approachable than an unrestricted chromatic tuner for beginners.

Useful lessons:

- Offer Auto and Manual-string modes.
- Make alternate tunings searchable and favorite-able.
- Use string order and simple completion feedback rather than requiring users to interpret pitch class alone.
- Custom tuning creation should be part of the core data model.

Source: [Fender Tune support](https://tune-support.fender.com/hc/en-us), [Tune Plus feature description](https://support.fender.com/hc/en-us/articles/42912909683739-What-is-Tune-Plus)

### TonalEnergy Tuner

TonalEnergy supports chromatic and target tuning, instrument-specific modes/ranges, transposition, reference pitch, temperaments, pitch tracking, tone generation, analysis, and a deep metronome with subdivisions, meters, presets, count-in, tempo sequences, polyrhythms, flash, and external controls.

Useful lessons:

- Instrument range profiles improve detection behavior.
- Tuner and metronome should operate simultaneously.
- Visual, audible, and haptic beat channels improve accessibility and loud-room use.
- Presets and tempo programs are valuable after the core metronome is trustworthy.
- Advanced analysis belongs in a later release, not on the default tuner screen.

Source: [TonalEnergy product site](https://www.tonalenergy.com/), [TonalEnergy user guide](https://www.tonalenergy.com/tet-user-guide-android)

### Soundcorset

Soundcorset combines a chromatic tuner, pitch chart, volume display, recorder, metronome, flash/vibration modes, and a speed trainer. Its one-touch metronome and multimodal beat feedback are strong practice-oriented patterns.

Useful lessons:

- Tap tempo and a speed trainer are high-value, low-concept features.
- Flash and vibration are useful when audio output is undesirable.
- Battery-saving behavior matters for long practice sessions.

Source: [Soundcorset product site](https://www.soundcorset.com/)

### Peterson tuners

Peterson's products emphasize strobe-style sensitivity, target-note mode, reference-pitch calibration, global cent offsets, transposition, historical temperaments, per-instrument presets, and proprietary “sweetened” tunings.

Useful lessons:

- Separate equal temperament from instrument-specific offsets.
- Store custom per-note/per-string cent offsets in a general tuning profile.
- Provide a precision/strobe view for advanced users, while avoiding proprietary Peterson presets and trademarks.
- Intonation mode is a logical post-MVP addition.

Source: [Peterson StroboSoft](https://www.petersontuners.com/products/strobosoft/), [Peterson iStroboSoft](https://www.petersontuners.com/products/istrobosoft/nnApp)

## Opportunity

The proposed app can occupy a useful middle ground: broader than guitar-centric tuners, calmer than full practice suites, more private than account-based products, and more approachable than laboratory-style tuning tools.

Differentiators:

- Offline and private by design.
- Broad instrument library with transposition and range-aware detection.
- Beginner guided mode and professional chromatic mode in the same app.
- Custom tuning and temperament support without a subscription.
- Tuner/metronome split view designed for tablets.
- Explicit low-vision, color-independent, haptic, and one-handed controls.

## Sources and evidence notes

Feature claims above come from official product sites, official support pages, app-store listings, technical documentation, or the original Tuneo repository. Product capabilities can change; verify store listings immediately before implementation or release positioning.
