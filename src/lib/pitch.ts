const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

export interface NoteInfo {
  midi: number;
  roundedMidi: number;
  name: string;
  octave: number;
  cents: number;
  targetFrequency: number;
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function frequencyToMidi(frequency: number, a4 = 440): number {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(a4) || a4 <= 0) return Number.NaN;
  return 69 + 12 * Math.log2(frequency / a4);
}

export function centsBetween(frequency: number, targetFrequency: number): number {
  if (frequency <= 0 || targetFrequency <= 0) return Number.NaN;
  return 1200 * Math.log2(frequency / targetFrequency);
}

export function midiToNote(midi: number): { name: string; octave: number } {
  const rounded = Math.round(midi);
  const pitchClass = ((rounded % 12) + 12) % 12;
  return { name: SHARP_NAMES[pitchClass]!, octave: Math.floor(rounded / 12) - 1 };
}

export function analyzeFrequency(frequency: number, a4 = 440, targetMidi?: number): NoteInfo | null {
  const midi = frequencyToMidi(frequency, a4);
  if (!Number.isFinite(midi)) return null;
  const roundedMidi = targetMidi ?? Math.round(midi);
  const targetFrequency = midiToFrequency(roundedMidi, a4);
  const label = midiToNote(roundedMidi);
  return {
    midi,
    roundedMidi,
    name: label.name,
    octave: label.octave,
    cents: centsBetween(frequency, targetFrequency),
    targetFrequency,
  };
}

export function writtenNote(concertMidi: number, transpositionSemitones: number): { name: string; octave: number } {
  return midiToNote(concertMidi + transpositionSemitones);
}

export function adjustedTargetMidi(midi: number, capo: number, detune: number): number {
  return Math.max(0, Math.min(127, midi + Math.round(capo) + Math.round(detune)));
}

export function minimumConfidence(sensitivity: number): number {
  const normalized = Math.max(0, Math.min(100, sensitivity)) / 100;
  return 0.85 - normalized * 0.5;
}

export function yinThreshold(sensitivity: number): number {
  const normalized = Math.max(0, Math.min(100, sensitivity)) / 100;
  return 0.08 + normalized * 0.17;
}

export function clampCents(cents: number, limit = 50): number {
  return Math.max(-limit, Math.min(limit, cents));
}

export function formatCents(cents: number): string {
  const rounded = Math.abs(cents) < 0.05 ? 0 : Math.round(cents * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} ¢`;
}
