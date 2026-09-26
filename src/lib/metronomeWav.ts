import { clampBpm } from '@/lib/metronome';
import type { AccentLevel, MetronomeSettings } from '@/types';

export const METRONOME_SAMPLE_RATE = 44_100;

export const METRONOME_CLICK_VOLUMES = {
  accent: 1,
  beat: 0.72,
  subdivision: 0.28,
} as const;

const CLICK_AMPLITUDE = 0.72;
const NORMAL_CLICK_SECONDS = 0.055;
const ACCENT_CLICK_SECONDS = 0.07;
const RENDER_VERSION = 1;

export type MetronomeLoopSettings = Pick<
  MetronomeSettings,
  'bpm' | 'beats' | 'denominator' | 'subdivision' | 'accents'
>;

export interface MetronomeClickVolumes {
  accent: number;
  beat: number;
  subdivision: number;
}

export interface MetronomeFrameEvent {
  pulse: number;
  frame: number;
  beat: number;
  subdivision: number;
  kind: Exclude<AccentLevel, 'mute'> | 'subdivision';
  volume: number;
}

export interface MetronomeFrameLayout {
  sampleRate: number;
  frameCount: number;
  pulsesPerBar: number;
  framesPerPulse: number;
  events: MetronomeFrameEvent[];
}

export interface RenderedMetronomeWav extends MetronomeFrameLayout {
  bytes: Uint8Array<ArrayBuffer>;
  durationSeconds: number;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boundedVolume(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizedCounts(settings: MetronomeLoopSettings) {
  return {
    beats: Math.max(1, Math.min(32, Math.round(finitePositive(settings.beats, 1)))),
    denominator: Math.max(1, Math.round(finitePositive(settings.denominator, 4))),
    subdivision: Math.max(1, Math.min(4, Math.round(finitePositive(settings.subdivision, 1)))),
  };
}

export function getMetronomeFrameLayout(
  settings: MetronomeLoopSettings,
  sampleRate = METRONOME_SAMPLE_RATE,
  volumes: MetronomeClickVolumes = METRONOME_CLICK_VOLUMES,
): MetronomeFrameLayout {
  const safeSampleRate = Math.max(8_000, Math.round(finitePositive(sampleRate, METRONOME_SAMPLE_RATE)));
  const { beats, denominator, subdivision } = normalizedCounts(settings);
  const pulsesPerBar = beats * subdivision;
  const framesPerPulse = safeSampleRate * (60 / clampBpm(settings.bpm)) * (4 / denominator) / subdivision;
  const frameCount = Math.max(1, Math.round(framesPerPulse * pulsesPerBar));
  const events: MetronomeFrameEvent[] = [];

  for (let pulse = 0; pulse < pulsesPerBar; pulse += 1) {
    const beat = Math.floor(pulse / subdivision);
    const subdivisionInBeat = pulse % subdivision;
    const frame = Math.min(frameCount - 1, Math.round(pulse * framesPerPulse));

    if (subdivisionInBeat !== 0) {
      events.push({
        pulse,
        frame,
        beat,
        subdivision: subdivisionInBeat,
        kind: 'subdivision',
        volume: boundedVolume(volumes.subdivision),
      });
      continue;
    }

    const accent = settings.accents[beat] ?? (beat === 0 ? 'accent' : 'normal');
    if (accent === 'mute') continue;
    events.push({
      pulse,
      frame,
      beat,
      subdivision: 0,
      kind: accent,
      volume: boundedVolume(accent === 'accent' ? volumes.accent : volumes.beat),
    });
  }

  return { sampleRate: safeSampleRate, frameCount, pulsesPerBar, framesPerPulse, events };
}

function normalClickSample(time: number): number {
  return Math.sin(2 * Math.PI * 1_300 * time) * Math.exp(-time * 82) * CLICK_AMPLITUDE;
}

function accentClickSample(time: number): number {
  return (
    Math.sin(2 * Math.PI * 1_900 * time)
    + 0.3 * Math.sin(2 * Math.PI * 950 * time)
  ) * Math.exp(-time * 70) * CLICK_AMPLITUDE;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function renderMetronomeWav(
  settings: MetronomeLoopSettings,
  sampleRate = METRONOME_SAMPLE_RATE,
  volumes: MetronomeClickVolumes = METRONOME_CLICK_VOLUMES,
): RenderedMetronomeWav {
  const layout = getMetronomeFrameLayout(settings, sampleRate, volumes);
  const samples = new Float32Array(layout.frameCount);

  for (const event of layout.events) {
    const accented = event.kind === 'accent';
    const clickFrameCount = Math.round(
      (accented ? ACCENT_CLICK_SECONDS : NORMAL_CLICK_SECONDS) * layout.sampleRate,
    );

    for (let clickFrame = 0; clickFrame < clickFrameCount; clickFrame += 1) {
      const time = clickFrame / layout.sampleRate;
      const sample = accented ? accentClickSample(time) : normalClickSample(time);
      // Wrapping the tail makes the waveform itself periodic, including at very fast tempos.
      const targetFrame = (event.frame + clickFrame) % layout.frameCount;
      samples[targetFrame] = (samples[targetFrame] ?? 0) + sample * event.volume;
    }
  }

  const dataBytes = layout.frameCount * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, layout.sampleRate, true);
  view.setUint32(28, layout.sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  for (let frame = 0; frame < layout.frameCount; frame += 1) {
    const sample = Math.max(-1, Math.min(1, samples[frame] ?? 0));
    view.setInt16(44 + frame * 2, Math.round(sample * 32_767), true);
  }

  return {
    ...layout,
    bytes,
    durationSeconds: layout.frameCount / layout.sampleRate,
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function metronomeLoopCacheKey(
  settings: MetronomeLoopSettings,
  sampleRate = METRONOME_SAMPLE_RATE,
  volumes: MetronomeClickVolumes = METRONOME_CLICK_VOLUMES,
): string {
  const { beats, denominator, subdivision } = normalizedCounts(settings);
  const accents = Array.from(
    { length: beats },
    (_, beat) => settings.accents[beat] ?? (beat === 0 ? 'accent' : 'normal'),
  );
  return fnv1a(JSON.stringify({
    version: RENDER_VERSION,
    bpm: clampBpm(settings.bpm),
    beats,
    denominator,
    subdivision,
    accents,
    sampleRate: Math.max(8_000, Math.round(finitePositive(sampleRate, METRONOME_SAMPLE_RATE))),
    volumes: {
      accent: boundedVolume(volumes.accent),
      beat: boundedVolume(volumes.beat),
      subdivision: boundedVolume(volumes.subdivision),
    },
  }));
}
