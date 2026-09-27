import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { Card, IconButton, NumberField, PillButton, Screen, SettingRow, Sheet } from '@/components/Controls';
import { allInstruments, findInstrument } from '@/constants/instruments';
import { normalizeCustomInstrument } from '@/lib/persistedState';
import { midiToNote } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';
import { radius, spacing } from '@/theme';
import type { InstrumentPreset, TuningPreset, TuningTarget } from '@/types';

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createInstrumentDraft(): InstrumentPreset {
  const instrumentId = localId('custom');
  return {
    id: instrumentId,
    name: '',
    family: 'Custom',
    transpositionSemitones: 0,
    detectorProfile: 'general',
    aliases: [],
    tunings: [{ id: localId('tuning'), name: 'Standard', targets: [{ label: '1', midi: 60 }] }],
  };
}

function cloneInstrument(instrument: InstrumentPreset): InstrumentPreset {
  return {
    ...instrument,
    aliases: [...instrument.aliases],
    tunings: instrument.tunings.map((tuning) => ({
      ...tuning,
      targets: tuning.targets.map((target) => ({ ...target })),
    })),
  };
}

function confirmDestructive(title: string, message: string, onConfirm: () => void, confirmLabel = 'Delete') {
  if (Platform.OS === 'web') {
    if (typeof globalThis.confirm === 'function' && globalThis.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

export default function LibraryScreen() {
  const { create } = useLocalSearchParams<{ create?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tablet = width >= 820;
  const {
    state,
    palette,
    updateTuner,
    updatePreferences,
    toggleFavorite,
    createPracticePreset,
    applyPracticePreset,
    renamePracticePreset,
    deletePracticePreset,
    saveCustomInstrument,
    deleteCustomInstrument,
    reset,
  } = useApp();
  const [search, setSearch] = useState('');
  const [instrumentDraft, setInstrumentDraft] = useState<InstrumentPreset | null>(null);
  const [presetEditor, setPresetEditor] = useState<{ id?: string; name: string } | null>(null);

  useEffect(() => {
    if (create !== '1') return;
    const handle = setTimeout(() => {
      setInstrumentDraft(createInstrumentDraft());
      router.setParams({ create: undefined });
    }, 0);
    return () => clearTimeout(handle);
  }, [create, router]);

  const instruments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allInstruments(state.customInstruments)
      .filter((item) => !query || `${item.name} ${item.variant ?? ''} ${item.family} ${item.aliases.join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => Number(state.favoriteInstrumentIds.includes(b.id)) - Number(state.favoriteInstrumentIds.includes(a.id)) || a.name.localeCompare(b.name));
  }, [search, state.customInstruments, state.favoriteInstrumentIds]);

  const customIds = useMemo(() => new Set(state.customInstruments.map((item) => item.id)), [state.customInstruments]);

  const choose = (id: string) => {
    const instrument = findInstrument(id, state.customInstruments);
    updateTuner({
      instrumentId: id,
      tuningId: instrument.tunings[0]?.id ?? '',
      targetIndex: 0,
      transposition: instrument.transpositionSemitones,
      transpositionLabel: instrument.variant ?? 'C',
    });
  };

  const saveInstrument = () => {
    if (!instrumentDraft?.name.trim()) return;
    const normalized = normalizeCustomInstrument(instrumentDraft, instrumentDraft.id);
    if (!normalized) return;
    saveCustomInstrument(normalized);
    setInstrumentDraft(null);
  };

  const confirmDeleteInstrument = (instrument: InstrumentPreset) => {
    confirmDestructive('Delete custom instrument?', instrument.name, () => deleteCustomInstrument(instrument.id));
  };

  const submitPreset = () => {
    if (!presetEditor?.name.trim()) return;
    if (presetEditor.id) renamePracticePreset(presetEditor.id, presetEditor.name);
    else createPracticePreset(presetEditor.name);
    setPresetEditor(null);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.page, tablet && styles.pageTablet]}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: palette.text }]}>Library & settings</Text>
          <PillButton icon="add" label="Custom" onPress={() => setInstrumentDraft(createInstrumentDraft())} />
        </View>
        <View style={[styles.columns, tablet && styles.columnsTablet]}>
          <View style={styles.libraryColumn}>
            <TextInput accessibilityLabel="Search instrument library" placeholder="Search instruments" placeholderTextColor={palette.textMuted} value={search} onChangeText={setSearch} style={[styles.search, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]} />
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>INSTRUMENTS</Text>
            <Card style={styles.listCard}>
              {instruments.map((item, index) => {
                const selected = item.id === state.tuner.instrumentId;
                const favorite = state.favoriteInstrumentIds.includes(item.id);
                const custom = customIds.has(item.id);
                return (
                  <View key={item.id} style={[styles.instrument, custom && !tablet && styles.rowPhone, index > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Use ${item.name} ${item.variant ?? ''}`} onPress={() => choose(item.id)} style={[styles.instrumentMain, custom && !tablet && styles.mainPhone]}>
                      <View style={[styles.instrumentIcon, { backgroundColor: selected ? palette.primary : palette.surfaceMuted }]}><Ionicons name={item.tunings.length ? 'musical-notes' : 'radio-outline'} size={22} color={selected ? palette.onPrimary : palette.text} /></View>
                      <View style={styles.instrumentCopy}><Text style={[styles.instrumentName, { color: palette.text }]}>{item.name} {item.variant ?? ''}</Text><Text style={[styles.instrumentMeta, { color: palette.textMuted }]}>{item.family}{item.tunings[0] ? ` · ${item.tunings.length} ${item.tunings.length === 1 ? 'tuning' : 'tunings'}` : ' · Chromatic'}</Text></View>
                      {selected ? <Ionicons name="checkmark-circle" size={23} color={palette.primary} /> : null}
                    </Pressable>
                    <View style={[styles.instrumentActions, custom && !tablet && styles.actionsPhone]}>
                      {custom ? <IconButton icon="create-outline" label={`Edit ${item.name}`} onPress={() => setInstrumentDraft(cloneInstrument(item))} /> : null}
                      {custom ? <IconButton icon="trash-outline" label={`Delete ${item.name}`} onPress={() => confirmDeleteInstrument(item)} /> : null}
                      <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} accessibilityState={{ selected: favorite }} onPress={() => toggleFavorite(item.id)} style={styles.favorite}><Ionicons name={favorite ? 'star' : 'star-outline'} size={22} color={favorite ? palette.accent : palette.textMuted} /></Pressable>
                    </View>
                  </View>
                );
              })}
            </Card>
          </View>

          <View style={styles.settingsColumn}>
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>PRACTICE PRESETS</Text>
            <Card style={styles.presetCard}>
              <PillButton icon="save-outline" label="Save current setup" onPress={() => setPresetEditor({ name: `Practice ${state.practicePresets.length + 1}` })} />
              {state.practicePresets.map((preset) => (
                <View key={preset.id} style={[styles.presetRow, !tablet && styles.rowPhone, { borderTopColor: palette.border }]}>
                  <View style={[styles.presetMain, !tablet && styles.mainPhone]}>
                    <Text style={[styles.instrumentName, { color: palette.text }]}>{preset.name}</Text>
                    <Text style={[styles.instrumentMeta, { color: palette.textMuted }]}>{preset.metronome.bpm} BPM · {preset.metronome.beats}/{preset.metronome.denominator}{preset.tuner.capo ? ` · Capo ${preset.tuner.capo}` : ''}{preset.tuner.detune ? ` · ${preset.tuner.detune} st` : ''}</Text>
                  </View>
                  <View style={[styles.presetActions, !tablet && styles.actionsPhone]}>
                    <PillButton icon="play-outline" label="Apply" accessibilityLabel={`Apply ${preset.name}`} onPress={() => applyPracticePreset(preset.id)} />
                    <IconButton icon="create-outline" label={`Rename ${preset.name}`} onPress={() => setPresetEditor({ id: preset.id, name: preset.name })} />
                    <IconButton icon="trash-outline" label={`Delete ${preset.name}`} onPress={() => confirmDestructive('Delete practice preset?', preset.name, () => deletePracticePreset(preset.id))} />
                  </View>
                </View>
              ))}
            </Card>

            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>APPEARANCE</Text>
            <Card>
              <Text style={[styles.settingTitle, { color: palette.text }]}>Theme</Text>
              <View style={styles.choices}>{(['system', 'light', 'dark'] as const).map((theme) => <PillButton key={theme} label={theme[0]!.toUpperCase() + theme.slice(1)} selected={state.preferences.theme === theme} onPress={() => updatePreferences({ theme })} />)}</View>
              <SettingRow label="High contrast" value={state.preferences.highContrast} onValueChange={(highContrast) => updatePreferences({ highContrast })} />
              <SettingRow label="Reduce motion" value={state.preferences.reduceMotion} onValueChange={(reduceMotion) => updatePreferences({ reduceMotion })} />
            </Card>

            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>TUNER</Text>
            <Card>
              <View style={styles.fields}><NumberField label="Concert A" value={state.tuner.a4} min={390} max={490} suffix="Hz" onChange={(a4) => updateTuner({ a4 })} /><NumberField label="Tolerance" value={state.tuner.tolerance} min={1} max={10} suffix="cents" onChange={(tolerance) => updateTuner({ tolerance })} /></View>
              <View style={[styles.volumeRow, { borderTopColor: palette.border }]}><Text style={[styles.settingTitle, { color: palette.text }]}>Reference tone volume</Text><View style={styles.volumeButtons}><PillButton label="−" onPress={() => updateTuner({ referenceToneVolume: Math.max(0.05, state.tuner.referenceToneVolume - 0.1) })} /><Text style={[styles.volume, { color: palette.text }]}>{Math.round(state.tuner.referenceToneVolume * 100)}%</Text><PillButton label="+" onPress={() => updateTuner({ referenceToneVolume: Math.min(1, state.tuner.referenceToneVolume + 0.1) })} /></View></View>
            </Card>

            <Pressable accessibilityRole="button" accessibilityLabel="Reset all settings" onPress={() => confirmDestructive('Reset all settings?', 'Custom instruments and practice presets will also be removed.', reset, 'Reset')} style={[styles.reset, { borderColor: palette.danger }]}><Text style={[styles.resetText, { color: palette.danger }]}>Reset all settings</Text></Pressable>
          </View>
        </View>
      </ScrollView>

      <Sheet visible={Boolean(presetEditor)} title={presetEditor?.id ? 'Rename preset' : 'Save practice preset'} onClose={() => setPresetEditor(null)}>
        <TextInput accessibilityLabel="Preset name" autoFocus placeholder="Preset name" placeholderTextColor={palette.textMuted} value={presetEditor?.name ?? ''} onChangeText={(name) => setPresetEditor((current) => current ? { ...current, name } : null)} onSubmitEditing={submitPreset} style={[styles.editorInput, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={presetEditor?.id ? 'Save preset name' : 'Save practice preset'} accessibilityState={{ disabled: !presetEditor?.name.trim() }} disabled={!presetEditor?.name.trim()} onPress={submitPreset} style={[styles.saveButton, { backgroundColor: palette.primary, opacity: presetEditor?.name.trim() ? 1 : 0.45 }]}><Text style={[styles.saveText, { color: palette.onPrimary }]}>Save</Text></Pressable>
      </Sheet>

      <Sheet visible={Boolean(instrumentDraft)} title={instrumentDraft && customIds.has(instrumentDraft.id) ? `Edit ${instrumentDraft.name}` : 'Create custom instrument'} onClose={() => setInstrumentDraft(null)}>
        {instrumentDraft ? <InstrumentEditor instrument={instrumentDraft} onChange={setInstrumentDraft} /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Save custom instrument" accessibilityState={{ disabled: !instrumentDraft?.name.trim() }} disabled={!instrumentDraft?.name.trim()} onPress={saveInstrument} style={[styles.saveButton, { backgroundColor: palette.primary, opacity: instrumentDraft?.name.trim() ? 1 : 0.45 }]}><Text style={[styles.saveText, { color: palette.onPrimary }]}>Save instrument</Text></Pressable>
      </Sheet>
    </Screen>
  );
}

function InstrumentEditor({ instrument, onChange }: { instrument: InstrumentPreset; onChange: (instrument: InstrumentPreset) => void }) {
  const { palette } = useApp();
  const updateTuning = (index: number, patch: Partial<TuningPreset>) => {
    const tunings = instrument.tunings.map((tuning, tuningIndex) => tuningIndex === index ? { ...tuning, ...patch } : tuning);
    onChange({ ...instrument, tunings });
  };
  const deleteTuning = (index: number) => onChange({ ...instrument, tunings: instrument.tunings.filter((_, tuningIndex) => tuningIndex !== index) });
  const addTuning = () => onChange({
    ...instrument,
    tunings: [...instrument.tunings, { id: localId('tuning'), name: `Tuning ${instrument.tunings.length + 1}`, targets: [{ label: '1', midi: 60 }] }],
  });

  return (
    <View style={styles.editor}>
      <View style={styles.fields}>
        <EditorInput label="Name" value={instrument.name} onChangeText={(name) => onChange({ ...instrument, name })} />
        <EditorInput label="Family" value={instrument.family} onChangeText={(family) => onChange({ ...instrument, family })} />
      </View>
      <Text style={[styles.editorLabel, { color: palette.textMuted }]}>DETECTOR RANGE</Text>
      <View style={styles.choices}>{(['low', 'general', 'high'] as const).map((profile) => <PillButton key={profile} label={profile[0]!.toUpperCase() + profile.slice(1)} selected={instrument.detectorProfile === profile} onPress={() => onChange({ ...instrument, detectorProfile: profile })} />)}</View>
      {instrument.tunings.map((tuning, tuningIndex) => (
        <View key={tuning.id} style={[styles.tuningEditor, { borderColor: palette.border }]}>
          <View style={styles.tuningHeader}>
            <EditorInput label={`Tuning ${tuningIndex + 1}`} value={tuning.name} onChangeText={(name) => updateTuning(tuningIndex, { name })} />
            {instrument.tunings.length > 1 ? <IconButton icon="trash-outline" label={`Delete ${tuning.name}`} onPress={() => deleteTuning(tuningIndex)} /> : null}
          </View>
          {tuning.targets.map((target, targetIndex) => (
            <TargetEditor
              key={`${tuning.id}-${targetIndex}`}
              target={target}
              index={targetIndex}
              count={tuning.targets.length}
              onChange={(next) => updateTuning(tuningIndex, { targets: tuning.targets.map((item, index) => index === targetIndex ? next : item) })}
              onMove={(direction) => {
                const targets = [...tuning.targets];
                const destination = targetIndex + direction;
                if (destination < 0 || destination >= targets.length) return;
                [targets[targetIndex], targets[destination]] = [targets[destination]!, targets[targetIndex]!];
                updateTuning(tuningIndex, { targets });
              }}
              onDelete={() => updateTuning(tuningIndex, { targets: tuning.targets.filter((_, index) => index !== targetIndex) })}
            />
          ))}
          <PillButton icon="add" label="Add note" onPress={() => updateTuning(tuningIndex, { targets: [...tuning.targets, { label: String(tuning.targets.length + 1), midi: 60 }] })} />
        </View>
      ))}
      <PillButton icon="add-circle-outline" label="Add tuning" onPress={addTuning} />
    </View>
  );
}

function EditorInput({ label, value, onChangeText }: { label: string; value: string; onChangeText: (text: string) => void }) {
  const { palette } = useApp();
  return <View style={styles.editorField}><Text style={[styles.editorLabel, { color: palette.textMuted }]}>{label.toUpperCase()}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} style={[styles.editorInput, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} /></View>;
}

function TargetEditor({ target, index, count, onChange, onMove, onDelete }: { target: TuningTarget; index: number; count: number; onChange: (target: TuningTarget) => void; onMove: (direction: -1 | 1) => void; onDelete: () => void }) {
  const { palette } = useApp();
  const note = midiToNote(target.midi);
  return (
    <View style={styles.targetRow}>
      <View style={styles.targetFields}>
        <TextInput accessibilityLabel={`Note ${index + 1} label`} value={target.label} onChangeText={(label) => onChange({ ...target, label })} style={[styles.targetLabelInput, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} />
        <TextInput accessibilityLabel={`Note ${index + 1} MIDI number`} keyboardType="number-pad" selectTextOnFocus value={String(target.midi)} onChangeText={(value) => { const midi = Number(value); if (Number.isFinite(midi)) onChange({ ...target, midi: Math.max(0, Math.min(127, Math.round(midi))) }); }} style={[styles.midiInput, { color: palette.text, backgroundColor: palette.surfaceMuted, borderColor: palette.border }]} />
        <Text accessibilityLabel={`Sounds as ${note.name}${note.octave}`} style={[styles.notePreview, { color: palette.text }]}>{note.name}{note.octave}</Text>
      </View>
      <View style={styles.targetActions}>
        <IconButton icon="arrow-up" label={`Move note ${index + 1} up`} disabled={index === 0} onPress={() => onMove(-1)} />
        <IconButton icon="arrow-down" label={`Move note ${index + 1} down`} disabled={index === count - 1} onPress={() => onMove(1)} />
        <IconButton icon="close" label={`Delete note ${index + 1}`} disabled={count === 1} onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.md, paddingBottom: 32, gap: spacing.md },
  pageTablet: { padding: spacing.xl },
  titleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { flex: 1, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  columns: { gap: spacing.lg },
  columnsTablet: { flexDirection: 'row', alignItems: 'flex-start' },
  libraryColumn: { flex: 1.08, gap: spacing.sm },
  settingsColumn: { flex: 0.92, gap: spacing.sm },
  search: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 5 },
  listCard: { paddingVertical: 2 },
  instrument: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  instrumentMain: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  instrumentActions: { flexDirection: 'row', alignItems: 'center' },
  rowPhone: { paddingBottom: 8 },
  mainPhone: { flexBasis: '100%' },
  actionsPhone: { width: '100%', justifyContent: 'flex-end' },
  instrumentIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  instrumentCopy: { flex: 1 },
  instrumentName: { fontSize: 16, fontWeight: '800' },
  instrumentMeta: { fontSize: 12, marginTop: 3 },
  favorite: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
  presetCard: { gap: 10 },
  presetRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  presetMain: { flex: 1, minHeight: 56, justifyContent: 'center' },
  presetActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  settingTitle: { fontSize: 16, fontWeight: '800' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  fields: { flexDirection: 'row', gap: 10 },
  volumeRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 15 },
  volumeButtons: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 },
  volume: { fontSize: 16, fontWeight: '900', minWidth: 50, textAlign: 'center' },
  reset: { minHeight: 50, marginTop: 8, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resetText: { fontSize: 14, fontWeight: '800' },
  editor: { gap: 16 },
  editorField: { flex: 1, gap: 6 },
  editorLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  editorInput: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  saveButton: { minHeight: 54, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 16, fontWeight: '900' },
  tuningEditor: { borderWidth: 1, borderRadius: radius.lg, padding: 12, gap: 10 },
  tuningHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  targetRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  targetFields: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  targetActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  targetLabelInput: { width: 55, height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 8, textAlign: 'center', fontWeight: '800' },
  midiInput: { width: 62, height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 8, textAlign: 'center', fontWeight: '800' },
  notePreview: { width: 38, fontSize: 14, fontWeight: '900', textAlign: 'center' },
});
