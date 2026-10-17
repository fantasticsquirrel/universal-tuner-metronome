import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';
import { Platform } from 'react-native';

import { PITCH_MISS_GRACE_MS } from '@/lib/pitchTracker';
import type { DetectorProfile, PitchSnapshot } from '@/types';

export interface NativePitchSettings {
  profile: DetectorProfile;
  threshold: number;
  minimumRms: number;
}

export interface NativePitchEvent {
  detected: boolean;
  frequency: number | null;
  confidence: number;
  rms: number;
  clipping: boolean;
  timestamp: number;
  // Measured using the same native monotonic clock as the analysis timestamp.
  // Older installed binaries do not provide this field.
  ageMs?: number;
}

interface NativePitchErrorEvent {
  message: string;
}

interface TuneraPitchNativeModule {
  start: (settings: NativePitchSettings & { deliveryMode?: 'latest' }) => Promise<void>;
  updateSettings: (settings: NativePitchSettings) => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  takeLatestPitch?: (session: number) => NativePitchEvent | null;
  addListener(eventName: 'onPitch', listener: (event: NativePitchEvent) => void): EventSubscription;
  addListener(eventName: 'onPitchAvailable', listener: (event: { session: number }) => void): EventSubscription;
  addListener(eventName: 'onError', listener: (event: NativePitchErrorEvent) => void): EventSubscription;
}

const module = Platform.OS === 'android'
  ? requireOptionalNativeModule<TuneraPitchNativeModule>('TuneraPitch')
  : null;

export function nativePitchSnapshot(
  event: NativePitchEvent,
  receivedAt = Date.now(),
): PitchSnapshot | null {
  if (!event.detected || event.frequency === null) return null;
  const ageMs = event.ageMs ?? 0;
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= PITCH_MISS_GRACE_MS) return null;
  return {
    frequency: event.frequency,
    confidence: event.confidence,
    rms: event.rms,
    clipping: event.clipping,
    // Convert clock domains without making a delayed result look fresh.
    // Legacy native modules retain their previous receive-time behavior.
    timestamp: receivedAt - ageMs,
  };
}

/**
 * Android performs PCM ingestion and pitch detection in one native thread.
 * A single wake remains outstanding until JS pulls the newest scalar result.
 * Busy JS never has to replay a queue of pitch frames; PCM stays native.
 */
export const nativePitchInput = {
  available: module !== null,

  start(settings: NativePitchSettings): Promise<void> {
    if (!module) return Promise.reject(new Error('Native pitch input is unavailable.'));
    return module.start(module.takeLatestPitch ? { ...settings, deliveryMode: 'latest' } : settings);
  },

  updateSettings(settings: NativePitchSettings): Promise<void> {
    if (!module) return Promise.resolve();
    return module.updateSettings(settings);
  },

  stop(): Promise<void> {
    if (!module) return Promise.resolve();
    return module.stop();
  },

  isRunning(): boolean {
    return module?.isRunning() ?? false;
  },

  addPitchListener(listener: (snapshot: PitchSnapshot | null) => void): EventSubscription | null {
    if (!module) return null;
    if (module.takeLatestPitch) {
      return module.addListener('onPitchAvailable', ({ session }) => {
        const event = module.takeLatestPitch!(session);
        // A wake from a stopped/replaced session must not clear current pitch.
        if (event) listener(nativePitchSnapshot(event));
      });
    }
    // Keep JS updates compatible with installations of the previous module.
    return module.addListener('onPitch', (event: NativePitchEvent) => {
      listener(nativePitchSnapshot(event));
    });
  },

  addErrorListener(listener: (message: string) => void): EventSubscription | null {
    if (!module) return null;
    return module.addListener('onError', (event: NativePitchErrorEvent) => listener(event.message));
  },
};
