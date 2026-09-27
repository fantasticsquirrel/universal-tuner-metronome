import type { AudioPlayer, AudioStatus } from 'expo-audio';

import { startLoopingPlayback } from '../playerPlayback';

type StatusListener = (status: AudioStatus) => void;

function fakeStatus(isLoaded: boolean, error: string | null = null): AudioStatus {
  return {
    id: 'test-player',
    currentTime: 0,
    playbackState: isLoaded ? 'ready' : 'buffering',
    timeControlStatus: 'paused',
    reasonForWaitingToPlay: '',
    mute: false,
    duration: 1,
    playing: false,
    loop: false,
    didJustFinish: false,
    isBuffering: !isLoaded,
    isLoaded,
    playbackRate: 1,
    shouldCorrectPitch: true,
    isLive: false,
    currentOffsetFromLive: null,
    error,
  };
}

function fakePlayer(initiallyLoaded: boolean) {
  let listener: StatusListener | null = null;
  const player = {
    currentStatus: fakeStatus(initiallyLoaded),
    addListener: jest.fn((_event: string, nextListener: StatusListener) => {
      listener = nextListener;
      return { remove: jest.fn() };
    }),
    setPlaybackRate: jest.fn(),
    seekTo: jest.fn().mockResolvedValue(undefined),
    play: jest.fn(),
    pause: jest.fn(),
    shouldCorrectPitch: true,
    volume: 1,
    loop: false,
  } as unknown as AudioPlayer;

  return {
    player,
    emit: (status: AudioStatus) => listener?.(status),
  };
}

describe('audio player readiness', () => {
  it('waits for a player to load before configuring and playing it', async () => {
    const { player, emit } = fakePlayer(false);
    const playback = startLoopingPlayback(
      player,
      { playbackRate: 1.25, volume: 0.6 },
      () => true,
      'the reference tone',
    );

    expect(player.play).not.toHaveBeenCalled();
    emit(fakeStatus(true));
    await playback;

    expect(player.setPlaybackRate).toHaveBeenCalledWith(1.25);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('surfaces load errors without invoking playback', async () => {
    const { player, emit } = fakePlayer(false);
    const playback = startLoopingPlayback(
      player,
      { playbackRate: 1, volume: 1 },
      () => true,
      'the reference tone',
    );

    emit(fakeStatus(false, 'Decoder failed'));
    await expect(playback).rejects.toThrow('Decoder failed');
    expect(player.play).not.toHaveBeenCalled();
  });

  it('does not play a request that was cancelled while loading', async () => {
    const { player, emit } = fakePlayer(false);
    let current = true;
    const playback = startLoopingPlayback(
      player,
      { playbackRate: 1, volume: 1 },
      () => current,
      'the reference tone',
    );

    current = false;
    emit(fakeStatus(true));
    await expect(playback).rejects.toThrow('cancelled');
    expect(player.play).not.toHaveBeenCalled();
  });
});
