import React from 'react';
import { Linking, Text } from 'react-native';
import * as Haptics from 'expo-haptics';

import TunerScreen from '../../../app/(tabs)/index';
import { Screen, Sheet, PillButton } from '../Controls';
import { MetronomeMini } from '../MetronomeMini';
import { TuningGauge } from '../TuningGauge';
import { DEFAULT_STATE } from '@/lib/persistedState';
import { findInstrument, findTuning } from '@/constants/instruments';
import { midiToFrequency } from '@/lib/pitch';
import { lightPalette } from '@/theme';
import type { PitchSnapshot, TunerSettings } from '@/types';

// First native-component transform/render can exceed Jest's default on CI.
jest.setTimeout(20_000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success' },
  notificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/store/AppProvider', () => ({ useApp: jest.fn() }));
jest.mock('@/audio/AudioProvider', () => {
  const controls = { running: false, tonePlaying: false, toneError: null, toggleTone: jest.fn(), retuneTone: jest.fn() };
  return { __controls: controls, useRuntimeAudio: () => controls, useAudioControls: () => controls };
});
jest.mock('@/audio/usePitchInput', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  let input: object;
  const listeners = new Set<() => void>();
  const subscribe = (callback: () => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; };
  return {
    __setInput: (next: object) => { input = next; listeners.forEach((callback) => callback()); },
    usePitchInput: jest.fn(() => ReactModule.useSyncExternalStore(subscribe, () => input)),
  };
});
jest.mock('../Controls', () => {
  const actual = jest.requireActual('../Controls');
  return { ...actual, Screen: jest.fn(actual.Screen), Sheet: jest.fn(actual.Sheet) };
});
jest.mock('../MetronomeMini', () => ({ MetronomeMini: jest.fn(() => null) }));

const { act, create } = jest.requireActual('react-test-renderer');
const appMock = jest.requireMock('@/store/AppProvider');
const pitchMock = jest.requireMock('@/audio/usePitchInput');
const audio = jest.requireMock('@/audio/AudioProvider').__controls;

// The production hook is replaced only at its microphone/event boundary. Each
// emission independently commits, as real asynchronous pitch events do.
describe('live tuner consumer behavior', () => {
  let renderer: ReturnType<typeof create>;
  let state: typeof DEFAULT_STATE;
  let input: { permission: string; snapshot: PitchSnapshot | null; error: string | null; isListening: boolean; start: jest.Mock; stop: jest.Mock };
  const updateTuner = jest.fn();

  beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    state = { ...DEFAULT_STATE, tuner: { ...DEFAULT_STATE.tuner } };
    input = { permission: 'granted', snapshot: null, error: null, isListening: true, start: jest.fn().mockResolvedValue(undefined), stop: jest.fn().mockResolvedValue(undefined) };
    audio.running = false;
    audio.tonePlaying = false;
    audio.toneError = null;
    appMock.useApp.mockImplementation(() => ({ state, palette: lightPalette, updateTuner }));
    pitchMock.__setInput(input);
  });
  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  const mount = async () => { await act(async () => { renderer = create(React.createElement(TunerScreen)); }); };
  const emit = async (patch: Partial<typeof input>) => {
    input = { ...input, ...patch };
    await act(async () => pitchMock.__setInput(input));
    await act(async () => jest.advanceTimersByTime(0));
  };
  const pitch = async (frequency: number, timestamp: number, extra: Partial<PitchSnapshot> = {}) => emit({ snapshot: { frequency, timestamp, confidence: 0.99, rms: 0.1, clipping: false, ...extra } });
  const texts = () => renderer.root.findAllByType(Text).map((node: { props: { children: unknown } }) => node.props.children).flat().join(' ');
  const press = async (label: string) => {
    const button = renderer.root.findAll((node: { props: { accessibilityLabel?: string; onPress?: () => void } }) => node.props.accessibilityLabel === label && Boolean(node.props.onPress))[0];
    expect(button).toBeDefined();
    await act(async () => button.props.onPress());
  };
  const settings = async (patch: Partial<TunerSettings>) => {
    state = { ...state, tuner: { ...state.tuner, ...patch } };
    await act(async () => renderer.update(React.createElement(TunerScreen)));
  };

  it('characterizes timestamp lock hold, one haptic per lock and loss/reacquisition', async () => {
    await mount();
    await pitch(440, 1000);
    await pitch(440, 1699);
    expect(texts()).not.toContain('LOCKED');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await pitch(440, 1700);
    expect(texts()).toContain('LOCKED');
    await pitch(440, 1800);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    await pitch(440, 1900, { confidence: 0.1 });
    expect(texts()).not.toContain('LOCKED');
    await pitch(440, 2000);
    await pitch(440, 2700);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
    expect(updateTuner).not.toHaveBeenCalled();
  });

  it('characterizes guided mismatch, auto-advance, transpose, details and clipping', async () => {
    const instrument = findInstrument('guitar-6', []);
    const tuning = findTuning(instrument, instrument.tunings[0]!.id)!;
    state.tuner = { ...state.tuner, instrumentId: instrument.id, tuningId: tuning.id, transposition: 2 };
    const target = tuning.targets[0]!;
    await mount();
    await pitch(midiToFrequency(target.midi + 12), 1000);
    expect(texts()).toContain('AIM FOR');
    expect(renderer.root.findByType(TuningGauge).props.active).toBe(false);
    await pitch(midiToFrequency(target.midi), 2000, { clipping: true });
    expect(texts()).toContain('Concert');
    expect(texts()).toContain('Input is clipping');
    expect(texts()).toContain('99%');
    await pitch(midiToFrequency(target.midi), 2700);
    expect(updateTuner).toHaveBeenCalledTimes(1);
    expect(updateTuner).toHaveBeenCalledWith({ targetIndex: 1 });
    await pitch(midiToFrequency(target.midi), 2800);
    expect(updateTuner).toHaveBeenCalledTimes(1);
  });

  it('uses the latest detected note for tone presses, but retunes only selected targets', async () => {
    await mount();
    expect(audio.retuneTone).toHaveBeenLastCalledWith(69);
    await pitch(midiToFrequency(62), 1000);
    await press('Play reference tone');
    expect(audio.toggleTone).toHaveBeenLastCalledWith(62);
    expect(audio.retuneTone).toHaveBeenCalledTimes(1);
    await settings({ referenceToneMidi: 72 });
    expect(audio.retuneTone).toHaveBeenLastCalledWith(72);
    await emit({ snapshot: null });
    await press('Play reference tone');
    expect(audio.toggleTone).toHaveBeenLastCalledWith(72);
    const instrument = findInstrument('guitar-6', []);
    await settings({ instrumentId: instrument.id, tuningId: instrument.tunings[0]!.id, capo: 2 });
    const targetMidi = instrument.tunings[0]!.targets[0]!.midi + 2;
    expect(audio.retuneTone).toHaveBeenLastCalledWith(targetMidi);
    await pitch(440, 2000);
    await press('Play reference tone');
    expect(audio.toggleTone).toHaveBeenLastCalledWith(targetMidi);
  });

  it('auto-starts once and preserves manual listening, permission and retry actions', async () => {
    input.isListening = false;
    await mount();
    expect(input.start).toHaveBeenCalledTimes(1);
    await emit({ isListening: true });
    await press('Stop listening');
    expect(input.stop).toHaveBeenCalledTimes(1);
    await emit({ isListening: false });
    expect(input.start).toHaveBeenCalledTimes(1);
    await press('Start listening');
    expect(input.start).toHaveBeenCalledTimes(2);
    await emit({ permission: 'denied' });
    expect(texts()).toContain('Input problem');
    expect(texts()).toContain('Microphone access is turned off.');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const action = renderer.root.findAllByType(PillButton).find((node: { props: { label: string } }) => node.props.label === 'Open settings');
    await act(async () => action.props.onPress());
    expect(openSettings).toHaveBeenCalledTimes(1);
    await emit({ permission: 'error', error: 'Route failed' });
    expect(texts()).toContain('Route failed');
    const retry = renderer.root.findAllByType(PillButton).find((node: { props: { label: string } }) => node.props.label === 'Retry');
    await act(async () => retry.props.onPress());
    expect(input.start).toHaveBeenCalledTimes(3);
    await emit({ permission: 'granted', error: null });
    expect(texts()).not.toContain('Input problem');
  });

  it('resets the hold on a new guided target and respects disabled auto-advance', async () => {
    const instrument = findInstrument('guitar-6', []);
    const tuning = instrument.tunings[0]!;
    state.tuner = { ...state.tuner, instrumentId: instrument.id, tuningId: tuning.id, autoAdvance: false };
    await mount();
    await pitch(midiToFrequency(tuning.targets[0]!.midi), 1000);
    await pitch(midiToFrequency(tuning.targets[0]!.midi), 1700);
    expect(texts()).toContain('LOCKED');
    expect(updateTuner).not.toHaveBeenCalled();
    await settings({ targetIndex: 1 });
    expect(texts()).not.toContain('LOCKED');
    await pitch(midiToFrequency(tuning.targets[1]!.midi), 1800);
    await pitch(midiToFrequency(tuning.targets[1]!.midi), 2499);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    await pitch(midiToFrequency(tuning.targets[1]!.midi), 2500);
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
    expect(updateTuner).not.toHaveBeenCalled();
  });

  it('surfaces tone errors and permission requests without losing listening controls', async () => {
    input.permission = 'undetermined';
    input.isListening = false;
    audio.toneError = 'Reference tone failed';
    await mount();
    expect(input.start).not.toHaveBeenCalled();
    expect(texts()).toContain('Input problem');
    expect(texts()).toContain('Reference tone failed');
    const allow = renderer.root.findAllByType(PillButton).find((node: { props: { label: string } }) => node.props.label === 'Allow mic');
    await act(async () => allow.props.onPress());
    expect(input.start).toHaveBeenCalledTimes(1);
    audio.tonePlaying = true;
    await emit({ permission: 'granted', isListening: true });
    await press('Stop reference tone');
    expect(audio.toggleTone).toHaveBeenCalledTimes(1);
    expect(texts()).not.toContain('Input problem');
  });

  it('isolates 20 pitch emissions from screen chrome and metronome rendering', async () => {
    await mount();
    const screenBefore = (Screen as jest.Mock).mock.calls.length;
    const miniBefore = (MetronomeMini as jest.Mock).mock.calls.length;
    const pitchBefore = pitchMock.usePitchInput.mock.calls.length;
    for (let index = 0; index < 20; index += 1) await pitch(442 + index / 10, 1000 + index * 10);
    const counts = {
      screen: (Screen as jest.Mock).mock.calls.length - screenBefore,
      metronome: (MetronomeMini as jest.Mock).mock.calls.length - miniBefore,
      live: pitchMock.usePitchInput.mock.calls.length - pitchBefore,
    };
    process.stdout.write(`20 independently committed pitch emissions: ${JSON.stringify(counts)}\n`);
    expect(counts).toEqual({ screen: 0, metronome: 0, live: 20 });
    expect(texts()).toContain('443.9 Hz');
  });

  it('does not construct closed sheets and keeps instrument selection working', async () => {
    await mount();
    expect(Sheet).not.toHaveBeenCalled();
    const mode = renderer.root.findAllByType(PillButton).find((node: { props: { icon?: string } }) => node.props.icon === 'musical-notes-outline');
    await act(async () => mode.props.onPress());
    expect(renderer.root.findAllByType(Sheet)).toHaveLength(1);
    const instrument = findInstrument('guitar-6', []);
    await press(`Use ${instrument.name} ${instrument.variant ?? ''}`);
    expect(updateTuner).toHaveBeenCalledWith(expect.objectContaining({ instrumentId: 'guitar-6', targetIndex: 0 }));
    expect(renderer.root.findAllByType(Sheet)).toHaveLength(0);
  });
});
