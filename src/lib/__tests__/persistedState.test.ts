import {
  decodePersistedState,
  DEFAULT_STATE,
  DEFAULT_TUNER,
  migratePersistedState,
  restorePracticePreset,
  STATE_VERSION,
} from '../persistedState';

describe('persisted state migration', () => {
  it('defaults fresh and incomplete tuner state to Concert A 440 Hz', () => {
    expect(DEFAULT_TUNER.a4).toBe(440);
    expect(DEFAULT_STATE.tuner.a4).toBe(440);
    for (const input of [undefined, null, {}, { tuner: {} }]) {
      expect(migratePersistedState(input).tuner.a4).toBe(440);
    }
  });

  it('falls back to 440 Hz for malformed or nonfinite stored references', () => {
    for (const a4 of [undefined, null, '', '442', NaN, Infinity, -Infinity]) {
      expect(migratePersistedState({ tuner: { a4 } }).tuner.a4).toBe(440);
    }
    expect(decodePersistedState('{not-json')).toBeNull();
    expect(decodePersistedState('{"tuner":{}}')?.tuner.a4).toBe(440);
  });

  it('preserves explicit saved Concert A values when loading or migrating', () => {
    for (const a4 of [390, 432, 440, 442.5, 490]) {
      expect(migratePersistedState({ tuner: { a4 } }).tuner.a4).toBe(a4);
      expect(decodePersistedState(JSON.stringify({ schemaVersion: STATE_VERSION, tuner: { a4 } }))?.tuner.a4).toBe(a4);
    }
  });

  it('migrates legacy v1 state and supplies every v2 field', () => {
    const migrated = migratePersistedState({
      tuner: { instrumentId: 'guitar-6', tuningId: 'guitar-drop-d', a4: 442 },
      metronome: { bpm: 120, beats: 3, accents: ['accent', 'normal', 'mute'] },
      favoriteInstrumentIds: ['guitar-6'],
    });

    expect(migrated.schemaVersion).toBe(STATE_VERSION);
    expect(migrated.tuner).toMatchObject({
      instrumentId: 'guitar-6',
      tuningId: 'guitar-drop-d',
      a4: 442,
      capo: 0,
      detune: 0,
      sensitivity: DEFAULT_STATE.tuner.sensitivity,
      lockHoldMs: DEFAULT_STATE.tuner.lockHoldMs,
    });
    expect(migrated.metronome).toMatchObject({ bpm: 120, beats: 3, countInBars: 0, practiceMinutes: 0 });
    expect(migrated.metronome.accents).toEqual(['accent', 'normal', 'mute']);
    expect(migrated.customInstruments).toEqual([]);
    expect(migrated.practicePresets).toEqual([]);
  });

  it('bounds invalid settings and rejects malformed serialized data', () => {
    const migrated = migratePersistedState({
      tuner: { a4: 900, capo: 99, detune: 7, noiseGate: -1 },
      metronome: { bpm: -20, beats: 80, subdivision: 9, countInBars: 10 },
    });

    expect(migrated.tuner).toMatchObject({ a4: 490, capo: 12, detune: 0, noiseGate: 0.001 });
    expect(migrated.metronome).toMatchObject({ bpm: 20, beats: 32, subdivision: 4, countInBars: 4 });
    expect(decodePersistedState('{not-json')).toBeNull();
  });

  it('preserves custom tuning and note order', () => {
    const migrated = migratePersistedState({
      customInstruments: [{
        id: 'custom-seven',
        name: 'Seven string',
        family: 'Guitar',
        detectorProfile: 'low',
        transpositionSemitones: 0,
        aliases: [],
        tunings: [{
          id: 'custom-seven-standard',
          name: 'Low first',
          targets: [{ label: '7', midi: 35 }, { label: '6', midi: 40 }, { label: '1', midi: 64 }],
        }],
      }],
    });

    expect(migrated.customInstruments[0]?.tunings[0]?.targets).toEqual([
      { label: '7', midi: 35 },
      { label: '6', midi: 40 },
      { label: '1', midi: 64 },
    ]);
  });

  it('restores a saved tuner and metronome setup without aliasing nested arrays', () => {
    const preset = {
      id: 'practice-1',
      name: 'Drop practice',
      tuner: { ...DEFAULT_STATE.tuner, capo: 3, detune: -1, instrumentId: 'guitar-6' },
      metronome: {
        ...DEFAULT_STATE.metronome,
        bpm: 132,
        countInBars: 2,
        practiceMinutes: 15,
        accents: ['accent', 'mute', 'normal', 'normal'] as ('accent' | 'normal' | 'mute')[],
      },
    };
    const restored = restorePracticePreset(DEFAULT_STATE, preset);

    expect(restored.tuner).toMatchObject({ capo: 3, detune: -1, instrumentId: 'guitar-6' });
    expect(restored.metronome).toMatchObject({ bpm: 132, countInBars: 2, practiceMinutes: 15 });
    expect(restored.metronome.accents).not.toBe(preset.metronome.accents);
    expect(restored.metronome.trainer).not.toBe(preset.metronome.trainer);
  });
});
