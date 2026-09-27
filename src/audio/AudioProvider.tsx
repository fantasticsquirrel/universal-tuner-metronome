import { setAudioModeAsync, useAudioPlayer, type AudioPlayer, type AudioStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync } from 'expo-keep-awake';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { pulseDurationMs, trainedBpm } from '@/lib/metronome';
import { practiceClock } from '@/lib/practice';
import {
  getMetronomeFrameLayout,
  metronomeLoopCacheKey,
  renderMetronomeWav,
  type MetronomeLoopSettings,
} from '@/lib/metronomeWav';
import { midiToFrequency } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';
import type { MetronomeSettings } from '@/types';
import { deactivateKeepAwakeIfActive } from './keepAwake';
import { startLoopingPlayback } from './playerPlayback';

interface AudioContextValue {
  running: boolean;
  currentBeat: number;
  currentSubdivision: number;
  countInBarsRemaining: number;
  practiceElapsedSeconds: number;
  practiceSecondsRemaining: number | null;
  toggleMetronome: () => void;
  stopMetronome: () => void;
  tonePlaying: boolean;
  toneError: string | null;
  toggleTone: (midi?: number) => void;
  retuneTone: (midi: number) => void;
  stopTone: () => void;
}

interface PreparedLoopSource {
  uri: string;
  release: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);
const KEEP_AWAKE_TAG = 'tunera-metronome';
const PLAYER_LOAD_TIMEOUT_MS = 10_000;

function safePause(player: AudioPlayer): void {
  try {
    player.pause();
  } catch (error) {
    console.warn('Could not pause an audio player cleanly.', error);
  }
}

function referenceToneError(error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : '';
  return detail
    ? `Reference tone could not be played: ${detail}`
    : 'Reference tone could not be played. Try again.';
}

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
  const [countInBarsRemaining, setCountInBarsRemaining] = useState(0);
  const [practiceElapsedSeconds, setPracticeElapsedSeconds] = useState(0);
  const [practiceSecondsRemaining, setPracticeSecondsRemaining] = useState<number | null>(null);
  const [tonePlaying, setTonePlaying] = useState(false);
  const [toneError, setToneError] = useState<string | null>(null);

  const visualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visualTickRef = useRef<() => void>(() => undefined);
  const stopMetronomeRef = useRef<() => void>(() => undefined);
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
  const countInRemainingRef = useRef(0);
  const practiceStartedAtRef = useRef<number | null>(null);
  const sessionClockStartedRef = useRef(false);
  const audioSessionPromiseRef = useRef<Promise<void> | null>(null);
  const toneRequestRef = useRef(0);
  const toneDesiredRef = useRef(false);
  const activeTonePlayerRef = useRef<AudioPlayer | null>(null);
  settingsRef.current = state.metronome;

  const metronomePlayerA = useAudioPlayer(null, { updateInterval: 100 });
  const metronomePlayerB = useAudioPlayer(null, { updateInterval: 100 });
  const accentPlayer = useAudioPlayer(require('../../assets/audio/click-accent.wav'));
  const clickPlayer = useAudioPlayer(require('../../assets/audio/click.wav'));
  const lowTonePlayer = useAudioPlayer(require('../../assets/audio/tone-a2.wav'), { updateInterval: 100 });
  const highTonePlayer = useAudioPlayer(require('../../assets/audio/tone-a4.wav'), { updateInterval: 100 });
  const metronomePlayersRef = useRef<[AudioPlayer, AudioPlayer]>([metronomePlayerA, metronomePlayerB]);
  metronomePlayersRef.current = [metronomePlayerA, metronomePlayerB];

  const ensureAudioSession = useCallback((): Promise<void> => {
    if (audioSessionPromiseRef.current) return audioSessionPromiseRef.current;
    const request = setAudioModeAsync({
      allowsRecording: true,
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
      allowsBackgroundRecording: false,
    }).catch((error) => {
      if (audioSessionPromiseRef.current === request) audioSessionPromiseRef.current = null;
      throw error;
    });
    audioSessionPromiseRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    void ensureAudioSession().catch((error) => {
      console.warn('Could not configure the shared recording/playback audio session.', error);
    });
  }, [ensureAudioSession]);

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
      const previousBar = clockLastBarRef.current;
      const crossedBars = bar - clockLastBarRef.current;
      clockLastBarRef.current = bar;

      const countInBarsCrossed = Math.min(countInRemainingRef.current, crossedBars);
      countInRemainingRef.current -= countInBarsCrossed;
      setCountInBarsRemaining(countInRemainingRef.current);
      if (countInRemainingRef.current === 0 && practiceStartedAtRef.current === null) {
        practiceStartedAtRef.current = clockAnchorRef.current
          + (previousBar + countInBarsCrossed) * pulsesPerBar * pulseMs;
        setPracticeElapsedSeconds(0);
        setPracticeSecondsRemaining(
          settingsRef.current.practiceMinutes > 0 ? settingsRef.current.practiceMinutes * 60 : null,
        );
      }

      const practiceBarsCrossed = crossedBars - countInBarsCrossed;
      const previousCompletedBars = completedBarsRef.current;
      completedBarsRef.current += practiceBarsCrossed;

      const liveSettings = settingsRef.current;
      if (practiceBarsCrossed > 0 && liveSettings.bpm === clockSettings.bpm) {
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

    let practiceTimerRemainingMs: number | null = null;
    if (practiceStartedAtRef.current !== null) {
      const practiceElapsedMs = Math.max(0, now - practiceStartedAtRef.current);
      const clock = practiceClock(
        practiceElapsedMs,
        1,
        0,
        settingsRef.current.practiceMinutes,
      );
      setPracticeElapsedSeconds(clock.practiceElapsedSeconds);
      setPracticeSecondsRemaining(clock.practiceSecondsRemaining);
      if (clock.finished) {
        stopMetronomeRef.current();
        return;
      }
      if (settingsRef.current.practiceMinutes > 0) {
        practiceTimerRemainingMs = settingsRef.current.practiceMinutes * 60_000 - practiceElapsedMs;
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
    const nextPulseDelay = Math.max(1, nextBoundary - performance.now());
    visualTimerRef.current = setTimeout(
      () => visualTickRef.current(),
      practiceTimerRemainingMs === null
        ? nextPulseDelay
        : Math.max(1, Math.min(nextPulseDelay, practiceTimerRemainingMs)),
    );
  };

  resetVisualClockRef.current = (settings, anchorMs) => {
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    clockSettingsRef.current = settings;
    clockAnchorRef.current = anchorMs;
    clockLastPulseRef.current = -1;
    clockLastBarRef.current = 0;
    if (!sessionClockStartedRef.current) {
      sessionClockStartedRef.current = true;
      countInRemainingRef.current = settings.countInBars;
      practiceStartedAtRef.current = settings.countInBars === 0 ? anchorMs : null;
      setCountInBarsRemaining(settings.countInBars);
      setPracticeElapsedSeconds(0);
      setPracticeSecondsRemaining(settings.practiceMinutes > 0 ? settings.practiceMinutes * 60 : null);
    }
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
        await ensureAudioSession();
        if (!desiredRunningRef.current || request !== requestRef.current) return;
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
    countInRemainingRef.current = 0;
    practiceStartedAtRef.current = null;
    sessionClockStartedRef.current = false;
    setCountInBarsRemaining(settingsRef.current.countInBars);
    setPracticeElapsedSeconds(0);
    setPracticeSecondsRemaining(
      settingsRef.current.practiceMinutes > 0 ? settingsRef.current.practiceMinutes * 60 : null,
    );
    void deactivateKeepAwakeIfActive(KEEP_AWAKE_TAG);
  }, []);
  stopMetronomeRef.current = stopMetronome;

  const toggleMetronome = useCallback(() => {
    if (runningRef.current) {
      stopMetronome();
      void Haptics.selectionAsync();
      return;
    }

    desiredRunningRef.current = true;
    runningRef.current = true;
    completedBarsRef.current = 0;
    countInRemainingRef.current = settingsRef.current.countInBars;
    practiceStartedAtRef.current = null;
    sessionClockStartedRef.current = false;
    setCountInBarsRemaining(settingsRef.current.countInBars);
    setPracticeElapsedSeconds(0);
    setPracticeSecondsRemaining(
      settingsRef.current.practiceMinutes > 0 ? settingsRef.current.practiceMinutes * 60 : null,
    );
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
    if (
      !running
      || !sessionClockStartedRef.current
      || practiceStartedAtRef.current === null
    ) return;
    if (visualTimerRef.current) clearTimeout(visualTimerRef.current);
    visualTickRef.current();
  }, [running, state.metronome.practiceMinutes]);

  useEffect(() => {
    if (running && state.metronome.keepAwake) void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    else void deactivateKeepAwakeIfActive(KEEP_AWAKE_TAG);
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
    void deactivateKeepAwakeIfActive(KEEP_AWAKE_TAG);
  }, []);

  const stopTone = useCallback(() => {
    toneDesiredRef.current = false;
    toneRequestRef.current += 1;
    activeTonePlayerRef.current = null;
    safePause(lowTonePlayer);
    safePause(highTonePlayer);
    setTonePlaying(false);
  }, [highTonePlayer, lowTonePlayer]);

  const requestTonePlayback = useCallback((midi: number, request: number) => {
    setToneError(null);
    const frequency = midiToFrequency(midi, state.tuner.a4);
    const useLow = frequency < 260;
    const player = useLow ? lowTonePlayer : highTonePlayer;
    const otherPlayer = useLow ? highTonePlayer : lowTonePlayer;
    activeTonePlayerRef.current = player;

    void (async () => {
      try {
        await ensureAudioSession();
        if (!toneDesiredRef.current || request !== toneRequestRef.current) return;
        safePause(otherPlayer);
        await startLoopingPlayback(
          player,
          {
            playbackRate: Math.max(0.1, Math.min(2, frequency / (useLow ? 110 : 440))),
            volume: state.tuner.referenceToneVolume,
          },
          () => toneDesiredRef.current && request === toneRequestRef.current,
          'the reference tone',
        );
        if (!toneDesiredRef.current || request !== toneRequestRef.current) return;
        setTonePlaying(true);
      } catch (error) {
        if (request !== toneRequestRef.current) return;
        toneDesiredRef.current = false;
        activeTonePlayerRef.current = null;
        safePause(lowTonePlayer);
        safePause(highTonePlayer);
        setTonePlaying(false);
        setToneError(referenceToneError(error));
        console.warn('Reference tone playback failed.', error);
      }
    })();
  }, [ensureAudioSession, highTonePlayer, lowTonePlayer, state.tuner.a4, state.tuner.referenceToneVolume]);

  const toggleTone = useCallback((midi = state.tuner.referenceToneMidi) => {
    if (toneDesiredRef.current) {
      stopTone();
      return;
    }

    toneDesiredRef.current = true;
    requestTonePlayback(midi, ++toneRequestRef.current);
  }, [requestTonePlayback, state.tuner.referenceToneMidi, stopTone]);

  const retuneTone = useCallback((midi: number) => {
    if (!toneDesiredRef.current) return;
    requestTonePlayback(midi, ++toneRequestRef.current);
  }, [requestTonePlayback]);

  useEffect(() => {
    const players = [lowTonePlayer, highTonePlayer];
    const subscriptions = players.map((player) => (
      player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (
          !status.error
          || !toneDesiredRef.current
          || activeTonePlayerRef.current !== player
        ) return;
        toneDesiredRef.current = false;
        toneRequestRef.current += 1;
        activeTonePlayerRef.current = null;
        safePause(lowTonePlayer);
        safePause(highTonePlayer);
        setTonePlaying(false);
        setToneError(referenceToneError(new Error(status.error)));
        console.warn('Reference tone player reported an error.', status.error);
      })
    ));
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [highTonePlayer, lowTonePlayer]);

  const value = useMemo(() => ({
    running,
    currentBeat,
    currentSubdivision,
    countInBarsRemaining,
    practiceElapsedSeconds,
    practiceSecondsRemaining,
    toggleMetronome,
    stopMetronome,
    tonePlaying,
    toneError,
    toggleTone,
    retuneTone,
    stopTone,
  }), [
    running,
    currentBeat,
    currentSubdivision,
    countInBarsRemaining,
    practiceElapsedSeconds,
    practiceSecondsRemaining,
    toggleMetronome,
    stopMetronome,
    tonePlaying,
    toneError,
    toggleTone,
    retuneTone,
    stopTone,
  ]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useRuntimeAudio(): AudioContextValue {
  const value = useContext(AudioContext);
  if (!value) throw new Error('useRuntimeAudio must be used within AudioProvider');
  return value;
}
