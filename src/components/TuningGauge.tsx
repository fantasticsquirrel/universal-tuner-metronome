import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { clampCents, formatCents } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';

export function TuningGauge({ cents, tolerance, active }: { cents: number; tolerance: number; active: boolean }) {
  const { palette, state } = useApp();
  const [trackWidth, setTrackWidth] = useState(0);
  const [translateX] = useState(() => new Animated.Value(0));
  const value = active ? clampCents(cents) : 0;
  const reduceMotion = state.preferences.reduceMotion;

  useEffect(() => {
    if (trackWidth <= 0) return;
    const toValue = value * trackWidth / 100;
    if (reduceMotion) {
      translateX.setValue(toValue);
      return;
    }
    // Only the marker transform animates; pitch text and lock decisions still
    // consume every snapshot. Width is measured again after rotation/resizing.
    const animation = Animated.timing(translateX, { toValue, duration: 80, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduceMotion, trackWidth, translateX, value]);
  const inTune = active && Math.abs(cents) <= tolerance;
  const direction = !active ? 'Play a steady note' : inTune ? 'IN TUNE' : cents < 0 ? '↑ Tune up · Flat' : '↓ Tune down · Sharp';
  const markerColor = inTune ? palette.success : cents < 0 ? palette.flat : palette.sharp;

  return (
    <View accessible accessibilityLabel={active ? `${formatCents(cents)}, ${direction}` : direction} style={styles.wrap}>
      <View style={styles.labels}><Text style={{ color: palette.textMuted }}>−50</Text><Text style={{ color: palette.textMuted }}>0</Text><Text style={{ color: palette.textMuted }}>+50</Text></View>
      <View testID="tuning-gauge-track" onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={[styles.track, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
        <View style={[styles.tolerance, { backgroundColor: palette.success, left: `${50 - tolerance}%`, width: `${Math.max(5, tolerance * 2)}%` }]} />
        <View style={[styles.center, { backgroundColor: palette.textMuted }]} />
        <Animated.View testID="tuning-gauge-marker" style={[styles.marker, { backgroundColor: active ? markerColor : palette.textMuted, transform: [{ translateX }] }]} />
      </View>
      <Text style={[styles.cents, { color: active ? palette.text : palette.textMuted }]}>{active ? formatCents(cents) : '—'}</Text>
      <Text style={[styles.direction, { color: active ? markerColor : palette.textMuted }]}>{direction}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', alignItems: 'center' },
  labels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 6 },
  track: { width: '100%', height: 24, borderRadius: 12, borderWidth: 1, justifyContent: 'center', overflow: 'visible' },
  tolerance: { height: 8, position: 'absolute', borderRadius: 4, opacity: 0.3 },
  center: { width: 2, height: 18, position: 'absolute', left: '50%' },
  marker: { width: 6, height: 38, borderRadius: 3, position: 'absolute', left: '50%', marginLeft: -3 },
  cents: { fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: 18 },
  direction: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5, marginTop: 2 },
});
