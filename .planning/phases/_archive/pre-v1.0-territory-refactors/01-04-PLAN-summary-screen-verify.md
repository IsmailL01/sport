---
phase: 01-validate-close-territory-core
plan: 04
type: execute
wave: 2
depends_on: [02]
files_modified:
  - apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
  - apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
  - apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx
  - apps/mobile-rn/src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx
autonomous: true
requirements: [PHASE1-09]
maps_to_existing_plan: P1-J-05 (final statistics / summary screen — RunDetailsScreen already exists per D-20)

must_haves:
  truths:
    - "After Stop+Confirm Save in TrackerLiveScreen, navigation calls nav.replace('RunDetails', { sessionId }) — never nav.navigate (so back button does not return to recording screen)"
    - "RunDetailsScreen renders full-map territory polygon when areaM2 !== null AND closureFired === true (D-21 visual verification)"
    - "RunDetailsScreen renders correct camera bounds-fit on mount (uses the captured polygon or bounding box of the points)"
    - "GPX share button exists on both RunDetailsScreen and SessionDetailModal (D-22 — already present, snapshot proves it)"
    - "Jest snapshot test for RunDetailsScreen with mock session data is green"
  artifacts:
    - path: apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx
      provides: "Snapshot regression test for the Summary screen (first React component test in the suite)"
      min_lines: 40
    - path: apps/mobile-rn/src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx
      provides: "Navigation assertion: Stop+Save calls nav.replace('RunDetails', ...) not nav.navigate"
      min_lines: 30
  key_links:
    - from: apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
      to: apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
      via: nav.replace('RunDetails', { sessionId })
      pattern: "nav\\.replace\\(['\"]RunDetails"
    - from: apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
      to: apps/mobile-rn/src/map/MapboxView.tsx
      via: <MapboxView> mount + ZoneLayer for closed polygon
      pattern: "MapboxView|ZoneLayer"
---

<objective>
Per CONTEXT.md D-20, D-21, D-22: `RunDetailsScreen.tsx` ALREADY implements the post-Stop+Save Summary screen content (full-map render + metrics tiles + splits + GPX share button). The remaining gap is (a) verifying navigation flow lands on this screen via `nav.replace` (not `nav.navigate` — back-button must not return to recording), (b) adding a snapshot regression test so the screen's render output is locked in for Phase 1 closure, and (c) confirming the closure-polygon branch renders correctly when `closureFired && areaM2 !== null`.

Purpose: This is a verification + safety-net plan, not new feature work. RunDetailsScreen has been shipping for months; this plan locks the contract in tests so future refactors (Plan 02 hook extraction, Plan 03 closure feedback, Plan 06 region picker) cannot silently regress the summary UX.
Output: Navigation assertion test + Jest snapshot test for RunDetailsScreen + an audit pass on `nav.replace` usage in the Stop+Save flow.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-validate-close-territory-core/01-CONTEXT.md
@.planning/phases/01-validate-close-territory-core/01-RESEARCH.md
@.planning/phases/01-validate-close-territory-core/01-PATTERNS.md
@CLAUDE.md

@apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx
@apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx
@apps/mobile-rn/src/state/activity.ts
@apps/mobile-rn/src/navigation/types.ts

<interfaces>
<!-- Existing screens. The plan verifies their wiring; signatures should NOT change. -->

```typescript
// apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx (existing per D-20)
// Receives a sessionId via route params; loads session via storage; renders full-map + tiles + splits + GPX share button.
type RouteParams = { sessionId: number };

// apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx (existing)
// Stop+Save flow ends with nav.replace('RunDetails', { sessionId }) per D-20.
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Audit + fix navigation after Stop+Save in TrackerLiveScreen</name>
  <files>apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx</files>
  <action>
    Per D-20: ensure that after the user confirms Save in the Stop+Confirm Alert, the screen calls `nav.replace('RunDetails', { sessionId })` and NOT `nav.navigate(...)` or `nav.push(...)`. The replace semantics are critical so the user cannot press the back button and return to the live-recording screen (which is now in `state: 'stopped'` — undefined UX).

    Step 1a — Read `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx`. Locate the Stop+Confirm Alert block (PATTERNS.md line 322 references existing lines 94-139). Identify the line that navigates to RunDetails.

    Step 1b — Verify the call is `nav.replace('RunDetails', { sessionId })`:
    - If it is `nav.replace(...)` — no change required, the Stop+Save flow is correct (D-20 holds). Move on.
    - If it is `nav.navigate(...)` or `nav.push(...)` — change to `nav.replace(...)`. Commit message must note "fix: use nav.replace so back button does not return to stopped recording screen (PHASE1-09)".
    - If it is `nav.goBack()` (returns to TrackerStart) WITHOUT subsequently entering RunDetails — this is a BUG: the user has no path to the Summary. Replace with `nav.replace('RunDetails', { sessionId })`.

    Step 1c — Verify the `sessionId` passed is the just-saved session ID (read from `useActivityStore.getState().sessionId` or the equivalent local variable used in the existing code). If the existing code passes `Date.now()` or any other non-session value, fix it to pass the actual sessionId from the snapshot.

    Step 1d — Verify the navigation type signature. Read `apps/mobile-rn/src/navigation/types.ts`. Confirm `RunDetails` is registered in `RecordStackParamList` (or whichever stack contains the record flow) with `{ sessionId: number }` route params. If the type is missing or has wrong shape, fix it.

    NEVER use `nav.navigate('RunDetails', ...)` in this code path — that pushes onto the stack, leaving the stopped recording screen in history; the back button then leads users to a "stopped, useless" screen. NEVER pass arbitrary route params like `{ session: snapshot }` — pass only `{ sessionId }` and let RunDetailsScreen load from storage (it already does this per existing impl).

    Implements PHASE1-09 (D-20 navigation flow).
  </action>
  <verify>
    <automated>cd apps/mobile-rn && grep -n "nav\\.replace\\|nav\\.navigate\\|nav\\.push\\|nav\\.goBack" apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx && npm run typecheck</automated>
  </verify>
  <done>After Stop+Save flow, `nav.replace('RunDetails', { sessionId })` is the call (grep proves it). `npm run typecheck` clean. Manual smoke on Pixel emulator: record a fake session (or use dev menu), press Stop → Confirm Save → land on RunDetailsScreen → press back → land on TrackerStart (NOT on the stopped TrackerLive).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Navigation assertion test for Stop+Save flow</name>
  <files>apps/mobile-rn/src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx</files>
  <behavior>
    - Test 1: Mounting TrackerLiveScreen with a mocked `useNavigation` returning `{ replace: jest.fn() }`, then simulating Stop+Confirm Save via the existing flow (mock `Alert.alert` to immediately invoke the "Сохранить" callback), causes `nav.replace` to be called once with `('RunDetails', { sessionId: <number> })`. Note: the test must mock the underlying session-finalize logic so we don't hit storage; the assertion is purely about the navigation call.
    - Test 2: `nav.navigate` and `nav.push` are NEVER called from the Stop+Save path.

    This is a focused navigation test, NOT a full screen render test. We do not need to render the entire TrackerLive UI — just trigger the Save path and assert the navigation call.
  </behavior>
  <action>
    Create `apps/mobile-rn/src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx`. Approach: mock everything heavy (MapboxView, location adapter, store actions) and render the screen with `@testing-library/react-native`.

    Mock patterns:
    ```
    jest.mock('@react-navigation/native', () => ({
      useNavigation: () => ({ replace: replaceMock, navigate: navigateMock, push: pushMock, goBack: jest.fn() }),
      useRoute: () => ({ params: {} }),
    }));
    jest.mock('../map/MapboxView', () => ({ MapboxView: ({ children }: any) => children, LocationPuckLayer: () => null }));
    jest.mock('../map/components/TrackLayer', () => ({ TrackLayer: () => null }));
    jest.mock('../map/components/ZoneLayer', () => ({ ZoneLayer: () => null }));
    jest.mock('../map/components/CorridorLayer', () => ({ CorridorLayer: () => null }));
    jest.mock('../map/offline', () => ({ downloadHomeRegion: jest.fn() }));
    jest.mock('expo-haptics', () => ({ notificationAsync: jest.fn(() => Promise.resolve()), NotificationFeedbackType: { Success: 'success' } }));
    ```

    Mock the store:
    ```
    const stopMock = jest.fn(() => 12345); // returns sessionId
    jest.mock('../state/activity', () => ({
      useActivityStore: Object.assign(
        (selector: any) => selector({ state: 'recording', sessionId: 12345, points: [/* 100 points */], areaM2: 1000, closureFired: true, isPaused: false, ... }),
        { getState: () => ({ stop: stopMock, sessionId: 12345 }) }
      ),
      ingestRawPoint: jest.fn(),
    }));
    ```

    Mock `Alert.alert` to auto-invoke the Save button:
    ```
    import { Alert } from 'react-native';
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
      const save = buttons?.find((b: any) => b.text?.match(/Сохранить|Save/i));
      save?.onPress?.();
    });
    ```

    Then `render(<TrackerLiveScreen />)`, find the Stop button (use `getByText` or a `testID` that the existing screen has — read the file to find it), press it, then assert `replaceMock` was called with `['RunDetails', { sessionId: 12345 }]`.

    If the existing screen does not use stable testIDs and `getByText` is brittle, add a `testID="stop-button"` to the Stop button as a small in-place edit — note this in the task's commit message.

    ABSOLUTELY DO NOT assert on Mapbox-rendered output — `MapboxView` is mocked. The test scope is ONLY the navigation call. NEVER call the real `nav.navigate` — that triggers `react-navigation` internals not available under jest.

    Implements PHASE1-09 test coverage for the navigation contract.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=TrackerLiveScreen.navAfterSave</automated>
  </verify>
  <done>Test file exists with ≥2 tests, both green. Assertion confirms `nav.replace('RunDetails', { sessionId: <some-number> })` is called exactly once on Stop+Save.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Snapshot test for RunDetailsScreen with closure polygon + GPX button</name>
  <files>apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx</files>
  <behavior>
    - Test 1: With a mock session (`{ id, startedAt, endedAt, distanceM: 5000, areaM2: 50000, closureFired: true, points: [/* 200 fake points */], laps: [/* 5 fake laps */] }`), `render(<RunDetailsScreen />)` produces a Jest snapshot that includes the area-tile, distance-tile, splits row, and GPX share button. Match snapshot.
    - Test 2: With a non-closure session (`areaM2 === null && closureFired === false`), the snapshot shows the metrics tiles + splits but NO closed-zone polygon (the ZoneLayer mock returns null and the area-tile shows "—" or hides itself per existing screen behavior — read the file to learn).
    - Test 3: Find the GPX share button (`getByText(/GPX|Поделиться/i)` or a testID) and assert it exists. Per D-22: "GPX share button already exists" — verify by query.
  </behavior>
  <action>
    Create `apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx`. Use the same Mapbox/store mocking pattern as Task 2 plus a mock for the session-loading repo function used by RunDetailsScreen (read the screen file to identify which repository it imports — likely `sessionRepository.findSession(id)` or `useHistoryStore`).

    Mock session-load:
    ```
    jest.mock('../storage/sessionRepository', () => ({
      findSession: jest.fn((id: number) => ({
        id, startedAt: id, endedAt: id + 3_600_000, activityType: 'run',
        distanceM: 5000, areaM2: 50_000, isClosed: true,
        avgHrBpm: 140, maxHrBpm: 165, caloriesKcal: 350,
      })),
      // include any other functions the screen calls
    }));
    jest.mock('../storage/pointRepository', () => ({
      loadPointsForSession: jest.fn(() => Array.from({ length: 200 }, (_, i) => ({
        timestamp: 1_700_000_000_000 + i * 5_000,
        latitude: 50.0 + i * 0.0001,
        longitude: 10.0 + i * 0.0001,
        altitude: null, accuracy: 5, speed: null, heading: null, source: 'raw',
      }))),
    }));
    ```

    Use the `MapboxView`/`ZoneLayer`/`TrackLayer` mocks from Task 2.

    First test:
    ```
    it('renders full summary with closure polygon (snapshot)', () => {
      const { toJSON, getByText } = render(<RunDetailsScreen route={{ params: { sessionId: 1 } } as any} />);
      expect(toJSON()).toMatchSnapshot();
      expect(getByText(/GPX|Поделиться/i)).toBeTruthy(); // GPX share button (D-22)
    });
    ```

    For Test 2, change the mock to return `areaM2: null, isClosed: false` and snapshot.

    The first snapshot run creates the `.snap` file — review it before committing to ensure no PII or absolute paths leaked into the output. Commit the `.snap` file alongside the test.

    This is the FIRST React component test in the codebase (per RESEARCH.md §Hook tests gap). Establishes the pattern for future screen tests. NEVER assert on Mapbox internal rendering — it's fully mocked. NEVER include real timestamps that change per run — use fixed numeric IDs throughout the mock.

    Implements PHASE1-09 + D-21 + D-22 verification.
  </action>
  <verify>
    <automated>cd apps/mobile-rn && npm test -- --testPathPattern=RunDetailsScreen.snapshot</automated>
  </verify>
  <done>Snapshot test file exists with ≥3 tests including a `.snap` file. All green. `cd apps/mobile-rn && npm test` overall suite passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Navigation routing → user-facing state | If `nav.replace` is wrong and user lands on a recording screen in stopped state, UX confusion. No security boundary, but a state-machine confusion attack surface (low). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-01-04-01 | Tampering | Snapshot test out-of-date silently passes | mitigate | Snapshot reviewed before commit. Future changes to RunDetailsScreen WILL fail the snapshot and force a developer review. |
| T-01-04-02 | Information Disclosure | Snapshot file contains user PII | mitigate | Mock data uses fake timestamps + fixed lat/lon (50.0/10.0). No real GPX content in the snapshot. |

Very low security surface — verification + tests only.
</threat_model>

<verification>
- `cd apps/mobile-rn && npm test` — all tests green including new snapshot + nav assertion.
- `cd apps/mobile-rn && npm run typecheck` clean.
- Manual smoke: record → Stop → Confirm Save → land on RunDetailsScreen → see full-map + metrics + splits + GPX share button → press back → land on TrackerStart (NOT TrackerLive).
- `grep -c "nav\\.replace" apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` shows ≥1 occurrence on the Stop+Save path.
</verification>

<success_criteria>
- All must_haves.truths above are TRUE.
- Snapshot file committed to repo (under `__snapshots__/`).
- Nav assertion test green.
- Atomic commits per task: Task 1 `fix(phase1): ensure nav.replace on Stop+Save (PHASE1-09)` (or `chore(phase1): verify nav.replace flow` if no change was needed), Task 2 `test(phase1): nav assertion for Stop+Save (PHASE1-09)`, Task 3 `test(phase1): RunDetailsScreen snapshot (PHASE1-09)`.
</success_criteria>

<output>
After completion, create `.planning/phases/01-validate-close-territory-core/01-04-SUMMARY.md` capturing:
- Was `nav.replace` already correct, or did it need to be fixed? (D-20 acceptance)
- Snapshot file size + sample content (≤5 lines pasted for review)
- Confirm GPX share button is on RunDetailsScreen (D-22)
- Cross-link: closes PHASE1-09 + P1-J-05
</output>
