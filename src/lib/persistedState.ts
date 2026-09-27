import type {
  AccentLevel,
  AppPreferences,
  DetectorProfile,
  InstrumentPreset,
  MetronomeSettings,
  PersistedState,
  PracticePreset,
  TunerSettings,
  TuningPreset,
} from '@/types';
import { allInstruments } from '@/constants/instruments';

export const STATE_VERSION = 2 as const;
export const STORAGE_KEY = '@tunera/settings/v2';
export const LEGACY_STORAGE_KEYS = ['@tunera/settings/v1'] as const;

export const DEFAULT_TUNER: TunerSettings = {
  instrumentId: 'chromatic',
  tuningId: '',
  targetIndex: 0,
  a4: 440,
  transposition: 0,
  transpositionLabel: 'C',
  tolerance: 3,
  capo: 0,
  detune: 0,
  sensitivity: 65,
  noiseGate: 0.008,
  lockHoldMs: 700,
  autoAdvance: true,
  showDetails: true,
  referenceToneMidi: 69,
  referenceToneVolume: 0.35,
};

export const DEFAULT_METRONOME: MetronomeSettings = {
  bpm: 100,
  beats: 4,
  denominator: 4,
  subdivision: 1,
  accents: ['accent', 'normal', 'normal', 'normal'],
  haptics: false,
  keepAwake: true,
  countInBars: 0,
  practiceMinutes: 0,
  trainer: { enabled: false, increment: 2, everyBars: 4, targetBpm: 140 },
};

export const DEFAULT_STATE: PersistedState = {
  schemaVersion: STATE_VERSION,
  tuner: DEFAULT_TUNER,
  metronome: DEFAULT_METRONOME,
  preferences: { theme: 'system', highContrast: false, reduceMotion: false },
  favoriteInstrumentIds: ['guitar-6', 'violin'],
  customInstruments: [],
  practicePresets: [],
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(number(value, fallback, min, max));
}

function string(value: unknown, fallback: string, maxLength = 80): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeTuner(value: unknown): TunerSettings {
  const input = record(value);
  return {
    instrumentId: string(input.instrumentId, DEFAULT_TUNER.instrumentId),
    tuningId: typeof input.tuningId === 'string' ? input.tuningId.slice(0, 120) : DEFAULT_TUNER.tuningId,
    targetIndex: integer(input.targetIndex, DEFAULT_TUNER.targetIndex, 0, 127),
    a4: number(input.a4, DEFAULT_TUNER.a4, 390, 490),
    transposition: integer(input.transposition, DEFAULT_TUNER.transposition, -24, 24),
    transpositionLabel: string(input.transpositionLabel, DEFAULT_TUNER.transpositionLabel, 12),
    tolerance: number(input.tolerance, DEFAULT_TUNER.tolerance, 1, 20),
    capo: integer(input.capo, DEFAULT_TUNER.capo, 0, 12),
    detune: integer(input.detune, DEFAULT_TUNER.detune, -12, 0),
    sensitivity: integer(input.sensitivity, DEFAULT_TUNER.sensitivity, 0, 100),
    noiseGate: number(input.noiseGate, DEFAULT_TUNER.noiseGate, 0.001, 0.1),
    lockHoldMs: integer(input.lockHoldMs, DEFAULT_TUNER.lockHoldMs, 100, 3000),
    autoAdvance: bool(input.autoAdvance, DEFAULT_TUNER.autoAdvance),
    showDetails: bool(input.showDetails, DEFAULT_TUNER.showDetails),
    referenceToneMidi: integer(input.referenceToneMidi, DEFAULT_TUNER.referenceToneMidi, 0, 127),
    referenceToneVolume: number(input.referenceToneVolume, DEFAULT_TUNER.referenceToneVolume, 0.05, 1),
  };
}

function normalizeAccents(value: unknown, beats: number): AccentLevel[] {
  const input = Array.isArray(value) ? value : [];
  return Array.from({ length: beats }, (_, index) => {
    const accent = input[index];
    return accent === 'accent' || accent === 'normal' || accent === 'mute'
      ? accent
      : index === 0 ? 'accent' : 'normal';
  });
}

function normalizeMetronome(value: unknown): MetronomeSettings {
  const input = record(value);
  const trainer = record(input.trainer);
  const beats = integer(input.beats, DEFAULT_METRONOME.beats, 1, 32);
  const denominator = integer(input.denominator, DEFAULT_METRONOME.denominator, 2, 16);
  const subdivision = integer(input.subdivision, DEFAULT_METRONOME.subdivision, 1, 4);
  return {
    bpm: integer(input.bpm, DEFAULT_METRONOME.bpm, 20, 400),
    beats,
    denominator: denominator === 2 || denominator === 4 || denominator === 8 || denominator === 16
      ? denominator
      : DEFAULT_METRONOME.denominator,
    subdivision: subdivision === 1 || subdivision === 2 || subdivision === 3 || subdivision === 4
      ? subdivision
      : DEFAULT_METRONOME.subdivision,
    accents: normalizeAccents(input.accents, beats),
    haptics: bool(input.haptics, DEFAULT_METRONOME.haptics),
    keepAwake: bool(input.keepAwake, DEFAULT_METRONOME.keepAwake),
    countInBars: integer(input.countInBars, DEFAULT_METRONOME.countInBars, 0, 4),
    practiceMinutes: integer(input.practiceMinutes, DEFAULT_METRONOME.practiceMinutes, 0, 180),
    trainer: {
      enabled: bool(trainer.enabled, DEFAULT_METRONOME.trainer.enabled),
      increment: integer(trainer.increment, DEFAULT_METRONOME.trainer.increment, 1, 20),
      everyBars: integer(trainer.everyBars, DEFAULT_METRONOME.trainer.everyBars, 1, 32),
      targetBpm: integer(trainer.targetBpm, DEFAULT_METRONOME.trainer.targetBpm, 20, 400),
    },
  };
}

function normalizeTuning(value: unknown, fallbackId: string): TuningPreset | null {
  const input = record(value);
  const targets = Array.isArray(input.targets)
    ? input.targets.flatMap((candidate, index) => {
      const target = record(candidate);
      if (typeof target.midi !== 'number' || !Number.isFinite(target.midi)) return [];
      return [{
        label: string(target.label, String(index + 1), 16),
        midi: integer(target.midi, 60, 0, 127),
      }];
    })
    : [];
  if (targets.length === 0) return null;
  return {
    id: string(input.id, fallbackId, 120),
    name: string(input.name, 'Custom tuning'),
    targets,
  };
}

export function normalizeCustomInstrument(value: unknown, fallbackId = `custom-${Date.now()}`): InstrumentPreset | null {
  const input = record(value);
  const id = string(input.id, fallbackId, 120);
  const tunings = Array.isArray(input.tunings)
    ? input.tunings.flatMap((candidate, index) => {
      const tuning = normalizeTuning(candidate, `${id}-tuning-${index + 1}`);
      return tuning ? [tuning] : [];
    })
    : [];
  if (tunings.length === 0) return null;
  const profile: DetectorProfile = input.detectorProfile === 'low' || input.detectorProfile === 'high'
    ? input.detectorProfile
    : 'general';
  return {
    id,
    family: string(input.family, 'Custom'),
    name: string(input.name, 'Custom instrument'),
    variant: typeof input.variant === 'string' && input.variant.trim() ? input.variant.trim().slice(0, 80) : undefined,
    transpositionSemitones: integer(input.transpositionSemitones, 0, -24, 24),
    detectorProfile: profile,
    tunings,
    aliases: Array.isArray(input.aliases)
      ? input.aliases.filter((alias): alias is string => typeof alias === 'string').map((alias) => alias.slice(0, 80))
      : [],
  };
}

function normalizePreferences(value: unknown): AppPreferences {
  const input = record(value);
  const theme = input.theme === 'light' || input.theme === 'dark' ? input.theme : 'system';
  return {
    theme,
    highContrast: bool(input.highContrast, DEFAULT_STATE.preferences.highContrast),
    reduceMotion: bool(input.reduceMotion, DEFAULT_STATE.preferences.reduceMotion),
  };
}

function normalizePracticePreset(value: unknown, index: number): PracticePreset | null {
  const input = record(value);
  if (typeof input.name !== 'string' || !input.name.trim()) return null;
  return {
    id: string(input.id, `practice-${index + 1}`, 120),
    name: string(input.name, `Practice ${index + 1}`),
    tuner: normalizeTuner(input.tuner),
    metronome: normalizeMetronome(input.metronome),
  };
}

export function reconcileTunerForInstrument(
  tuner: TunerSettings,
  instrument: InstrumentPreset,
): TunerSettings {
  const tuning = instrument.tunings.find((item) => item.id === tuner.tuningId)
    ?? instrument.tunings[0];
  if (!tuning) return { ...tuner, tuningId: '', targetIndex: 0 };
  return {
    ...tuner,
    tuningId: tuning.id,
    targetIndex: Math.min(tuner.targetIndex, tuning.targets.length - 1),
  };
}

function reconcileTunerSelection(
  tuner: TunerSettings,
  customInstruments: InstrumentPreset[],
): TunerSettings {
  const instruments = allInstruments(customInstruments);
  const instrument = instruments.find((item) => item.id === tuner.instrumentId);
  if (!instrument) {
    return {
      ...tuner,
      instrumentId: 'chromatic',
      tuningId: '',
      targetIndex: 0,
      transposition: 0,
      transpositionLabel: 'C',
      capo: 0,
      detune: 0,
    };
  }
  return reconcileTunerForInstrument(tuner, instrument);
}

export function migratePersistedState(value: unknown): PersistedState {
  const input = record(value);
  const customInstruments = Array.isArray(input.customInstruments)
    ? input.customInstruments.flatMap((candidate, index) => {
      const instrument = normalizeCustomInstrument(candidate, `custom-${index + 1}`);
      return instrument ? [instrument] : [];
    })
    : [];
  const practicePresets = Array.isArray(input.practicePresets)
    ? input.practicePresets.flatMap((candidate, index) => {
      const preset = normalizePracticePreset(candidate, index);
      return preset ? [preset] : [];
    })
    : [];
  const tuner = reconcileTunerSelection(normalizeTuner(input.tuner), customInstruments);
  return {
    schemaVersion: STATE_VERSION,
    tuner,
    metronome: normalizeMetronome(input.metronome),
    preferences: normalizePreferences(input.preferences),
    favoriteInstrumentIds: Array.isArray(input.favoriteInstrumentIds)
      ? [...new Set(input.favoriteInstrumentIds.filter((id): id is string => typeof id === 'string'))]
      : [...DEFAULT_STATE.favoriteInstrumentIds],
    customInstruments,
    practicePresets: practicePresets.map((preset) => ({
      ...preset,
      tuner: reconcileTunerSelection(preset.tuner, customInstruments),
    })),
  };
}

export function decodePersistedState(serialized: string | null): PersistedState | null {
  if (!serialized) return null;
  try {
    return migratePersistedState(JSON.parse(serialized));
  } catch {
    return null;
  }
}

export function restorePracticePreset(state: PersistedState, preset: PracticePreset): PersistedState {
  return {
    ...state,
    tuner: { ...preset.tuner },
    metronome: {
      ...preset.metronome,
      accents: [...preset.metronome.accents],
      trainer: { ...preset.metronome.trainer },
    },
  };
}
