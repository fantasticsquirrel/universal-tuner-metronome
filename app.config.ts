import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Tunera',
  slug: 'tunera',
  owner: 'cabbageman2',
  extra: {
    eas: { projectId: 'bdc76f5c-c510-4dba-86eb-b27d7795fa5d' },
  },
  version: '0.2.1',
  orientation: 'default',
  icon: './assets/icon.png',
  scheme: 'tunera',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.tunera.mobile',
    infoPlist: {
      NSMicrophoneUsageDescription:
        'Tunera listens only while the tuner is active to measure pitch. Audio is processed on this device and is never saved or uploaded.',
    },
  },
  android: {
    package: 'app.tunera.mobile',
    versionCode: 4,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#071512',
    },
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
        backgroundColor: '#071512',
        dark: { backgroundColor: '#071512' },
      },
    ],
    [
      '@siteed/audio-studio',
      {
        enablePhoneStateHandling: false,
        enableNotifications: false,
        enableBackgroundAudio: false,
        enableDeviceDetection: false,
        iosConfig: {
          microphoneUsageDescription:
            'Tunera listens only while the tuner is active to measure pitch. Audio is processed on this device and is never saved or uploaded.',
        },
      },
    ],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        android: { minSdkVersion: 29 },
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
