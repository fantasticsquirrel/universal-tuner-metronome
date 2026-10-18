# Concert A numeric-entry fix

Base: `f2ad07b1989407f56d094a941379b1125b8d071f` (the unchanged source tree of the tested Tunera 0.2.4 preview).

## Cause and behavior

`NumberField` converted and clamped every keystroke. Clearing Concert A produced `Number('') === 0`, immediately replaced by 390 Hz. Typing the first digit of a replacement value similarly snapped to the minimum before the number could be completed.

The input now retains its draft text separately from the controlled numeric setting. Complete, finite, in-range decimal values apply immediately. Empty text, partial digits below the minimum, a sign, a trailing decimal separator, invalid text, and out-of-range values remain editable without changing tuning. Both dot and comma decimal separators are supported; exponent/hex notation and nonfinite values are rejected. Both Concert A locations request a decimal keyboard.

Blur or Done normalizes the display to the latest accepted controlled value. Escape discards only unfinished draft text; this remains a live setting, not a transactional form. Dismissing Pitch setup without blur preserves valid edits and discards unfinished text. Caller-controlled rounding for integer settings is retained. No DSP, microphone, audio, persistence, dependencies, version metadata, permissions, signing, or workflow code changes are included.

## Verification

- The new numeric-field tests failed against the original implementation: 22 failures and 2 passing boundary tests.
- TypeScript and ESLint pass.
- Full Jest suite: 21 suites / 141 tests pass.
- Native host parity/capture/mailbox suite: 19 tests pass.
- Android production JavaScript/Hermes export succeeds using the existing local toolchain.
- Independent source review and focused regression run found no blocking issues.

Coverage includes per-digit replacement, clearing, decimals/comma decimals and trailing zeros, incomplete/invalid/out-of-range text, inclusive bounds, blur/Done, Escape, unmount without blur, repeated sheet close/reopen, external changes, integer rounding, negative/fractional sibling fields, and live-pitch emissions while editing. Accepted Concert A changes reach the gauge without restarting microphone input. The existing 20-emission isolation check remains `screen: 0, metronome: 0, live: 20`.

Reproduce after installing the existing lockfile dependencies:

```sh
npm run typecheck
npm run lint
npm test -- --ci
python3 tools/native-pitch/run.py test  # requires the pinned cached jars and JDK 17+
CI=1 npx expo export --platform android
```

Renderer tests exercise the real JS components and event handlers, not a physical Android/iOS keyboard, cursor, or IME. The Android export verifies bundling/Hermes compilation, not a new APK or installation. A target-device keyboard check remains necessary before release. No release, merge, paid build, or GitHub Actions run is part of this fix.
