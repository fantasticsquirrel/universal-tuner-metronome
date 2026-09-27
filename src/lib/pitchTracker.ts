import type { PitchSnapshot } from '@/types';

export const PITCH_MISS_GRACE_MS = 200;

const CONTINUOUS_PITCH_CENTS = 80;
const SMOOTHING_WEIGHT = 0.55;

export interface PitchTrackResult {
  snapshot: PitchSnapshot | null;
  expiresAt: number | null;
}

function centsApart(first: number, second: number): number {
  return Math.abs(1200 * Math.log2(first / second));
}

/**
 * Stabilizes presentation without accumulating latency: nearby estimates are
 * smoothed, a large jump needs one confirmation, and brief detector misses
 * retain the last good value. A real note change is therefore delayed by at
 * most one analysis interval while isolated octave errors never reach the UI.
 */
export class PitchTracker {
  private current: PitchSnapshot | null = null;
  private pendingJump: PitchSnapshot | null = null;

  reset(): void {
    this.current = null;
    this.pendingJump = null;
  }

  update(
    candidate: PitchSnapshot | null,
    now: number,
    minimumConfidence: number,
  ): PitchTrackResult {
    if (this.current && now >= this.current.timestamp + PITCH_MISS_GRACE_MS) {
      this.current = null;
      this.pendingJump = null;
    }

    if (!candidate || candidate.confidence < minimumConfidence) {
      this.pendingJump = null;
      return this.result();
    }

    if (!this.current) {
      this.current = candidate;
      return this.result();
    }

    const jumpCents = centsApart(candidate.frequency, this.current.frequency);
    if (jumpCents > CONTINUOUS_PITCH_CENTS) {
      if (
        this.pendingJump
        && centsApart(candidate.frequency, this.pendingJump.frequency) <= CONTINUOUS_PITCH_CENTS
      ) {
        this.current = candidate;
        this.pendingJump = null;
      } else {
        this.pendingJump = candidate;
      }
      return this.result();
    }

    this.pendingJump = null;
    this.current = {
      ...candidate,
      // A geometric blend is linear in cents, unlike an arithmetic frequency
      // average. Weight the new sample more heavily to keep the gauge nimble.
      frequency: this.current.frequency
        * (candidate.frequency / this.current.frequency) ** SMOOTHING_WEIGHT,
    };
    return this.result();
  }

  private result(): PitchTrackResult {
    return {
      snapshot: this.current,
      expiresAt: this.current
        ? this.current.timestamp + PITCH_MISS_GRACE_MS
        : null,
    };
  }
}
