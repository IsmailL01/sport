---
slug: tracker-live-polish-pass
created: 2026-05-25
type: quick
---

# Context: tracker-live polish pass

## Origin

User request 2026-05-25: «сейчас нужно чтобы экран с картой и пробежай где
показывается время и так далее, работало идеально сейчас например такие баги
недочеты например я начинаю бег и у меня почему-то кнопка продолжить активна,
нужно чтобы эта страница работала идеально и стороны клиента и стороны
backend, проведи анализ и пофикси все баги и доведи все до идеала»

Translation: "I need the screen with the map and the run, where time is shown
etc, to work perfectly. For example bugs/flaws: I start a run and for some
reason the Continue button is active. This page needs to work perfectly on
client AND backend side. Analyze and fix all bugs and bring everything to
perfection."

Second of two polish-pass /gsd-quick tasks the user has run in close
succession (first was chat-polish-pass, 2026-05-25, commits `994f85e..e9b42ce`,
shipped 6 FE-only items in ~3h). User's standing pattern: "Go tight" scope
confirmation after I propose 5-8 concrete items.

## Discussion phase decisions

After survey of TrackerLiveScreen + run state machine + the alleged
"Continue button active on start" bug, three scope options were presented:

1. **TIGHT** (7 items + tests, FE-only, ~5-8h) — chosen
2. **Skip item 1** (PauseDetector warmup) — defer until Pixel pocket-walk
   provides field observation
3. **Расширяй** — add lap UX overhaul / live HR / Map style — declined

User chose **TIGHT** ("Go tight"). Decisions:

- **D-01**: PauseDetector warmup IS in scope. The user reported the
  symptom; even if the root cause is "legitimate" (GPS lock + stationary
  start), the UX is broken. Suppressing during warmup is a behavioral
  improvement valid regardless of field-test outcome.
- **D-02**: Time-freeze on pause is a real bug (existing UI ticks
  `(now - startedAt) / 1000` regardless of `isPaused`). Confirmed by
  reading [TrackerLiveScreen.tsx:82](apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx#L82).
- **D-03**: Time-freeze implementation lives in SessionManager domain
  layer, NOT in the screen. Rationale: durationS is a derived metric of
  the session; UI just reads it. Centralizing in SessionManager keeps
  pauseDuration consistent for any consumer (RunDetailsScreen could read
  the same accumulator for a "effective active time" display in v1.1).
  Plus it's testable in jest without RN rendering.
- **D-04**: NO backend changes. The TrackerLive screen is fully local
  during recording — pipeline → SessionManager → SQLite. Backend (Go
  `activity-sync` service) sees the session only after stop+save +
  upload. There's no "live run" backend touch. Surface area for "backend
  perfection" of this specific screen = N/A.
- **D-05**: Tests added for pure logic (PauseDetector warmup, time-freeze
  accumulator). Visual rendering changes get manual-smoke validation via
  next APK install — matches existing project convention (chat-polish-pass
  set the same precedent).
- **D-06**: --research flag interpreted but skipped — survey gave enough
  info, RN patterns (Alert, conditional camera follow, NaN guards) are
  trivial.

## Out of scope

The user's «довел до идеала» ambition statement mentioned backend.
Reasoning on each potentially-implied item:

### Adaptive sampling re-tune

`LocationAdapter.setSamplingMode('active' | 'paused' | 'background-slc')`
exists from Phase 1 / PHASE1-11. Current intervals are reasonable defaults
but not field-validated. Re-tuning needs **observation from Plan 07-03 Task
6 Pixel pocket-walk** (battery drain delta, accuracy delta). Premature
optimization without field data. Out of scope.

### Live HR (BLE pairing)

Currently `useSensorsStore.liveHrBpm` reads from a HealthKit/Health Connect
adapter polling loop. Direct BLE pairing for chest straps / Garmin / Polar
is `HEALTH-*` v1.1 backlog. Out of v1.0.

### Map style overhaul

App uses Mapbox `outdoors-v12` default style. Custom Mapbox Studio style
for terrain colour ramp / road weight is `ADR-0011`-deferred. Out of v1.0.

### Backend session upload (activity-sync)

After stop+save, the session is uploaded by `useSyncStore.trigger()` →
POST to `activity-sync` service. This pipeline has its OWN edge cases
(retry on network failure, dedup via `external_uuid + source`, schema
v1.0 contract per ADR-0007). NOT this screen's concern; sessions are
already in SQLite by the time upload kicks off. Out of scope.

### Pixel pocket-walk

The full validation of this screen is **Plan 07-03 Task 6** — a 1-hour
real-device walk with the recorded GPS track. That's a user-action item,
not a /gsd-quick deliverable. This pass shipping = the next pocket-walk
attempt is on a better baseline.

## Architectural notes

### PauseDetector layer

[src/pipeline/filters/PauseDetector.ts](apps/mobile-rn/src/pipeline/filters/PauseDetector.ts)
— pure observer, NOT in Pipeline (doesn't drop or modify points). Called
from SessionManager.ingestRawPoint() at line 299 after pipeline.process()
returns accepted. Emits via listener callback to wrapper which calls
`manager.setPaused()`.

Adding warmup needs:
- Track timestamp of first observed point (or take from constructor as
  sessionStartedAt argument)
- Track distance traveled (from PauseDetector's vantage point only — or
  pass it in)
- Suppress `auto-paused` emission while warmup conditions hold; do NOT
  suppress `auto-resumed` (it's safe / desired)

### Time-freeze architecture

Currently:
- `state/activity.ts` stores `startedAt: number | null`
- `TrackerLiveScreen.tsx:82` computes `durationS = (now - startedAt) / 1000`
- Pause flag doesn't affect duration

Target:
- SessionManager tracks `pausedDurationMs` (accumulator): incremented by
  delta on each `setPaused(false)` if previously paused
- SessionManager tracks `pausedAt: number | null`: timestamp when paused
- Effective elapsed = `now - startedAt - pausedDurationMs - (pausedAt !== null ? (now - pausedAt) : 0)`
- Expose via `snapshot()` so UI reads via wrapper selector

### Map camera freeze on pause

[useTrackerCamera.ts:40](apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts#L40):
```
const isFollowing = state === 'recording' && pointsLength > 0 && !closureFired;
```

Extend to:
```
const isFollowing = state === 'recording' && pointsLength > 0 && !closureFired && !isPaused;
```

Trivial. One line + one new selector.

## Files touched (planned)

```
src/pipeline/filters/PauseDetector.ts                    (extend: warmup args)
src/pipeline/filters/__tests__/PauseDetector.warmup.test.ts  (new)
src/domain/session/SessionManager.ts                     (extend: pausedDurationMs, effectiveElapsedMs)
src/domain/session/__tests__/SessionManager.test.ts      (extend: time-freeze tests)
src/state/activity.ts                                    (propagate effectiveElapsedMs to store)
src/navigation/screens/record/TrackerLiveScreen.tsx      (durationS from store, pace/HR guards, lap opacity, empty-stop guard)
src/navigation/screens/record/hooks/useTrackerCamera.ts  (freeze on pause)
src/navigation/screens/record/__tests__/TrackerLiveScreen.timeFreezing.test.ts  (new — pure-logic, not RN render)
```

## Commit plan

Expected 8 commits:

1. `docs(quick/tracker-live): PLAN + CONTEXT`
2. `feat(pipeline): PauseDetector warmup suppression (first 10s + 2m guard)` + warmup tests
3. `feat(session): time-freeze on pause via pausedDurationMs accumulator` + SessionManager tests
4. `feat(state): expose effectiveElapsedMs via useActivityStore selector` (wire-up only — tiny)
5. `feat(tracker-live): apply effectiveElapsedMs + pace/HR null-guards + lap opacity`
6. `feat(tracker-live): freeze map camera on pause via useTrackerCamera + isPaused selector`
7. `feat(tracker-live): empty-session stop guard (5s / 0 points)`
8. `docs(quick/tracker-live): SUMMARY + STATE table update`

Items 3+4+5 are tightly coupled (sessionManager → store → UI) but each is
small enough to commit independently. Items 6+7 are isolated UI tweaks.
