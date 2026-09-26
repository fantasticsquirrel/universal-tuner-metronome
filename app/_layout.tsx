import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AudioProvider } from '@/audio/AudioProvider';
import { AppProvider, useApp } from '@/store/AppProvider';

function RootNavigator() {
  const { isDark } = useApp();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)" /></Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider><AudioProvider><RootNavigator /></AudioProvider></AppProvider>
    </SafeAreaProvider>
  );
}
