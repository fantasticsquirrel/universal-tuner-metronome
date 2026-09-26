const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', '.expo/**', 'coverage/**'],
    rules: { 'react-hooks/exhaustive-deps': 'warn' }
  },
  {
    files: ['src/audio/AudioProvider.tsx'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off'
    }
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: { globals: { Buffer: 'readonly' } }
  }
]);
