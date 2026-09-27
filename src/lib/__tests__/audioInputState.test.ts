import type { RecordingInterruptionReason } from '@siteed/audio-studio';

import {
  classifyRecordingInterruption,
  getInputProblem,
  recordingInterruptionMessage,
} from '../audioInputState';

describe('audio input state', () => {
  it('hides normal and in-progress states', () => {
    expect(getInputProblem('checking', null)).toBeNull();
    expect(getInputProblem('granted', null)).toBeNull();
  });

  it('returns only actionable permission and recovery problems', () => {
    expect(getInputProblem('undetermined', null)).toMatchObject({
      kind: 'permission',
      actionLabel: 'Allow mic',
    });
    expect(getInputProblem('denied', null)).toMatchObject({
      kind: 'denied',
      actionLabel: 'Open settings',
    });
    expect(getInputProblem('granted', 'Input failed.')).toEqual({
      kind: 'retry',
      title: 'Input failed.',
      actionLabel: 'Retry',
    });
  });

  it('recovers app-owned focus loss without treating it as a failure', () => {
    expect(classifyRecordingInterruption('audioFocusLoss', true)).toBe('recover');
    expect(classifyRecordingInterruption('audioFocusLoss', false)).toBe('defer');
    expect(classifyRecordingInterruption('audioFocusGain', false)).toBe('recover');
  });

  it.each<RecordingInterruptionReason>(['recordingStopped', 'deviceSwitchFailed'])(
    'surfaces persistent %s failures',
    (reason) => {
      expect(classifyRecordingInterruption(reason, false)).toBe('fail');
      expect(recordingInterruptionMessage(reason)).toMatch(/retry|unavailable/i);
    },
  );

  it.each<RecordingInterruptionReason>(['phoneCall', 'deviceDisconnected'])(
    'waits for transient %s interruptions to recover',
    (reason) => {
      expect(classifyRecordingInterruption(reason, false)).toBe('defer');
    },
  );
});
