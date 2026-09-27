import { adjustedTargetMidi, analyzeFrequency, centsBetween, effectiveNoiseGate, frequencyToMidi, midiToFrequency, midiToNote, minimumConfidence, writtenNote, yinThreshold } from '../pitch';

describe('pitch math', () => {
  it('round-trips MIDI and frequency across the useful range', () => {
    for (let midi = 21; midi <= 108; midi += 1) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 8);
    }
  });

  it('supports calibration and cents offsets', () => {
    expect(midiToFrequency(69, 442)).toBe(442);
    expect(centsBetween(440 * 2 ** (3 / 1200), 440)).toBeCloseTo(3, 8);
    expect(analyzeFrequency(440)?.cents).toBeCloseTo(0, 8);
  });

  it('labels octaves and transposing instruments', () => {
    expect(midiToNote(60)).toEqual({ name: 'C', octave: 4 });
    expect(writtenNote(70, 2)).toEqual({ name: 'C', octave: 5 });
    expect(writtenNote(63, 9)).toEqual({ name: 'C', octave: 5 });
    expect(writtenNote(65, 7)).toEqual({ name: 'C', octave: 5 });
  });

  it('applies capo and whole-instrument detune to guided targets', () => {
    expect(adjustedTargetMidi(40, 2, -1)).toBe(41);
    expect(adjustedTargetMidi(127, 12, 0)).toBe(127);
    expect(adjustedTargetMidi(0, 0, -12)).toBe(0);
  });

  it('maps sensitivity to permissive detector thresholds', () => {
    expect(minimumConfidence(100)).toBeLessThan(minimumConfidence(0));
    expect(yinThreshold(100)).toBeGreaterThan(yinThreshold(0));
    expect(effectiveNoiseGate(0.008, 65)).toBeCloseTo(0.0028);
    expect(effectiveNoiseGate(0.008, 100)).toBeCloseTo(0.0008);
    expect(minimumConfidence(-20)).toBe(minimumConfidence(0));
    expect(yinThreshold(120)).toBe(yinThreshold(100));
  });
});
