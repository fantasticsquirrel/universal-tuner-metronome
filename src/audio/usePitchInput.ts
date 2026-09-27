import {
  AudioStudioModule,
  useAudioRecorder,
  type AudioDataEvent,
  type RecordingConfig,
  type RecordingInterruptionEvent,
} from '@siteed/audio-studio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  classifyRecordingInterruption,
  recordingInterruptionMessage,
} from '@/lib/audioInputState';
import { audioStreamSamples } from '@/audio/audioStream';
import { detectPitchYin, pitchFrameSize } from '@/lib/yin';
import { effectiveNoiseGate, minimumConfidence, yinThreshold } from '@/lib/pitch';
import { PitchTracker } from '@/lib/pitchTracker';
import type { DetectorProfile, PermissionState, PitchSnapshot } from '@/types';

const SAMPLE_RATE = 48_000;
const ANALYSIS_INTERVAL_MS = 50;
const INTERRUPTION_GRACE_MS = 2_000;

export function usePitchInput(
  profile: DetectorProfile,
  sensitivity: number,
  noiseGate: number,
  appPlaybackActive = false,
) {
  const {
    startRecording,
    stopRecording,
    resumeRecording,
    isRecording,
    isPaused,
  } = useAudioRecorder();
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [snapshot, setSnapshot] = useState<PitchSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ringRef = useRef(new Float32Array(pitchFrameSize(profile)));
  const writeRef = useRef(0);
  const filledRef = useRef(0);
  const lastAnalysisRef = useRef(0);
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pitchTrackerRef = useRef(new PitchTracker());
  const desiredListeningRef = useRef(false);
  const appPlaybackActiveRef = useRef(appPlaybackActive);
  const lastAudioAtRef = useRef(0);
  const interruptionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorSourceRef = useRef<'start' | 'interruption' | null>(null);
  const detectorSettingsRef = useRef({ profile, sensitivity, noiseGate });

  useEffect(() => {
    appPlaybackActiveRef.current = appPlaybackActive;
  }, [appPlaybackActive]);

  useEffect(() => {
    detectorSettingsRef.current = { profile, sensitivity, noiseGate };
  }, [noiseGate, profile, sensitivity]);

  const clearInterruptionTimer = useCallback(() => {
    if (interruptionTimerRef.current) clearTimeout(interruptionTimerRef.current);
    interruptionTimerRef.current = null;
  }, []);

  const clearInterruptionProblem = useCallback(() => {
    clearInterruptionTimer();
    if (errorSourceRef.current === 'interruption') {
      errorSourceRef.current = null;
      setError(null);
    }
  }, [clearInterruptionTimer]);

  const setInputProblem = useCallback((message: string, source: 'start' | 'interruption') => {
    errorSourceRef.current = source;
    setError(message);
  }, []);

  const verifyInterruptionRecovery = useCallback((
    event: RecordingInterruptionEvent,
    interruptedAt: number,
  ) => {
    clearInterruptionTimer();
    interruptionTimerRef.current = setTimeout(() => {
      interruptionTimerRef.current = null;
      if (!desiredListeningRef.current || lastAudioAtRef.current > interruptedAt) return;
      setInputProblem(recordingInterruptionMessage(event.reason), 'interruption');
    }, INTERRUPTION_GRACE_MS);
  }, [clearInterruptionTimer, setInputProblem]);

  useEffect(() => {
    ringRef.current = new Float32Array(pitchFrameSize(profile));
    writeRef.current = 0;
    filledRef.current = 0;
    lastAnalysisRef.current = 0;
    pitchTrackerRef.current.reset();
    const clearSnapshotTimer = setTimeout(() => setSnapshot(null), 0);
    return () => clearTimeout(clearSnapshotTimer);
  }, [profile]);

  const refreshPermission = useCallback(() => {
    void AudioStudioModule.getPermissionsAsync()
      .then((result: { granted?: boolean; status?: string }) => {
        setPermission(result.granted ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined');
      })
      .catch(() => setPermission('undetermined'));
  }, []);

  useEffect(() => {
    refreshPermission();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshPermission();
    });
    return () => subscription.remove();
  }, [refreshPermission]);

  const clearAnalysisTimers = useCallback(() => {
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    if (snapshotExpiryTimerRef.current) clearTimeout(snapshotExpiryTimerRef.current);
    analysisTimerRef.current = null;
    snapshotExpiryTimerRef.current = null;
  }, []);

  const publishTrackedSnapshot = useCallback((result: PitchSnapshot | null) => {
    if (snapshotExpiryTimerRef.current) clearTimeout(snapshotExpiryTimerRef.current);
    snapshotExpiryTimerRef.current = null;

    const now = Date.now();
    const tracked = pitchTrackerRef.current.update(
      result,
      now,
      minimumConfidence(detectorSettingsRef.current.sensitivity),
    );
    setSnapshot(tracked.snapshot);

    if (tracked.expiresAt !== null) {
      snapshotExpiryTimerRef.current = setTimeout(() => {
        snapshotExpiryTimerRef.current = null;
        const expired = pitchTrackerRef.current.update(
          null,
          Date.now(),
          minimumConfidence(detectorSettingsRef.current.sensitivity),
        );
        setSnapshot(expired.snapshot);
      }, Math.max(1, tracked.expiresAt - now + 1));
    }
  }, []);

  const analyzeLatestFrame = useCallback(() => {
    analysisTimerRef.current = null;
    if (!desiredListeningRef.current) return;
    const ring = ringRef.current;
    if (filledRef.current < ring.length) return;
    lastAnalysisRef.current = Date.now();
    const frame = new Float32Array(ring.length);
    frame.set(ring.subarray(writeRef.current));
    frame.set(ring.subarray(0, writeRef.current), ring.length - writeRef.current);
    const detectorSettings = detectorSettingsRef.current;
    const result = detectPitchYin(frame, {
      sampleRate: SAMPLE_RATE,
      profile: detectorSettings.profile,
      threshold: yinThreshold(detectorSettings.sensitivity),
      minimumRms: effectiveNoiseGate(
        detectorSettings.noiseGate,
        detectorSettings.sensitivity,
      ),
    });
    publishTrackedSnapshot(result);
  }, [publishTrackedSnapshot]);

  const onAudioStream = useCallback(async (event: AudioDataEvent) => {
    if (!desiredListeningRef.current) return;
    lastAudioAtRef.current = Date.now();
    clearInterruptionProblem();
    const incoming = audioStreamSamples(event);
    if (incoming.length === 0) return;
    const ring = ringRef.current;
    for (let index = 0; index < incoming.length; index += 1) {
      ring[writeRef.current] = incoming[index]!;
      writeRef.current = (writeRef.current + 1) % ring.length;
      filledRef.current = Math.min(ring.length, filledRef.current + 1);
    }
    if (filledRef.current < ring.length || analysisTimerRef.current) return;

    // Run outside the native stream callback and keep only one pending job.
    // If JS is busy, later audio callbacks update the ring and the scheduled
    // analysis consumes the newest frame instead of building a stale queue.
    const delay = Math.max(
      0,
      ANALYSIS_INTERVAL_MS - (Date.now() - lastAnalysisRef.current),
    );
    analysisTimerRef.current = setTimeout(analyzeLatestFrame, delay);
  }, [analyzeLatestFrame, clearInterruptionProblem]);

  const onRecordingInterrupted = useCallback((event: RecordingInterruptionEvent) => {
    if (!desiredListeningRef.current) return;
    const interruptedAt = Date.now();
    const disposition = classifyRecordingInterruption(
      event.reason,
      appPlaybackActiveRef.current,
    );

    if (disposition === 'fail') {
      clearInterruptionTimer();
      setInputProblem(recordingInterruptionMessage(event.reason), 'interruption');
      return;
    }

    if (disposition === 'defer') {
      verifyInterruptionRecovery(event, interruptedAt);
      return;
    }

    clearInterruptionProblem();
    if (!event.isPaused) return;

    // App-owned mixed playback should not pause capture. If a device still reports a
    // focus loss, resume defensively and only surface it if samples do not return.
    void resumeRecording()
      .then(() => clearInterruptionProblem())
      .catch(() => verifyInterruptionRecovery(event, interruptedAt));
  }, [clearInterruptionProblem, clearInterruptionTimer, resumeRecording, setInputProblem, verifyInterruptionRecovery]);

  const start = useCallback(async () => {
    desiredListeningRef.current = true;
    clearInterruptionTimer();
    clearAnalysisTimers();
    pitchTrackerRef.current.reset();
    writeRef.current = 0;
    filledRef.current = 0;
    lastAnalysisRef.current = 0;
    setSnapshot(null);
    const recoveringFromProblem = errorSourceRef.current !== null;
    errorSourceRef.current = null;
    setError(null);
    let permissionGranted = false;
    try {
      const result = await AudioStudioModule.requestPermissionsAsync() as { granted?: boolean };
      if (!result.granted) {
        desiredListeningRef.current = false;
        setPermission('denied');
        return;
      }
      permissionGranted = true;
      setPermission('granted');

      if (isPaused) {
        await resumeRecording();
        return;
      }
      if (isRecording) {
        if (!recoveringFromProblem) return;
        await stopRecording();
      }

      const config: RecordingConfig = {
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        streamFormat: 'float32',
        interval: 50,
        bufferDurationSeconds: 0.02,
        keepFullAnalysis: false,
        keepAwake: false,
        output: { primary: { enabled: false } },
        autoResumeAfterInterruption: true,
        android: { audioFocusStrategy: 'communication' },
        ios: {
          audioSession: {
            category: 'PlayAndRecord',
            mode: 'Measurement',
            categoryOptions: ['MixWithOthers', 'AllowBluetooth', 'DefaultToSpeaker'],
          },
        },
        onRecordingInterrupted,
        onAudioStream,
      };
      await startRecording(config);
    } catch (caught) {
      if (!permissionGranted) setPermission('error');
      setInputProblem(
        caught instanceof Error ? caught.message : 'Microphone input could not be started.',
        'start',
      );
    }
  }, [clearAnalysisTimers, clearInterruptionTimer, isPaused, isRecording, onAudioStream, onRecordingInterrupted, resumeRecording, setInputProblem, startRecording, stopRecording]);

  const stop = useCallback(async () => {
    desiredListeningRef.current = false;
    clearInterruptionTimer();
    clearAnalysisTimers();
    pitchTrackerRef.current.reset();
    writeRef.current = 0;
    filledRef.current = 0;
    lastAnalysisRef.current = 0;
    setSnapshot(null);
    errorSourceRef.current = null;
    setError(null);
    if (!isRecording && !isPaused) return;
    try {
      await stopRecording();
    } catch {
      // The native recorder may already be stopped after a route interruption.
    }
  }, [clearAnalysisTimers, clearInterruptionTimer, isPaused, isRecording, stopRecording]);

  useEffect(() => () => {
    desiredListeningRef.current = false;
    clearInterruptionTimer();
    clearAnalysisTimers();
    void stopRecording().catch(() => undefined);
  }, [clearAnalysisTimers, clearInterruptionTimer, stopRecording]);

  return { permission, snapshot, error, isListening: isRecording, start, stop };
}
