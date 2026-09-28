import { nativePitchSnapshot } from '../nativePitchInput';

describe('native Android pitch events', () => {
  it('normalizes the native monotonic timestamp to the JS tracker clock', () => {
    const snapshot = nativePitchSnapshot({
      detected: true,
      frequency: 440,
      confidence: 0.98,
      rms: 0.01,
      clipping: false,
      timestamp: 12_345,
    }, 1_700_000_000_000);

    expect(snapshot).toEqual({
      frequency: 440,
      confidence: 0.98,
      rms: 0.01,
      clipping: false,
      timestamp: 1_700_000_000_000,
    });
  });

  it('maps a native detector miss to null', () => {
    expect(nativePitchSnapshot({
      detected: false,
      frequency: null,
      confidence: 0,
      rms: 0.001,
      clipping: false,
      timestamp: 12_345,
    })).toBeNull();
  });
});
