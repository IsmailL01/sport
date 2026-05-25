---
slug: tracker-live-polish-pass
created: 2026-05-25
type: quick
flags: --discuss --research
status: in-progress
---

# TrackerLive polish pass — TIGHT scope (7 items + integration tests)

## Description

User-reported bug + perfection pass on the live-running screen (the most
load-bearing UI surface of the entire app — Phase 7 Plan 07-03 Pixel
pocket-walk validates exactly this screen). All FE-side; backend not
involved during recording (sessions are local-only until save → upload).

User's concrete bug report: «я начинаю бег и у меня почему-то кнопка
продолжить активна» — "Continue" button is active when starting a run.
Survey identified this is likely legitimate auto-pause during GPS warmup
(stationary first 5-10s while satellites lock). Fix: suppress PauseDetector
output until the runner has either moved 2m OR 10s have elapsed.

## Items

| # | Item | File(s) | Cat | Est | Status |
|---|---|---|---|---|---|
| 1 | **PauseDetector warmup suppression** — suppress auto-pause output until 10s elapsed AND 2m moved since session start | `src/pipeline/filters/PauseDetector.ts` + tests | BUG-ish | 1.5h | pending |
| 2 | **Time-freeze on pause** — sessionManager tracks frozen elapsed via `pausedDurationMs` accumulator; UI reads `effectiveElapsedMs` instead of `now - startedAt` | `src/domain/session/SessionManager.ts` + `src/state/activity.ts` + `TrackerLiveScreen.tsx` + tests | **BUG** | 2h | pending |
| 3 | Pace null-guard consistency (current pace at line 217 — render '—' when null, matches avgPace/bestPace pattern) | `TrackerLiveScreen.tsx:217` | POLISH | 15min | pending |
| 4 | Lap button opacity-reflects-disabled (currently `opacity: pressed ? 0.85 : pauseUi.isPaused || points.length < 2 ? 0.4 : 1` — boolean math works but visually subtle; clean it up) | `TrackerLiveScreen.tsx:271` | POLISH | 15min | pending |
| 5 | Map camera freeze on pause (camera follows GPS drift even when paused — distracting + battery-impact; freeze followUserLocation while isPaused) | `src/navigation/screens/record/hooks/useTrackerCamera.ts` + caller | POLISH | 30min | pending |
| 6 | HR NaN guard (`Number.isNaN(liveHr)` → render '—'; protects against malformed BLE reads) | `TrackerLiveScreen.tsx:220` | POLISH | 15min | pending |
| 7 | Empty-session stop guard — Alert when user taps STOP with <5s OR 0 points (offer "Все равно завершить?" + return to TrackerStart) | `TrackerLiveScreen.tsx:101 handleStop` | POLISH | 30min | pending |
| 8 | Integration test: TrackerLiveScreen pause→resume + time-freeze coverage | new `src/navigation/screens/record/__tests__/TrackerLiveScreen.timeFreezing.test.ts` + `PauseDetector.warmup.test.ts` already in item 1 | TESTS | 1h | pending |

**Total est:** 6-8h | **Files touched:** ~5 | **New tests:** 2 files (PauseDetector warmup + TrackerLive integration) | **No backend changes**

## Acceptance criteria

- All 7 items implemented as separate atomic commits (item 3+4+6 may bundle as a single "TrackerLive small guards" commit since they're 1-3 lines each)
- tsc clean after each commit
- jest baseline preserved (669/669 → 669+ with new tests)
- No backend changes anywhere
- PauseDetector with warmup: existing 10+ tests in pipeline.test.ts continue passing; new warmup test asserts no auto-pause within first 10s when speed=0
- Time-freeze: pausedDurationMs accumulator tested; UI durationS frozen during pause; resumes from frozen value on un-pause
- No regressions in TrackerStart → TrackerLive → RunDetails happy-path (manual smoke confirmed via APK install on Pixel/BlueStacks)

## Out of scope (deferred / N/A)

See CONTEXT.md §"Out of scope" for full reasoning.

- Adaptive sampling re-tune (`active`/`paused`/`background-slc` thresholds) — needs Pixel pocket-walk field data first
- Live HR BLE sensor pairing flow — HEALTH-* v1.1
- Map style overhaul (Mapbox Studio custom style) — out of v1.0 per ADR-0011
- Lap UX (per-lap graph, lap-diff visualization) — separate feature scope
- Backend session-upload pipeline — separate from "live run screen"; lives in RunDetails post-save + activity-sync service (out of /gsd-quick scope)
- Plan 07-03 Task 6 Pixel pocket-walk validation — user action, requires physical device
