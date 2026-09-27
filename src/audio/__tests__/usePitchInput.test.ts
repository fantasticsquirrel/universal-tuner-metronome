import React from 'react';
import type { AudioDataEvent, RecordingConfig } from '@siteed/audio-studio';

import { usePitchInput } from '../usePitchInput';
import type { PitchSnapshot } from '@/types';

const mockStartRecording = jest.fn().mockResolvedValue(undefined);
const mockStopRecording = jest.fn().mockResolvedValue(undefined);
jest.mock('@siteed/audio-studio', () => ({
  AudioStudioModule: {
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  },
  useAudioRecorder: () => ({
    startRecording: mockStartRecording,
    stopRecording: mockStopRecording,
    resumeRecording: jest.fn().mockResolvedValue(undefined),
    isRecording: false,
    isPaused: false,
  }),
}));

jest.mock('@/lib/yin', () => {
  const actual = jest.requireActual('@/lib/yin') as object;
  return {
    ...actual,
    detectPitchYin: jest.fn((): PitchSnapshot => ({
      frequency: 440,
      confidence: 0.99,
      rms: 0.01,
      clipping: false,
      timestamp: Date.now(),
    })),
  };
});

interface Renderer {
  unmount: () => void;
}

const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => Renderer;
};
const yinMock = jest.requireMock('@/lib/yin') as {
  detectPitchYin: jest.Mock<PitchSnapshot | null, [Float32Array]>;
};

function event(samples: Float32Array): AudioDataEvent {
  return {
    data: samples,
    streamFormat: 'float32',
    position: 0,
    fileUri: '',
    eventDataSize: samples.byteLength,
    totalSize: samples.byteLength,
  };
}

describe('live pitch input scheduling', () => {
  let renderer: Renderer | null = null;
  let pitchInput: ReturnType<typeof usePitchInput> | null = null;

  function Capture() {
    pitchInput = usePitchInput('general', 65, 0.008);
    return null;
  }

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    await act(async () => {
      renderer = create(React.createElement(Capture));
    });
    await act(async () => {
      await pitchInput!.start();
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    pitchInput = null;
    jest.useRealTimers();
  });

  it('uses short recorder buffers and coalesces queued input into the newest frame', async () => {
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;
    expect(config.interval).toBe(50);
    expect(config.bufferDurationSeconds).toBe(0.02);

    const first = new Float32Array(4096).fill(0.1);
    const newest = new Float32Array(4096).fill(0.2);
    await act(async () => {
      await config.onAudioStream!(event(first));
      await config.onAudioStream!(event(newest));
      expect(yinMock.detectPitchYin).not.toHaveBeenCalled();
      jest.runOnlyPendingTimers();
    });

    expect(yinMock.detectPitchYin).toHaveBeenCalledTimes(1);
    const analyzed = yinMock.detectPitchYin.mock.calls[0]![0];
    expect(analyzed[0]).toBeCloseTo(0.2);
    expect(analyzed[analyzed.length - 1]).toBeCloseTo(0.2);
  });
});
