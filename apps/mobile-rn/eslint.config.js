// ESLint v9 flat-config (migrated from .eslintrc.json — Phase 1 PHASE1-13).
// `npm run lint` runs `eslint .` which picks up this file.
//
// Rules preserved from the legacy .eslintrc.json:
//   - no-restricted-imports: blocks `@rnmapbox/maps` outside src/map/ (ТЗ §3 принцип 10)
//
// Rules added in PHASE1-13 (D-33):
//   - no-restricted-syntax: blocks `process.env.EXPO_PUBLIC_*_SECRET` MemberExpression
//     and any string Literal matching /^sk\.[A-Za-z0-9._-]{40,}/ (Mapbox secret token shape).
//     The {40,} length quantifier prevents false-positives on UI strings like 'sk-button'.
//
// Ignore patterns: replaces legacy .eslintignore (which flat-config does not support).
//   - apps/mobile-rn/src/__fixtures__/ — intentional lint-failure fixtures used to verify
//     the token-secret guard fires (run via `npx eslint --no-ignore -- src/__fixtures__/...`).

const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'android/**',
      'ios/**',
      'coverage/**',
      '.expo/**',
      // Intentional lint-failure fixtures for PHASE1-13 token-secret guard
      // (verified via dedicated `eslint --no-ignore -- src/__fixtures__/`).
      'src/__fixtures__/**',
    ],
  },
  ...expoConfig,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@rnmapbox/maps',
              message:
                'Импорт Mapbox SDK разрешён только из src/map/. См. ТЗ §3 принцип 10.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^EXPO_PUBLIC_.*_SECRET$/]",
          message:
            'Secrets must NOT be exposed via EXPO_PUBLIC_* — they ship in the bundle. Use ~/.netrc / ~/.gradle/gradle.properties at build time. См. docs/SECRETS.md.',
        },
        {
          selector: "Literal[value=/^sk\\.[A-Za-z0-9._-]{40,}/]",
          message:
            'Hard-coded Mapbox sk. secret detected. Move to ~/.netrc / ~/.gradle/gradle.properties. См. docs/SECRETS.md.',
        },
      ],
    },
  },
  {
    // Mapbox SDK is permitted inside the adapter quarantine (src/map/) and
    // inside test files that mock or stub the SDK (src/__tests__/).
    // The token-secret rules (no-restricted-syntax) still apply to both.
    files: ['src/map/**/*.{ts,tsx}', 'src/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];
