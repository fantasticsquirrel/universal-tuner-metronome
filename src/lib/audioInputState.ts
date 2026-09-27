import type { RecordingInterruptionReason } from '@siteed/audio-studio';

import type { PermissionState } from '@/types';

export type InputProblemKind = 'permission' | 'denied' | 'retry';

export interface InputProblem {
  kind: InputProblemKind;
  title: string;
  actionLabel: string;
}

export type InterruptionDisposition = 'recover' | 'defer' | 'fail';

export function getInputProblem(
  permission: PermissionState,
  error: string | null,
): InputProblem | null {
  if (permission === 'denied') {
    return {
      kind: 'denied',
      title: 'Microphone access is turned off.',
      actionLabel: 'Open settings',
    };
  }

  if (error) {
    return { kind: 'retry', title: error, actionLabel: 'Retry' };
  }

  if (permission === 'undetermined') {
    return {
      kind: 'permission',
      title: 'Microphone access is needed to tune.',
      actionLabel: 'Allow mic',
    };
  }

  if (permission === 'error') {
    return {
      kind: 'retry',
      title: 'Microphone access could not be checked.',
      actionLabel: 'Retry',
    };
  }

  return null;
}

export function classifyRecordingInterruption(
  reason: RecordingInterruptionReason,
  appPlaybackActive: boolean,
): InterruptionDisposition {
  switch (reason) {
    case 'audioFocusGain':
    case 'phoneCallEnded':
    case 'deviceFallback':
    case 'deviceConnected':
      return 'recover';
    case 'audioFocusLoss':
      return appPlaybackActive ? 'recover' : 'defer';
    case 'phoneCall':
    case 'deviceDisconnected':
      return 'defer';
    case 'recordingStopped':
    case 'deviceSwitchFailed':
      return 'fail';
  }
}

export function recordingInterruptionMessage(reason: RecordingInterruptionReason): string {
  switch (reason) {
    case 'deviceDisconnected':
    case 'deviceSwitchFailed':
      return 'The microphone route is unavailable. Reconnect it or choose another input, then retry.';
    case 'recordingStopped':
      return 'Microphone input stopped unexpectedly. Tap retry to continue listening.';
    default:
      return 'Microphone input is still interrupted. Tap retry when the audio route is ready.';
  }
}
