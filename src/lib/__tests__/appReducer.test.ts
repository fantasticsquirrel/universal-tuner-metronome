import { DEFAULT_STATE, appReducer } from '@/store/AppProvider';
import type { InstrumentPreset, PracticePreset } from '@/types';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

describe('app state flows', () => {
  it('resets Concert A to 440 Hz only when reset is requested', () => {
    const customized = appReducer(DEFAULT_STATE, { type: 'tuner', patch: { a4: 442.5 } });
    expect(customized.tuner.a4).toBe(442.5);
    expect(appReducer(customized, { type: 'hydrate', state: customized }).tuner.a4).toBe(442.5);
    expect(appReducer(customized, { type: 'reset' }).tuner.a4).toBe(440);
  });

  it('creates, applies, renames, and deletes a practice preset', () => {
    const preset: PracticePreset = {
      id: 'practice-test',
      name: 'Scales',
      tuner: { ...DEFAULT_STATE.tuner, a4: 442, capo: 2 },
      metronome: {
        ...DEFAULT_STATE.metronome,
        bpm: 132,
        accents: [...DEFAULT_STATE.metronome.accents],
        trainer: { ...DEFAULT_STATE.metronome.trainer },
      },
    };

    let state = appReducer(DEFAULT_STATE, { type: 'practice-create', preset });
    state = appReducer(state, { type: 'tuner', patch: { a4: 440, capo: 0 } });
    state = appReducer(state, { type: 'metronome', patch: { bpm: 80 } });
    state = appReducer(state, { type: 'practice-apply', id: preset.id });
    expect(state.tuner).toMatchObject({ a4: 442, capo: 2 });
    expect(state.metronome.bpm).toBe(132);

    state = appReducer(state, { type: 'practice-rename', id: preset.id, name: 'Fast scales' });
    expect(state.practicePresets[0]?.name).toBe('Fast scales');
    state = appReducer(state, { type: 'practice-delete', id: preset.id });
    expect(state.practicePresets).toEqual([]);
  });

  it('keeps custom note order and reconciles edits, favorites, and deletion', () => {
    const instrument: InstrumentPreset = {
      id: 'custom-test',
      name: 'Test strings',
      family: 'Custom',
      transpositionSemitones: 0,
      detectorProfile: 'low',
      aliases: [],
      tunings: [{
        id: 'custom-test-standard',
        name: 'Standard',
        targets: [{ label: 'Low', midi: 40 }, { label: 'Middle', midi: 45 }, { label: 'High', midi: 50 }],
      }],
    };
    const activeTuner = {
      ...DEFAULT_STATE.tuner,
      instrumentId: instrument.id,
      tuningId: instrument.tunings[0]!.id,
      targetIndex: 2,
    };
    let state = appReducer(DEFAULT_STATE, { type: 'custom-save', instrument });
    state = appReducer(state, { type: 'tuner', patch: activeTuner });
    state = appReducer(state, { type: 'favorite', id: instrument.id });
    state = appReducer(state, {
      type: 'practice-create',
      preset: {
        id: 'custom-practice',
        name: 'Custom practice',
        tuner: activeTuner,
        metronome: DEFAULT_STATE.metronome,
      },
    });

    const edited: InstrumentPreset = {
      ...instrument,
      tunings: [{
        ...instrument.tunings[0]!,
        targets: [{ label: 'Middle', midi: 45 }, { label: 'Low', midi: 40 }],
      }],
    };
    state = appReducer(state, { type: 'custom-save', instrument: edited });
    expect(state.customInstruments[0]?.tunings[0]?.targets.map((target) => target.midi)).toEqual([45, 40]);
    expect(state.tuner.targetIndex).toBe(1);
    expect(state.practicePresets[0]?.tuner.targetIndex).toBe(1);
    expect(state.favoriteInstrumentIds).toContain(instrument.id);

    state = appReducer(state, { type: 'custom-delete', id: instrument.id });
    expect(state.customInstruments).toEqual([]);
    expect(state.favoriteInstrumentIds).not.toContain(instrument.id);
    expect(state.tuner).toMatchObject({ instrumentId: 'chromatic', tuningId: '', targetIndex: 0 });
    expect(state.practicePresets[0]?.tuner.instrumentId).toBe('chromatic');
  });
});
