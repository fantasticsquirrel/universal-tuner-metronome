# Verification plan

## DSP correctness

Generate deterministic sine, saw, triangle, and harmonic-rich fixtures across A0–C8 at multiple amplitudes, sample rates, attack shapes, vibrato depths, noise levels, and cent offsets. Add legally usable recordings for guitar, bass, bowed strings, winds, brass, voice, and struck instruments.

For every fixture record:

- Expected fundamental frequency and MIDI/note.
- Allowed cents error after acquisition.
- Maximum acquisition time.
- Expected confidence/no-pitch intervals.
- Whether octave ambiguity is acceptable for the fixture.

Test boundaries around semitone midpoints, temperament offsets, A4 calibration, transposition labels, clipping, silence, broadband noise, and competing harmonics.

## Metronome timing

- Render scheduled click output to a loopback/file harness and detect transient positions.
- Measure interval error, standard deviation/jitter, cumulative drift, and missed/duplicate events.
- Run 20, 60, 120, 240, and 400 BPM for at least 30 minutes.
- Test meter/subdivision changes while running and verify boundary semantics.
- Force CPU load, screen rotation, background/foreground transitions, route changes, and notification interruptions.
- Track audio underruns/xruns in debug builds.

## Unit and schema tests

- Frequency ↔ MIDI ↔ note ↔ cents round trips.
- Every shipped temperament table and root transformation.
- Bb/Eb/F transposition fixtures in both directions.
- Instrument/tuning schema validation and stable migrations.
- Custom import rejection for oversized, malformed, non-finite, or out-of-range values.
- Metronome pattern expansion and tempo automation boundaries.

## UI tests

- First-launch permission grant, denial, and later recovery.
- Tune a guided instrument from wrong note through completion.
- Switch instrument/key/calibration and verify the active summary.
- Create/edit/delete/export/import a custom tuning.
- Start metronome, edit accents/subdivision, collapse to tuner, and stop.
- Rotation and phone/tablet adaptive layouts without audio restart.
- Large text, screen readers, reduced motion, high contrast, and color-blind checks.

## Device matrix

Minimum pre-release matrix:

- Current and oldest-supported iPhone, plus one iPad size.
- Android flagship and midrange devices from at least Samsung, Google, and one additional manufacturer.
- At least one older/slow supported Android device.
- Built-in microphone/speaker, wired interface/headset where available, Bluetooth route, and USB audio where supported.

## Usability studies

Run short task-based sessions with at least:

- Two beginners.
- Two guitar/bass players using alternate tunings.
- Two orchestral wind/brass players using transposition.
- One teacher using a tablet.
- One advanced temperament/intonation user.

Observe task completion and confusion; do not lead users through the interface. Specifically test whether concert vs written pitch, hidden calibration, and guided auto-advance are understood.

## Release evidence

Archive benchmark output by app version and device. The release checklist must include:

- Pitch accuracy/acquisition report.
- Metronome drift/jitter report.
- Battery/thermal report.
- Accessibility results.
- Dependency/license inventory.
- Privacy/network capture showing no unexpected traffic.
- Known limitations and tested instrument/range statement.
