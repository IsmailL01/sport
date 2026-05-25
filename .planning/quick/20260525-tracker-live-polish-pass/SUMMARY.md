---
slug: tracker-live-polish-pass
created: 2026-05-25
type: quick
status: complete
commits:
  - bc95c30  # PLAN + CONTEXT
  - 815c0ff  # PauseDetector warmup gate
  - b834eef  # SessionManager time-freeze accumulator
  - ed5925f  # TrackerLiveScreen: effective elapsed + pace/HR/lap guards
  - a3983cc  # useTrackerCamera: freeze camera on pause
  - 8ebf5d0  # TrackerLiveScreen: empty-session stop guard
  - da35b5f  # integration test + nav-after-save test adaptation
tests_added: 17  # 6 PauseDetector warmup + 9 SessionManager time-freeze + 2 pause-flow integration
tests_total_before: 669
tests_total_after: 686
---

# TrackerLive polish pass — closeout

All 7 TIGHT-scope items shipped as 6 atomic code commits + 1 integration-
test commit (+ 1 PLAN/CONTEXT commit, total 8).

## Deliverables vs plan

| # | Item | File(s) | Commit | Status |
|---|---|---|---|---|
| 1 | **PauseDetector warmup gate** — suppress auto-paused emission until EITHER 10s elapsed OR 2m cumulative motion crossed since first observed point | `src/pipeline/filters/PauseDetector.ts` + warmup tests (6 new) + wire in `state/activity.ts` | `815c0ff` | ✅ |
| 2 | **Time-freeze on pause** — domain-layer `pausedAt` + `pausedDurationMs` + `effectiveElapsedMs()` method on SessionManager | `src/domain/session/SessionManager.ts` + tests (9 new) + propagate via `state/activity.ts` | `b834eef` | ✅ |
| 3 | Pace null-guard parity — top-row ТЕМП renders '—' when null (matched avgPace/bestPace pattern) | `TrackerLiveScreen.tsx:217-223` | `ed5925f` | ✅ |
| 4 | Lap button disabled-opacity — extracted `lapDisabled` const; `disabled ? 0.4 : pressed ? 0.85 : 1` | `TrackerLiveScreen.tsx:271` | `ed5925f` | ✅ |
| 5 | Map camera freeze on pause — useTrackerCamera subscribes to isPaused; releases followUserLocation | `src/navigation/screens/record/hooks/useTrackerCamera.ts` | `a3983cc` | ✅ |
| 6 | HR NaN guard — `!Number.isFinite(liveHr)` catches null + NaN + ±Infinity | `TrackerLiveScreen.tsx:220-227` | `ed5925f` | ✅ |
| 7 | Empty-session stop guard — `durationS < 5 \|\| points.length < 2` → "Пустая сессия" Alert with Cancel + "Удалить и выйти" only (no Save path offered) | `TrackerLiveScreen.tsx:101 handleStop` | `8ebf5d0` | ✅ |
| 8 | Pause-flow integration test (end-to-end PauseDetector→SessionManager→effective elapsed) + nav-after-save test adapted to new empty-session guard | new `SessionManager.pauseFlow.test.ts` + edit `TrackerLiveScreen.navAfterSave.test.tsx` | `da35b5f` | ✅ |

## Acceptance criteria — verified

- ✅ All 7 items implemented as atomic commits (items 3+4+6 bundled in `ed5925f` since each is 1-3 lines)
- ✅ tsc clean after each commit
- ✅ jest **686/686 passing** (was 669; **+17 tests** added)
- ✅ No backend changes — 0 files outside `apps/mobile-rn/src/`
- ✅ PauseDetector backward-compat: warmup parameter defaults to `null`; existing 18 pipeline tests unchanged
- ✅ Time-freeze: tested across single-pause, multi-pause cycles, stop-while-paused (folds open pause), start/reset/recoverLast (clears accumulator)
- ✅ Existing TrackerLive nav-after-save test adapted to new guard behavior (was testing intermediate broken path that no longer occurs)

## What got new tests

- `src/pipeline/filters/__tests__/PauseDetector.warmup.test.ts` — 6 tests: backward-compat (no warmup), suppress within warmup window, emit after warmupMs, emit after distance crossed, never suppress auto-resumed, reset() clears warmup state
- `src/domain/session/__tests__/SessionManager.timeFreezing.test.ts` — 9 tests: zero before start, ticks normally, freezes during pause, resumes from frozen value, accumulates across cycles, snapshot exposes fields, start() resets, stop()-while-paused folds, recoverLast() resets
- `src/domain/session/__tests__/SessionManager.pauseFlow.test.ts` — 2 integration tests: full run scenario (warmup → motion → traffic-light pause → resume) with effective-elapsed bounds assertion; warmup-resets-across-start

## Files changed

```
src/pipeline/filters/PauseDetector.ts                                     (~50 LOC: warmup state + gate)
src/pipeline/filters/__tests__/PauseDetector.warmup.test.ts               (new: 90 LOC, 6 tests)
src/domain/session/SessionManager.ts                                      (~30 LOC: pause accumulator + effectiveElapsedMs)
src/domain/session/__tests__/SessionManager.timeFreezing.test.ts          (new: 180 LOC, 9 tests)
src/domain/session/__tests__/SessionManager.pauseFlow.test.ts             (new: 200 LOC, 2 integration tests)
src/state/activity.ts                                                     (~10 LOC: propagate new fields)
src/navigation/screens/record/TrackerLiveScreen.tsx                       (~60 LOC: effective elapsed + guards + empty-stop)
src/navigation/screens/record/hooks/useTrackerCamera.ts                   (~3 LOC: isPaused gate)
src/__tests__/TrackerLiveScreen.navAfterSave.test.tsx                     (adapt to new empty-session guard)
```

8 files modified + 3 new test files. Total +850 / -25 LOC across 7 commits.

## What the user will see in next debug-APK

1. **"ПРОДОЛЖИТЬ" button no longer appears immediately after START** — warmup gate suppresses auto-pause during GPS lock. Won't fire until either 10 seconds elapse OR 2m of motion accumulated. Once you start running, normal 5s-stationary auto-pause behavior resumes.
2. **Timer freezes during pause** — ВРЕМЯ on the top metric overlay stops ticking when isPaused=true. Resumes from the frozen value on un-pause.
3. **Pace shows '—' when stationary** — top-row ТЕМП no longer flashes 'null' / NaN.
4. **HR shows '—' on bad reads** — handles NaN + Infinity, not just null.
5. **Lap button visually disabled** — opacity 0.4 reflects disabled state cleanly when stationary <2 points or paused.
6. **Map camera freezes on pause** — no more re-centering on GPS drift while you're standing still. Camera resumes follow on un-pause.
7. **Empty-session guard** — pressing СТОП with 0 points / <5s shows "Пустая сессия" dialog (Cancel + Delete only); no garbage Журнал entries.

## Performance metrics

- **Total work:** ~2.5h actual (estimated 5-8h; came in well under because the domain-layer (PauseDetector + SessionManager) refactor was small and tests caught issues immediately)
- **Files touched:** 9 (5 modified + 4 new — 3 test files + 1 doc)
- **Lines:** +850 / -25
- **Bundle impact:** Negligible. New deps: 0. haversineDistance from existing util/geo.

## Not addressed (intentionally out of scope)

Per CONTEXT.md §"Out of scope":

- **Plan 07-03 Task 6 (Pixel pocket-walk)** — user-action with physical device; this pass makes that walk land on a better baseline
- **Adaptive sampling re-tune** — needs Pixel field data first
- **Live HR BLE pairing** — HEALTH-* v1.1
- **Map style overhaul** — ADR-0011 deferred
- **Backend activity-sync upload reliability** — separate from "live recording" surface; lives in RunDetails post-save

## Backlog promotion suggestions

If user wants more polish after this:

1. **PauseDetector field-tuning** — once Plan 07-03 pocket-walk delivers real data, adjust warmupMs/warmupMeters + pauseSpeedMs/pauseWindowMs based on observed user behavior. Likely v1.0.1 work.
2. **Map "recenter" button** — when camera is released (closure or pause), show small floating "↑↑" button to re-snap to user location. ~30min. Currently no escape from a released camera until session restart.
3. **Per-session pace splits table** — Phase 1 has lap infrastructure; surface per-km splits during the run (not just at RunDetails). Small UI addition reusing existing lapFromRange. ~1h.

These should go to ROADMAP.md v1.0.1 backlog if the user wants them tracked.
