# Touch UX specification

## Navigation model

Use three primary destinations: **Tuner**, **Metronome**, and **Library**. Settings open from a persistent top-right control. On tablets, use a navigation rail and allow Tuner + Metronome split view. Do not require a home/dashboard screen.

The app reopens to the last primary destination and restores its state.

## Tuner screen

### Phone portrait

Top to bottom:

1. Compact mode bar: instrument/tuning, transposition, calibration status.
2. Large detected or target note with octave.
3. Wide tuning gauge showing flat/in-tune/sharp with numeric cents beneath.
4. Optional secondary row: detected Hz, target Hz, confidence/input level.
5. Guided string strip when an instrument tuning is selected.
6. Bottom action row: target/auto toggle, tone, metronome mini-control, more.

The entire center gauge can be tapped to hold/release the current target. Swipe horizontally across the string strip to move between strings. Long-pressing an instrument/tuning opens recent and favorite choices; normal tap opens the full picker.

### Phone landscape

Place note/gauge on the left two-thirds and target strings/actions on the right third. Keep the detected note readable from music-stand distance.

### Tablet

Offer two layouts:

- Focus: enlarged tuner, same hierarchy as phone.
- Practice split: tuner on the left, metronome on the right, both fully operable.

### Feedback states

- **Listening:** neutral gauge, microphone/input indicator.
- **No reliable pitch:** em dash note, “Play a steady note,” retain last note faintly for orientation.
- **Flat/sharp:** direction arrow, signed cents, spatial gauge movement, and optional color.
- **In tune:** centered marker, “IN TUNE” label, gentle haptic after the note remains within tolerance for a configurable hold period.
- **Target mismatch:** guided mode shows the detected note and “Aim for E2,” rather than pretending it is merely very sharp/flat.
- **Clipping/noisy:** actionable input message, not a generic failure.

## Instrument and tuning picker

Use a bottom sheet on phones and side sheet on tablets.

- Search field at top.
- Recent and favorites first.
- Family chips for browsing.
- Each result shows instrument, tuning name, and note sequence.
- A clear “Chromatic — any instrument” option always appears first.
- “Create custom” remains visible without entering settings.

Advanced parameters—temperament, calibration, transposition, capo, cent offset—open in a second sheet titled **Pitch setup**. Show a compact summary on the tuner screen so hidden settings never silently affect results.

## Metronome screen

Primary controls:

- A large start/stop surface reachable by either thumb.
- Large BPM value with minus/plus buttons; press-and-hold accelerates changes.
- Horizontal drag or rotary gesture for coarse adjustment; vertical/fine gesture or buttons for single-BPM changes.
- Tap-tempo target at least 96 × 64 dp/pt.
- Beat row that allows tapping each beat to cycle accent, normal, or mute.
- Meter and subdivision controls directly visible.

Secondary controls in a single expandable panel: sound, volume mix, flash, haptics, count-in, timer, and speed trainer. Preserve controls while running and apply changes on the next musically safe boundary.

The collapsed metronome mini-player on the tuner screen shows start/stop, BPM, current beat, and an expand affordance.

## Setup and permission flow

First launch has two pages maximum:

1. Short value statement and optional default-instrument choice.
2. Microphone explanation followed by the system permission prompt.

If permission is denied, keep metronome and tone generator usable and show a direct route to system settings. Never block the whole app behind microphone permission.

## Interaction rules

- Common changes take one tap from the active screen.
- Destructive reset/import actions require confirmation; ordinary tuning changes do not.
- Settings that alter pitch interpretation always remain visible as a summary.
- Animations follow reduced-motion settings and never delay interaction.
- Device rotation preserves running audio and current session state.
- Avoid gesture-only features; every gesture has a visible control equivalent.
