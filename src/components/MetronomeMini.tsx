import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useRuntimeAudio } from '@/audio/AudioProvider';
import { useApp } from '@/store/AppProvider';
import { formatPracticeTime } from '@/lib/practice';
import { radius } from '@/theme';

export function MetronomeMini({ expanded = false }: { expanded?: boolean }) {
  const router = useRouter();
  const { state, palette } = useApp();
  const { running, currentBeat, countInBarsRemaining, practiceSecondsRemaining, toggleMetronome } = useRuntimeAudio();
  return (
    <View style={[styles.wrap, expanded && styles.expanded, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={running ? 'Stop metronome' : 'Start metronome'} onPress={toggleMetronome} style={[styles.play, { backgroundColor: running ? palette.danger : palette.primary }]}>
        <Ionicons name={running ? 'stop' : 'play'} size={24} color={palette.onPrimary} />
      </Pressable>
      <View style={styles.copy}>
        <Text style={[styles.eyebrow, { color: palette.textMuted }]}>METRONOME</Text>
        <Text style={[styles.bpm, { color: palette.text }]}>{state.metronome.bpm} <Text style={styles.unit}>BPM</Text></Text>
        {running && countInBarsRemaining > 0 ? <Text style={[styles.session, { color: palette.textMuted }]}>IN {countInBarsRemaining}</Text> : running && practiceSecondsRemaining !== null ? <Text style={[styles.session, { color: palette.textMuted }]}>{formatPracticeTime(practiceSecondsRemaining)}</Text> : null}
      </View>
      <View style={styles.beats}>
        {state.metronome.accents.map((accent, index) => (
          <View key={index} style={[styles.dot, {
            backgroundColor: running && currentBeat === index ? palette.accent : accent === 'mute' ? palette.border : palette.textMuted,
            transform: [{ scale: running && currentBeat === index ? 1.4 : 1 }],
          }]} />
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Open metronome" onPress={() => router.push('/metronome')} style={styles.open}>
        <Ionicons name="chevron-forward" size={22} color={palette.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { minHeight: 76, borderWidth: 1, borderRadius: radius.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  expanded: { minHeight: 110 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  copy: { minWidth: 88 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  bpm: { fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'] },
  unit: { fontSize: 10, fontWeight: '700' },
  session: { fontSize: 10, fontWeight: '900', fontVariant: ['tabular-nums'] },
  beats: { flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', flexWrap: 'wrap' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  open: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
});
