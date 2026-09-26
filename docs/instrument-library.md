# Instrument and tuning model

## Scope language

“All instruments” should mean any predominantly monophonic pitched source within the tested frequency range, plus curated presets for common instruments. It must not imply polyphonic piano/guitar analysis or identical microphone performance for every acoustic environment.

## Data model

Each instrument is data-driven:

```json
{
  "id": "clarinet-bb",
  "family": "woodwind",
  "name": "Clarinet",
  "variant": "Bb",
  "transpositionSemitones": -2,
  "soundingRange": { "minMidi": 50, "maxMidi": 94 },
  "detectorProfile": "general",
  "defaultMode": "chromatic",
  "aliases": ["B-flat clarinet"]
}
```

The sign convention must be explicit: `writtenMidi = concertMidi + transpositionSemitones` or its inverse. Pick one, enforce it in schema tests, and include fixtures for Bb, Eb, and F instruments.

String/fixed-note tunings are separate reusable records:

```json
{
  "id": "guitar-standard",
  "instrumentId": "guitar-6",
  "name": "Standard",
  "targets": [
    { "label": "6", "midi": 40, "centOffset": 0 },
    { "label": "5", "midi": 45, "centOffset": 0 },
    { "label": "4", "midi": 50, "centOffset": 0 },
    { "label": "3", "midi": 55, "centOffset": 0 },
    { "label": "2", "midi": 59, "centOffset": 0 },
    { "label": "1", "midi": 64, "centOffset": 0 }
  ]
}
```

## Initial curated catalog

### Chromatic and voice

- Universal chromatic, voice ranges, choir section presets.

### Guitar family

- 6-, 7-, 8-, and 12-string guitar; baritone; lap steel/dobro as later catalog expansion.
- Standard, half/whole-step down, Drop D/C/B, DADGAD, open G/D/E/C, Nashville/high-strung, and custom.
- 4-, 5-, and 6-string bass with standard/drop/custom tunings.

### Ukulele and folk fretted strings

- Soprano/concert/tenor/baritone ukulele, high-G and low-G.
- Mandolin, mandola, octave mandolin, mandocello.
- 4- and 5-string banjo, tenor banjo.
- Bouzouki, balalaika, cavaquinho, charango, dulcimer, sitar/tanpura as validated additions.

### Bowed and orchestral strings

- Violin, viola, cello, double bass.
- Fiddle alternate tunings as named presets.
- Harp and orchestral tuning remain chromatic in V1; later add guided string maps only after usability testing.

### Woodwinds

- Piccolo, flute, oboe, English horn, bassoon, saxophone family, clarinet family, recorder family.
- Presets primarily define written-key transposition and practical range; they do not force fixed target notes.

### Brass

- Trumpet/cornet variants, French horn, trombone, euphonium/baritone, tuba variants.
- Support both concert-pitch and common written-pitch conventions with a plainly visible label.

### Keyboards, percussion, and other

- Piano/organ/harpsichord chromatic single-note mode with temperament support.
- Marimba, xylophone, vibraphone, glockenspiel, timpani, handpan, and steelpan as chromatic or guided target sets.
- Reference-tone mode for instruments whose attack makes continuous tracking unstable.

## Temperaments

Ship only tables that can be independently verified and are not proprietary:

- 12-tone equal temperament.
- Just intonation variants keyed by tonic.
- Pythagorean.
- Quarter-comma meantone.
- Werckmeister III.
- Kirnberger III.
- Vallotti.
- User-defined 12-note offsets.

Document the exact source and cent table for every shipped temperament during implementation. Temperament root/key must be selectable where the system depends on it.

## Custom profiles

Users can create:

- Custom instrument name, family, transposition, and range.
- Any number of ordered target notes/strings/courses.
- Per-target cent offsets.
- Custom 12-note temperament offsets and root.
- Tags, favorite status, and display order.

Validation prevents duplicate IDs, non-finite values, unsupported MIDI/frequency ranges, and excessively large imports.
