import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/store/AppProvider';
import { radius, spacing } from '@/theme';

export function Screen({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { palette } = useApp();
  return <SafeAreaView edges={['top']} style={[styles.screen, { backgroundColor: palette.background }, style]}>{children}</SafeAreaView>;
}

export function Card({ children, style }: React.PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const { palette } = useApp();
  return <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

export function IconButton({ icon, label, onPress, selected = false, disabled = false }: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { palette } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { backgroundColor: selected ? palette.primary : palette.surfaceMuted, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={icon} color={selected ? palette.onPrimary : palette.text} size={23} />
    </Pressable>
  );
}

export function PillButton({ label, onPress, selected = false, icon }: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { palette } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.pill, {
        backgroundColor: selected ? palette.primary : palette.surfaceMuted,
        borderColor: selected ? palette.primary : palette.border,
        opacity: pressed ? 0.75 : 1,
      }]}
    >
      {icon ? <Ionicons name={icon} size={17} color={selected ? palette.onPrimary : palette.text} /> : null}
      <Text numberOfLines={1} style={[styles.pillText, { color: selected ? palette.onPrimary : palette.text }]}>{label}</Text>
    </Pressable>
  );
}

export function SettingRow({ label, detail, value, onValueChange, disabled = false }: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { palette } = useApp();
  return (
    <View style={[styles.settingRow, { borderBottomColor: palette.border, opacity: disabled ? 0.5 : 1 }]}>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingLabel, { color: palette.text }]}>{label}</Text>
        {detail ? <Text style={[styles.settingDetail, { color: palette.textMuted }]}>{detail}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: palette.border, true: palette.primary }}
      />
    </View>
  );
}

export function NumberField({ label, value, onChange, min, max, suffix, keyboardType = 'number-pad' }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  const { palette } = useApp();
  return (
    <View style={styles.numberField}>
      <Text style={[styles.numberLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={[styles.numberInputWrap, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
        <TextInput
          accessibilityLabel={label}
          keyboardType={keyboardType}
          selectTextOnFocus
          value={String(value)}
          onChangeText={(text) => {
            const number = Number(text.replace(',', '.'));
            if (Number.isFinite(number)) onChange(Math.max(min, Math.min(max, number)));
          }}
          style={[styles.numberInput, { color: palette.text }]}
        />
        {suffix ? <Text style={{ color: palette.textMuted }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Sheet({ visible, title, onClose, children }: React.PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
}>) {
  const { palette } = useApp();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close dialog" />
      <SafeAreaView style={[styles.sheet, { backgroundColor: palette.surface }]} edges={['bottom']}>
        <View style={[styles.sheetHandle, { backgroundColor: palette.border }]} />
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: palette.text }]}>{title}</Text>
          <IconButton icon="close" label={`Close ${title}`} onPress={onClose} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 48, maxWidth: 220, borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 15, fontWeight: '700' },
  settingRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  settingCopy: { flex: 1, paddingVertical: 10 },
  settingLabel: { fontSize: 16, fontWeight: '700' },
  settingDetail: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  numberField: { flex: 1, minWidth: 110, gap: 6 },
  numberLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  numberInputWrap: { height: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  numberInput: { flex: 1, height: 48, fontSize: 17, fontWeight: '700' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)' },
  sheet: { maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 8 },
  sheetHandle: { width: 42, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 5 },
  sheetHeader: { minHeight: 60, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 22, fontWeight: '800' },
  sheetContent: { paddingHorizontal: 20, paddingBottom: 28, gap: 12 },
});
