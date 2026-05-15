// Intentional lint-failure fixture for PHASE1-13 token-secret guard.
// This file is excluded from the standard `npm run lint` run via the
// `ignores` block in `eslint.config.js`. CI verifies the rule by running
// ESLint on this file explicitly with `--no-ignore`:
//
//   npx eslint --no-ignore -- src/__fixtures__/secret.lint-fixture.ts
//
// Expected: non-zero exit code AND both error messages emitted
// ("Secrets must NOT be exposed via EXPO_PUBLIC_*" and "Hard-coded Mapbox sk. secret detected").
//
// DO NOT IMPORT THIS FILE FROM PRODUCTION CODE. It exists solely as a
// negative test for the ESLint rule. See docs/SECRETS.md §Guard Rails.

// Should trigger the MemberExpression rule (process.env.EXPO_PUBLIC_*_SECRET):
const leakedSecret = process.env.EXPO_PUBLIC_MAPBOX_SECRET;

// Should trigger the Literal rule (^sk\.[A-Za-z0-9._-]{40,}):
// The body after `sk.` is a fake JWT-shaped string ≥40 chars; the rule's length
// quantifier prevents false-positives on short UI strings like 'sk-button'.
const hardCoded =
  'sk.eyJ1IjoiZmFrZSIsImEiOiJja3FxcWFhYWEwMDFhMm9wbHBpZXh4eHh4eHgifQ.fake-suffix-for-fixture';

export { leakedSecret, hardCoded };
