import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { useColorScheme } from 'react-native';

import { darkPalette, lightPalette, type Palette } from '@/theme';
import type { AppPreferences, MetronomeSettings, PersistedState, TunerSettings } from '@/types';

const STORAGE_KEY = '@tunera/settings/v1';

export const DEFAULT_STATE: PersistedState = {
  tuner: {
    instrumentId: 'chromatic',
    tuningId: '',
    targetIndex: 0,
    a4: 440,
    transposition: 0,
    transpositionLabel: 'C',
    tolerance: 3,
    autoAdvance: true,
    showDetails: true,
    referenceToneMidi: 69,
    referenceToneVolume: 0.35,
  },
  metronome: {
    bpm: 100,
    beats: 4,
    denominator: 4,
    subdivision: 1,
    accents: ['accent', 'normal', 'normal', 'normal'],
    haptics: false,
    keepAwake: true,
    trainer: { enabled: false, increment: 2, everyBars: 4, targetBpm: 140 },
  },
  preferences: { theme: 'system', highContrast: false, reduceMotion: false },
  favoriteInstrumentIds: ['guitar-6', 'violin'],
};

type Action =
  | { type: 'hydrate'; state: PersistedState }
  | { type: 'tuner'; patch: Partial<TunerSettings> }
  | { type: 'metronome'; patch: Partial<MetronomeSettings> }
  | { type: 'preferences'; patch: Partial<AppPreferences> }
  | { type: 'favorite'; id: string }
  | { type: 'reset' };

function mergeState(input: Partial<PersistedState>): PersistedState {
  return {
    ...DEFAULT_STATE,
    ...input,
    tuner: { ...DEFAULT_STATE.tuner, ...input.tuner },
    metronome: {
      ...DEFAULT_STATE.metronome,
      ...input.metronome,
      trainer: { ...DEFAULT_STATE.metronome.trainer, ...input.metronome?.trainer },
    },
    preferences: { ...DEFAULT_STATE.preferences, ...input.preferences },
  };
}

function reducer(state: PersistedState, action: Action): PersistedState {
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
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: React.PropsWithChildren) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [hydrated, setHydrated] = React.useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) dispatch({ type: 'hydrate', state: mergeState(JSON.parse(stored) as Partial<PersistedState>) });
      })
      .catch(() => undefined)
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const handle = setTimeout(() => void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)), 150);
    return () => clearTimeout(handle);
  }, [hydrated, state]);

  const isDark = state.preferences.theme === 'dark'
    || (state.preferences.theme === 'system' && systemScheme === 'dark');
  const palette = isDark ? darkPalette : lightPalette;

  const updateTuner = useCallback((patch: Partial<TunerSettings>) => dispatch({ type: 'tuner', patch }), []);
  const updateMetronome = useCallback((patch: Partial<MetronomeSettings>) => dispatch({ type: 'metronome', patch }), []);
  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => dispatch({ type: 'preferences', patch }), []);
  const toggleFavorite = useCallback((id: string) => dispatch({ type: 'favorite', id }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  const value = useMemo(() => ({
    state, hydrated, palette, isDark, updateTuner, updateMetronome, updatePreferences, toggleFavorite, reset,
  }), [state, hydrated, palette, isDark, updateTuner, updateMetronome, updatePreferences, toggleFavorite, reset]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within AppProvider');
  return value;
}
