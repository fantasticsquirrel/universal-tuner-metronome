export interface PracticeClock {
  countInBarsRemaining: number;
  practiceElapsedSeconds: number;
  practiceSecondsRemaining: number | null;
  finished: boolean;
}

export function practiceClock(
  elapsedMs: number,
  barDurationMs: number,
  countInBars: number,
  practiceMinutes: number,
): PracticeClock {
  const safeElapsed = Math.max(0, elapsedMs);
  const safeBarDuration = Math.max(1, barDurationMs);
  const safeCountIn = Math.max(0, Math.min(4, Math.round(countInBars)));
  const countInDuration = safeCountIn * safeBarDuration;
  const remainingCountInMs = Math.max(0, countInDuration - safeElapsed);
  const countInBarsRemaining = remainingCountInMs > 0
    ? Math.ceil(remainingCountInMs / safeBarDuration)
    : 0;
  const practiceElapsedMs = Math.max(0, safeElapsed - countInDuration);
  const practiceElapsedSeconds = Math.floor(practiceElapsedMs / 1000);
  const durationSeconds = Math.max(0, Math.round(practiceMinutes)) * 60;
  const practiceSecondsRemaining = durationSeconds > 0
    ? Math.max(0, Math.ceil(durationSeconds - practiceElapsedMs / 1000))
    : null;
  return {
    countInBarsRemaining,
    practiceElapsedSeconds,
    practiceSecondsRemaining,
    finished: practiceSecondsRemaining === 0,
  };
}

export function formatPracticeTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}
