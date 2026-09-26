import { useAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { pulseDurationMs, trainedBpm } from '@/lib/metronome';
import {
  getMetronomeFrameLayout,
  metronomeLoopCacheKey,
  renderMetronomeWav,
  type MetronomeLoopSettings,
} from '@/lib/metronomeWav';
import { midiToFrequency } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';
import type { MetronomeSettings } from '@/types';

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

interface PreparedLoopSource {
  uri: string;
  release: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);
const KEEP_AWAKE_TAG = 'tunera-metronome';
const PLAYER_LOAD_TIMEOUT_MS = 10_000;

function metronomeAudioSettings(settings: MetronomeSettings): MetronomeLoopSettings {
  return {
    bpm: settings.bpm,
    beats: settings.beats,
    denominator: settings.denominator,
    subdivision: settings.subdivision,
    accents: [...settings.accents],
  };
}

function prepareLoopSource(settings: MetronomeLoopSettings): PreparedLoopSource {
  if (Platform.OS === 'web') {
    const rendered = renderMetronomeWav(settings);
    const uri = URL.createObjectURL(new Blob([rendered.bytes], { type: 'audio/wav' }));
    return { uri, release: () => URL.revokeObjectURL(uri) };
  }

  const key = metronomeLoopCacheKey(settings);
  const file = new File(Paths.cache, `tunera-metronome-${key}.wav`);
  const expectedSize = 44 + getMetronomeFrameLayout(settings).frameCount * 2;
  const cachedSize = file.exists ? file.info().size : undefined;
  if (!file.exists || cachedSize !== expectedSize) {
    const rendered = renderMetronomeWav(settings);
    file.create({ overwrite: true });
    file.write(rendered.bytes);
  }
  return { uri: file.uri, release: () => undefined };
}

function replaceAndWaitUntilLoaded(
  player: AudioPlayer,
  uri: string,
  isCurrent: () => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { remove: () => void } | null = null;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription?.remove();
      if (error) reject(error);
      else resolve();
    };
    const timeout = setTimeout(
      () => finish(new Error('Timed out while loading the generated metronome loop.')),
      PLAYER_LOAD_TIMEOUT_MS,
    );

    subscription = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
      if (!isCurrent()) finish(new Error('Metronome loop load was superseded.'));
      else if (status.error) finish(new Error(status.error));
      else if (status.isLoaded) finish();
    });

    player.replace({ uri });
  });
}

export function AudioProvider({ children }: React.PropsWithChildren) {
  const { state, updateMetronome } = useApp();
  const [running, setRunning] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);
  const [currentSubdivision, setCurrentSubdivision] = useState(0);
  const [tonePlaying, setTonePlaying] = useState(false);

  const visualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualTickRef = useRef<() => void>(() => undefined);
  const resetVisualClockRef = useRef<(settings: MetronomeSettings, anchorMs: number) => void>(() => undefined);
  const configureLoopRef = useRef<(settings: MetronomeSettings) => void>(() => undefined);
  const desiredRunningRef = useRef(false);
  const runningRef = useRef(false);
  const settingsRef = useRef(state.metronome);
  const requestRef = useRef(0);
  const lastRequestedKeyRef = useRef<string | null>(null);
  const activePlayerRef = useRef<-1 | 0 | 1>(-1);
  const playerSourceCleanupRef = useRef<[() => void, () => void]>([
    () => undefined,
    () => undefined,
  ]);
  const fallbackModeRef = useRef(false);
  const clockAnchorRef = useRef(0);
  const clockSettingsRef = useRef(state.metronome);
  const clockLastPulseRef = useRef(-1);
  const clockLastBarRef = useRef(0);
  const completedBarsRef = useRef(0);
  settingsRef.current = state.metronome;

  const metronomePlayerA = useAudioPlayer(null, { updateInterval: 100 });
  const metronomePlayerB = useAudioPlayer(null, { updateInterval: 100 });
  const accentPlayer = useAudioPlayer(require('../../assets/audio/click-accent.wav'));
  const clickPlayer = useAudioPlayer(require('../../assets/audio/click.wav'));
  const lowTonePlayer = useAudioPlayer(require('../../assets/audio/tone-a2.wav'));
  const highTonePlayer = useAudioPlayer(require('../../assets/audio/tone-a4.wav'));
  const metronomePlayersRef = useRef<[AudioPlayer, AudioPlayer]>([metronomePlayerA, metronomePlayerB]);
  metronomePlayersRef.current = [metronomePlayerA, metronomePlayerB];

  const playClick = useCallback((accented: boolean, volume = 1) => {
    const player = accented ? accentPlayer : clickPlayer;
    player.volume = volume;
    void player.seekTo(0).then(() => player.play()).catch(() => undefined);
  }, [accentPlayer, clickPlayer]);

  const startFallback = useCallback((settings: MetronomeSettings, error: unknown) => {
    if (!desiredRunningRef.current) return;
    requestRef.current += 1;
    activePlayerRef.current = -1;
    fallbackModeRef.current = true;
    lastRequestedKeyRef.current = null;
    for (const player of metronomePlayersRef.current) player.pause();
    resetVisualClockRef.current(settings, performance.now());
    // The generated native loop is the normal path; this preserves basic operation on unsupported devices.
    console.warn('Native metronome loop unavailable; using best-effort click fallback.', error);
  }, []);

  visualTickRef.current = () => {
    if (!desiredRunningRef.current) return;

    const clockSettings = clockSettingsRef.current;
    const pulsesPerBar = Math.max(1, clockSettings.beats * clockSettings.subdivision);
    const pulseMs = pulseDurationMs(
      clockSettings.bpm,
      clockSettings.denominator,
      clockSettings.subdivision,
    );
    const now = performance.now();
    const elapsed = Math.max(0, now - clockAnchorRef.current);
    const absolutePulse = Math.floor(elapsed / pulseMs);
    const bar = Math.floor(absolutePulse / pulsesPerBar);

    if (bar > clockLastBarRef.current) {
      const previousCompletedBars = completedBarsRef.current;
      completedBarsRef.current += bar - clockLastBarRef.current;
      clockLastBarRef.current = bar;

      const liveSettings = settingsRef.current;
      if (liveSettings.bpm === clockSettings.bpm) {
        let nextBpm = liveSettings.bpm;
        for (let completed = previousCompletedBars + 1; completed <= completedBarsRef.current; completed += 1) {
          nextBpm = trainedBpm(nextBpm, completed, liveSettings.trainer);
        }
        if (nextBpm !== liveSettings.bpm) {
          const nextSettings = { ...liveSettings, bpm: nextBpm };
          settingsRef.current = nextSettings;
          updateMetronome({ bpm: nextBpm });
          configureLoopRef.current(nextSettings);
        }
      }
    }

    if (absolutePulse !== clockLastPulseRef.current) {
      clockLastPulseRef.current = absolutePulse;
      const pulseInBar = absolutePulse % pulsesPerBar;
      const beat = Math.floor(pulseInBar / clockSettings.subdivision);
      const subdivision = pulseInBar % clockSettings.subdivision;
      const accent = clockSettings.accents[beat] ?? (beat === 0 ? 'accent' : 'normal');
      setCurrentBeat(beat);
      setCurrentSubdivision(subdivision);

      if (fallbackModeRef.current) {
        if (subdivision === 0) {
          if (accent !== 'mute') playClick(accent === 'accent', accent === 'accent' ? 1 : 0.72);
        } else {
          playClick(false, 0.28);
        }
      }

      if (subdivision === 0 && settingsRef.current.haptics) {
        void Haptics.impactAsync(
          accent === 'accent'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light,
        );
      }
    }

    const nextBoundary = clockAnchorRef.current + (absolutePulse + 1) * pulseMs;
    visualTimerRef.current = setTimeout(
      () => visualTickRef.current(),
      Math.max(1, nextBoundary - performance.now()),
    );
  };

  resetVisualClockRef.current = (settings, anchorMs) => {
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    clockSettingsRef.current = settings;
    clockAnchorRef.current = anchorMs;
    clockLastPulseRef.current = -1;
    clockLastBarRef.current = 0;
    visualTickRef.current();
  };

  configureLoopRef.current = (settings) => {
    if (!desiredRunningRef.current) return;
    const audioSettings = metronomeAudioSettings(settings);
    const key = metronomeLoopCacheKey(audioSettings);
    if (lastRequestedKeyRef.current === key) return;
    lastRequestedKeyRef.current = key;
    const request = ++requestRef.current;

    void (async () => {
      // Let the pressed state paint and give a same-frame stop action a chance to cancel the render.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!desiredRunningRef.current || request !== requestRef.current) return;

      let source: PreparedLoopSource | null = null;
      try {
        source = prepareLoopSource(audioSettings);
        if (!desiredRunningRef.current || request !== requestRef.current) {
          source.release();
          return;
        }

        const targetIndex: 0 | 1 = activePlayerRef.current === 0 ? 1 : 0;
        const targetPlayer = metronomePlayersRef.current[targetIndex];
        targetPlayer.pause();
        targetPlayer.loop = true;
        targetPlayer.volume = 1;
        targetPlayer.shouldCorrectPitch = false;

        await replaceAndWaitUntilLoaded(
          targetPlayer,
          source.uri,
          () => desiredRunningRef.current && request === requestRef.current,
        );
        if (!desiredRunningRef.current || request !== requestRef.current) {
          source.release();
          return;
        }

        await targetPlayer.seekTo(0);
        if (!desiredRunningRef.current || request !== requestRef.current) {
          source.release();
          return;
        }

        const oldIndex = activePlayerRef.current;
        if (oldIndex !== -1 && oldIndex !== targetIndex) {
          metronomePlayersRef.current[oldIndex].pause();
        }
        playerSourceCleanupRef.current[targetIndex]();
        playerSourceCleanupRef.current[targetIndex] = source.release;
        source = null;
        activePlayerRef.current = targetIndex;
        fallbackModeRef.current = false;
        targetPlayer.play();
        resetVisualClockRef.current(settings, performance.now());
      } catch (error) {
        source?.release();
        if (!desiredRunningRef.current || request !== requestRef.current) return;
        if (activePlayerRef.current === -1) startFallback(settings, error);
        else {
          lastRequestedKeyRef.current = null;
          console.warn('Could not apply the new metronome loop; keeping the current loop.', error);
        }
      }
    })();
  };

  const stopMetronome = useCallback(() => {
    desiredRunningRef.current = false;
    runningRef.current = false;
    requestRef.current += 1;
    lastRequestedKeyRef.current = null;
    fallbackModeRef.current = false;
    activePlayerRef.current = -1;
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    visualTimerRef.current = null;
    for (const player of metronomePlayersRef.current) player.pause();
    setRunning(false);
    setCurrentBeat(-1);
    setCurrentSubdivision(0);
    completedBarsRef.current = 0;
    void deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

  const toggleMetronome = useCallback(() => {
    if (runningRef.current) {
      stopMetronome();
      void Haptics.selectionAsync();
      return;
    }

    desiredRunningRef.current = true;
    runningRef.current = true;
    completedBarsRef.current = 0;
    lastRequestedKeyRef.current = null;
    setRunning(true);
    configureLoopRef.current(settingsRef.current);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [stopMetronome]);

  const audioSettingsKey = metronomeLoopCacheKey(metronomeAudioSettings(state.metronome));
  useEffect(() => {
    if (running) configureLoopRef.current(settingsRef.current);
  }, [audioSettingsKey, running]);

  useEffect(() => {
    if (running && state.metronome.keepAwake) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else void deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, [running, state.metronome.keepAwake]);

  useEffect(() => {
    const subscriptions = metronomePlayersRef.current.map((player, index) => (
      player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (
          desiredRunningRef.current
          && activePlayerRef.current === index
          && status.error
        ) {
          startFallback(clockSettingsRef.current, new Error(status.error));
        }
      })
    ));
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [metronomePlayerA, metronomePlayerB, startFallback]);

  useEffect(() => () => {
    desiredRunningRef.current = false;
    requestRef.current += 1;
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    for (const player of metronomePlayersRef.current) player.pause();
    for (const release of playerSourceCleanupRef.current) release();
    void deactivateKeepAwake(KEEP_AWAKE_TAG);
  }, []);

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
