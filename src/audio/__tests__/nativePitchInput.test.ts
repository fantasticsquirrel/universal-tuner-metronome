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

  it('preserves the age of a latest-value handoff instead of refreshing an old reading', () => {
    expect(nativePitchSnapshot({
      detected: true, frequency: 440, confidence: 0.98, rms: 0.01,
      clipping: false, timestamp: 12_345, ageMs: 75,
    }, 10_000)?.timestamp).toBe(9_925);
  });

  it.each([200, 500, Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'does not publish expired or invalid native age %s',
    (ageMs) => {
      expect(nativePitchSnapshot({
        detected: true, frequency: 440, confidence: 0.98, rms: 0.01,
        clipping: false, timestamp: 12_345, ageMs,
      }, 10_000)).toBeNull();
    },
  );
});
