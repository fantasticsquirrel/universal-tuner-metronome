import type { AccentLevel, SpeedTrainerSettings } from '@/types';

export const BPM_MIN = 20;
export const BPM_MAX = 400;

export function clampBpm(value: number): number {
  return Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(value)));
}

export function beatDurationMs(bpm: number, denominator: number): number {
  return (60_000 / clampBpm(bpm)) * (4 / denominator);
}

export function pulseDurationMs(bpm: number, denominator: number, subdivision: number): number {
  return beatDurationMs(bpm, denominator) / Math.max(1, subdivision);
}

export function defaultAccents(beats: number): AccentLevel[] {
  return Array.from({ length: beats }, (_, index) => (index === 0 ? 'accent' : 'normal'));
}

export function resizeAccents(accents: AccentLevel[], beats: number): AccentLevel[] {
  const count = Math.max(1, Math.min(32, Math.round(beats)));
  return Array.from({ length: count }, (_, index) => accents[index] ?? (index === 0 ? 'accent' : 'normal'));
}

export function cycleAccent(accent: AccentLevel): AccentLevel {
  if (accent === 'accent') return 'normal';
  if (accent === 'normal') return 'mute';
  return 'accent';
}

export function bpmFromTaps(timestamps: number[]): number | null {
  if (timestamps.length < 2) return null;
  const recent = timestamps.slice(-6);
  const intervals = recent.slice(1).map((time, index) => time - recent[index]!).filter((interval) => interval >= 150 && interval <= 3000);
  if (intervals.length === 0) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return clampBpm(60_000 / median);
}

export function trainedBpm(currentBpm: number, completedBars: number, trainer: SpeedTrainerSettings): number {
  if (!trainer.enabled || completedBars <= 0 || completedBars % trainer.everyBars !== 0) return currentBpm;
  return Math.min(clampBpm(trainer.targetBpm), clampBpm(currentBpm + trainer.increment));
}
