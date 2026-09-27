import {
  AudioStudioModule,
  useAudioRecorder,
  type AudioDataEvent,
  type RecordingConfig,
} from '@siteed/audio-studio';
import { useCallback, useEffect, useRef, useState } from 'react';

import { detectPitchYin } from '@/lib/yin';
import { yinThreshold } from '@/lib/pitch';
import type { DetectorProfile, PermissionState, PitchSnapshot } from '@/types';

const SAMPLE_RATE = 48_000;

export function usePitchInput(profile: DetectorProfile, sensitivity: number, noiseGate: number) {
  const { startRecording, stopRecording, isRecording } = useAudioRecorder();
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [snapshot, setSnapshot] = useState<PitchSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ringRef = useRef(new Float32Array(profile === 'low' ? 8192 : 4096));
  const writeRef = useRef(0);
  const filledRef = useRef(0);
  const lastAnalysisRef = useRef(0);

  useEffect(() => {
    ringRef.current = new Float32Array(profile === 'low' ? 8192 : 4096);
    writeRef.current = 0;
    filledRef.current = 0;
  }, [profile]);

  useEffect(() => {
    void AudioStudioModule.getPermissionsAsync()
      .then((result: { granted?: boolean; status?: string }) => {
        setPermission(result.granted ? 'granted' : result.status === 'denied' ? 'denied' : 'undetermined');
      })
      .catch(() => setPermission('undetermined'));
  }, []);

  const onAudioStream = useCallback(async (event: AudioDataEvent) => {
    const incoming = event.data instanceof Float32Array ? event.data : new Float32Array(event.data as ArrayLike<number>);
    const ring = ringRef.current;
    for (let index = 0; index < incoming.length; index += 1) {
      ring[writeRef.current] = incoming[index]!;
      writeRef.current = (writeRef.current + 1) % ring.length;
      filledRef.current = Math.min(ring.length, filledRef.current + 1);
    }
    const now = Date.now();
    if (filledRef.current < ring.length || now - lastAnalysisRef.current < 90) return;
    lastAnalysisRef.current = now;
    const frame = new Float32Array(ring.length);
    frame.set(ring.subarray(writeRef.current));
    frame.set(ring.subarray(0, writeRef.current), ring.length - writeRef.current);
    const result = detectPitchYin(frame, {
      sampleRate: SAMPLE_RATE,
      profile,
      threshold: yinThreshold(sensitivity),
      minimumRms: noiseGate,
    });
    setSnapshot(result);
  }, [noiseGate, profile, sensitivity]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const result = await AudioStudioModule.requestPermissionsAsync() as { granted?: boolean };
      if (!result.granted) {
        setPermission('denied');
        return;
      }
      setPermission('granted');
      const config: RecordingConfig = {
        sampleRate: SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        streamFormat: 'float32',
        interval: 100,
        bufferDurationSeconds: 0.1,
        keepFullAnalysis: false,
        output: { primary: { enabled: false } },
        autoResumeAfterInterruption: true,
        onRecordingInterrupted: () => setError('Listening was interrupted. Tap retry when your audio route is ready.'),
        onAudioStream,
      };
      await startRecording(config);
    } catch (caught) {
      setPermission('error');
      setError(caught instanceof Error ? caught.message : 'Microphone input could not be started.');
    }
  }, [onAudioStream, startRecording]);

  const stop = useCallback(async () => {
    if (!isRecording) return;
    try {
      await stopRecording();
    } catch {
      // The native recorder may already be stopped after a route interruption.
    }
  }, [isRecording, stopRecording]);

  useEffect(() => () => { void stopRecording().catch(() => undefined); }, [stopRecording]);

  return { permission, snapshot, error, isListening: isRecording, start, stop };
}
