import { PitchTracker, PITCH_MISS_GRACE_MS } from '../pitchTracker';
import type { PitchSnapshot } from '@/types';

function snapshot(frequency: number, timestamp: number, confidence = 0.95): PitchSnapshot {
  return { frequency, confidence, rms: 0.01, clipping: false, timestamp };
}

describe('live pitch tracking', () => {
  it('holds brief detector misses but expires a genuinely stale pitch', () => {
    const tracker = new PitchTracker();
    expect(tracker.update(snapshot(440, 1_000), 1_000, 0.5).snapshot?.frequency).toBe(440);
    expect(tracker.update(null, 1_000 + PITCH_MISS_GRACE_MS - 1, 0.5).snapshot?.frequency).toBe(440);
    expect(tracker.update(null, 1_000 + PITCH_MISS_GRACE_MS, 0.5).snapshot).toBeNull();
  });

  it('smooths small gauge changes in cents without delaying their timestamps', () => {
    const tracker = new PitchTracker();
    tracker.update(snapshot(440, 1_000), 1_000, 0.5);
    const tracked = tracker.update(snapshot(442, 1_050), 1_050, 0.5).snapshot;
    expect(tracked?.frequency).toBeGreaterThan(440);
    expect(tracked?.frequency).toBeLessThan(442);
    expect(tracked?.timestamp).toBe(1_050);
  });

  it('suppresses a single octave glitch and confirms a real note change once', () => {
    const tracker = new PitchTracker();
    tracker.update(snapshot(110, 1_000), 1_000, 0.5);

    expect(tracker.update(snapshot(220, 1_050), 1_050, 0.5).snapshot?.frequency).toBe(110);
    expect(tracker.update(snapshot(219.8, 1_100), 1_100, 0.5).snapshot?.frequency).toBe(219.8);
  });

  it('treats a below-threshold estimate as a miss instead of UI churn', () => {
    const tracker = new PitchTracker();
    tracker.update(snapshot(440, 1_000), 1_000, 0.7);
    expect(tracker.update(snapshot(330, 1_050, 0.4), 1_050, 0.7).snapshot?.frequency).toBe(440);
  });
});
