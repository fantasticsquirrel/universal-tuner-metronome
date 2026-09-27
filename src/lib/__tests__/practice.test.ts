import { formatPracticeTime, practiceClock } from '../practice';

describe('practice clock', () => {
  it('counts whole bars before starting the practice timer', () => {
    expect(practiceClock(0, 2_000, 2, 1)).toEqual({
      countInBarsRemaining: 2,
      practiceElapsedSeconds: 0,
      practiceSecondsRemaining: 60,
      finished: false,
    });
    expect(practiceClock(2_001, 2_000, 2, 1).countInBarsRemaining).toBe(1);
    expect(practiceClock(4_000, 2_000, 2, 1)).toEqual({
      countInBarsRemaining: 0,
      practiceElapsedSeconds: 0,
      practiceSecondsRemaining: 60,
      finished: false,
    });
  });

  it('finishes a timed session and leaves untimed sessions open', () => {
    expect(practiceClock(64_000, 2_000, 2, 1)).toMatchObject({
      practiceElapsedSeconds: 60,
      practiceSecondsRemaining: 0,
      finished: true,
    });
    expect(practiceClock(90_000, 2_000, 0, 0)).toMatchObject({
      practiceElapsedSeconds: 90,
      practiceSecondsRemaining: null,
      finished: false,
    });
  });

  it('formats session time for compact controls', () => {
    expect(formatPracticeTime(0)).toBe('0:00');
    expect(formatPracticeTime(65)).toBe('1:05');
  });
});
