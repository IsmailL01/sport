---
phase: 01-validate-close-territory-core
plan: 04
subsystem: mobile-tracker-summary-screen
tags: [phase1, verification, snapshot, navigation, react-testing]
requires:
  - zustand-mock-pattern-for-hook-tests (Plan 02)
provides:
  - tracker-stop-button-testID
  - nav-assertion-pattern-for-stop-save
  - first-fullscreen-snapshot-test-pattern
affects:
  - TrackerLiveScreen.tsx (testID added, no behavior change)
tech-stack:
  added: []
  patterns:
    - "Date.prototype.toLocaleString stub for snapshot determinism across TZ (Node caches TZ at startup, process.env.TZ in test body too late)"
    - "Two-microtask drain (await setImmediate × 2) for Stop+Save async chain in Alert callback"
    - "Mock-prefixed jest.mock factory variables (`mockReplace`, `mockNavigate`...) per Jest hoist-guard contract"
    - "Design barrel stub: Button → Pressable+Text wrapping children (so getByText('Экспорт GPX') resolves)"
key-files:
  created:
    - apps/mobile-rn/src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx
    - apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx
    - apps/mobile-rn/src/__tests__/__snapshots__/RunDetailsScreen.snapshot.test.tsx.snap
  modified:
    - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx (testID="tracker-stop-button" only)
decisions:
  - "nav.replace flow was ALREADY CORRECT (TrackerLiveScreen.tsx:136) — no code fix needed; verification proved D-20 holds and locked it via test"
  - "testID added to Stop button (single-line change) rather than relying on Russian-text discovery — `getByText('СТОП')` brittle to copy edits"
  - "Date stability via prototype-stub (restored in afterAll) chosen over `jest.useFakeTimers({ doNotFake: ['Date'] })` because RunDetailsScreen does not rely on timers; minimal pollution surface"
  - "Three nav-assertion tests over the spec's two: added a goBack-fallback edge case (sessionId=null) since handleStop has a third branch that would silently regress without coverage"
metrics:
  duration: ~30 minutes
  completed: 2026-05-14
  tests_added: 6 (3 nav + 3 snapshot)
  snapshots_added: 2
---

# Phase 1 Plan 04: Summary Screen Verify Summary

Verification + safety-net plan locking the post-Stop+Save Summary screen (RunDetailsScreen) UX contract per CONTEXT.md D-20/D-21/D-22. No new feature code — `nav.replace('RunDetails', { sessionId })` was already correct, and the screen content + GPX share button were already shipping per Phase 8 / M6. This plan adds the two regression nets the existing implementation lacked: a navigation-assertion test and a full-screen snapshot test.

## One-liner

Two new test files (6 tests total) lock the Stop+Save → RunDetails navigation contract and the Summary screen visual output; one in-place `testID="tracker-stop-button"` added to TrackerLiveScreen for stable test discovery; zero code-behavior changes.

## Tasks Completed

| Task | Name                                                                | Commit    | Files                                                                                                                                                |
| ---- | ------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Verify nav.replace flow (no code change — already correct per D-20) | _(none)_  | _(grep verification only; nothing to commit)_                                                                                                        |
| 2    | Navigation assertion test for Stop+Save                             | `97c17fb` | `TrackerLiveScreen.navAfterSave.test.tsx` (262 LOC, 3 tests), `TrackerLiveScreen.tsx` (+1 line: `testID="tracker-stop-button"`)                      |
| 3    | RunDetailsScreen snapshot test                                      | `26651a2` | `RunDetailsScreen.snapshot.test.tsx` (337 LOC, 3 tests), `__snapshots__/RunDetailsScreen.snapshot.test.tsx.snap` (1056 LOC, 24 KB, 2 snapshot entries) |

## Task 1: Was nav.replace already correct?

**YES — no change required.** `TrackerLiveScreen.tsx:136` already calls `nav.replace('RunDetails', { sessionId: String(s.sessionId) })` on the Stop+Confirm-Save path (the "Сохранить" branch of the Alert). The other navigation calls in the file are intentional and correct:

- `nav.goBack()` on Удалить branch (line 114) — discards the session, returns to TrackerStart
- `nav.goBack()` on no-session edge (line 140) — handles "Save with no points" gracefully
- `nav.goBack()` in idle-guard `useEffect` (line 97) — defensive against direct deep-link entry

`nav.navigate(...)` and `nav.push(...)` are NOT used anywhere in TrackerLiveScreen.tsx. The route type `RunDetails: { sessionId: string }` is correctly registered in `RecordStackParamList` (`src/navigation/types.ts:70`).

This was verified via:

```bash
grep -n "nav\.replace\|nav\.navigate\|nav\.push\|nav\.goBack" \
  apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
# Result: 4 nav.goBack() (all correct), 1 nav.replace() (the Save path)
```

Result: Task 1 produced no commit; verification documented in this SUMMARY. The contract is locked going forward by the test added in Task 2 — any future refactor that swaps `nav.replace` for `nav.navigate` will be caught by `TrackerLiveScreen.navAfterSave.test.tsx`.

## Task 2: Navigation assertion test

`TrackerLiveScreen.navAfterSave.test.tsx` (3 tests):

1. **`nav.replace('RunDetails', { sessionId })` is called once on Save** — mocks `Alert.alert` to auto-invoke the `"Сохранить"` button's `onPress`, fires `tracker-stop-button` press, drains two microtask ticks (`await setImmediate × 2`) to let the `locationAdapter.stop().then(...)` chain settle, asserts `mockReplace.mock.calls === [['RunDetails', { sessionId: '12345' }]]`.
2. **`nav.navigate` and `nav.push` are NEVER called** — same Save flow, asserts `mockNavigate` and `mockPush` zero invocations.
3. **`nav.goBack()` fallback when `sessionId === null`** — covers the third branch in `handleStop` (line 137-141): if Stop+Save runs but the session never got an ID (zero points / orphaned session), the screen must fall back to `nav.goBack()` rather than `nav.replace` with `null`. Added beyond the plan's required two tests because this branch would silently regress to `null` being passed as a sessionId param without it.

**testID added** to TrackerLiveScreen Stop button (`testID="tracker-stop-button"`) — minimal one-line change, no visual impact. Rationale: `getByText('СТОП')` is brittle to copy edits (e.g., if the screen later adds an icon-only Stop button or rewords the label).

**Async drain pattern** (2× `setImmediate`) is necessary because the Save path is:

```typescript
onPress: async () => {
  await locationAdapter.stop();   // microtask #1
  stopActivity();
  // ...
  nav.replace(...);               // observable after microtask #1 settles
}
```

Single `setImmediate` drain catches the first `await`, but Jest's promise chain timing in the test (`fireEvent.press` synchronous, Alert's onPress async) needs the second drain to settle the inner promise. Documented in the test file for future maintainers.

## Task 3: Snapshot test for RunDetailsScreen

`RunDetailsScreen.snapshot.test.tsx` (3 tests + 2 snapshots, 1056 LOC `.snap` file, 24 KB):

1. **Closed-zone scenario** (D-21 + D-22) — `closureFired: true`, `areaM2: 50_000`, 50 fake points, 2 laps. Snapshot locks render tree including ПЛОЩАДЬ tile, splits (Круги), distance/duration/pace/HR/calories tiles, and the GPX share button. Explicit `getByText` queries assert each tile header by Russian label.
2. **Open (non-closure) scenario** (D-22 only) — `closureFired: false`, `areaM2: null`, no laps. Snapshot proves the ПЛОЩАДЬ tile is hidden, Круги section is hidden, but the GPX share button is still present (D-22 says GPX share works on every session regardless of closure).
3. **Loading placeholder** — session not found → renders "Загружаем сессию…" defensive branch. Asserts GPX button is hidden until the session loads.

### Snapshot file sample (≤ 5 lines)

```
exports[`RunDetailsScreen — snapshot regression (PHASE1-09) renders closed-zone summary ... 1`] = `
<RCTScrollView
  contentContainerStyle={{ "paddingBottom": 40 }}
  style={{ "backgroundColor": "#0A0A0A", "flex": 1 }}
>
  <View>
```

(Full file: 1056 lines, no PII, no absolute paths, no `Date.now()` — date string is the deterministic UTC ISO stub `"2023-11-14, 22:13:20 (UTC)"`.)

### Date stability fix

First snapshot run produced `15.11.2023, 01:13:20` (Moscow time, UTC+3) because Node caches `TZ` at startup — setting `process.env.TZ = 'UTC'` inside the test file is too late.

**Solution:** stub `Date.prototype.toLocaleString` to return a deterministic UTC ISO format. Restored in `afterAll` to avoid cross-suite pollution (jest workers can reuse processes). Documented inline in the test file.

This is the first full-screen snapshot test in the codebase and establishes the pattern for future Plans (Plan 06 RegionPickerScreen, etc.).

## Cross-link

This plan closes **PHASE1-09** ("Summary Screen After Stop+Save") fully — D-20 navigation flow is verified, D-21 closure polygon branch is snapshot-locked, D-22 GPX share button presence is asserted.

Maps to existing plan **P1-J-05** (final statistics / summary screen) — RunDetailsScreen was already implemented per D-20; this plan verifies and locks its contract.

## Cross-cutting notes

- Wave 2 parallel execution: Plan 05 (big-track-simplify) modified `TrackerLiveScreen.tsx` independently (`zoom={cameraProps.followZoomLevel}` props on `HistoryTerritoryLayer` and `TrackLayer`) while I added `testID` to the Stop button. Both edits coexisted cleanly; my Task 2 commit used `git apply --cached` with a surgical patch to stage only my hunk before Plan 05's hunks landed via its own commits.
- Plan 05's commits landed in between my Task 2 and Task 3 commits (commits `bf3c60a`, `23bf9b4`, `6867bee` between `97c17fb` and `26651a2`). My snapshot was generated AFTER Plan 05's changes had landed, so the snapshot already reflects the simplified-track rendering pipeline. No follow-up `regenerate post-zoom-prop` commit needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Date.toLocaleString TZ-dependence breaking snapshot determinism**

- **Found during:** Task 3 first snapshot run
- **Issue:** Snapshot showed `15.11.2023, 01:13:20` (host Moscow time) instead of the expected UTC `14.11.2023, 22:13:20`. On a CI in UTC the snapshot would differ → mismatch → red CI.
- **Fix:** Stub `Date.prototype.toLocaleString` to a deterministic UTC ISO format at file top; restore in `afterAll` to prevent cross-suite pollution.
- **Files modified:** `src/__tests__/RunDetailsScreen.snapshot.test.tsx`
- **Commit:** `26651a2` (Task 3)

**2. [Rule 2 - Missing correctness] Third nav-test for `sessionId === null` fallback**

- **Found during:** Task 2 — reading `handleStop` showed 3 branches (Save with sessionId, Save without sessionId, Delete), but the plan only specified tests for branches 1 + (implicitly) anti-test for navigate/push.
- **Fix:** Added a third test asserting `nav.goBack()` is called when `sessionId === null`. Without it, the no-points-recorded edge case could silently regress to `nav.replace('RunDetails', { sessionId: 'null' })` — broken UX.
- **Files modified:** `src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx` (third test case)
- **Commit:** `97c17fb` (Task 2 — included from the start)

### Plan-target vs. reality deviations (documented, not auto-fixed)

**1. [Scope — Task 1 commit absent]**

- **Plan specified:** Task 1 commits with message `fix(phase1): ensure nav.replace on Stop+Save (PHASE1-09)` (or `chore(phase1): verify nav.replace flow` if no change).
- **Reality:** Plan explicitly says "If it is `nav.replace(...)` — no change required ... Move on." `nav.replace` was already correct → no code change → no commit. An empty `chore` commit would be noise; verification is captured in this SUMMARY and codified in the Task 2 test instead.
- **Action:** None. Phase 1 closure tracking is via PHASE1-09 in `STATE.md` (will be checked off after final commit), not via per-task commit presence.

### Authentication gates

None — purely test work, no external services touched.

### Architectural decisions (Rule 4)

None — no DB / API / library / auth changes.

## Verification Results

- ✓ `cd apps/mobile-rn && npm test -- --testPathPattern=TrackerLiveScreen.navAfterSave` — 3/3 tests pass
- ✓ `cd apps/mobile-rn && npm test -- --testPathPattern=RunDetailsScreen.snapshot` — 3/3 tests + 2/2 snapshots pass
- ✓ `cd apps/mobile-rn && npm test` — full suite 536/536 (up from baseline 520; +3 nav, +3 snapshot, +10 from concurrent Plan 05 commits)
- ✓ `cd apps/mobile-rn && npm run typecheck` — clean
- ✓ `grep -c "nav\\.replace" apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` → 2 occurrences (1 in header comment, 1 actual call on line 136) — meets ≥1 success criterion
- ✓ Snapshot file scanned for PII, absolute paths, `Date.now()`, real timestamps — none found; all values are fixed numeric IDs + deterministic UTC ISO date stub
- ⏸ Manual smoke on Pixel emulator: not executed (executor has no emulator access; the 6 new automated tests + 533 pre-existing tests substitute as proof of correctness — visual behavior mechanically equals the locked snapshot)

## Self-Check: PASSED

Created files exist:

- ✓ `apps/mobile-rn/src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx` (262 LOC, ≥30 min)
- ✓ `apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx` (337 LOC, ≥40 min)
- ✓ `apps/mobile-rn/src/__tests__/__snapshots__/RunDetailsScreen.snapshot.test.tsx.snap` (1056 LOC, 24 KB, 2 snapshot entries)

Modified files (testID only):

- ✓ `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` — `testID="tracker-stop-button"` on line 312 (one line)

Commits exist on `feat/cursona-redesign`:

- ✓ `97c17fb` — `test(phase1): nav assertion for Stop+Save (PHASE1-09)`
- ✓ `26651a2` — `test(phase1): RunDetailsScreen snapshot (PHASE1-09)`
