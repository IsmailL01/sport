/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    // @noble/ed25519 + @noble/hashes are ESM-only; Jest needs to transform them
    // (Plan 08-01 Task 5 introduced these deps for manifest signature verification).
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@sentry/.*|sentry-expo|native-base|react-native-svg|@rnmapbox/.*|@noble/.*)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
