import type { InstrumentPreset, TuningPreset } from '@/types';

const tuning = (id: string, name: string, notes: [string, number][]): TuningPreset => ({
  id,
  name,
  targets: notes.map(([label, midi]) => ({ label, midi })),
});

export const INSTRUMENTS: InstrumentPreset[] = [
  {
    id: 'chromatic', family: 'All', name: 'Chromatic', transpositionSemitones: 0,
    detectorProfile: 'general', aliases: ['universal', 'voice', 'piano'], tunings: [],
  },
  {
    id: 'guitar-6', family: 'Guitar', name: 'Guitar', variant: '6-string', transpositionSemitones: 0,
    detectorProfile: 'general', aliases: ['acoustic', 'electric'], tunings: [
      tuning('guitar-standard', 'Standard', [['6', 40], ['5', 45], ['4', 50], ['3', 55], ['2', 59], ['1', 64]]),
      tuning('guitar-drop-d', 'Drop D', [['6', 38], ['5', 45], ['4', 50], ['3', 55], ['2', 59], ['1', 64]]),
      tuning('guitar-dadgad', 'DADGAD', [['6', 38], ['5', 45], ['4', 50], ['3', 55], ['2', 57], ['1', 62]]),
    ],
  },
  {
    id: 'bass-4', family: 'Bass', name: 'Bass', variant: '4-string', transpositionSemitones: 0,
    detectorProfile: 'low', aliases: ['electric bass'], tunings: [
      tuning('bass-standard', 'Standard', [['E', 28], ['A', 33], ['D', 38], ['G', 43]]),
      tuning('bass-drop-d', 'Drop D', [['D', 26], ['A', 33], ['D', 38], ['G', 43]]),
    ],
  },
  {
    id: 'ukulele', family: 'Fretted strings', name: 'Ukulele', transpositionSemitones: 0,
    detectorProfile: 'general', aliases: ['uke'], tunings: [
      tuning('ukulele-high-g', 'High G', [['G', 67], ['C', 60], ['E', 64], ['A', 69]]),
      tuning('ukulele-low-g', 'Low G', [['G', 55], ['C', 60], ['E', 64], ['A', 69]]),
    ],
  },
  {
    id: 'violin', family: 'Bowed strings', name: 'Violin', transpositionSemitones: 0,
    detectorProfile: 'general', aliases: ['fiddle'], tunings: [tuning('violin-standard', 'Standard', [['G', 55], ['D', 62], ['A', 69], ['E', 76]])],
  },
  {
    id: 'viola', family: 'Bowed strings', name: 'Viola', transpositionSemitones: 0,
    detectorProfile: 'general', aliases: [], tunings: [tuning('viola-standard', 'Standard', [['C', 48], ['G', 55], ['D', 62], ['A', 69]])],
  },
  {
    id: 'cello', family: 'Bowed strings', name: 'Cello', transpositionSemitones: 0,
    detectorProfile: 'low', aliases: ['violoncello'], tunings: [tuning('cello-standard', 'Standard', [['C', 36], ['G', 43], ['D', 50], ['A', 57]])],
  },
  {
    id: 'double-bass', family: 'Bowed strings', name: 'Double bass', transpositionSemitones: 0,
    detectorProfile: 'low', aliases: ['upright bass'], tunings: [tuning('double-bass-standard', 'Standard', [['E', 28], ['A', 33], ['D', 38], ['G', 43]])],
  },
  {
    id: 'mandolin', family: 'Fretted strings', name: 'Mandolin', transpositionSemitones: 0,
    detectorProfile: 'general', aliases: [], tunings: [tuning('mandolin-standard', 'Standard', [['G', 55], ['D', 62], ['A', 69], ['E', 76]])],
  },
  {
    id: 'clarinet-bb', family: 'Woodwind', name: 'Clarinet', variant: 'B♭', transpositionSemitones: 2,
    detectorProfile: 'general', aliases: ['b-flat clarinet'], tunings: [],
  },
  {
    id: 'alto-sax-eb', family: 'Woodwind', name: 'Alto saxophone', variant: 'E♭', transpositionSemitones: 9,
    detectorProfile: 'general', aliases: ['alto sax'], tunings: [],
  },
  {
    id: 'trumpet-bb', family: 'Brass', name: 'Trumpet', variant: 'B♭', transpositionSemitones: 2,
    detectorProfile: 'general', aliases: ['cornet'], tunings: [],
  },
  {
    id: 'horn-f', family: 'Brass', name: 'French horn', variant: 'F', transpositionSemitones: 7,
    detectorProfile: 'general', aliases: ['horn'], tunings: [],
  },
  {
    id: 'flute-c', family: 'Woodwind', name: 'Flute', variant: 'C', transpositionSemitones: 0,
    detectorProfile: 'high', aliases: [], tunings: [],
  },
];

export const TRANSPOSITIONS = [
  { label: 'C', semitones: 0 },
  { label: 'B♭', semitones: 2 },
  { label: 'A', semitones: 3 },
  { label: 'E♭', semitones: 9 },
  { label: 'F', semitones: 7 },
  { label: 'G', semitones: 5 },
] as const;

export function allInstruments(customInstruments: InstrumentPreset[] = []): InstrumentPreset[] {
  return [...INSTRUMENTS, ...customInstruments];
}

export function findInstrument(id: string, customInstruments: InstrumentPreset[] = []): InstrumentPreset {
  return allInstruments(customInstruments).find((item) => item.id === id) ?? INSTRUMENTS[0]!;
}

export function findTuning(instrument: InstrumentPreset, id: string): TuningPreset | undefined {
  return instrument.tunings.find((item) => item.id === id) ?? instrument.tunings[0];
}
