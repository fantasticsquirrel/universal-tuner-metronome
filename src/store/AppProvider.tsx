import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { useColorScheme } from 'react-native';

import {
  decodePersistedState,
  DEFAULT_STATE,
  LEGACY_STORAGE_KEYS,
  migratePersistedState,
  reconcileTunerForInstrument,
  restorePracticePreset,
  STORAGE_KEY,
} from '@/lib/persistedState';
import { darkPalette, lightPalette, type Palette } from '@/theme';
import type {
  AppPreferences,
  InstrumentPreset,
  MetronomeSettings,
  PersistedState,
  PracticePreset,
  TunerSettings,
} from '@/types';

export { DEFAULT_STATE } from '@/lib/persistedState';

type Action =
  | { type: 'hydrate'; state: PersistedState }
  | { type: 'tuner'; patch: Partial<TunerSettings> }
  | { type: 'metronome'; patch: Partial<MetronomeSettings> }
  | { type: 'preferences'; patch: Partial<AppPreferences> }
  | { type: 'favorite'; id: string }
  | { type: 'practice-create'; preset: PracticePreset }
  | { type: 'practice-apply'; id: string }
  | { type: 'practice-rename'; id: string; name: string }
  | { type: 'practice-delete'; id: string }
  | { type: 'custom-save'; instrument: InstrumentPreset }
  | { type: 'custom-delete'; id: string }
  | { type: 'reset' };

export function appReducer(state: PersistedState, action: Action): PersistedState {
  switch (action.type) {
    case 'hydrate': return action.state;
    case 'tuner': return { ...state, tuner: { ...state.tuner, ...action.patch } };
    case 'metronome': return { ...state, metronome: { ...state.metronome, ...action.patch } };
    case 'preferences': return { ...state, preferences: { ...state.preferences, ...action.patch } };
    case 'favorite': {
      const favoriteInstrumentIds = state.favoriteInstrumentIds.includes(action.id)
        ? state.favoriteInstrumentIds.filter((id) => id !== action.id)
        : [...state.favoriteInstrumentIds, action.id];
      return { ...state, favoriteInstrumentIds };
    }
    case 'practice-create':
      return { ...state, practicePresets: [...state.practicePresets, action.preset] };
    case 'practice-apply': {
      const preset = state.practicePresets.find((item) => item.id === action.id);
      return preset ? restorePracticePreset(state, preset) : state;
    }
    case 'practice-rename':
      return {
        ...state,
        practicePresets: state.practicePresets.map((preset) => (
          preset.id === action.id ? { ...preset, name: action.name } : preset
        )),
      };
    case 'practice-delete':
      return { ...state, practicePresets: state.practicePresets.filter((preset) => preset.id !== action.id) };
    case 'custom-save': {
      const existing = state.customInstruments.some((item) => item.id === action.instrument.id);
      return {
        ...state,
        tuner: state.tuner.instrumentId === action.instrument.id
          ? reconcileTunerForInstrument(state.tuner, action.instrument)
          : state.tuner,
        customInstruments: existing
          ? state.customInstruments.map((item) => item.id === action.instrument.id ? action.instrument : item)
          : [...state.customInstruments, action.instrument],
        practicePresets: state.practicePresets.map((preset) => (
          preset.tuner.instrumentId === action.instrument.id
            ? { ...preset, tuner: reconcileTunerForInstrument(preset.tuner, action.instrument) }
            : preset
        )),
      };
    }
    case 'custom-delete':
      return {
        ...state,
        tuner: state.tuner.instrumentId === action.id
          ? { ...state.tuner, instrumentId: 'chromatic', tuningId: '', targetIndex: 0, capo: 0, detune: 0 }
          : state.tuner,
        customInstruments: state.customInstruments.filter((item) => item.id !== action.id),
        favoriteInstrumentIds: state.favoriteInstrumentIds.filter((id) => id !== action.id),
        practicePresets: state.practicePresets.map((preset) => preset.tuner.instrumentId === action.id
          ? { ...preset, tuner: { ...preset.tuner, instrumentId: 'chromatic', tuningId: '', targetIndex: 0, capo: 0, detune: 0 } }
          : preset),
      };
    case 'reset': return DEFAULT_STATE;
  }
}

interface AppContextValue {
  state: PersistedState;
  hydrated: boolean;
  palette: Palette;
  isDark: boolean;
  updateTuner: (patch: Partial<TunerSettings>) => void;
  updateMetronome: (patch: Partial<MetronomeSettings>) => void;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
  toggleFavorite: (id: string) => void;
  createPracticePreset: (name: string) => void;
  applyPracticePreset: (id: string) => void;
  renamePracticePreset: (id: string, name: string) => void;
  deletePracticePreset: (id: string) => void;
  saveCustomInstrument: (instrument: InstrumentPreset) => void;
  deleteCustomInstrument: (id: string) => void;
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AppProvider({ children }: React.PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, DEFAULT_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    void (async () => {
      try {
        let decoded = decodePersistedState(await AsyncStorage.getItem(STORAGE_KEY));
        if (!decoded) {
          for (const key of LEGACY_STORAGE_KEYS) {
            decoded = decodePersistedState(await AsyncStorage.getItem(key));
            if (decoded) break;
          }
        }
        if (decoded) dispatch({ type: 'hydrate', state: decoded });
      } catch {
        // A storage failure should not block the offline app from opening with defaults.
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => {
      const normalized = migratePersistedState(state);
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)).catch(() => undefined);
    }, 150);
    return () => clearTimeout(handle);
  }, [hydrated, state]);

  const isDark = state.preferences.theme === 'dark'
    || (state.preferences.theme === 'system' && systemScheme === 'dark');
  const palette = isDark ? darkPalette : lightPalette;

  const updateTuner = useCallback((patch: Partial<TunerSettings>) => dispatch({ type: 'tuner', patch }), []);
  const updateMetronome = useCallback((patch: Partial<MetronomeSettings>) => dispatch({ type: 'metronome', patch }), []);
  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => dispatch({ type: 'preferences', patch }), []);
  const toggleFavorite = useCallback((id: string) => dispatch({ type: 'favorite', id }), []);
  const createPracticePreset = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({
      type: 'practice-create',
      preset: {
        id: localId('practice'),
        name: trimmed.slice(0, 80),
        tuner: { ...state.tuner },
        metronome: {
          ...state.metronome,
          trainer: { ...state.metronome.trainer },
          accents: [...state.metronome.accents],
        },
      },
    });
  }, [state.metronome, state.tuner]);
  const applyPracticePreset = useCallback((id: string) => dispatch({ type: 'practice-apply', id }), []);
  const renamePracticePreset = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (trimmed) dispatch({ type: 'practice-rename', id, name: trimmed.slice(0, 80) });
  }, []);
  const deletePracticePreset = useCallback((id: string) => dispatch({ type: 'practice-delete', id }), []);
  const saveCustomInstrument = useCallback((instrument: InstrumentPreset) => dispatch({ type: 'custom-save', instrument }), []);
  const deleteCustomInstrument = useCallback((id: string) => dispatch({ type: 'custom-delete', id }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const value = useMemo(() => ({
    state,
    hydrated,
    palette,
    isDark,
    updateTuner,
    updateMetronome,
    updatePreferences,
    toggleFavorite,
    createPracticePreset,
    applyPracticePreset,
    renamePracticePreset,
    deletePracticePreset,
    saveCustomInstrument,
    deleteCustomInstrument,
    reset,
  }), [
    state,
    hydrated,
    palette,
    isDark,
    updateTuner,
    updateMetronome,
    updatePreferences,
    toggleFavorite,
    createPracticePreset,
    applyPracticePreset,
    renamePracticePreset,
    deletePracticePreset,
    saveCustomInstrument,
    deleteCustomInstrument,
    reset,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
