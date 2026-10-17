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
import { nativePitchInput, type NativePitchSettings } from '@/audio/nativePitchInput';
import { PitchFrameBuffer } from '@/audio/pitchFrameBuffer';
import { createYinPitchDetector, pitchFrameSize } from '@/lib/yin';
import { effectiveNoiseGate, minimumConfidence, yinThreshold } from '@/lib/pitch';
import { PitchTracker } from '@/lib/pitchTracker';
import type { DetectorProfile, PermissionState, PitchSnapshot } from '@/types';

const SAMPLE_RATE = 48_000;
const ANALYSIS_INTERVAL_MS = 50;
const INTERRUPTION_GRACE_MS = 2_000;

function detectorSettings(
  profile: DetectorProfile,
  sensitivity: number,
  noiseGate: number,
): NativePitchSettings {
  return {
    profile,
    threshold: yinThreshold(sensitivity),
    minimumRms: effectiveNoiseGate(noiseGate, sensitivity),
  };
}

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
  const [nativeListening, setNativeListening] = useState(false);
  // Native Android never needs a JavaScript PCM history. Allocate fallback
  // buffers in the profile effect, not in a render-time useRef argument.
  const frameBufferRef = useRef<PitchFrameBuffer | null>(null);
  const fallbackDetectorRef = useRef<ReturnType<typeof createYinPitchDetector> | null>(null);
  const lastAnalysisRef = useRef(0);
  const analysisTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pitchTracker] = useState(() => new PitchTracker());
  const inputOperationRef = useRef(0);
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

  const clearAnalysisTimers = useCallback(() => {
    if (analysisTimerRef.current) clearTimeout(analysisTimerRef.current);
    if (snapshotExpiryTimerRef.current) clearTimeout(snapshotExpiryTimerRef.current);
    analysisTimerRef.current = null;
    snapshotExpiryTimerRef.current = null;
  }, []);

  useEffect(() => {
    clearAnalysisTimers();
    frameBufferRef.current = nativePitchInput.available
      ? null
      : new PitchFrameBuffer(pitchFrameSize(profile));
    if (!nativePitchInput.available) fallbackDetectorRef.current ??= createYinPitchDetector();
    lastAnalysisRef.current = 0;
    pitchTracker.reset();
    const clearSnapshotTimer = setTimeout(() => setSnapshot(null), 0);
    return () => clearTimeout(clearSnapshotTimer);
  }, [clearAnalysisTimers, pitchTracker, profile]);

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
      if (nextState !== 'active') {
        if (nativePitchInput.available && desiredListeningRef.current) {
          inputOperationRef.current += 1;
          setNativeListening(false);
          clearAnalysisTimers();
          pitchTracker.reset();
          setSnapshot(null);
          void nativePitchInput.stop().catch(() => undefined);
        }
        return;
      }

      refreshPermission();
      if (
        !nativePitchInput.available
        || !desiredListeningRef.current
        || nativePitchInput.isRunning()
      ) return;

      const operation = inputOperationRef.current + 1;
      inputOperationRef.current = operation;
      const settings = detectorSettingsRef.current;
      void nativePitchInput
        .start(detectorSettings(settings.profile, settings.sensitivity, settings.noiseGate))
        .then(() => {
          if (operation !== inputOperationRef.current || !desiredListeningRef.current) {
            return nativePitchInput.stop();
          }
          setNativeListening(true);
          clearInterruptionProblem();
          return undefined;
        })
        .catch((caught) => {
          if (operation !== inputOperationRef.current || !desiredListeningRef.current) return;
          desiredListeningRef.current = false;
          setNativeListening(false);
          setInputProblem(
            caught instanceof Error ? caught.message : 'Microphone input could not be resumed.',
            'interruption',
          );
        });
    });
    return () => subscription.remove();
  }, [clearAnalysisTimers, clearInterruptionProblem, pitchTracker, refreshPermission, setInputProblem]);

  const publishTrackedSnapshot = useCallback((result: PitchSnapshot | null) => {
    if (snapshotExpiryTimerRef.current) clearTimeout(snapshotExpiryTimerRef.current);
    snapshotExpiryTimerRef.current = null;

    const now = Date.now();
    const tracked = pitchTracker.update(
      result,
      now,
      minimumConfidence(detectorSettingsRef.current.sensitivity),
    );
    setSnapshot(tracked.snapshot);

    if (tracked.expiresAt !== null) {
      snapshotExpiryTimerRef.current = setTimeout(() => {
        snapshotExpiryTimerRef.current = null;
        const expired = pitchTracker.update(
          null,
          Date.now(),
          minimumConfidence(detectorSettingsRef.current.sensitivity),
        );
        setSnapshot(expired.snapshot);
      }, Math.max(1, tracked.expiresAt - now + 1));
    }
  }, [pitchTracker]);

  useEffect(() => {
    if (!nativePitchInput.available) return undefined;
    const pitchSubscription = nativePitchInput.addPitchListener((result) => {
      if (!desiredListeningRef.current) return;
      lastAudioAtRef.current = Date.now();
      clearInterruptionProblem();
      publishTrackedSnapshot(result);
    });
    const errorSubscription = nativePitchInput.addErrorListener((message) => {
      desiredListeningRef.current = false;
      setNativeListening(false);
      setInputProblem(message, 'interruption');
    });
    return () => {
      pitchSubscription?.remove();
      errorSubscription?.remove();
    };
  }, [clearInterruptionProblem, publishTrackedSnapshot, setInputProblem]);

  useEffect(() => {
    if (!nativePitchInput.available || !nativeListening) return;
    void nativePitchInput
      .updateSettings(detectorSettings(profile, sensitivity, noiseGate))
      .catch((caught) => setInputProblem(
        caught instanceof Error ? caught.message : 'Pitch detector settings could not be updated.',
        'interruption',
      ));
  }, [nativeListening, noiseGate, profile, sensitivity, setInputProblem]);

  const analyzeLatestFrame = useCallback(() => {
    analysisTimerRef.current = null;
    if (!desiredListeningRef.current) return;
    const frame = frameBufferRef.current?.latest();
    if (!frame) return;
    lastAnalysisRef.current = Date.now();
    const detectorSettings = detectorSettingsRef.current;
    const result = fallbackDetectorRef.current!.detect(frame, {
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
    const frameBuffer = frameBufferRef.current;
    if (!frameBuffer) return;
    frameBuffer.push(incoming);
    if (!frameBuffer.ready || analysisTimerRef.current) return;

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
    const operation = inputOperationRef.current + 1;
    inputOperationRef.current = operation;
    desiredListeningRef.current = true;
    clearInterruptionTimer();
    clearAnalysisTimers();
    pitchTracker.reset();
    frameBufferRef.current?.reset();
    lastAnalysisRef.current = 0;
    setSnapshot(null);
    const recoveringFromProblem = errorSourceRef.current !== null;
    errorSourceRef.current = null;
    setError(null);
    let permissionGranted = false;
    try {
      const result = await AudioStudioModule.requestPermissionsAsync() as { granted?: boolean };
      if (operation !== inputOperationRef.current || !desiredListeningRef.current) return;
      if (!result.granted) {
        desiredListeningRef.current = false;
        setPermission('denied');
        return;
      }
      permissionGranted = true;
      setPermission('granted');

      if (nativePitchInput.available) {
        if (nativePitchInput.isRunning() && nativeListening && !recoveringFromProblem) return;
        await nativePitchInput.start(detectorSettings(profile, sensitivity, noiseGate));
        if (operation !== inputOperationRef.current || !desiredListeningRef.current) {
          await nativePitchInput.stop().catch(() => undefined);
          return;
        }
        setNativeListening(true);
        return;
      }

      if (isPaused) {
        await resumeRecording();
        if (operation !== inputOperationRef.current || !desiredListeningRef.current) {
          await stopRecording().catch(() => undefined);
        }
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
      if (operation !== inputOperationRef.current || !desiredListeningRef.current) {
        await stopRecording().catch(() => undefined);
      }
    } catch (caught) {
      if (operation !== inputOperationRef.current || !desiredListeningRef.current) return;
      desiredListeningRef.current = false;
      setNativeListening(false);
      if (!permissionGranted) setPermission('error');
      setInputProblem(
        caught instanceof Error ? caught.message : 'Microphone input could not be started.',
        'start',
      );
    }
  }, [clearAnalysisTimers, clearInterruptionTimer, isPaused, isRecording, nativeListening, noiseGate, onAudioStream, onRecordingInterrupted, pitchTracker, profile, resumeRecording, sensitivity, setInputProblem, startRecording, stopRecording]);

  const stop = useCallback(async () => {
    inputOperationRef.current += 1;
    desiredListeningRef.current = false;
    clearInterruptionTimer();
    clearAnalysisTimers();
    pitchTracker.reset();
    frameBufferRef.current?.reset();
    lastAnalysisRef.current = 0;
    setSnapshot(null);
    errorSourceRef.current = null;
    setError(null);
    if (nativePitchInput.available) {
      setNativeListening(false);
      try {
        await nativePitchInput.stop();
      } catch {
        // Android may already have stopped capture after an input route failure.
      }
      return;
    }
    try {
      await stopRecording();
    } catch {
      // The native recorder may already be stopped after a route interruption.
    }
  }, [clearAnalysisTimers, clearInterruptionTimer, pitchTracker, stopRecording]);

  useEffect(() => () => {
    inputOperationRef.current += 1;
    desiredListeningRef.current = false;
    clearInterruptionTimer();
    clearAnalysisTimers();
    if (nativePitchInput.available) void nativePitchInput.stop().catch(() => undefined);
    void stopRecording().catch(() => undefined);
  }, [clearAnalysisTimers, clearInterruptionTimer, stopRecording]);

  return {
    permission,
    snapshot,
    error,
    isListening: nativePitchInput.available ? nativeListening : isRecording,
    start,
    stop,
  };
}
