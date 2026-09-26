import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { Card, NumberField, PillButton, Screen, SettingRow } from '@/components/Controls';
import { findInstrument, INSTRUMENTS } from '@/constants/instruments';
import { useApp } from '@/store/AppProvider';
import { radius, spacing } from '@/theme';

export default function LibraryScreen() {
  const { width } = useWindowDimensions();
  const tablet = width >= 820;
  const { state, palette, updateTuner, updatePreferences, toggleFavorite, reset } = useApp();
  const [search, setSearch] = useState('');
  const instruments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...INSTRUMENTS]
      .filter((item) => !query || `${item.name} ${item.variant ?? ''} ${item.family} ${item.aliases.join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => Number(state.favoriteInstrumentIds.includes(b.id)) - Number(state.favoriteInstrumentIds.includes(a.id)) || a.name.localeCompare(b.name));
  }, [search, state.favoriteInstrumentIds]);

  const choose = (id: string) => {
    const instrument = findInstrument(id);
    updateTuner({ instrumentId: id, tuningId: instrument.tunings[0]?.id ?? '', targetIndex: 0, transposition: instrument.transpositionSemitones, transpositionLabel: instrument.variant ?? 'C' });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.page, tablet && styles.pageTablet]}>
        <View><Text style={[styles.title, { color: palette.text }]}>Library & settings</Text><Text style={[styles.subtitle, { color: palette.textMuted }]}>Your instruments and preferences stay on this device.</Text></View>
        <View style={[styles.columns, tablet && styles.columnsTablet]}>
          <View style={styles.libraryColumn}>
            <TextInput accessibilityLabel="Search instrument library" placeholder="Search instruments" placeholderTextColor={palette.textMuted} value={search} onChangeText={setSearch} style={[styles.search, { color: palette.text, backgroundColor: palette.surface, borderColor: palette.border }]} />
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>INSTRUMENTS</Text>
            <Card style={styles.listCard}>
              {instruments.map((item, index) => {
                const selected = item.id === state.tuner.instrumentId;
                const favorite = state.favoriteInstrumentIds.includes(item.id);
                return (
                  <View key={item.id} style={[styles.instrument, index > 0 && { borderTopColor: palette.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Use ${item.name} ${item.variant ?? ''}`} onPress={() => choose(item.id)} style={styles.instrumentMain}>
                      <View style={[styles.instrumentIcon, { backgroundColor: selected ? palette.primary : palette.surfaceMuted }]}><Ionicons name={item.tunings.length ? 'musical-notes' : 'radio-outline'} size={22} color={selected ? palette.onPrimary : palette.text} /></View>
                      <View style={styles.instrumentCopy}><Text style={[styles.instrumentName, { color: palette.text }]}>{item.name} {item.variant ?? ''}</Text><Text style={[styles.instrumentMeta, { color: palette.textMuted }]}>{item.family}{item.tunings[0] ? ` · ${item.tunings[0].name}` : ' · Chromatic'}</Text></View>
                      {selected ? <Ionicons name="checkmark-circle" size={23} color={palette.primary} /> : null}
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={favorite ? `Remove ${item.name} from favorites` : `Add ${item.name} to favorites`} onPress={() => toggleFavorite(item.id)} style={styles.favorite}><Ionicons name={favorite ? 'star' : 'star-outline'} size={22} color={favorite ? palette.accent : palette.textMuted} /></Pressable>
                  </View>
                );
              })}
            </Card>
          </View>

          <View style={styles.settingsColumn}>
            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>APPEARANCE</Text>
            <Card>
              <Text style={[styles.settingTitle, { color: palette.text }]}>Theme</Text>
              <View style={styles.choices}>{(['system', 'light', 'dark'] as const).map((theme) => <PillButton key={theme} label={theme[0]!.toUpperCase() + theme.slice(1)} selected={state.preferences.theme === theme} onPress={() => updatePreferences({ theme })} />)}</View>
              <SettingRow label="High contrast" detail="Stronger visual separation for controls" value={state.preferences.highContrast} onValueChange={(highContrast) => updatePreferences({ highContrast })} />
              <SettingRow label="Reduce motion" detail="Avoid non-essential movement" value={state.preferences.reduceMotion} onValueChange={(reduceMotion) => updatePreferences({ reduceMotion })} />
            </Card>

            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>TUNER</Text>
            <Card>
              <View style={styles.fields}><NumberField label="Concert A" value={state.tuner.a4} min={390} max={490} suffix="Hz" onChange={(a4) => updateTuner({ a4 })} /><NumberField label="Tolerance" value={state.tuner.tolerance} min={1} max={10} suffix="cents" onChange={(tolerance) => updateTuner({ tolerance })} /></View>
              <Text style={[styles.help, { color: palette.textMuted }]}>Equal temperament · written pitch transposition is selected from the tuner.</Text>
              <View style={[styles.volumeRow, { borderTopColor: palette.border }]}><Text style={[styles.settingTitle, { color: palette.text }]}>Reference tone volume</Text><View style={styles.volumeButtons}><PillButton label="−" onPress={() => updateTuner({ referenceToneVolume: Math.max(0.05, state.tuner.referenceToneVolume - 0.1) })} /><Text style={[styles.volume, { color: palette.text }]}>{Math.round(state.tuner.referenceToneVolume * 100)}%</Text><PillButton label="+" onPress={() => updateTuner({ referenceToneVolume: Math.min(1, state.tuner.referenceToneVolume + 0.1) })} /></View></View>
            </Card>

            <Text style={[styles.sectionLabel, { color: palette.textMuted }]}>PRIVACY & ABOUT</Text>
            <Card>
              <View style={styles.aboutRow}><View style={[styles.logo, { backgroundColor: palette.primary }]}><Ionicons name="pulse" size={28} color={palette.onPrimary} /></View><View style={styles.aboutCopy}><Text style={[styles.settingTitle, { color: palette.text }]}>Tunera 0.1.0</Text><Text style={[styles.help, { color: palette.textMuted }]}>Offline by design. No accounts, ads, analytics, recordings, or network-dependent features.</Text></View></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Reset all settings" onPress={() => Alert.alert('Reset all settings?', 'Your tuner and metronome preferences will return to defaults.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Reset', style: 'destructive', onPress: reset }])} style={[styles.reset, { borderColor: palette.danger }]}><Text style={[styles.resetText, { color: palette.danger }]}>Reset all settings</Text></Pressable>
            </Card>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: spacing.md, paddingBottom: 32, gap: spacing.lg }, pageTablet: { padding: spacing.xl },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -0.8 }, subtitle: { fontSize: 14, lineHeight: 20, marginTop: 3 }, columns: { gap: spacing.lg }, columnsTablet: { flexDirection: 'row', alignItems: 'flex-start' }, libraryColumn: { flex: 1.08, gap: spacing.sm }, settingsColumn: { flex: 0.92, gap: spacing.sm },
  search: { minHeight: 54, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 16, fontSize: 16 }, sectionLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 5 }, listCard: { paddingVertical: 2 },
  instrument: { flexDirection: 'row', alignItems: 'center' }, instrumentMain: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 }, instrumentIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, instrumentCopy: { flex: 1 }, instrumentName: { fontSize: 16, fontWeight: '800' }, instrumentMeta: { fontSize: 12, marginTop: 3 }, favorite: { width: 48, height: 56, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 16, fontWeight: '800' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 5 }, fields: { flexDirection: 'row', gap: 10 }, help: { fontSize: 12, lineHeight: 18, marginTop: 12 }, volumeRow: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 15 }, volumeButtons: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 9 }, volume: { fontSize: 16, fontWeight: '900', minWidth: 50, textAlign: 'center' },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, logo: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, aboutCopy: { flex: 1 }, reset: { minHeight: 50, marginTop: 18, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, resetText: { fontSize: 14, fontWeight: '800' },
});
