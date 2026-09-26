export type ThemePreference = 'system' | 'light' | 'dark';
export type AccentLevel = 'accent' | 'normal' | 'mute';
export type PermissionState = 'checking' | 'undetermined' | 'granted' | 'denied' | 'error';
export type DetectorProfile = 'low' | 'general' | 'high';

export interface TuningTarget {
  label: string;
  midi: number;
}

export interface TuningPreset {
  id: string;
  name: string;
  targets: TuningTarget[];
}

export interface InstrumentPreset {
  id: string;
  family: string;
  name: string;
  variant?: string;
  transpositionSemitones: number;
  detectorProfile: DetectorProfile;
  tunings: TuningPreset[];
  aliases: string[];
}

export interface TunerSettings {
  instrumentId: string;
  tuningId: string;
  targetIndex: number;
  a4: number;
  transposition: number;
  transpositionLabel: string;
  tolerance: number;
  autoAdvance: boolean;
  showDetails: boolean;
  referenceToneMidi: number;
  referenceToneVolume: number;
}

export interface SpeedTrainerSettings {
  enabled: boolean;
  increment: number;
  everyBars: number;
  targetBpm: number;
}

export interface MetronomeSettings {
  bpm: number;
  beats: number;
  denominator: 2 | 4 | 8 | 16;
  subdivision: 1 | 2 | 3 | 4;
  accents: AccentLevel[];
  haptics: boolean;
  keepAwake: boolean;
  trainer: SpeedTrainerSettings;
}

export interface AppPreferences {
  theme: ThemePreference;
  highContrast: boolean;
  reduceMotion: boolean;
}

export interface PersistedState {
  tuner: TunerSettings;
  metronome: MetronomeSettings;
  preferences: AppPreferences;
  favoriteInstrumentIds: string[];
}

export interface PitchSnapshot {
  frequency: number;
  confidence: number;
  rms: number;
  clipping: boolean;
  timestamp: number;
}
