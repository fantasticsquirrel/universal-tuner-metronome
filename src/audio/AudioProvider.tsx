import * as Haptics from 'expo-haptics';
import { useAudioPlayer } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { midiToFrequency } from '@/lib/pitch';
import { pulseDurationMs, trainedBpm } from '@/lib/metronome';
import { useApp } from '@/store/AppProvider';

interface AudioContextValue {
  running: boolean;
  currentBeat: number;
  currentSubdivision: number;
  toggleMetronome: () => void;
  stopMetronome: () => void;
  tonePlaying: boolean;
  toggleTone: (midi?: number) => void;
  stopTone: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);
const KEEP_AWAKE_TAG = 'tunera-metronome';

export function AudioProvider({ children }: React.PropsWithChildren) {
  const { state, updateMetronome } = useApp();
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [currentSubdivision, setCurrentSubdivision] = useState(0);
  const [tonePlaying, setTonePlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextPulseRef = useRef(0);
  const pulseRef = useRef(0);
  const barsRef = useRef(0);
  const settingsRef = useRef(state.metronome);
  settingsRef.current = state.metronome;

  const accentPlayer = useAudioPlayer(require('../../assets/audio/click-accent.wav')); // eslint-disable-line @typescript-eslint/no-require-imports
  const clickPlayer = useAudioPlayer(require('../../assets/audio/click.wav')); // eslint-disable-line @typescript-eslint/no-require-imports
  const lowTonePlayer = useAudioPlayer(require('../../assets/audio/tone-a2.wav')); // eslint-disable-line @typescript-eslint/no-require-imports
  const highTonePlayer = useAudioPlayer(require('../../assets/audio/tone-a4.wav')); // eslint-disable-line @typescript-eslint/no-require-imports

  const playClick = useCallback((accented: boolean, volume = 1) => {
    const player = accented ? accentPlayer : clickPlayer;
    player.volume = volume;
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [accentPlayer, clickPlayer]);

  const tickRef = useRef<() => void>(() => undefined);
  tickRef.current = () => {
    if (!running) return;
    const settings = settingsRef.current;
    const pulsesPerBar = settings.beats * settings.subdivision;
    const pulseInBar = pulseRef.current % pulsesPerBar;
    const beat = Math.floor(pulseInBar / settings.subdivision);
    const subdivision = pulseInBar % settings.subdivision;
    setCurrentBeat(beat);
    setCurrentSubdivision(subdivision);

    if (subdivision === 0) {
      const accent = settings.accents[beat] ?? 'normal';
      if (accent !== 'mute') playClick(accent === 'accent', accent === 'accent' ? 1 : 0.72);
      if (settings.haptics) void Haptics.impactAsync(accent === 'accent' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    } else {
      playClick(false, 0.28);
    }

    pulseRef.current += 1;
    if (pulseRef.current % pulsesPerBar === 0) {
      barsRef.current += 1;
      const nextBpm = trainedBpm(settings.bpm, barsRef.current, settings.trainer);
      if (nextBpm !== settings.bpm) {
        settingsRef.current = { ...settings, bpm: nextBpm };
        updateMetronome({ bpm: nextBpm });
      }
    }
    nextPulseRef.current += pulseDurationMs(settingsRef.current.bpm, settings.denominator, settings.subdivision);
    timerRef.current = setTimeout(() => tickRef.current(), Math.max(0, nextPulseRef.current - performance.now()));
  };

  const stopMetronome = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    setCurrentBeat(-1);
    pulseRef.current = 0;
    barsRef.current = 0;
    void deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

  const toggleMetronome = useCallback(() => {
    if (running) {
      stopMetronome();
      void Haptics.selectionAsync();
      return;
    }
    pulseRef.current = 0;
    barsRef.current = 0;
    nextPulseRef.current = performance.now();
    setRunning(true);
    if (settingsRef.current.keepAwake) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [running, stopMetronome]);

  useEffect(() => {
    if (running && !timerRef.current) tickRef.current();
  }, [running]);

  useEffect(() => () => stopMetronome(), [stopMetronome]);

  const stopTone = useCallback(() => {
    lowTonePlayer.pause();
    highTonePlayer.pause();
    setTonePlaying(false);
  }, [highTonePlayer, lowTonePlayer]);

  const toggleTone = useCallback((midi = state.tuner.referenceToneMidi) => {
    if (tonePlaying) {
      stopTone();
      return;
    }
    const frequency = midiToFrequency(midi, state.tuner.a4);
    const useLow = frequency < 260;
    const player = useLow ? lowTonePlayer : highTonePlayer;
    player.shouldCorrectPitch = false;
    player.playbackRate = Math.max(0.1, Math.min(2, frequency / (useLow ? 110 : 440)));
    player.volume = state.tuner.referenceToneVolume;
    player.loop = true;
    void player.seekTo(0).then(() => player.play()).then(() => setTonePlaying(true)).catch(() => setTonePlaying(false));
  }, [highTonePlayer, lowTonePlayer, state.tuner.a4, state.tuner.referenceToneMidi, state.tuner.referenceToneVolume, stopTone, tonePlaying]);

  const value = useMemo(() => ({
    running, currentBeat, currentSubdivision, toggleMetronome, stopMetronome, tonePlaying, toggleTone, stopTone,
  }), [running, currentBeat, currentSubdivision, toggleMetronome, stopMetronome, tonePlaying, toggleTone, stopTone]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useRuntimeAudio(): AudioContextValue {
  const value = useContext(AudioContext);
  if (!value) throw new Error('useRuntimeAudio must be used within AudioProvider');
  return value;
}
