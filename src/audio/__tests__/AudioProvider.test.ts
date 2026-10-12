import React from 'react';
import type { AudioPlayer } from 'expo-audio';

import { midiToFrequency } from '@/lib/pitch';
import { DEFAULT_STATE } from '@/lib/persistedState';
import { AudioProvider, useAudioControls, useRuntimeAudio } from '../AudioProvider';
import TunerScreen from '../../../app/(tabs)/index';
import { Screen } from '@/components/Controls';
import { MetronomeMini } from '@/components/MetronomeMini';
import { usePitchInput } from '../usePitchInput';
import { lightPalette } from '@/theme';

// First native-component transform/render can exceed Jest's default on CI.
jest.setTimeout(20_000);

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../usePitchInput', () => {
  const input = { permission: 'granted', snapshot: null, error: null, isListening: true, start: jest.fn(), stop: jest.fn() };
  return { usePitchInput: jest.fn(() => input) };
});
jest.mock('@/components/Controls', () => {
  const actual = jest.requireActual('@/components/Controls');
  return { ...actual, Screen: jest.fn(actual.Screen) };
});
jest.mock('@/components/MetronomeMini', () => {
  const actual = jest.requireActual('@/components/MetronomeMini');
  return { MetronomeMini: jest.fn(actual.MetronomeMini) };
});

jest.mock('expo-audio', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const players: AudioPlayer[] = [];

  return {
    __players: players,
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    useAudioPlayer: jest.fn(() => {
      const playerRef = ReactModule.useRef<AudioPlayer | null>(null);
      if (!playerRef.current) {
        const listeners = new Set<(mockStatus: object) => void>();
        playerRef.current = {
          currentStatus: { error: null, isLoaded: true },
          addListener: jest.fn((_event, listener) => {
            listeners.add(listener);
            return { remove: () => listeners.delete(listener) };
          }),
          pause: jest.fn(),
          play: jest.fn(),
          replace: jest.fn(() => listeners.forEach((listener) => listener({ isLoaded: true }))),
          seekTo: jest.fn().mockResolvedValue(undefined),
          setPlaybackRate: jest.fn(),
          shouldCorrectPitch: true,
          volume: 1,
          loop: false,
        } as unknown as AudioPlayer;
        players.push(playerRef.current);
      }
      return playerRef.current;
    }),
  };
});

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({ exists: false, uri: '/cache/loop.wav', create: jest.fn(), write: jest.fn() })),
  Paths: { cache: '/cache' },
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  impactAsync: jest.fn().mockResolvedValue(undefined),
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/store/AppProvider', () => ({ useApp: jest.fn() }));

interface Renderer {
  unmount: () => void;
}

const { act, create } = jest.requireActual('react-test-renderer') as {
  act: (callback: () => void | Promise<void>) => Promise<void>;
  create: (element: React.ReactElement) => Renderer;
};
const audioMock = jest.requireMock('expo-audio') as { __players: AudioPlayer[] };
const appMock = jest.requireMock('@/store/AppProvider') as { useApp: jest.Mock };

describe('reference tone selection playback', () => {
  let renderer: Renderer | null = null;
  let runtime: ReturnType<typeof useRuntimeAudio> | null = null;

  function RuntimeCapture() {
    runtime = useRuntimeAudio();
    return null;
  }

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(async () => {
    audioMock.__players.splice(0);
    appMock.useApp.mockReturnValue({
      state: DEFAULT_STATE,
      updateMetronome: jest.fn(),
    });
    await act(async () => {
      renderer = create(React.createElement(AudioProvider, null, React.createElement(RuntimeCapture)));
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = null;
    runtime = null;
  });

  it('retunes active playback to a newly selected MIDI pitch', async () => {
    const lowTonePlayer = audioMock.__players[4]!;
    const highTonePlayer = audioMock.__players[5]!;

    await act(async () => {
      runtime!.toggleTone(55);
    });
    expect(lowTonePlayer.setPlaybackRate).toHaveBeenLastCalledWith(midiToFrequency(55) / 110);
    expect(lowTonePlayer.play).toHaveBeenCalledTimes(1);

    await act(async () => {
      runtime!.retuneTone(62);
    });
    expect(lowTonePlayer.pause).toHaveBeenCalled();
    expect(highTonePlayer.setPlaybackRate).toHaveBeenLastCalledWith(midiToFrequency(62) / 440);
    expect(highTonePlayer.play).toHaveBeenCalledTimes(1);

    await act(async () => {
      runtime!.toggleTone(62);
    });
    expect(lowTonePlayer.pause).toHaveBeenCalled();
    expect(highTonePlayer.pause).toHaveBeenCalled();
    expect(highTonePlayer.play).toHaveBeenCalledTimes(1);
  });

  it('does not start playback when MIDI selection changes while inactive', async () => {
    await act(async () => {
      runtime!.retuneTone(62);
    });

    const tonePlayers = audioMock.__players.slice(4);
    for (const player of tonePlayers) {
      expect(player.setPlaybackRate).not.toHaveBeenCalled();
      expect(player.play).not.toHaveBeenCalled();
    }
  });

  it('lets the latest selection win when active pitches change rapidly', async () => {
    const highTonePlayer = audioMock.__players[5]!;

    await act(async () => {
      runtime!.toggleTone(55);
    });
    await act(async () => {
      runtime!.retuneTone(62);
      runtime!.retuneTone(69);
    });

    expect(highTonePlayer.setPlaybackRate).toHaveBeenCalledTimes(1);
    expect(highTonePlayer.setPlaybackRate).toHaveBeenCalledWith(midiToFrequency(69) / 440);
    expect(highTonePlayer.play).toHaveBeenCalledTimes(1);
  });
});

describe('audio control subscription isolation', () => {
  it('keeps control consumers stable while legacy consumers receive every pulse and practice clock update', async () => {
    jest.useFakeTimers();
    audioMock.__players.splice(0);
    appMock.useApp.mockReturnValue({
      state: { ...DEFAULT_STATE, metronome: { ...DEFAULT_STATE.metronome, bpm: 120, subdivision: 2, countInBars: 1, practiceMinutes: 1 } },
      palette: lightPalette,
      updateTuner: jest.fn(),
      updateMetronome: jest.fn(),
    });
    let controls!: ReturnType<typeof useAudioControls>;
    let runtime!: ReturnType<typeof useRuntimeAudio>;
    let controlRenders = 0;
    let pulseRenders = 0;
    function ControlConsumer() {
      controls = useAudioControls();
      controlRenders += 1;
      return null;
    }
    function LegacyPulseConsumer() {
      runtime = useRuntimeAudio();
      pulseRenders += 1;
      return null;
    }
    let renderer: Renderer | null = null;
    try {
      await act(async () => {
        renderer = create(React.createElement(AudioProvider, null,
          React.createElement(ControlConsumer), React.createElement(LegacyPulseConsumer), React.createElement(TunerScreen)));
      });
      await act(async () => controls.toggleMetronome());
      await act(async () => { jest.advanceTimersByTime(0); });
      expect(audioMock.__players[0]!.play).toHaveBeenCalledTimes(1);
      expect(runtime.running).toBe(true);
      expect(runtime.countInBarsRemaining).toBe(1);
      const stableControls = controls;
      const before = {
        controls: controlRenders,
        pulses: pulseRenders,
        screen: (Screen as jest.Mock).mock.calls.length,
        live: (usePitchInput as jest.Mock).mock.calls.length,
        mini: (MetronomeMini as jest.Mock).mock.calls.length,
      };
      for (let pulse = 1; pulse <= 16; pulse += 1) {
        await act(async () => { jest.advanceTimersByTime(250); });
        expect(runtime.currentBeat).toBe(Math.floor((pulse % 8) / 2));
        expect(runtime.currentSubdivision).toBe(pulse % 2);
        expect(runtime.countInBarsRemaining).toBe(pulse < 8 ? 1 : 0);
      }
      expect(runtime.practiceElapsedSeconds).toBe(2);
      expect(runtime.practiceSecondsRemaining).toBe(58);
      const counts = { controls: controlRenders - before.controls, pulses: pulseRenders - before.pulses };
      process.stdout.write(`16 independently committed metronome pulses: ${JSON.stringify(counts)}\n`);
      expect(counts).toEqual({ controls: 0, pulses: 16 });
      expect(controls).toBe(stableControls);
      const consumerCounts = {
        screen: (Screen as jest.Mock).mock.calls.length - before.screen,
        live: (usePitchInput as jest.Mock).mock.calls.length - before.live,
        mini: (MetronomeMini as jest.Mock).mock.calls.length - before.mini,
      };
      process.stdout.write(`Actual tuner + metronome consumers across those pulses: ${JSON.stringify(consumerCounts)}\n`);
      expect(consumerCounts).toEqual({ screen: 0, live: 0, mini: 16 });
      expect(usePitchInput).toHaveBeenLastCalledWith(expect.any(String), expect.any(Number), expect.any(Number), true);
      await act(async () => controls.toggleTone(69));
      expect(controls.tonePlaying).toBe(true);
      expect(controlRenders).toBe(before.controls + 1);
      await act(async () => controls.stopMetronome());
      expect(controls.running).toBe(false);
      expect(runtime.currentBeat).toBe(-1);
      expect(runtime.currentSubdivision).toBe(0);
      expect(runtime.practiceElapsedSeconds).toBe(0);
      expect(runtime.practiceSecondsRemaining).toBe(60);
      // Combined tuner/metronome capture remains enabled, including tone-only.
      expect(usePitchInput).toHaveBeenLastCalledWith(expect.any(String), expect.any(Number), expect.any(Number), true);
      await act(async () => controls.stopTone());
      expect(controls.tonePlaying).toBe(false);
      expect(usePitchInput).toHaveBeenLastCalledWith(expect.any(String), expect.any(Number), expect.any(Number), false);
    } finally {
      await act(async () => renderer?.unmount());
      jest.useRealTimers();
    }
  });
});
