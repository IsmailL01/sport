---
phase: 01-validate-close-territory-core
plan: 03
subsystem: mobile-closure-feedback
tags: [phase1, expo-haptics, toast, ui, tdd]
requires:
  - useTrackerCamera-hook
  - useLayerVisibility-hook
  - usePauseUI-hook
  - zustand-mock-pattern-for-hook-tests
provides:
  - Toast-component
  - useToast-hook
  - ToastProvider-context
  - useClosureFeedback-hook
  - haptic-on-event-pattern
affects:
  - App.tsx
  - TrackerLiveScreen.tsx
tech-stack:
  added:
    - "expo-haptics@~14.1.4 (Expo SDK 54 compatible)"
  patterns:
    - "In-house Animated.View toast overlay (Context-provider, fade-in/out)"
    - "Sole-call-site Haptics with .catch(() => {}) swallow (iOS sim / Android-13+ permission resilient)"
    - "Zustand-mock-pattern replicated from Plan 02 SUMMARY — module-level mockState, jest.mock factory, jest.fn renamed to mockShow/mockHaptics for jest's mock-prefix rule"
key-files:
  created:
    - apps/mobile-rn/src/ui/Toast.tsx
    - apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts
    - apps/mobile-rn/src/__tests__/Toast.test.tsx
    - apps/mobile-rn/src/__tests__/useClosureFeedback.test.tsx
  modified:
    - apps/mobile-rn/package.json
    - apps/mobile-rn/package-lock.json
    - apps/mobile-rn/App.tsx
    - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
decisions:
  - "expo-haptics pinned ~14.1.4 (SDK 54). Used `npm install --save-exact` then converted bare `14.1.4` → `~14.1.4` to match the plan's verify regex `~14\\.1\\.[0-9]+`. Caret range explicitly forbidden — would admit 15.x SDK 55 breaking changes."
  - "Toast: theme integration via `useTheme().lime` (Cursona accent #C6F560) with literal `#10B981` fallback when no ThemeProvider in tree. Plan suggested either; chose the design-token path per CLAUDE.md `Принципы кода` (design tokens, not hard-coded colors). The literal acts as belt-and-braces for tests that mock the design barrel."
  - "Toast typing: returned `ReactElement` (from `react`) instead of bare `JSX.Element`. React 19 + @types/react 19.1 do not ship a global `JSX` namespace; `ReactElement` is the canonical replacement. Same fix applied in test file."
  - "Test mock identifiers use `mockShow` / `mockHaptics` (mock-prefixed) — jest.mock's factory variable-access guard rejects `showMock` despite the docs claiming case-insensitivity for the suffix. PREFIXING with `mock` is the safe form."
  - "Single Haptics call site enforced (RESEARCH.md Anti-Patterns). Verified by `grep -rn 'Haptics' src --include='*.ts*' | grep -v __tests__` → only 3 hits, all inside `useClosureFeedback.ts`."
metrics:
  duration: ~25 minutes
  completed: 2026-05-14
---

# Phase 1 Plan 03: Closure Feedback (Haptic + Toast) Summary

`expo-haptics@~14.1.4` installed (only new dependency this phase introduces); in-house `Toast.tsx` Context-provider + `useToast()` hook + `useClosureFeedback()` effect-hook ship the long-deferred P1-G-09 micro-interaction. `ToastProvider` mounted in `App.tsx` between `ThemeProvider` and `RootNavigator`; `TrackerLiveScreen` calls `useClosureFeedback()` alongside the Plan 02 hooks. 8 new tests; 0 regressions; 520/520 full-suite green.

## One-liner

Closure haptic + toast wired end-to-end: `Haptics.notificationAsync(Success)` + `«Зона замкнута! Площадь: <formatArea(areaM2)>»` toast fires exactly once per session when `closureFired` flips false→true, via a side-effect hook that is the sole `expo-haptics` call site in the codebase.

## Tasks Completed

| Task | Name                                                                          | Commit    | Files                                                                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Install expo-haptics + create Toast component + tests                         | `8327df1` | `package.json` (+ `package-lock.json`), `src/ui/Toast.tsx` (85 LOC), `src/__tests__/Toast.test.tsx` (104 LOC, 3 tests)                                                                                              |
| 2-RED  | TDD RED — failing tests for useClosureFeedback                              | `5caf8a0` | `src/__tests__/useClosureFeedback.test.tsx` (151 LOC, 5 tests — module-not-found failure as expected)                                                                                                               |
| 2-GREEN| TDD GREEN — useClosureFeedback hook implementation                          | `fc3bc67` | `src/navigation/screens/record/hooks/useClosureFeedback.ts` (28 LOC), tiny test-file tweak to silence `unknown[] spread → mockHaptics`                                                                              |
| 3    | Wire ToastProvider + closure feedback                                         | `4cbe759` | `App.tsx` (ToastProvider import + JSX wrap), `TrackerLiveScreen.tsx` (`useClosureFeedback` import + call site)                                                                                                      |

## LOC + Test Counts

| File                                                                                | LOC | Min target | Status |
| ----------------------------------------------------------------------------------- | --- | ---------- | ------ |
| `apps/mobile-rn/src/ui/Toast.tsx`                                                   | 85  | 50         | ✓ ≥    |
| `apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts`          | 28  | 20         | ✓ ≥    |

| Suite                                                  | Tests | Status |
| ------------------------------------------------------ | ----- | ------ |
| `Toast.test.tsx`                                       | 3     | ✓      |
| `useClosureFeedback.test.tsx`                          | 5     | ✓      |
| **Total NEW tests added**                              | **8** | **✓**  |
| **Full Jest suite** (45 suites, 520 tests)             | 520   | ✓      |

**tsc --noEmit:** clean.
**eslint:** 0 errors, 59 warnings (all pre-existing — 4 new structural lines did not introduce any).

## Theme integration choice

Used `useTheme().lime` (Cursona accent token `#C6F560`) for the toast background with a fallback to the literal `#10B981` (matches CONTEXT.md D-17's success-accent spec). Both colors are observably green; the lime token blends with the rest of the Cursona dark theme while the literal acts as a safety net when the design barrel is mocked in tests (the Toast test deliberately mocks `../design` to avoid pulling MMKV into jest-expo).

## expo-haptics resolved version

`package.json` line:
```json
"expo-haptics": "~14.1.4",
```
Verified with: `grep '"expo-haptics"' package.json | grep -E '~14\.1\.[0-9]+'` → match (plan verify command). Tilde range admits 14.1.x patches only — no 14.2 / 15.x exposure.

## Manual smoke outcome

**Not executed.** The executor environment does not have a Pixel emulator / iOS simulator / physical device available. Behavior is mechanically validated by:
- 5 unit tests for `useClosureFeedback` covering haptic-call, toast-call, idempotency, area-null guard, and silent-swallow.
- 3 unit tests for `Toast` covering default no-op, render + fade-out unmount, and replace-while-visible.
- Full suite green; no test references mock `closureFired` differently than the real `activity.ts` store contract.

Manual smoke (haptic on real device, toast visible on emulator) should be performed by the device-owner during Phase 1 field-test runs (PHASE1-01..04). The hook code path is identical to RESEARCH.md Pattern 3 verbatim — no novel logic that needs runtime debugging beyond the test assertions.

## Cross-link

This plan closes:
- **PHASE1-08** (REQ-ID — closure haptic + toast feedback)
- **P1-G-09** (`docs/DEVELOPMENT_PLAN.md` legacy ID — "отложено до runtime")

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Build/Type] `JSX.Element` not a valid TS type under React 19**
- **Found during:** Task 1 typecheck immediately after writing Toast.tsx + Toast.test.tsx.
- **Issue:** `tsc --noEmit` failed with `TS2503: Cannot find namespace 'JSX'`. React 19 (`"react": "19.1.0"`, `"@types/react": "~19.1.0"` per package.json) removed the global `JSX` namespace; types now live under `React.JSX`.
- **Fix:** Replaced the bare `JSX.Element` return-type annotations in both files with `ReactElement` (imported from `react`).
- **Files modified:** `src/ui/Toast.tsx` (1 line), `src/__tests__/Toast.test.tsx` (2 lines).
- **Commit:** rolled into `8327df1` before commit.

**2. [Rule 1 — Test runtime] `jest.mock` factory rejected `showMock` / `hapticsMock` identifiers**
- **Found during:** Task 2 RED test run.
- **Issue:** Babel's jest-mock transform reported `Invalid variable access: showMock` because the factory rule only allows identifiers PREFIXED with `mock` (case-insensitive), not suffixed.
- **Fix:** Renamed `showMock` → `mockShow` and `hapticsMock` → `mockHaptics` (replace-all in the test file).
- **Files modified:** `src/__tests__/useClosureFeedback.test.tsx` (8 references in total).
- **Commit:** rolled into `5caf8a0`.

**3. [Rule 1 — Type] `mockHaptics(...args)` rest-spread typing**
- **Found during:** Task 2 GREEN typecheck.
- **Issue:** `(...args: unknown[]) => mockHaptics(...args)` failed `TS2556` because `jest.fn(() => Promise.resolve())` has no rest parameter declared.
- **Fix:** Annotated the `jest.fn` factory as `jest.fn((..._args: unknown[]) => Promise.resolve())`.
- **Files modified:** `src/__tests__/useClosureFeedback.test.tsx` (1 line).
- **Commit:** rolled into `fc3bc67`.

**4. [Rule 1 — Install metadata] `npm install --save-exact` strips `~` from version range**
- **Found during:** Task 1 verify step.
- **Issue:** `npm install expo-haptics@~14.1.4 --save-exact` resolved to bare `"expo-haptics": "14.1.4"` in package.json. The plan's verify regex `grep -E '~14\.1\.[0-9]+'` requires the tilde prefix.
- **Fix:** Manually edited package.json to restore the tilde: `"expo-haptics": "~14.1.4"`. Functionally equivalent for npm resolution (already locked at 14.1.4 by lockfile); satisfies the verify expression.
- **Files modified:** `package.json` (1 line).
- **Commit:** rolled into `8327df1`.

### Plan-target vs. reality deviations (documented, not auto-fixed)

None — code paths matched the plan exactly. The only target adjustments above were build/typing corrections that the plan's pseudocode did not anticipate for React 19.

### Authentication gates

None — pure UI + dependency add, no external services touched.

### Architectural decisions (Rule 4)

None — no DB / API / library swap / auth change.

## Verification Results

- ✓ `grep '"expo-haptics"' apps/mobile-rn/package.json | grep -E '~14\.1\.[0-9]+'` — match (Task 1 done criterion).
- ✓ `cd apps/mobile-rn && npx jest --testPathPattern=Toast.test` — 3/3 pass.
- ✓ `cd apps/mobile-rn && npx jest --testPathPattern=useClosureFeedback.test` — 5/5 pass.
- ✓ `cd apps/mobile-rn && npm test` — 45 suites / 520 tests pass (full suite green).
- ✓ `cd apps/mobile-rn && npm run typecheck` — clean.
- ✓ `cd apps/mobile-rn && npm run lint` — 0 errors, 59 warnings (all pre-existing).
- ✓ `grep -c "ToastProvider" apps/mobile-rn/App.tsx` → 4 (1 import + 1 comment ref + 2 JSX tags).
- ✓ `grep -rn "Haptics" apps/mobile-rn/src --include='*.ts*' | grep -v __tests__` → exactly 1 file (`useClosureFeedback.ts`), 3 lines (comment + import + call) — RESEARCH.md "single call site" Anti-Pattern guard satisfied.
- ⏸ Manual smoke (device) — deferred to PHASE1-01..04 field runs (owner-driven per CONTEXT.md D-01).

## must_haves.truths check

- ✓ `expo-haptics` installed at pinned version `~14.1.4`.
- ✓ `Toast` component exists in `src/ui/Toast.tsx` with `ToastProvider` Context + `useToast()` hook.
- ✓ `ToastProvider` mounted above `RootNavigator` in `App.tsx`, between `ThemeProvider` and `RootNavigator`.
- ✓ `useClosureFeedback` fires `Haptics.notificationAsync(Success)` AND `show('Зона замкнута! Площадь: N')` exactly once when `closureFired` transitions false→true (Test 1 + Test 2 + Test 3 idempotency).
- ✓ Haptic failures silently swallowed via `.catch` (Test 5).
- ✓ Toast text matches locked RU copy `«Зона замкнута! Площадь: <formatArea(areaM2)>»` (Test 2 uses real `formatArea` for the expected string).

## key_links sanity-check

- ✓ `useClosureFeedback.ts → Toast.tsx` via `useToast()` — `grep useToast useClosureFeedback.ts` → present (line 14 import, line 19 call).
- ✓ `useClosureFeedback.ts → activity.ts` via `useActivityStore` selectors for `closureFired` / `areaM2` — present (lines 12 / 18-19).
- ✓ `App.tsx → Toast.tsx` via `<ToastProvider>` wrap — present (line 27 import, line 79 JSX).

## Self-Check: PASSED

Created files exist:
- ✓ `apps/mobile-rn/src/ui/Toast.tsx`
- ✓ `apps/mobile-rn/src/__tests__/Toast.test.tsx`
- ✓ `apps/mobile-rn/src/navigation/screens/record/hooks/useClosureFeedback.ts`
- ✓ `apps/mobile-rn/src/__tests__/useClosureFeedback.test.tsx`

Modified files exist:
- ✓ `apps/mobile-rn/package.json` (+`package-lock.json`)
- ✓ `apps/mobile-rn/App.tsx`
- ✓ `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx`

Commits exist on `feat/cursona-redesign`:
- ✓ `8327df1` — `feat(phase1): add expo-haptics + Toast component (PHASE1-08)`
- ✓ `5caf8a0` — `test(phase1): add failing tests for useClosureFeedback (PHASE1-08)` (TDD RED gate)
- ✓ `fc3bc67` — `feat(phase1): useClosureFeedback hook (PHASE1-08)` (TDD GREEN gate)
- ✓ `4cbe759` — `feat(phase1): wire ToastProvider + closure feedback (PHASE1-08)`

## TDD Gate Compliance

Plan 03 frontmatter `type: execute` (not `tdd`), but Task 2 carried `tdd="true"`. RED → GREEN gates honored at the task level:
- RED commit: `5caf8a0` (test-only, failing — module-not-found).
- GREEN commit: `fc3bc67` (hook implementation + test fix-up — all 5 tests pass).
- REFACTOR: not needed; hook is 9 lines of effect logic + 4 lines of selectors. No cleanup opportunity that wouldn't reduce clarity.
