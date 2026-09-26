import { beatDurationMs, bpmFromTaps, clampBpm, defaultAccents, resizeAccents, trainedBpm } from '../metronome';

describe('metronome helpers', () => {
  it('clamps tempo and calculates meter-aware beats', () => {
    expect(clampBpm(5)).toBe(20);
    expect(clampBpm(500)).toBe(400);
    expect(beatDurationMs(120, 4)).toBe(500);
    expect(beatDurationMs(120, 8)).toBe(250);
  });

  it('uses a median tap interval and ignores unusable gaps', () => {
    expect(bpmFromTaps([0, 500, 1000, 1500])).toBe(120);
    expect(bpmFromTaps([0])).toBeNull();
  });

  it('maintains accents when meter changes', () => {
    expect(defaultAccents(3)).toEqual(['accent', 'normal', 'normal']);
    expect(resizeAccents(['accent', 'mute'], 4)).toEqual(['accent', 'mute', 'normal', 'normal']);
  });

  it('advances a trainer only at configured bar boundaries', () => {
    const trainer = { enabled: true, increment: 5, everyBars: 2, targetBpm: 130 };
    expect(trainedBpm(100, 1, trainer)).toBe(100);
    expect(trainedBpm(100, 2, trainer)).toBe(105);
    expect(trainedBpm(128, 4, trainer)).toBe(130);
  });
});
