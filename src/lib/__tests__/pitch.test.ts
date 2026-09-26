import { analyzeFrequency, centsBetween, frequencyToMidi, midiToFrequency, midiToNote, writtenNote } from '../pitch';

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
});
