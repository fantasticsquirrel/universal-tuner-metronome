import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { IconButton, NumberField, PillButton, Screen, SettingRow, Sheet } from '@/components/Controls';
import { MetronomeMini } from '@/components/MetronomeMini';
import { LiveTuner } from '@/components/LiveTuner';
import { allInstruments, findInstrument, findTuning, TRANSPOSITIONS } from '@/constants/instruments';
import { adjustedTargetMidi, midiToNote } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';
import { radius, spacing } from '@/theme';

export default function TunerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tablet = width >= 900;
  const { state, palette, updateTuner } = useApp();
  const { tuner } = state;
  const instruments = useMemo(() => allInstruments(state.customInstruments), [state.customInstruments]);
  const instrument = findInstrument(tuner.instrumentId, state.customInstruments);
  const activeTuning = findTuning(instrument, tuner.tuningId);
  const [instrumentSheet, setInstrumentSheet] = useState(false);
  const [pitchSheet, setPitchSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [inputProblem, setInputProblem] = useState(false);

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return instruments.filter((item) => !query || `${item.name} ${item.variant ?? ''} ${item.family} ${item.aliases.join(' ')}`.toLowerCase().includes(query));
  }, [instruments, search]);

  const selectInstrument = (id: string) => {
    const next = findInstrument(id, state.customInstruments);
    updateTuner({
      instrumentId: id,
      tuningId: next.tunings[0]?.id ?? '',
      targetIndex: 0,
      transposition: next.transpositionSemitones,
      transpositionLabel: next.variant ?? 'C',
    });
    setInstrumentSheet(false);
  };

  const pitchSummary = [
    `A4 ${tuner.a4}`,
    tuner.transpositionLabel,
    tuner.capo > 0 ? `Capo ${tuner.capo}` : '',
    tuner.detune < 0 ? `${tuner.detune} st` : '',
  ].filter(Boolean).join(' · ');

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.page, tablet && styles.pageTablet]}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={[styles.brand, { color: palette.text }]}>Tunera</Text>
            {inputProblem ? (
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: palette.danger }]} />
                <Text numberOfLines={1} style={[styles.status, { color: palette.danger }]}>Input problem</Text>
              </View>
            ) : null}
          </View>
          <IconButton icon="settings-outline" label="Open settings" onPress={() => router.push('/library')} />
        </View>

        <View style={[styles.workspace, tablet && styles.workspaceTablet]}>
          <View style={styles.mainColumn}>
            <View style={styles.modeRow}>
              <PillButton icon="musical-notes-outline" label={`${instrument.name}${activeTuning ? ` · ${activeTuning.name}` : ''}`} onPress={() => setInstrumentSheet(true)} />
              <PillButton icon="options-outline" label={pitchSummary} onPress={() => setPitchSheet(true)} />
            </View>

            <LiveTuner onInputProblemChange={setInputProblem}>
              {activeTuning ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strings} accessibilityLabel="Guided strings">
                  {activeTuning.targets.map((item, index) => {
                    const note = midiToNote(adjustedTargetMidi(item.midi, tuner.capo, tuner.detune));
                    return <PillButton key={`${item.label}-${item.midi}`} label={`${item.label}  ${note.name}${note.octave}`} selected={index === tuner.targetIndex} onPress={() => updateTuner({ targetIndex: index })} />;
                  })}
                </ScrollView>
              ) : null}
            </LiveTuner>
          </View>
          <View style={tablet ? styles.sideColumn : styles.miniPhone}><MetronomeMini expanded={tablet} /></View>
        </View>
      </ScrollView>

      {instrumentSheet ? <Sheet visible title="Instrument & tuning" onClose={() => setInstrumentSheet(false)}>
        <TextInput accessibilityLabel="Search instruments" placeholder="Search instruments" placeholderTextColor={palette.textMuted} value={search} onChangeText={setSearch} style={[styles.search, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} />
        <PillButton icon="add" label="Create custom" onPress={() => { setInstrumentSheet(false); router.push({ pathname: '/library', params: { create: '1' } }); }} />
        {results.map((item) => (
          <View key={item.id} style={[styles.instrumentItem, { borderBottomColor: palette.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Use ${item.name} ${item.variant ?? ''}`} onPress={() => selectInstrument(item.id)} style={styles.instrumentPress}>
              <View style={styles.instrumentCopy}><Text style={[styles.instrumentName, { color: palette.text }]}>{item.name} {item.variant ?? ''}</Text><Text style={{ color: palette.textMuted }}>{item.family}</Text></View>
              <Ionicons name={item.id === instrument.id ? 'checkmark-circle' : 'chevron-forward'} size={24} color={item.id === instrument.id ? palette.primary : palette.textMuted} />
            </Pressable>
            {item.id === instrument.id && item.tunings.length > 1 ? <View style={styles.tuningChoices}>{item.tunings.map((preset) => <PillButton key={preset.id} label={preset.name} selected={preset.id === activeTuning?.id} onPress={() => updateTuner({ tuningId: preset.id, targetIndex: 0 })} />)}</View> : null}
          </View>
        ))}
      </Sheet> : null}

      {pitchSheet ? <Sheet visible title="Pitch setup" onClose={() => setPitchSheet(false)}>
        <View style={styles.fieldRow}><NumberField label="Concert A" value={tuner.a4} min={390} max={490} suffix="Hz" keyboardType="decimal-pad" onChange={(a4) => updateTuner({ a4 })} /><NumberField label="Tolerance" value={tuner.tolerance} min={1} max={10} suffix="cents" onChange={(tolerance) => updateTuner({ tolerance })} /></View>
        <View style={styles.fieldRow}><NumberField label="Capo" value={tuner.capo} min={0} max={12} suffix="fret" onChange={(capo) => updateTuner({ capo: Math.round(capo) })} /><NumberField label="Detune" value={tuner.detune} min={-12} max={0} suffix="semitones" keyboardType="numbers-and-punctuation" onChange={(detune) => updateTuner({ detune: Math.round(detune) })} /></View>
        <View style={styles.fieldRow}><NumberField label="Sensitivity" value={tuner.sensitivity} min={0} max={100} suffix="%" onChange={(sensitivity) => updateTuner({ sensitivity: Math.round(sensitivity) })} /><NumberField label="Noise gate" value={Math.round(tuner.noiseGate * 1000) / 10} min={0.1} max={10} suffix="%" keyboardType="decimal-pad" onChange={(noiseGate) => updateTuner({ noiseGate: noiseGate / 100 })} /></View>
        <NumberField label="Lock hold" value={tuner.lockHoldMs} min={100} max={3000} suffix="ms" onChange={(lockHoldMs) => updateTuner({ lockHoldMs: Math.round(lockHoldMs) })} />
        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>WRITTEN PITCH</Text>
        <View style={styles.choiceWrap}>{TRANSPOSITIONS.map((item) => <PillButton key={item.label} label={item.label} selected={tuner.transposition === item.semitones} onPress={() => updateTuner({ transposition: item.semitones, transpositionLabel: item.label })} />)}</View>
        <SettingRow label="Auto-advance strings" value={tuner.autoAdvance} onValueChange={(autoAdvance) => updateTuner({ autoAdvance })} />
        <SettingRow label="Show frequency details" value={tuner.showDetails} onValueChange={(showDetails) => updateTuner({ showDetails })} />
      </Sheet> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, paddingBottom: 28, gap: spacing.md, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  pageTablet: { padding: spacing.xl },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  brand: { fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 12, fontWeight: '700' },
  workspace: { gap: spacing.md }, workspaceTablet: { flexDirection: 'row', alignItems: 'flex-start' }, mainColumn: { flex: 1, gap: spacing.md }, sideColumn: { width: 300 }, miniPhone: {},
  strings: { gap: 8 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  search: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 },
  instrumentItem: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 }, instrumentPress: { minHeight: 60, flexDirection: 'row', alignItems: 'center' }, instrumentCopy: { flex: 1 }, instrumentName: { fontSize: 17, fontWeight: '800' }, tuningChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 10 },
  fieldRow: { flexDirection: 'row', gap: 12 }, sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 8 }, choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
