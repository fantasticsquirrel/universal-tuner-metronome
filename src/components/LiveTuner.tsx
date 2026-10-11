import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAudioControls } from '@/audio/AudioProvider';
import { usePitchInput } from '@/audio/usePitchInput';
import { Card, IconButton, PillButton } from '@/components/Controls';
import { TuningGauge } from '@/components/TuningGauge';
import { findInstrument, findTuning } from '@/constants/instruments';
import { getInputProblem } from '@/lib/audioInputState';
import { adjustedTargetMidi, analyzeFrequency, midiToNote, minimumConfidence, writtenNote } from '@/lib/pitch';
import { useApp } from '@/store/AppProvider';
import { radius } from '@/theme';

// Pitch emissions belong here, not at the screen that builds sheets and the
// metronome. Only the low-frequency input-problem flag crosses back to chrome.
// Guided-string children retain the screen's element identity across emissions.
export function LiveTuner({ children, onInputProblemChange }: React.PropsWithChildren<{
  onInputProblemChange: (hasProblem: boolean) => void;
}>) {
  const { state, palette, updateTuner } = useApp();
  const { tuner } = state;
  const instrument = findInstrument(tuner.instrumentId, state.customInstruments);
  const activeTuning = findTuning(instrument, tuner.tuningId);
  const target = activeTuning?.targets[tuner.targetIndex];
  const targetMidi = target ? adjustedTargetMidi(target.midi, tuner.capo, tuner.detune) : undefined;
  const { running, tonePlaying, toneError, toggleTone, retuneTone } = useAudioControls();
  const { permission, snapshot, error, isListening, start, stop } = usePitchInput(
    instrument.detectorProfile,
    tuner.sensitivity,
    tuner.noiseGate,
    running || tonePlaying,
  );
  const autoStarted = useRef(false);
  const lockStartedAt = useRef<number | null>(null);
  const lockKeyRef = useRef<string | null>(null);
  const completedLockKeyRef = useRef<string | null>(null);
  const [lockedState, setLockedState] = useState<{ key: string; startedAt: number } | null>(null);

  useEffect(() => {
    if (permission === 'granted' && !isListening && !autoStarted.current) {
      autoStarted.current = true;
      void start();
    }
  }, [isListening, permission, start]);

  const confidenceGate = minimumConfidence(tuner.sensitivity);
  const detected = snapshot && snapshot.confidence >= confidenceGate
    ? analyzeFrequency(snapshot.frequency, tuner.a4)
    : null;
  const guided = targetMidi !== undefined && snapshot
    ? analyzeFrequency(snapshot.frequency, tuner.a4, targetMidi)
    : null;
  const targetMismatch = Boolean(targetMidi !== undefined && detected && detected.roundedMidi !== targetMidi);
  const visibleNote = detected ? writtenNote(detected.roundedMidi, tuner.transposition) : null;
  const cents = guided?.cents ?? detected?.cents ?? 0;

  const lockKey = targetMidi !== undefined && activeTuning
    ? `${instrument.id}:${activeTuning.id}:${tuner.targetIndex}:${targetMidi}`
    : detected ? `chromatic:${detected.roundedMidi}` : null;
  const lockCandidate = Boolean(
    isListening
    && snapshot
    && detected
    && !targetMismatch
    && snapshot.confidence >= confidenceGate
    && Math.abs(guided?.cents ?? detected.cents) <= tuner.tolerance,
  );
  const locked = lockCandidate && lockedState?.key === lockKey;

  useEffect(() => {
    if (!lockCandidate || lockKey === null) {
      lockStartedAt.current = null;
      lockKeyRef.current = null;
      completedLockKeyRef.current = null;
      if (!lockedState) return;
      const clearTimer = setTimeout(() => setLockedState(null), 0);
      return () => clearTimeout(clearTimer);
    }
    const timestamp = snapshot?.timestamp ?? 0;
    if (lockKeyRef.current !== lockKey) {
      lockKeyRef.current = lockKey;
      lockStartedAt.current = timestamp;
      completedLockKeyRef.current = null;
      if (!lockedState) return;
      const clearTimer = setTimeout(() => setLockedState(null), 0);
      return () => clearTimeout(clearTimer);
    }
    lockStartedAt.current ??= timestamp;
    if (
      locked
      || completedLockKeyRef.current === lockKey
      || timestamp - lockStartedAt.current < tuner.lockHoldMs
    ) {
      return;
    }
    const timer = setTimeout(() => {
      if (lockKeyRef.current !== lockKey || completedLockKeyRef.current === lockKey) return;
      completedLockKeyRef.current = lockKey;
      setLockedState({ key: lockKey, startedAt: lockStartedAt.current ?? 0 });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (tuner.autoAdvance && activeTuning && target) {
        updateTuner({ targetIndex: (tuner.targetIndex + 1) % activeTuning.targets.length });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [
    activeTuning,
    lockCandidate,
    locked,
    lockKey,
    lockedState,
    snapshot?.timestamp,
    target,
    tuner.autoAdvance,
    tuner.lockHoldMs,
    tuner.targetIndex,
    updateTuner,
  ]);

  const inputProblem = getInputProblem(permission, error);
  const toneMidi = targetMidi ?? detected?.roundedMidi ?? tuner.referenceToneMidi;
  const selectedToneMidi = targetMidi ?? tuner.referenceToneMidi;

  useEffect(() => {
    retuneTone(selectedToneMidi);
  }, [retuneTone, selectedToneMidi]);

  const hasInputProblem = Boolean(inputProblem);
  useEffect(() => {
    onInputProblemChange(hasInputProblem);
  }, [hasInputProblem, onInputProblemChange]);

  return (
    <>
      {inputProblem ? (
        <Card style={styles.permissionCard}>
          <Ionicons name={inputProblem.kind === 'denied' ? 'mic-off-outline' : 'mic-outline'} size={30} color={palette.primary} />
          <View style={styles.permissionCopy}>
            <Text style={[styles.permissionTitle, { color: palette.text }]}>{inputProblem.title}</Text>
          </View>
          <PillButton label={inputProblem.actionLabel} onPress={() => inputProblem.kind === 'denied' ? void Linking.openSettings() : void start()} selected />
        </Card>
      ) : null}

      <Card style={styles.tunerCard}>
        <Text accessibilityLiveRegion="polite" style={[styles.targetLabel, { color: locked ? palette.success : palette.textMuted }]}>{locked ? 'LOCKED' : targetMismatch && targetMidi !== undefined ? `AIM FOR ${midiToNote(targetMidi).name}${midiToNote(targetMidi).octave}` : target ? `STRING ${target.label}` : 'CONCERT PITCH'}</Text>
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

      {children}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={tonePlaying ? 'Stop reference tone' : 'Play reference tone'} onPress={() => toggleTone(toneMidi)} style={[styles.toneButton, { backgroundColor: tonePlaying ? palette.accent : palette.surfaceMuted, borderColor: palette.border }]}>
          <Ionicons name={tonePlaying ? 'volume-high' : 'volume-medium-outline'} size={23} color={palette.text} />
          <Text style={[styles.toneText, { color: palette.text }]}>{tonePlaying ? 'Stop tone' : 'Reference tone'}</Text>
        </Pressable>
        <IconButton icon={isListening ? 'mic' : 'mic-off-outline'} label={isListening ? 'Stop listening' : 'Start listening'} selected={isListening} onPress={() => void (isListening ? stop() : start())} />
      </View>
      {toneError ? <Text accessibilityLiveRegion="polite" style={[styles.playbackError, { color: palette.danger }]}>{toneError}</Text> : null}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const { palette } = useApp();
  return <View style={styles.detail}><Text style={[styles.detailLabel, { color: palette.textMuted }]}>{label}</Text><Text style={[styles.detailValue, { color: palette.text }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  permissionCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, permissionCopy: { flex: 1 }, permissionTitle: { fontSize: 16, fontWeight: '800' },
  tunerCard: { minHeight: 410, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  targetLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', minHeight: 135 },
  note: { fontSize: 122, lineHeight: 138, fontWeight: '900', letterSpacing: -8 }, octave: { fontSize: 30, fontWeight: '800', marginTop: 24, marginLeft: 8 }, concert: { fontSize: 13, fontWeight: '700', marginTop: -10, marginBottom: 18 },
  details: { width: '100%', borderTopWidth: 1, flexDirection: 'row', marginTop: 22, paddingTop: 14 }, detail: { flex: 1, alignItems: 'center' }, detailLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8 }, detailValue: { fontSize: 14, fontWeight: '800', marginTop: 4, fontVariant: ['tabular-nums'] },
  warning: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10 }, toneButton: { minHeight: 52, flex: 1, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 }, toneText: { fontSize: 15, fontWeight: '800' },
  playbackError: { textAlign: 'center', fontSize: 12, fontWeight: '700' },
});
