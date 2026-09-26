import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useWindowDimensions } from 'react-native';

import { useApp } from '@/store/AppProvider';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const { palette } = useApp();
  const tablet = width >= 768;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: { backgroundColor: palette.tab, borderTopColor: palette.border, height: tablet ? undefined : 68 },
        tabBarItemStyle: { minHeight: 54 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarPosition: tablet ? 'left' : 'bottom',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Tuner', tabBarIcon: ({ color, size }) => <Ionicons name="radio-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="metronome" options={{ title: 'Metronome', tabBarIcon: ({ color, size }) => <Ionicons name="timer-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ color, size }) => <Ionicons name="library-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
