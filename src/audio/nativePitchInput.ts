import {
  requireOptionalNativeModule,
  type EventSubscription,
} from 'expo-modules-core';
import { Platform } from 'react-native';

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
}

interface NativePitchErrorEvent {
  message: string;
}

interface TuneraPitchNativeModule {
  start: (settings: NativePitchSettings) => Promise<void>;
  updateSettings: (settings: NativePitchSettings) => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  addListener(eventName: 'onPitch', listener: (event: NativePitchEvent) => void): EventSubscription;
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
  return {
    frequency: event.frequency,
    confidence: event.confidence,
    rms: event.rms,
    clipping: event.clipping,
    // Native analysis uses Android's monotonic clock for scheduling, while
    // the shared tracker expires values against Date.now(). Normalize at the
    // bridge boundary so a fresh result is never treated as stale.
    timestamp: receivedAt,
  };
}

/**
 * Android performs PCM ingestion and pitch detection in one native thread.
 * Only six scalar fields cross to JS per analysis instead of thousands of
 * samples, which keeps Hermes responsive on low-end tablets.
 */
export const nativePitchInput = {
  available: module !== null,

  start(settings: NativePitchSettings): Promise<void> {
    if (!module) return Promise.reject(new Error('Native pitch input is unavailable.'));
    return module.start(settings);
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
    return module.addListener('onPitch', (event: NativePitchEvent) => {
      listener(nativePitchSnapshot(event));
    });
  },

  addErrorListener(listener: (message: string) => void): EventSubscription | null {
    if (!module) return null;
    return module.addListener('onError', (event: NativePitchErrorEvent) => listener(event.message));
  },
};
