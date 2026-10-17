import type { NativePitchEvent, NativePitchSettings } from '../nativePitchInput';

const settings: NativePitchSettings = { profile: 'general', threshold: 0.15, minimumRms: 0.0028 };
const frame: NativePitchEvent = {
  detected: true, frequency: 440, confidence: 0.99, rms: 0.1,
  clipping: false, timestamp: 100, ageMs: 0,
};

function loadAdapter(latest: boolean) {
  const callbacks: Record<string, (event: never) => void> = {};
  const subscription = { remove: jest.fn() };
  const native = {
    start: jest.fn().mockResolvedValue(undefined),
    updateSettings: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    isRunning: jest.fn().mockReturnValue(true),
    ...(latest ? { takeLatestPitch: jest.fn().mockReturnValue(frame) } : {}),
    addListener: jest.fn((name: string, callback: (event: never) => void) => {
      callbacks[name] = callback;
      return subscription;
    }),
  };
  let adapter!: typeof import('../nativePitchInput').nativePitchInput;
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    jest.doMock('expo-modules-core', () => ({ requireOptionalNativeModule: () => native }));
    adapter = jest.requireActual('../nativePitchInput').nativePitchInput;
  });
  return {
    adapter, native, subscription,
    emit: (name: string, event: unknown) => callbacks[name]?.(event as never),
  };
}

describe('native pitch delivery compatibility', () => {
  afterEach(() => {
    jest.dontMock('react-native');
    jest.dontMock('expo-modules-core');
  });

  it('opts into latest-value delivery and drains only when JS consumes the wake', async () => {
    const { adapter, native, subscription, emit } = loadAdapter(true);
    const listener = jest.fn();
    expect(adapter.addPitchListener(listener)).toBe(subscription);
    await adapter.start(settings);
    expect(native.start).toHaveBeenCalledWith({ ...settings, deliveryMode: 'latest' });
    expect(native.addListener).toHaveBeenCalledWith('onPitchAvailable', expect.any(Function));
    expect(native.takeLatestPitch).not.toHaveBeenCalled();

    // Native may have overwritten many analyses before this single wake is handled.
    native.takeLatestPitch!.mockReturnValueOnce({ ...frame, frequency: 880, ageMs: 12 });
    emit('onPitchAvailable', { session: 7 });
    expect(native.takeLatestPitch).toHaveBeenCalledTimes(1);
    expect(native.takeLatestPitch).toHaveBeenCalledWith(7);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ frequency: 880 }));
  });

  it('ignores obsolete wakes but forwards detector misses and expired results', () => {
    const { adapter, native, emit } = loadAdapter(true);
    const listener = jest.fn();
    adapter.addPitchListener(listener);
    native.takeLatestPitch!.mockReturnValueOnce(null);
    emit('onPitchAvailable', { session: 1 });
    expect(listener).not.toHaveBeenCalled();

    native.takeLatestPitch!.mockReturnValueOnce({ ...frame, detected: false, frequency: null });
    emit('onPitchAvailable', { session: 2 });
    native.takeLatestPitch!.mockReturnValueOnce({ ...frame, ageMs: 500 });
    emit('onPitchAvailable', { session: 2 });
    expect(listener.mock.calls).toEqual([[null], [null]]);
  });

  it('keeps the event path for an older installed native module', async () => {
    const { adapter, native, emit } = loadAdapter(false);
    const listener = jest.fn();
    adapter.addPitchListener(listener);
    await adapter.start(settings);
    expect(native.start).toHaveBeenCalledWith(settings);
    expect(native.addListener).toHaveBeenCalledWith('onPitch', expect.any(Function));
    emit('onPitch', frame);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ frequency: 440 }));
  });
});
