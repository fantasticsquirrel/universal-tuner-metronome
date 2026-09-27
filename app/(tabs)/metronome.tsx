import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { useRuntimeAudio } from '@/audio/AudioProvider';
import { Card, PillButton, Screen, SettingRow } from '@/components/Controls';
import { bpmFromTaps, clampBpm, cycleAccent, resizeAccents } from '@/lib/metronome';
import { formatPracticeTime } from '@/lib/practice';
import { useApp } from '@/store/AppProvider';
import { radius, spacing } from '@/theme';
import type { MetronomeSettings } from '@/types';

const SUBDIVISIONS = [{ value: 1, label: 'Quarter', icon: '♩' }, { value: 2, label: 'Eighth', icon: '♫' }, { value: 3, label: 'Triplet', icon: '3' }, { value: 4, label: 'Sixteenth', icon: '♬' }] as const;
const DENOMINATORS = [2, 4, 8, 16] as const;

export default function MetronomeScreen() {
  const { width } = useWindowDimensions();
  const tablet = width >= 820;
  const compact = width < 380;
  const { state, palette, updateMetronome } = useApp();
  const settings = state.metronome;
  const {
    running,
    currentBeat,
    currentSubdivision,
    countInBarsRemaining,
    practiceElapsedSeconds,
    practiceSecondsRemaining,
    toggleMetronome,
  } = useRuntimeAudio();
  const tapsRef = useRef<number[]>([]);
  const [sliderWidth, setSliderWidth] = useState(1);

  const update = (patch: Partial<MetronomeSettings>) => updateMetronome(patch);
  const setBpm = (bpm: number) => update({ bpm: clampBpm(bpm) });
  const setBeats = (beats: number) => {
    const next = Math.max(1, Math.min(32, beats));
    update({ beats: next, accents: resizeAccents(settings.accents, next) });
  };
  const tap = () => {
    const now = Date.now();
    if (now - (tapsRef.current.at(-1) ?? now) > 3000) tapsRef.current = [];
    tapsRef.current.push(now);
    const bpm = bpmFromTaps(tapsRef.current);
    if (bpm) setBpm(bpm);
  };
  const updateTrainer = (patch: Partial<MetronomeSettings['trainer']>) => update({ trainer: { ...settings.trainer, ...patch } });

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.page, tablet && styles.pageTablet]}>
        <Text style={[styles.title, { color: palette.text }]}>Metronome</Text>
        <View style={[styles.columns, tablet && styles.columnsTablet]}>
          <View style={styles.primaryColumn}>
            <Card style={styles.tempoCard}>
              <Text style={[styles.eyebrow, { color: palette.textMuted }]}>TEMPO</Text>
              <View style={[styles.tempoRow, compact && styles.tempoRowCompact]}>
                <RoundButton compact={compact} label="Decrease BPM" icon="remove" onPress={() => setBpm(settings.bpm - 1)} />
                <View style={styles.bpmWrap}>
                  <TextInput accessibilityLabel="Beats per minute" keyboardType="number-pad" selectTextOnFocus value={String(settings.bpm)} onChangeText={(value) => { const parsed = Number(value); if (Number.isFinite(parsed)) setBpm(parsed); }} style={[styles.bpm, compact && styles.bpmCompact, { color: palette.text }]} />
                  <Text style={[styles.bpmLabel, { color: palette.textMuted }]}>BPM</Text>
                </View>
                <RoundButton compact={compact} label="Increase BPM" icon="add" onPress={() => setBpm(settings.bpm + 1)} />
              </View>
              <Pressable
                accessibilityRole="adjustable"
                accessibilityLabel="Tempo slider"
                accessibilityValue={{ min: 20, max: 400, now: settings.bpm }}
                accessibilityActions={[
                  { name: 'increment', label: 'Increase tempo' },
                  { name: 'decrement', label: 'Decrease tempo' },
                ]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'increment') setBpm(settings.bpm + 1);
                  if (event.nativeEvent.actionName === 'decrement') setBpm(settings.bpm - 1);
                }}
                onLayout={(event) => setSliderWidth(event.nativeEvent.layout.width)}
                onPress={(event) => setBpm(20 + (event.nativeEvent.locationX / sliderWidth) * 380)}
                style={[styles.slider, { backgroundColor: palette.surfaceMuted }]}
              >
                <View style={[styles.sliderFill, { backgroundColor: palette.primary, width: `${((settings.bpm - 20) / 380) * 100}%` }]} />
                <View style={[styles.sliderThumb, { backgroundColor: palette.primary, left: `${((settings.bpm - 20) / 380) * 100}%` }]} />
              </Pressable>
              <View style={styles.quickTempos}>{[60, 80, 100, 120, 160].map((bpm) => <PillButton key={bpm} label={String(bpm)} selected={settings.bpm === bpm} onPress={() => setBpm(bpm)} />)}</View>
              <View style={styles.transportRow}>
                <Pressable accessibilityRole="button" accessibilityLabel={running ? 'Stop metronome' : 'Start metronome'} onPress={toggleMetronome} style={[styles.start, { backgroundColor: running ? palette.danger : palette.primary }]}>
                  <Ionicons name={running ? 'stop' : 'play'} size={34} color={palette.onPrimary} /><Text style={[styles.startText, { color: palette.onPrimary }]}>{running ? 'STOP' : 'START'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Tap tempo" onPress={tap} style={[styles.tap, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}><Ionicons name="hand-left-outline" size={25} color={palette.text} /><Text style={[styles.tapText, { color: palette.text }]}>TAP</Text></Pressable>
              </View>
              {running ? <Text accessibilityLiveRegion="polite" style={[styles.sessionStatus, { color: palette.textMuted }]}>{countInBarsRemaining > 0 ? `Count-in · ${countInBarsRemaining} ${countInBarsRemaining === 1 ? 'bar' : 'bars'}` : practiceSecondsRemaining !== null ? `${formatPracticeTime(practiceSecondsRemaining)} remaining` : `${formatPracticeTime(practiceElapsedSeconds)} elapsed`}</Text> : null}
            </Card>

            <Card>
              <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: palette.text }]}>Beat pattern</Text><Text style={[styles.meterLabel, { color: palette.primary }]}>{settings.beats}/{settings.denominator}</Text></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.beatRow}>
                {settings.accents.map((accent, index) => {
                  const active = running && currentBeat === index;
                  return (
                    <Pressable key={index} accessibilityRole="button" accessibilityLabel={`Beat ${index + 1}, ${accent}`} onPress={() => { const accents = [...settings.accents]; accents[index] = cycleAccent(accent); update({ accents }); }} style={[styles.beat, { backgroundColor: active ? palette.accent : accent === 'mute' ? palette.surfaceMuted : accent === 'accent' ? palette.primary : palette.surfaceMuted, borderColor: active ? palette.accent : palette.border, opacity: accent === 'mute' ? 0.55 : 1 }]}>
                      <Text style={[styles.beatNumber, { color: accent === 'accent' && !active ? palette.onPrimary : palette.text }]}>{index + 1}</Text>
                      <View style={[styles.beatMark, { backgroundColor: active && currentSubdivision === 0 ? palette.text : accent === 'mute' ? palette.textMuted : accent === 'accent' ? palette.onPrimary : palette.text }]} />
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          </View>

          <View style={styles.secondaryColumn}>
            <Card>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Meter</Text>
              <View style={styles.stepRow}><RoundButton label="Remove beat" icon="remove" onPress={() => setBeats(settings.beats - 1)} /><Text style={[styles.stepValue, { color: palette.text }]}>{settings.beats}</Text><RoundButton label="Add beat" icon="add" onPress={() => setBeats(settings.beats + 1)} /></View>
              <View style={styles.choiceWrap}>{DENOMINATORS.map((value) => <PillButton key={value} label={`/${value}`} selected={settings.denominator === value} onPress={() => update({ denominator: value })} />)}</View>
            </Card>
            <Card>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Subdivision</Text>
              <View style={styles.subdivisionRow}>{SUBDIVISIONS.map((item) => <Pressable key={item.value} accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{ selected: settings.subdivision === item.value }} onPress={() => update({ subdivision: item.value })} style={[styles.subdivision, { backgroundColor: settings.subdivision === item.value ? palette.primary : palette.surfaceMuted }]}><Text style={[styles.subIcon, { color: settings.subdivision === item.value ? palette.onPrimary : palette.text }]}>{item.icon}</Text><Text style={[styles.subLabel, { color: settings.subdivision === item.value ? palette.onPrimary : palette.textMuted }]}>{item.label}</Text></Pressable>)}</View>
            </Card>
            <Card>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>Practice tools</Text>
              <View style={styles.practiceBlock}><Text style={[styles.practiceLabel, { color: palette.textMuted }]}>COUNT-IN</Text><View style={styles.choiceWrap}>{[0, 1, 2, 3, 4].map((bars) => <PillButton key={bars} accessibilityLabel={bars === 0 ? 'Disable count-in' : `${bars} bar count-in`} label={bars === 0 ? 'Off' : String(bars)} selected={settings.countInBars === bars} onPress={() => update({ countInBars: bars })} />)}</View></View>
              <View style={styles.practiceBlock}><Text style={[styles.practiceLabel, { color: palette.textMuted }]}>TIMER</Text><View style={styles.choiceWrap}>{[0, 5, 10, 15, 30, 60].map((minutes) => <PillButton key={minutes} accessibilityLabel={minutes === 0 ? 'Disable practice timer' : `${minutes} minute practice timer`} label={minutes === 0 ? 'Off' : `${minutes}m`} selected={settings.practiceMinutes === minutes} onPress={() => update({ practiceMinutes: minutes })} />)}</View></View>
              <SettingRow label="Haptic pulse" value={settings.haptics} onValueChange={(haptics) => update({ haptics })} />
              <SettingRow label="Keep screen awake" value={settings.keepAwake} onValueChange={(keepAwake) => update({ keepAwake })} />
              <SettingRow label="Speed trainer" detail={`+${settings.trainer.increment} BPM every ${settings.trainer.everyBars} bars, up to ${settings.trainer.targetBpm}`} value={settings.trainer.enabled} onValueChange={(enabled) => updateTrainer({ enabled })} />
              {settings.trainer.enabled ? <View style={styles.trainerControls}><TrainerStepper label="Increase" value={settings.trainer.increment} suffix="BPM" onMinus={() => updateTrainer({ increment: Math.max(1, settings.trainer.increment - 1) })} onPlus={() => updateTrainer({ increment: Math.min(20, settings.trainer.increment + 1) })} /><TrainerStepper label="Every" value={settings.trainer.everyBars} suffix="bars" onMinus={() => updateTrainer({ everyBars: Math.max(1, settings.trainer.everyBars - 1) })} onPlus={() => updateTrainer({ everyBars: Math.min(32, settings.trainer.everyBars + 1) })} /><TrainerStepper label="Goal" value={settings.trainer.targetBpm} suffix="BPM" onMinus={() => updateTrainer({ targetBpm: clampBpm(settings.trainer.targetBpm - 5) })} onPlus={() => updateTrainer({ targetBpm: clampBpm(settings.trainer.targetBpm + 5) })} /></View> : null}
            </Card>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function RoundButton({ label, icon, onPress, compact = false }: { label: string; icon: 'add' | 'remove'; onPress: () => void; compact?: boolean }) {
  const { palette } = useApp();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, compact && styles.roundCompact, { backgroundColor: palette.surfaceMuted }]}><Ionicons name={icon} size={28} color={palette.text} /></Pressable>;
}

function TrainerStepper({ label, value, suffix, onMinus, onPlus }: { label: string; value: number; suffix: string; onMinus: () => void; onPlus: () => void }) {
  const { palette } = useApp();
  return <View style={styles.trainer}><Text style={[styles.trainerLabel, { color: palette.textMuted }]}>{label}</Text><View style={styles.trainerRow}><Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={onMinus} style={styles.smallHit}><Ionicons name="remove" color={palette.text} size={18} /></Pressable><Text style={[styles.trainerValue, { color: palette.text }]}>{value} <Text style={styles.trainerSuffix}>{suffix}</Text></Text><Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={onPlus} style={styles.smallHit}><Ionicons name="add" color={palette.text} size={18} /></Pressable></View></View>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.md, paddingBottom: 32, gap: spacing.lg }, pageTablet: { padding: spacing.xl },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 }, columns: { gap: spacing.md }, columnsTablet: { flexDirection: 'row', alignItems: 'flex-start' }, primaryColumn: { flex: 1, gap: spacing.md }, secondaryColumn: { flex: 1, gap: spacing.md },
  tempoCard: { alignItems: 'center', gap: 18 }, eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 }, tempoRow: { flexDirection: 'row', alignItems: 'center', gap: 20 }, tempoRowCompact: { gap: 12 }, round: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, roundCompact: { width: 44, height: 44, borderRadius: 22 }, bpmWrap: { alignItems: 'center' }, bpm: { minWidth: 155, textAlign: 'center', fontSize: 72, lineHeight: 78, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -4 }, bpmCompact: { minWidth: 120, fontSize: 60, lineHeight: 66 }, bpmLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  slider: { width: '100%', height: 12, borderRadius: 6, justifyContent: 'center', overflow: 'visible' }, sliderFill: { height: 12, borderRadius: 6 }, sliderThumb: { width: 28, height: 28, borderRadius: 14, position: 'absolute', marginLeft: -14 }, quickTempos: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 },
  transportRow: { width: '100%', flexDirection: 'row', gap: 10 }, start: { flex: 2, minHeight: 76, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, startText: { fontSize: 18, fontWeight: '900', letterSpacing: 1 }, tap: { flex: 1, minHeight: 76, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, tapText: { fontSize: 12, fontWeight: '900', marginTop: 3, letterSpacing: 1 },
  sessionStatus: { minHeight: 18, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, sectionTitle: { fontSize: 19, fontWeight: '900' }, meterLabel: { fontSize: 25, fontWeight: '900' }, beatRow: { gap: 9, paddingVertical: 18 }, beat: { width: 58, height: 76, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }, beatNumber: { fontSize: 19, fontWeight: '900' }, beatMark: { width: 10, height: 10, borderRadius: 5 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, marginVertical: 15 }, stepValue: { fontSize: 45, fontWeight: '900', minWidth: 65, textAlign: 'center' }, choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, subdivisionRow: { flexDirection: 'row', gap: 7, marginTop: 14 }, subdivision: { flex: 1, minHeight: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, subIcon: { fontSize: 24, fontWeight: '900' }, subLabel: { fontSize: 9, fontWeight: '800', marginTop: 4 },
  practiceBlock: { gap: 8, paddingTop: 16 }, practiceLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1 }, trainerControls: { flexDirection: 'row', gap: 7, paddingTop: 14 }, trainer: { flex: 1, alignItems: 'center' }, trainerLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, trainerRow: { flexDirection: 'row', alignItems: 'center' }, smallHit: { width: 32, height: 48, alignItems: 'center', justifyContent: 'center' }, trainerValue: { fontSize: 16, fontWeight: '900', textAlign: 'center' }, trainerSuffix: { fontSize: 9 },
});
