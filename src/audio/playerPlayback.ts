import type { AudioPlayer, AudioStatus } from 'expo-audio';

export const PLAYER_LOAD_TIMEOUT_MS = 10_000;

export interface LoopPlaybackOptions {
  playbackRate: number;
  volume: number;
}

export function waitUntilPlayerReady(
  player: AudioPlayer,
  isCurrent: () => boolean,
  description: string,
  timeoutMs = PLAYER_LOAD_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription: { remove: () => void } | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      subscription?.remove();
      if (error) reject(error);
      else resolve();
    };
    const inspect = (status: Pick<AudioStatus, 'error' | 'isLoaded'>) => {
      if (!isCurrent()) finish(new Error(`${description} request was cancelled.`));
      else if (status.error) finish(new Error(status.error));
      else if (status.isLoaded) finish();
    };

    try {
      subscription = player.addListener('playbackStatusUpdate', inspect);
      inspect(player.currentStatus);
      if (settled) return;
      timeout = setTimeout(
        () => finish(new Error(`Timed out while loading ${description}.`)),
        timeoutMs,
      );
    } catch (error) {
      finish(error instanceof Error ? error : new Error(`Could not load ${description}.`));
    }
  });
}

export async function startLoopingPlayback(
  player: AudioPlayer,
  options: LoopPlaybackOptions,
  isCurrent: () => boolean,
  description: string,
): Promise<void> {
  await waitUntilPlayerReady(player, isCurrent, description);
  if (!isCurrent()) throw new Error(`${description} request was cancelled.`);

  player.shouldCorrectPitch = false;
  player.setPlaybackRate(options.playbackRate);
  player.volume = options.volume;
  player.loop = true;
  await player.seekTo(0);

  if (!isCurrent()) throw new Error(`${description} request was cancelled.`);
  player.play();
}
