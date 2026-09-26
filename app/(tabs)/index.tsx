import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { useRuntimeAudio } from '@/audio/AudioProvider';
import { usePitchInput } from '@/audio/usePitchInput';
import { Card, IconButton, NumberField, PillButton, Screen, SettingRow, Sheet } from '@/components/Controls';
import { MetronomeMini } from '@/components/MetronomeMini';
import { TuningGauge } from '@/components/TuningGauge';
import { findInstrument, findTuning, INSTRUMENTS, TRANSPOSITIONS } from '@/constants/instruments';
import { analyzeFrequency, midiToNote, writtenNote } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';
import { radius, spacing } from '@/theme';

export default function TunerScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tablet = width >= 900;
  const { state, palette, updateTuner } = useApp();
  const { tuner } = state;
  const instrument = findInstrument(tuner.instrumentId);
  const activeTuning = findTuning(instrument, tuner.tuningId);
  const target = activeTuning?.targets[tuner.targetIndex];
  const { permission, snapshot, error, isListening, start, stop } = usePitchInput(instrument.detectorProfile);
  const { tonePlaying, toggleTone } = useRuntimeAudio();
  const [instrumentSheet, setInstrumentSheet] = useState(false);
  const [pitchSheet, setPitchSheet] = useState(false);
  const [search, setSearch] = useState('');
  const autoStarted = useRef(false);
  const inTuneSince = useRef<number | null>(null);

  useEffect(() => {
    if (permission === 'granted' && !isListening && !autoStarted.current) {
      autoStarted.current = true;
      void start();
    }
  }, [isListening, permission, start]);

  const detected = snapshot && snapshot.confidence >= 0.55
    ? analyzeFrequency(snapshot.frequency, tuner.a4)
    : null;
  const guided = target && snapshot
    ? analyzeFrequency(snapshot.frequency, tuner.a4, target.midi)
    : null;
  const targetMismatch = Boolean(target && detected && Math.abs(detected.roundedMidi - target.midi) > 0);
  const visibleNote = detected ? writtenNote(detected.roundedMidi, tuner.transposition) : null;
  const cents = guided?.cents ?? detected?.cents ?? 0;

  useEffect(() => {
    if (!tuner.autoAdvance || !activeTuning || !guided || targetMismatch || snapshot!.confidence < 0.8 || Math.abs(guided.cents) > tuner.tolerance) {
      inTuneSince.current = null;
      return;
    }
    inTuneSince.current ??= Date.now();
    const timer = setTimeout(() => {
      if (inTuneSince.current && Date.now() - inTuneSince.current >= 700) {
        updateTuner({ targetIndex: (tuner.targetIndex + 1) % activeTuning.targets.length });
        inTuneSince.current = null;
      }
    }, 720);
    return () => clearTimeout(timer);
  }, [activeTuning, guided, snapshot, targetMismatch, tuner.autoAdvance, tuner.targetIndex, tuner.tolerance, updateTuner]);

  const results = useMemo(() => {
    const query = search.trim().toLowerCase();
    return INSTRUMENTS.filter((item) => !query || `${item.name} ${item.variant ?? ''} ${item.family} ${item.aliases.join(' ')}`.toLowerCase().includes(query));
  }, [search]);

  const selectInstrument = (id: string) => {
    const next = findInstrument(id);
    updateTuner({
      instrumentId: id,
      tuningId: next.tunings[0]?.id ?? '',
      targetIndex: 0,
      transposition: next.transpositionSemitones,
      transpositionLabel: next.variant ?? 'C',
    });
    setInstrumentSheet(false);
  };

  const statusText = error ? 'Input problem' : isListening ? 'Listening' : permission === 'denied' ? 'Microphone off' : 'Ready';
  const toneMidi = target?.midi ?? detected?.roundedMidi ?? tuner.referenceToneMidi;

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.page, tablet && styles.pageTablet]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.brand, { color: palette.text }]}>Tunera</Text>
            <View style={styles.statusRow}><View style={[styles.statusDot, { backgroundColor: isListening ? palette.success : palette.textMuted }]} /><Text style={[styles.status, { color: palette.textMuted }]}>{statusText}</Text></View>
          </View>
          <IconButton icon="settings-outline" label="Open settings" onPress={() => router.push('/library')} />
        </View>

        <View style={[styles.workspace, tablet && styles.workspaceTablet]}>
          <View style={styles.mainColumn}>
            <View style={styles.modeRow}>
              <PillButton icon="musical-notes-outline" label={`${instrument.name}${activeTuning ? ` · ${activeTuning.name}` : ''}`} onPress={() => setInstrumentSheet(true)} />
              <PillButton icon="options-outline" label={`A4 ${tuner.a4} · ${tuner.transpositionLabel}`} onPress={() => setPitchSheet(true)} />
            </View>

            {permission !== 'granted' || error ? (
              <Card style={styles.permissionCard}>
                <Ionicons name={permission === 'denied' ? 'mic-off-outline' : 'mic-outline'} size={30} color={palette.primary} />
                <View style={styles.permissionCopy}>
                  <Text style={[styles.permissionTitle, { color: palette.text }]}>{error ?? 'Hear pitch, privately'}</Text>
                  <Text style={[styles.permissionBody, { color: palette.textMuted }]}>Microphone audio is analyzed live in memory and is never saved or uploaded.</Text>
                </View>
                <PillButton label={permission === 'denied' ? 'Open settings' : 'Allow mic'} onPress={() => permission === 'denied' ? void Linking.openSettings() : void start()} selected />
              </Card>
            ) : null}

            <Card style={styles.tunerCard}>
              <Text style={[styles.targetLabel, { color: palette.textMuted }]}>{targetMismatch && target ? `Detected · Aim for ${midiToNote(target.midi).name}${midiToNote(target.midi).octave}` : target ? `STRING ${target.label}` : 'CONCERT PITCH'}</Text>
              <View style={styles.noteRow}>
                <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.note, { color: detected ? palette.text : palette.textMuted }]}>{visibleNote?.name ?? '—'}</Text>
                {visibleNote ? <Text style={[styles.octave, { color: palette.textMuted }]}>{visibleNote.octave}</Text> : null}
              </View>
              {tuner.transposition !== 0 && detected ? <Text style={[styles.concert, { color: palette.textMuted }]}>Concert {detected.name}{detected.octave}</Text> : null}
              <TuningGauge cents={cents} tolerance={tuner.tolerance} active={Boolean(detected && !targetMismatch)} />
              {tuner.showDetails ? (
                <View style={[styles.details, { borderTopColor: palette.border }]}>
                  <Detail label="INPUT" value={snapshot ? `${snapshot.frequency.toFixed(1)} Hz` : '—'} />
                  <Detail label="TARGET" value={guided ? `${guided.targetFrequency.toFixed(1)} Hz` : detected ? `${detected.targetFrequency.toFixed(1)} Hz` : '—'} />
                  <Detail label="CONFIDENCE" value={snapshot ? `${Math.round(snapshot.confidence * 100)}%` : '—'} />
                </View>
              ) : null}
              {snapshot?.clipping ? <Text style={[styles.warning, { color: palette.danger }]}>Input is clipping — move a little farther from the microphone.</Text> : null}
            </Card>

            {activeTuning ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strings} accessibilityLabel="Guided strings">
                {activeTuning.targets.map((item, index) => {
                  const note = midiToNote(item.midi);
                  return <PillButton key={`${item.label}-${item.midi}`} label={`${item.label}  ${note.name}${note.octave}`} selected={index === tuner.targetIndex} onPress={() => updateTuner({ targetIndex: index })} />;
                })}
              </ScrollView>
            ) : null}

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={tonePlaying ? 'Stop reference tone' : 'Play reference tone'} onPress={() => toggleTone(toneMidi)} style={[styles.toneButton, { backgroundColor: tonePlaying ? palette.accent : palette.surfaceMuted, borderColor: palette.border }]}>
                <Ionicons name={tonePlaying ? 'volume-high' : 'volume-medium-outline'} size={23} color={palette.text} />
                <Text style={[styles.toneText, { color: palette.text }]}>{tonePlaying ? 'Stop tone' : 'Reference tone'}</Text>
              </Pressable>
              <IconButton icon={isListening ? 'mic' : 'mic-off-outline'} label={isListening ? 'Stop listening' : 'Start listening'} selected={isListening} onPress={() => void (isListening ? stop() : start())} />
            </View>
          </View>
          <View style={tablet ? styles.sideColumn : styles.miniPhone}><MetronomeMini expanded={tablet} /></View>
        </View>
      </ScrollView>

      <Sheet visible={instrumentSheet} title="Instrument & tuning" onClose={() => setInstrumentSheet(false)}>
        <TextInput accessibilityLabel="Search instruments" placeholder="Search instruments" placeholderTextColor={palette.textMuted} value={search} onChangeText={setSearch} style={[styles.search, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} />
        {results.map((item) => (
          <View key={item.id} style={[styles.instrumentItem, { borderBottomColor: palette.border }]}>
            <Pressable accessibilityRole="button" onPress={() => selectInstrument(item.id)} style={styles.instrumentPress}>
              <View style={styles.instrumentCopy}><Text style={[styles.instrumentName, { color: palette.text }]}>{item.name} {item.variant ?? ''}</Text><Text style={{ color: palette.textMuted }}>{item.family}</Text></View>
              <Ionicons name={item.id === instrument.id ? 'checkmark-circle' : 'chevron-forward'} size={24} color={item.id === instrument.id ? palette.primary : palette.textMuted} />
            </Pressable>
            {item.id === instrument.id && item.tunings.length > 1 ? <View style={styles.tuningChoices}>{item.tunings.map((preset) => <PillButton key={preset.id} label={preset.name} selected={preset.id === activeTuning?.id} onPress={() => updateTuner({ tuningId: preset.id, targetIndex: 0 })} />)}</View> : null}
          </View>
        ))}
      </Sheet>

      <Sheet visible={pitchSheet} title="Pitch setup" onClose={() => setPitchSheet(false)}>
        <View style={styles.fieldRow}><NumberField label="Concert A" value={tuner.a4} min={390} max={490} suffix="Hz" onChange={(a4) => updateTuner({ a4 })} /><NumberField label="Tolerance" value={tuner.tolerance} min={1} max={10} suffix="cents" onChange={(tolerance) => updateTuner({ tolerance })} /></View>
        <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>WRITTEN PITCH</Text>
        <View style={styles.choiceWrap}>{TRANSPOSITIONS.map((item) => <PillButton key={item.label} label={item.label} selected={tuner.transposition === item.semitones} onPress={() => updateTuner({ transposition: item.semitones, transpositionLabel: item.label })} />)}</View>
        <SettingRow label="Auto-advance strings" detail="Move on after 0.7 seconds in tune" value={tuner.autoAdvance} onValueChange={(autoAdvance) => updateTuner({ autoAdvance })} />
        <SettingRow label="Show frequency details" value={tuner.showDetails} onValueChange={(showDetails) => updateTuner({ showDetails })} />
      </Sheet>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { palette } = useApp();
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: palette.textMuted }]}>{label}</Text><Text style={[styles.detailValue, { color: palette.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, paddingBottom: 28, gap: spacing.md, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  pageTablet: { padding: spacing.xl },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontSize: 27, fontWeight: '900', letterSpacing: -0.8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  status: { fontSize: 12, fontWeight: '700' },
  workspace: { gap: spacing.md }, workspaceTablet: { flexDirection: 'row', alignItems: 'flex-start' }, mainColumn: { flex: 1, gap: spacing.md }, sideColumn: { width: 300 }, miniPhone: {},
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permissionCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, permissionCopy: { flex: 1 }, permissionTitle: { fontSize: 16, fontWeight: '800' }, permissionBody: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  tunerCard: { minHeight: 410, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  targetLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', minHeight: 135 },
  note: { fontSize: 122, lineHeight: 138, fontWeight: '900', letterSpacing: -8 }, octave: { fontSize: 30, fontWeight: '800', marginTop: 24, marginLeft: 8 }, concert: { fontSize: 13, fontWeight: '700', marginTop: -10, marginBottom: 18 },
  details: { width: '100%', borderTopWidth: 1, flexDirection: 'row', marginTop: 22, paddingTop: 14 }, detail: { flex: 1, alignItems: 'center' }, detailLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, detailValue: { fontSize: 14, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  warning: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 12 }, strings: { gap: 8 },
  actions: { flexDirection: 'row', gap: 10 }, toneButton: { minHeight: 52, flex: 1, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, toneText: { fontSize: 15, fontWeight: '800' },
  search: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 },
  instrumentItem: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 }, instrumentPress: { minHeight: 60, flexDirection: 'row', alignItems: 'center' }, instrumentCopy: { flex: 1 }, instrumentName: { fontSize: 17, fontWeight: '800' }, tuningChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 10 },
  fieldRow: { flexDirection: 'row', gap: 12 }, sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1, marginTop: 8 }, choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
