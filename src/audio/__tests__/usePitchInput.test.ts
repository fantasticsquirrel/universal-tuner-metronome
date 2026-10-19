import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { AudioDataEvent, RecordingConfig } from '@siteed/audio-studio';

import { usePitchInput } from '../usePitchInput';
import type { DetectorProfile, PitchSnapshot } from '@/types';

jest.mock('@/audio/pitchFrameBuffer', () => {
  const actual = jest.requireActual('@/audio/pitchFrameBuffer');
  return { PitchFrameBuffer: jest.fn((size: number) => new actual.PitchFrameBuffer(size)) };
});
jest.mock('@/lib/pitchTracker', () => {
  const actual = jest.requireActual('@/lib/pitchTracker');
  return { ...actual, PitchTracker: jest.fn(() => new actual.PitchTracker()) };
});
const mockFrameBuffer = jest.requireMock('@/audio/pitchFrameBuffer').PitchFrameBuffer as jest.Mock;
const mockPitchTracker = jest.requireMock('@/lib/pitchTracker').PitchTracker as jest.Mock;

const mockStartRecording = jest.fn().mockResolvedValue(undefined);
const mockStopRecording = jest.fn().mockResolvedValue(undefined);
jest.mock('@/audio/nativePitchInput', () => ({
  nativePitchInput: {
    available: false,
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(false),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    addPitchListener: jest.fn(),
    addErrorListener: jest.fn(),
  },
}));
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
  const detect = jest.fn((): PitchSnapshot => ({
    frequency: 440,
    confidence: 0.99,
    rms: 0.01,
    clipping: false,
    timestamp: Date.now(),
  }));
  return {
    ...actual,
    detectPitchYin: detect,
    createYinPitchDetector: jest.fn(() => ({ detect })),
  };
});

interface Renderer {
  unmount: () => void;
  update: (element: React.ReactElement) => void;
}

const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => Renderer;
};
const yinMock = jest.requireMock('@/lib/yin') as {
  detectPitchYin: jest.Mock<PitchSnapshot | null, [Float32Array]>;
  createYinPitchDetector: jest.Mock;
};
const audioStudioMock = jest.requireMock('@siteed/audio-studio') as {
  AudioStudioModule: {
    getPermissionsAsync: jest.Mock<Promise<{ granted: boolean; status?: string }>, []>;
    requestPermissionsAsync: jest.Mock<Promise<{ granted: boolean }>, []>;
  };
};
const mockGetPermissions = audioStudioMock.AudioStudioModule.getPermissionsAsync;
const mockRequestPermissions = audioStudioMock.AudioStudioModule.requestPermissionsAsync;
const nativePitchModuleMock = jest.requireMock('@/audio/nativePitchInput') as {
  nativePitchInput: {
    available: boolean;
    start: jest.Mock;
    stop: jest.Mock;
    isRunning: jest.Mock;
    updateSettings: jest.Mock;
    addPitchListener: jest.Mock;
    addErrorListener: jest.Mock;
  };
};
const mockNativePitchInput = nativePitchModuleMock.nativePitchInput;

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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('live pitch input scheduling and permissions', () => {
  let renderer: Renderer | null = null;
  let pitchInput: ReturnType<typeof usePitchInput> | null = null;
  let appStateListener: ((state: AppStateStatus) => void) | null = null;
  let nativePitchListener: ((snapshot: PitchSnapshot | null) => void) | null = null;

  function Capture({ profile = 'general' }: { profile?: DetectorProfile }) {
    pitchInput = usePitchInput(profile, 65, 0.008);
    return null;
  }

  async function remount(native = false) {
    await act(async () => renderer?.unmount());
    jest.clearAllMocks();
    mockNativePitchInput.available = native;
    await act(async () => { renderer = create(React.createElement(Capture)); });
  }

  async function changeAppState(state: AppStateStatus) {
    await act(async () => { appStateListener!(state); });
  }

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(async () => {
    // React's async act bookkeeping uses microtasks; do not advance it as a
    // fake timer while an awaited audio callback is still inside act.
    jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
    jest.clearAllMocks();
    mockGetPermissions.mockReset().mockResolvedValue({ granted: true });
    mockRequestPermissions.mockReset().mockResolvedValue({ granted: true });
    mockNativePitchInput.start.mockReset().mockResolvedValue(undefined);
    mockNativePitchInput.stop.mockReset().mockResolvedValue(undefined);
    mockNativePitchInput.isRunning.mockReset().mockReturnValue(false);
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    mockNativePitchInput.available = false;
    nativePitchListener = null;
    mockNativePitchInput.addPitchListener.mockImplementation((listener) => {
      nativePitchListener = listener;
      return { remove: jest.fn() };
    });
    mockNativePitchInput.addErrorListener.mockReturnValue({ remove: jest.fn() });
    await act(async () => {
      renderer = create(React.createElement(Capture));
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    pitchInput = null;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it.each([
    [false, { granted: false, status: 'undetermined' }, 'undetermined'],
    [false, { granted: false, status: 'denied' }, 'denied'],
    [false, { granted: true }, 'granted'],
    [true, { granted: false, status: 'undetermined' }, 'undetermined'],
    [true, { granted: false, status: 'denied' }, 'denied'],
    [true, { granted: true }, 'granted'],
  ] as const)('only reads launch permission (native=%s, result=%j)', async (native, result, expected) => {
    mockGetPermissions.mockResolvedValueOnce(result);
    await remount(native);

    expect(pitchInput!.permission).toBe(expected);
    expect(mockGetPermissions).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockNativePitchInput.start).not.toHaveBeenCalled();
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('fails closed when the launch permission read fails', async () => {
    mockGetPermissions.mockRejectedValueOnce(new Error('Permission check unavailable'));
    await remount();

    expect(pitchInput!.permission).toBe('error');
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it.each([false, true])('does not capture after an explicit denial (native=%s)', async (native) => {
    await remount(native);
    mockRequestPermissions.mockResolvedValueOnce({ granted: false });
    await act(async () => { await pitchInput!.start(); });

    expect(pitchInput!.permission).toBe('denied');
    expect(pitchInput!.isListening).toBe(false);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockNativePitchInput.start).not.toHaveBeenCalled();
    expect(mockStartRecording).not.toHaveBeenCalled();
    await changeAppState('background');
    await changeAppState('active');
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockNativePitchInput.start).not.toHaveBeenCalled();
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('waits for a fresh grant before resuming native capture', async () => {
    await remount(true);
    await act(async () => { await pitchInput!.start(); });
    await changeAppState('background');
    const check = deferred<{ granted: boolean }>();
    mockGetPermissions.mockReturnValueOnce(check.promise);
    await changeAppState('active');

    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
    expect(pitchInput!.isListening).toBe(false);
    await act(async () => { check.resolve({ granted: true }); });
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(2);
    expect(pitchInput!.isListening).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it.each(['denied', 'undetermined', 'error'] as const)(
    'stops and clears resume intent after a %s foreground check without prompting',
    async (result) => {
      await remount(true);
      await act(async () => { await pitchInput!.start(); });
      await changeAppState('background');
      if (result === 'error') mockGetPermissions.mockRejectedValueOnce(new Error('Permission check failed'));
      else mockGetPermissions.mockResolvedValueOnce({ granted: false, status: result });
      await changeAppState('active');

      expect(pitchInput!.permission).toBe(result);
      expect(pitchInput!.isListening).toBe(false);
      expect(pitchInput!.snapshot).toBeNull();
      expect(mockNativePitchInput.stop).toHaveBeenCalledTimes(2);
      expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
      await changeAppState('background');
      await changeAppState('active');
      expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);

      // A later explicit user action can recover after permission is restored.
      await act(async () => { await pitchInput!.start(); });
      expect(mockNativePitchInput.start).toHaveBeenCalledTimes(2);
      expect(pitchInput!.isListening).toBe(true);
    },
  );

  it('stops native capture on revocation even if the backend still reports running', async () => {
    await remount(true);
    await act(async () => { await pitchInput!.start(); });
    mockNativePitchInput.isRunning.mockReturnValue(true);
    mockGetPermissions.mockResolvedValueOnce({ granted: false, status: 'denied' });
    await changeAppState('active');

    expect(pitchInput!.permission).toBe('denied');
    expect(pitchInput!.isListening).toBe(false);
    expect(mockNativePitchInput.stop).toHaveBeenCalledTimes(1);
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('stops the in-memory fallback and ignores late audio after permission revocation', async () => {
    await act(async () => { await pitchInput!.start(); });
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;
    await act(async () => {
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.2)));
      jest.advanceTimersByTime(50);
    });
    expect(pitchInput!.snapshot).not.toBeNull();
    mockGetPermissions.mockResolvedValueOnce({ granted: false, status: 'denied' });
    await changeAppState('active');
    yinMock.detectPitchYin.mockClear();
    await act(async () => {
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.3)));
      jest.runOnlyPendingTimers();
    });

    expect(pitchInput!.permission).toBe('denied');
    expect(pitchInput!.snapshot).toBeNull();
    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(yinMock.detectPitchYin).not.toHaveBeenCalled();
    expect(config.output).toEqual({ primary: { enabled: false } });
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it.each(['stop', 'background', 'unmount'] as const)(
    'does not resume when %s wins a pending foreground check',
    async (action) => {
      await remount(true);
      await act(async () => { await pitchInput!.start(); });
      await changeAppState('background');
      const check = deferred<{ granted: boolean }>();
      mockGetPermissions.mockReturnValueOnce(check.promise);
      await changeAppState('active');
      if (action === 'stop') await act(async () => { await pitchInput!.stop(); });
      else if (action === 'background') await changeAppState('background');
      else await act(async () => { renderer!.unmount(); renderer = null; });
      await act(async () => { check.resolve({ granted: true }); });

      expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
      if (action !== 'unmount') expect(pitchInput!.isListening).toBe(false);
    },
  );

  it('uses only the newest foreground permission check across repeated transitions', async () => {
    await remount(true);
    await act(async () => { await pitchInput!.start(); });
    await changeAppState('background');
    const oldCheck = deferred<{ granted: boolean; status?: string }>();
    const newCheck = deferred<{ granted: boolean }>();
    mockGetPermissions.mockReturnValueOnce(oldCheck.promise).mockReturnValueOnce(newCheck.promise);
    await changeAppState('active');
    await changeAppState('inactive');
    await changeAppState('background');
    await changeAppState('active');
    await act(async () => { newCheck.resolve({ granted: true }); });
    await act(async () => { oldCheck.resolve({ granted: false, status: 'denied' }); });

    expect(pitchInput!.permission).toBe('granted');
    expect(pitchInput!.isListening).toBe(true);
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(2);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    await changeAppState('background');
    await changeAppState('active');
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(3);
    expect(pitchInput!.isListening).toBe(true);
  });

  it.each(['denied', 'error'] as const)(
    'does not overwrite an explicit %s with a read started while the prompt was pending',
    async (result) => {
      await remount(true);
      const request = deferred<{ granted: boolean }>();
      const check = deferred<{ granted: boolean }>();
      mockRequestPermissions.mockReturnValueOnce(request.promise);
      let startPromise!: Promise<void>;
      await act(async () => { startPromise = pitchInput!.start(); });
      mockGetPermissions.mockReturnValueOnce(check.promise);
      await changeAppState('active');
      await act(async () => {
        if (result === 'denied') request.resolve({ granted: false });
        else request.reject(new Error('Permission request failed'));
        await startPromise;
      });
      await act(async () => { check.resolve({ granted: true }); });

      expect(pitchInput!.permission).toBe(result);
      expect(mockNativePitchInput.start).not.toHaveBeenCalled();
      expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    },
  );

  it('ignores a stale foreground grant after a newer denial', async () => {
    await remount(true);
    await act(async () => { await pitchInput!.start(); });
    await changeAppState('background');
    const oldCheck = deferred<{ granted: boolean }>();
    mockGetPermissions.mockReturnValueOnce(oldCheck.promise);
    await changeAppState('active');
    await changeAppState('background');
    mockGetPermissions.mockResolvedValueOnce({ granted: false, status: 'denied' });
    await changeAppState('active');
    await act(async () => { oldCheck.resolve({ granted: true }); });

    expect(pitchInput!.permission).toBe('denied');
    expect(pitchInput!.isListening).toBe(false);
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it('ignores an old launch grant after an explicit permission denial', async () => {
    const launchCheck = deferred<{ granted: boolean }>();
    mockGetPermissions.mockReturnValueOnce(launchCheck.promise);
    await remount(true);
    mockRequestPermissions.mockResolvedValueOnce({ granted: false });
    await act(async () => { await pitchInput!.start(); });
    await act(async () => { launchCheck.resolve({ granted: true }); });

    expect(pitchInput!.permission).toBe('denied');
    expect(mockNativePitchInput.start).not.toHaveBeenCalled();
  });

  it('ignores an old launch denial after an explicit grant', async () => {
    const launchCheck = deferred<{ granted: boolean; status: string }>();
    mockGetPermissions.mockReturnValueOnce(launchCheck.promise);
    await remount(true);
    await act(async () => { await pitchInput!.start(); });
    await act(async () => { launchCheck.resolve({ granted: false, status: 'denied' }); });

    expect(pitchInput!.permission).toBe('granted');
    expect(pitchInput!.isListening).toBe(true);
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
  });

  it('ignores a launch check that resolves after unmount', async () => {
    const launchCheck = deferred<{ granted: boolean }>();
    mockGetPermissions.mockReturnValueOnce(launchCheck.promise);
    await remount(true);
    const lastPermission = pitchInput!.permission;
    await act(async () => { renderer!.unmount(); renderer = null; });
    await act(async () => { launchCheck.resolve({ granted: true }); });

    expect(lastPermission).toBe('checking');
    expect(pitchInput!.permission).toBe('checking');
    expect(mockNativePitchInput.start).not.toHaveBeenCalled();
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it('reuses fallback buffers and tracker across pitch-driven and parent renders', async () => {
    expect(mockFrameBuffer).toHaveBeenCalledTimes(1);
    expect(mockPitchTracker).toHaveBeenCalledTimes(1);
    expect(yinMock.createYinPitchDetector).toHaveBeenCalledTimes(1);
    await act(async () => { await pitchInput!.start(); });
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;
    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        await config.onAudioStream!(event(new Float32Array(4096).fill(0.2)));
        jest.advanceTimersByTime(50);
      });
    }
    await act(async () => { renderer!.update(React.createElement(Capture)); });
    expect(pitchInput!.snapshot?.frequency).toBe(440);
    expect(mockFrameBuffer).toHaveBeenCalledTimes(1);
    expect(mockPitchTracker).toHaveBeenCalledTimes(1);
    expect(yinMock.createYinPitchDetector).toHaveBeenCalledTimes(1);
    await act(async () => { await pitchInput!.stop(); await pitchInput!.start(); });
    expect(mockFrameBuffer).toHaveBeenCalledTimes(1);
    expect(mockPitchTracker).toHaveBeenCalledTimes(1);
    expect(yinMock.createYinPitchDetector).toHaveBeenCalledTimes(1);
  });

  it('allocates a new fallback frame only on profile changes and discards old history', async () => {
    await act(async () => { await pitchInput!.start(); });
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;
    await act(async () => {
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.2)));
      jest.advanceTimersByTime(50);
    });
    yinMock.detectPitchYin.mockClear();
    await act(async () => { renderer!.update(React.createElement(Capture, { profile: 'low' })); });
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(pitchInput!.snapshot).toBeNull();
    expect(mockFrameBuffer.mock.calls.map(([size]) => size)).toEqual([4096, 8192]);
    await act(async () => {
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.3)));
      jest.advanceTimersByTime(50);
    });
    expect(yinMock.detectPitchYin).not.toHaveBeenCalled();
    await act(async () => {
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.4)));
      jest.advanceTimersByTime(50);
    });
    expect(yinMock.detectPitchYin).toHaveBeenCalledTimes(1);
    expect(yinMock.detectPitchYin.mock.calls[0]![0].length).toBe(8192);
    expect(mockFrameBuffer).toHaveBeenCalledTimes(2);
    expect(mockPitchTracker).toHaveBeenCalledTimes(1);
    expect(yinMock.createYinPitchDetector).toHaveBeenCalledTimes(1);
  });

  it('never allocates fallback PCM buffers on the native backend, including profile changes', async () => {
    await act(async () => renderer?.unmount());
    jest.clearAllMocks();
    mockNativePitchInput.available = true;
    await act(async () => { renderer = create(React.createElement(Capture)); });
    await act(async () => { await pitchInput!.start(); });
    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        nativePitchListener?.({ frequency: 440 + index, confidence: 0.99, rms: 0.01, clipping: false, timestamp: Date.now() });
      });
    }
    await act(async () => { renderer!.update(React.createElement(Capture, { profile: 'low' })); });
    await act(async () => { await pitchInput!.stop(); await pitchInput!.start(); });
    expect(mockFrameBuffer).not.toHaveBeenCalled();
    expect(yinMock.createYinPitchDetector).not.toHaveBeenCalled();
    expect(mockPitchTracker).toHaveBeenCalledTimes(1);
    expect(mockStartRecording).not.toHaveBeenCalled();
    expect(mockNativePitchInput.updateSettings).toHaveBeenLastCalledWith(expect.objectContaining({ profile: 'low' }));
  });

  it('uses short recorder buffers and coalesces queued input into the newest frame', async () => {
    await act(async () => {
      await pitchInput!.start();
    });
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;
    expect(config.interval).toBe(50);
    expect(config.bufferDurationSeconds).toBe(0.02);
    expect(config.output).toEqual({ primary: { enabled: false } });
    expect(config.keepFullAnalysis).toBe(false);

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

  it('does not start capture when Stop wins a pending permission request', async () => {
    let resolvePermission!: (result: { granted: boolean }) => void;
    mockRequestPermissions.mockImplementationOnce(() => new Promise((resolve) => {
      resolvePermission = resolve;
    }));

    let startPromise!: Promise<void>;
    await act(async () => {
      startPromise = pitchInput!.start();
      await Promise.resolve();
    });
    await act(async () => {
      await pitchInput!.stop();
    });
    await act(async () => {
      resolvePermission({ granted: true });
      await startPromise;
    });

    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('stops a recorder start that finishes after the input was cancelled', async () => {
    let resolveNativeStart!: () => void;
    mockStartRecording.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveNativeStart = resolve;
    }));

    let startPromise!: Promise<void>;
    await act(async () => {
      startPromise = pitchInput!.start();
      await Promise.resolve();
    });
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;

    await act(async () => {
      await pitchInput!.stop();
    });
    await act(async () => {
      resolveNativeStart();
      await startPromise;
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.3)));
      jest.runOnlyPendingTimers();
    });

    expect(mockStopRecording).toHaveBeenCalledTimes(2);
    expect(yinMock.detectPitchYin).not.toHaveBeenCalled();
  });

  it('cancels queued pitch work immediately on Stop', async () => {
    await act(async () => {
      await pitchInput!.start();
    });
    const config = mockStartRecording.mock.calls[0]![0] as RecordingConfig;
    await act(async () => {
      await config.onAudioStream!(event(new Float32Array(4096).fill(0.1)));
      await pitchInput!.stop();
      jest.runOnlyPendingTimers();
    });

    expect(yinMock.detectPitchYin).not.toHaveBeenCalled();
  });

  it('keeps Android PCM and pitch analysis native instead of bridging sample buffers', async () => {
    await act(async () => renderer?.unmount());
    mockNativePitchInput.available = true;
    await act(async () => {
      renderer = create(React.createElement(Capture));
    });

    await act(async () => {
      await pitchInput!.start();
    });

    expect(mockStartRecording).not.toHaveBeenCalled();
    expect(mockNativePitchInput.start).toHaveBeenCalledTimes(1);
    const settings = mockNativePitchInput.start.mock.calls[0]![0];
    expect(settings).toEqual({
      profile: 'general',
      threshold: expect.any(Number),
      minimumRms: expect.any(Number),
    });
    expect(JSON.stringify(settings).length).toBeLessThan(100);

    await act(async () => {
      nativePitchListener?.({
        frequency: 440,
        confidence: 0.99,
        rms: 0.01,
        clipping: false,
        timestamp: Date.now(),
      });
    });
    expect(pitchInput!.snapshot?.frequency).toBe(440);
    expect(yinMock.detectPitchYin).not.toHaveBeenCalled();
  });
});
