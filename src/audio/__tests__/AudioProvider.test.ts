import React from 'react';
import type { AudioPlayer } from 'expo-audio';

import { midiToFrequency } from '@/lib/pitch';
import { DEFAULT_STATE } from '@/lib/persistedState';
import { AudioProvider, useRuntimeAudio } from '../AudioProvider';

jest.mock('expo-audio', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const players: AudioPlayer[] = [];

  return {
    __players: players,
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    useAudioPlayer: jest.fn(() => {
      const playerRef = ReactModule.useRef<AudioPlayer | null>(null);
      if (!playerRef.current) {
        playerRef.current = {
          currentStatus: { error: null, isLoaded: true },
          addListener: jest.fn(() => ({ remove: jest.fn() })),
          pause: jest.fn(),
          play: jest.fn(),
          replace: jest.fn(),
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
  File: jest.fn(),
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
