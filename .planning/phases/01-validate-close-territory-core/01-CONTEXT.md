# Phase 1: Validate & Close Territory Core - Context

**Gathered:** 2026-05-14
**Status:** Ready for planning
**Mode:** Autonomous (`--auto`-equivalent — gray areas resolved with reasonable defaults per persistent no-questions instruction)

<domain>
## Phase Boundary

**What this phase delivers:** Prove Territory Core (GPS pipeline + map render + area calc + offline tiles) meets NFR-001..008 on three real device classes (iPhone, Pixel, Chinese-Android), finish the residual polish refactors that Phase 1 deferred (MapScreen hook extraction, SessionManager class, big-track simplification, closure haptic+toast, summary screen, manual offline region picker, adaptive sampling, SLC fallback), and rotate the leaked / mis-classified Mapbox tokens. After this phase, Phase 1 is formally closed in `STATUS.md` and `docs/DEVELOPMENT_PLAN.md`.

**Out of scope (belongs in other phases):**
- Real HealthKit / Health Connect / Strava / Garmin integration → Phase 2
- Cursona-redesign branch wrap → Phase 3
- Privacy zones, per-session visibility → Phase 4
- Any new game mechanics (segments, leaderboards, zone-wars) → Phase 5

</domain>

<decisions>
## Implementation Decisions

### Field-Testing Strategy (PHASE1-01..04)

- **D-01:** **Field testing is owner-driven.** Acceptance proof lives in `tests/FIELD_PROTOCOL.md` (already scaffolded with T1–T15 in `STATUS.md` history 2026-05-06). Code changes in this phase MUST NOT regress acceptance numbers from prior runs.
- **D-02:** **Device order: Pixel → iPhone → Chinese Android.** Pixel build is already verified (`apps/mobile-rn` debug APK builds clean). iPhone unblocks when Xcode installs (per existing TODO in STATUS.md). Chinese Android last because OEM-killer variability is highest.
- **D-03:** **Result capture format:** each test run produces (a) timestamped row in `tests/FIELD_PROTOCOL.md` with metrics, (b) GPX export saved to `tests/runs/<device>/<test>/<timestamp>.gpx`, (c) before/after battery photo if T6/T8. Pipeline already exports GPX via existing Share API.
- **D-04:** **Code work is parallelizable with device-acquisition blockers.** Refactors PHASE1-06..12 + token rotation PHASE1-13 do not require devices and proceed independently. Closure of Phase 1 (PHASE1-14) gates on T-results.

### MapScreen Hook Extraction (PHASE1-06)

- **D-05:** **MapScreen IS already extracted** as [TrackerLiveScreen.tsx](apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx) (per STATUS.md Phase 1 progress: "App.tsx работает с MetricsBar; полный refactor (отдельный экран, hook структура) — P1-B-* в Phase 1.5"). Remaining work is **extracting reusable hooks** from the screen body — not screen-level extraction.
- **D-06:** **Hooks to extract** (suggested, planner refines):
  - `useTrackerCamera()` — Mapbox camera follow + heading + bounds-fit on stop
  - `useLayerVisibility()` — track / corridor / zone / history toggles, paused-state dimming
  - `usePauseUI()` — auto-pause indicator, manual pause/resume binding
- **D-07:** **No new dependencies.** Hooks live in `apps/mobile-rn/src/navigation/screens/record/hooks/` with co-located unit tests using Jest + `@testing-library/react-hooks`-style patterns (already used in tests for stores).

### SessionManager Extraction (PHASE1-07)

- **D-08:** **Pattern:** extract a pure `SessionManager` class from [activity.ts](apps/mobile-rn/src/state/activity.ts) (the current 15KB "god store") that holds the imperative session lifecycle (start, pause, resume, ingestRawPoint, markLap, stop, save, discard, recover) **without** depending on Mapbox, SQLite, or zustand. The zustand store wraps the manager and exposes a reactive interface.
- **D-09:** **Migration strategy:** **gradual cutover, not rip-and-replace.** Phase A: introduce `SessionManager` class alongside the store; the store creates one instance and delegates mutating operations. Phase B: move closure detection + lap orchestration into the manager. Phase C: rewrite tests so they test the manager in isolation. The store's read API (`useActivityStore(s => s.points)`) does not change — UI code is untouched.
- **D-10:** **Required new tests:** real-SQLite integration tests for `sessionRepository` (CONCERNS.md R5 — currently using in-memory mocks), and a recovery-after-crash test that force-kills mid-session and verifies `recoverLast` produces a continuous session, not a duplicate row.
- **D-11:** **Concerns to address simultaneously** (CONCERNS.md): split `useActivityStore` god-store as part of D-08; `recoverLast` path must survive incomplete `closure_detector_state` (R7 race-condition fix already done via functional set — keep that pattern).

### Big-Track Simplification (PHASE1-05, P1-D-04)

- **D-12:** **Library:** use `@turf/simplify` (already in `package.json` — `@turf/simplify ^7.3.5`). No new dependency.
- **D-13:** **Trigger:** point count > **2000** OR detected JS frame drop. Default to point-count gate since it's deterministic and testable.
- **D-14:** **Tier strategy:** render **two GeoJSON sources** — `track-simplified` for `LineLayer` (visual) and `track-raw` for area-calc only (never rendered). Tolerance: `0.00005` degrees (~5 m) at zoom 12; scale linearly with `Math.pow(2, 12 - zoom)`. Live recording keeps raw fidelity for closure detection; only display layer is simplified.
- **D-15:** **History view: apply same simplification on `HistoryTerritoryLayer`** (all closed sessions overlay). Currently renders raw points — this is a known FPS risk on long history.

### Closure Haptic + Toast (PHASE1-08, P1-G-09)

- **D-16:** **Haptic library:** install `expo-haptics` (Expo SDK 54 supported). Use `Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)` on closure fire.
- **D-17:** **Toast:** **no new dependency** — implement lightweight in-house Toast overlay (`apps/mobile-rn/src/ui/Toast.tsx`) using Animated.View with fade-in/out, 2.5s display. Z-index above map but below modals. Theme matches existing dark UI (`#10B981` accent for success).
- **D-18:** **Trigger source:** existing `closureFired` event in [activity.ts](apps/mobile-rn/src/state/activity.ts:119) `closureDetector` callback. Hook into [TrackerLiveScreen.tsx](apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx:51) via `useEffect` watching `closureFired` transition false→true.
- **D-19:** **Toast text (RU, current app language):** «Зона замкнута! Площадь: N м²» (or km² when ≥10000 m²). Number formatted via existing `format.ts`.

### Summary Screen After Stop+Save (PHASE1-09, P1-J-05)

- **D-20:** **Summary screen IS already implemented** as [RunDetailsScreen.tsx](apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx) with full-map render + metrics tiles + splits. Remaining gap is **navigation flow**: after Stop+Confirm Save, ensure the user lands on RunDetailsScreen (not back to TrackerStart).
- **D-21:** **Verify** that the `closureFired && areaM2` branch renders the captured polygon with correct camera bounds (`bounds-fit` from D-06 hook). Add a snapshot test for the screen with mock session data.
- **D-22:** **GPX share button** already exists on RunDetailsScreen and SessionDetailModal — verify present, no work needed beyond visual QA.

### Manual Offline Region Picker UI (PHASE1-10, P1-K-04)

- **D-23:** **UX:** full-screen Mapbox view with a **draggable rectangle overlay**. User drags corners (4 handles) to define bounds. Zoom levels 12–16 fixed (matches `downloadHomeRegion` in [offline.ts](apps/mobile-rn/src/map/offline.ts:26)). Reject regions > 50 MB estimated.
- **D-24:** **Size estimate:** show estimated tile count + KB before download (Mapbox SDK provides `getPackEstimateSize` if available; otherwise rough `tileCount(bbox, zoom) * avgKBPerTile`).
- **D-25:** **Region management:** Settings screen lists existing packs (`offlineManager.getPacks()` already wrapped in [offline.ts](apps/mobile-rn/src/map/offline.ts:65)). Each row: name, size, delete button. Existing "home" pack is auto-created and labeled.
- **D-26:** **Naming:** user-defined name per pack; default `region-<timestamp>`. Stored via `createPack(name, …)` API.

### Adaptive GPS Sampling (PHASE1-11, P1-I-05)

- **D-27:** **Extend `LocationAdapter` interface** with `setSamplingMode(mode: 'active' | 'paused' | 'background-slc')`. Existing `ExpoLocationAdapter` translates: `active` → BestForNavigation distanceInterval 5m, `paused` → Balanced distanceInterval 50m, `background-slc` → switch to SLC (iOS only — see D-29).
- **D-28:** **Trigger logic** lives in the new `SessionManager` (D-08) — when `PauseDetector` fires `paused`, call `adapter.setSamplingMode('paused')`. When resumed, back to `active`. This is observable behavior; assert via mock adapter in tests.

### SignificantLocationChanges Fallback (PHASE1-12, P1-I-02)

- **D-29:** **iOS-only fallback.** When the foreground service notification is suppressed (rare iOS edge case where backgrounded foreground-service is killed), `expo-location` SLC keeps coarse locations flowing. On the next app foreground, detect gap (> 30s no point) and resume normal subscription. **Do not interpolate** — leave the gap visible on the track; the user knows GPS was lost.
- **D-30:** **Android: no SLC** (not in `expo-location` Android API). Mitigation is the existing foreground service + battery-optimization hint Alert (already shipped per STATUS.md `P1-I-04 минимум`).
- **D-31:** **Configurable threshold:** gap threshold in `settingsStore.gpsGapTriggerS = 30`. Field-test results may tune this.

### Mapbox Token Rotation (PHASE1-13)

- **D-32:** **User action required.** Steps documented in `docs/SECRETS.md` rotation playbook (create if missing):
  1. Generate new `sk.<…>` (true secret token) in Mapbox dashboard, restrict to Bundle ID `com.runningecosystem.mobile` + Android SHA-256 fingerprint
  2. Delete leaked `pk.<…>` mistakenly named `server-secret`
  3. Store `sk.<…>` in `~/.gradle/gradle.properties` and `~/.netrc` (CocoaPods) — **never** in `.env` checked into git
  4. Backend secret store (when one exists): future Phase 2 will introduce it; for now `sk.<…>` only used by build tooling, not runtime
- **D-33:** **ESLint guard:** add `no-restricted-syntax` rule rejecting `process.env.EXPO_PUBLIC_*_SECRET` and any string literal matching `^sk\.` in source files (excluding `*.md`).
- **D-34:** **Audit:** grep history for accidental token strings (chat exports, prior issue threads). Use `git log -p` + `git secret-scan` if available. Treat any historical leak as a force-rotation trigger.

### Phase 1 Closure Documentation (PHASE1-14)

- **D-35:** **Update both** `STATUS.md` Phase 1 progress table (mark PHASE1-* as ✓) and `docs/DEVELOPMENT_PLAN.md` Phase 1 acceptance section. Cross-reference field-test results.
- **D-36:** **Write ADR** if field tests surface decisions (e.g., "rejected SLC strategy on iOS due to gap quality" or "battery exceeded 10%/h on Xiaomi, accepted as known limitation"). ADR file: `docs/DECISIONS/0005-phase-1-field-test-outcomes.md`.
- **D-37:** **Update GSD STATE.md** to reflect Phase 1 done, advance current focus to Phase 2.

### Claude's Discretion

- **Test placement:** new tests go alongside existing `apps/mobile-rn/src/__tests__/` colocated pattern (per [.planning/codebase/TESTING.md](.planning/codebase/TESTING.md)). Real-SQLite integration test setup uses `expo-sqlite` in-process — no new framework.
- **Commit granularity:** atomic per REQ-ID; each PHASE1-* gets its own commit, message format `feat(phase1): <one-line> (PHASE1-XX)` matching existing CHANGELOG/commit style on `feat/cursona-redesign`.
- **Branch strategy:** field-test runs happen on whatever the active branch is at run time; refactors land on `feat/cursona-redesign` OR a sibling branch `feat/phase1-closeout` — leave to planner depending on cursona-redesign merge timing.
- **Tooling for big-track simplification:** if `@turf/simplify` proves insufficient on long tracks (>20k points seen in real use), revisit with Visvalingam–Whyatt; not blocking.

### Folded Todos

None — `.planning/todos/` not initialized.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/PROJECT.md` — full project context (validated capabilities, constraints, key decisions)
- `.planning/REQUIREMENTS.md` §Phase 1 Field Validation — PHASE1-01..14 specifications
- `.planning/ROADMAP.md` §Phase 1: Validate & Close Territory Core — success criteria and maps to existing plan
- `.planning/STATE.md` — current focus and blockers

### Existing Project Specs (canonical source-of-truth)
- `docs/RUNNING_ECOSYSTEM_TZ.md` §2.3–2.5 (FR-001..026, NFR-001..009, test protocol T1–T10) — field-test acceptance numbers
- `docs/RUNNING_ECOSYSTEM_TZ.md` §3.15 — Phase 1 acceptance criteria
- `docs/RUNNING_ECOSYSTEM_TZ.md` §6.6 — local-projection rule for area calc (already implemented)
- `docs/RUNNING_ECOSYSTEM_TZ.md` §10.5 — LineLayer+GeoJsonSource rule for track render (already implemented)
- `docs/RUNNING_ECOSYSTEM_TZ.md` §10.6 — MapAdapter abstraction rule (already implemented)
- `docs/DEVELOPMENT_PLAN.md` §3 Phase 1 — atomic task IDs `P1-A..P1-M` (canonical implementation breakdown)
- `STATUS.md` §Phase 1 progress — current per-subsection status
- `tests/FIELD_PROTOCOL.md` — test scaffold with T1–T15 (per STATUS.md 2026-05-06)
- `docs/SECRETS.md` — token inventory + rotation playbook (rotation TODO PHASE1-13)

### ADRs
- `docs/DECISIONS/0001-framework-react-native.md` — Expo RN locked (Mapbox via `@rnmapbox/maps` community)
- `docs/DECISIONS/0002-guest-mode.md` — deferred (not relevant to Phase 1 but informs Settings UX)

### Codebase Map (just generated)
- `.planning/codebase/STACK.md` — exact dependency versions for `expo-location`, `expo-sqlite`, `@rnmapbox/maps`, `@turf/*`
- `.planning/codebase/STRUCTURE.md` — directory layout (mobile-rn `src/` layers)
- `.planning/codebase/ARCHITECTURE.md` — DDD layering + adapter pattern + data flow
- `.planning/codebase/CONCERNS.md` — R-numbered issues to weave into this phase (R5 real-SQLite tests, R7 markLap race fix verified, R18 missing user_id columns NOT in scope here — Phase 4)
- `.planning/codebase/TESTING.md` — Jest setup, coverage targets, mock patterns

### Code Anchors (file paths for planner)
- `apps/mobile-rn/src/state/activity.ts` — current god-store to split (D-08..D-10)
- `apps/mobile-rn/src/navigation/screens/record/TrackerLiveScreen.tsx` — host of new hooks (D-06)
- `apps/mobile-rn/src/navigation/screens/record/RunDetailsScreen.tsx` — already-implemented Summary screen (D-20)
- `apps/mobile-rn/src/map/offline.ts` — wrapper around Mapbox offlineManager (D-23..D-26)
- `apps/mobile-rn/src/map/MapboxView.tsx` — only place Mapbox SDK is imported (ESLint guard already enforces)
- `apps/mobile-rn/src/pipeline/` — Kalman + filters + PauseDetector (D-27..D-28 extends LocationAdapter)
- `apps/mobile-rn/src/storage/sessionRepository.ts` — real-SQLite integration tests target (D-10)
- `apps/mobile-rn/eslint.config.*` — add `EXPO_PUBLIC_*_SECRET` rule (D-33)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`@turf/simplify ^7.3.5`** already in deps — drop-in for big-track simplification (D-12). No dependency add needed.
- **`Mapbox.offlineManager` wrapper** in `src/map/offline.ts` — `downloadHomeRegion`, `getPacks`, delete helpers. Manual-region UI calls `createPack` directly (D-23..D-26).
- **`ClosureDetector` callback in `state/activity.ts`** — already fires `closureFired` event with `{ areaM2 }`. Haptic+toast wires into existing event (D-18) — zero rework on detection.
- **`PauseDetector`** in pipeline — already emits paused/resumed transitions. Adaptive sampling subscribes (D-28).
- **`LocationAdapter` interface** in `src/location/` — single seam to extend with `setSamplingMode` (D-27). No platform code changes outside `ExpoLocationAdapter`.
- **`expo-sqlite`** sync API + WAL — supports in-process test instances. Real-SQLite integration tests (D-10) don't need a fixture DB process.
- **`format.ts`** in `src/ui/` — distance / pace / area formatters already i18n-aware. Toast text uses them (D-19).
- **GPX export via `Share` API** — already implemented on RunDetailsScreen + SessionDetailModal. Field-test capture format (D-03) reuses without changes.

### Established Patterns

- **MapAdapter rule:** never import `@rnmapbox/maps` outside `src/map/adapters/` — ESLint `no-restricted-imports` enforces. Region-picker UI in `src/ui/` must route through `MapboxView` component or accept the violation explicitly (it won't — `MapboxView` is reused).
- **Adapter pattern:** new behaviors (sampling mode, SLC fallback) extend the `LocationAdapter` interface, not the calling code. Mock adapter implements the interface for tests.
- **Zustand store delegation:** existing pattern — store wraps imperative logic, exposes selectors. SessionManager extraction (D-08) follows the same pattern that `permissions/` and `feed/` modules already use.
- **Module-per-feature:** `src/modules/<feature>/{domain,storage,state,sync,ui}/` for new features. Phase 1 closeout reorganizes session lifecycle into `src/modules/session/` if scope allows — leave decision to planner.
- **Test colocate** with target — domain/util tests in `__tests__/` adjacent. Coverage already 93% pipeline / 95% area / 100% metrics.

### Integration Points

- **TrackerLiveScreen** is the integration point for hooks (D-06), toast trigger (D-18), and adaptive sampling subscription.
- **RunDetailsScreen** consumes the post-Stop summary (D-20..D-22) — verify route navigation lands here.
- **Settings screen** is the integration point for offline region management (D-25), GPS gap threshold tuning (D-31), and Mapbox style preference (already shipped).
- **`activity.ts` store** is the integration point for `SessionManager` (D-08) — manager constructed in store factory, delegated to.
- **ESLint config** is the integration point for D-33 token-secret guard.

</code_context>

<specifics>
## Specific Ideas

- **Toast micro-interaction:** existing app uses dark theme `#0F1419` background and accent `#10B981` (per DECISION.md / codebase). Toast inherits same palette — feels native, not bolted-on.
- **Field-test acceptance numbers MUST match NFR table** in `docs/RUNNING_ECOSYSTEM_TZ.md` §2.4. Don't invent new thresholds.
- **Existing P1-G-09 spec** in `docs/DEVELOPMENT_PLAN.md` (closure haptic + toast — "отложено до runtime") — closure of this REQ also closes that P-ID.
- **Existing P1-K-04 spec** in `docs/DEVELOPMENT_PLAN.md` (manual region UI — "отложен") — same.
- **`expo-haptics` install** is the only new dependency added by this phase. All other deps already present.

</specifics>

<deferred>
## Deferred Ideas

- **Mapbox Studio custom style** (P0-A-02): explicitly deferred per PROJECT.md Out of Scope. Revisit when field-tests are done if the standard `outdoors-v12` proves visually inadequate.
- **Visvalingam–Whyatt simplification:** fallback if Douglas-Peucker (`@turf/simplify`) fails on long tracks; not blocking this phase.
- **HR-zone time breakdown on session detail:** noted in STATUS.md Phase 6.5 as deferred; cosmetic, belongs in a future polish phase.
- **Splits-over-time chart:** STATUS.md Phase 6.5 deferred item — bar chart already present, line chart is enhancement.
- **Privacy zone masking (track within home/work hidden):** Phase 4 — explicitly out of Phase 1.
- **Background reliability hardware mitigations** (e.g., recommending Auto-start in Xiaomi Settings): document in field-test outcome ADR (D-36) but don't ship in-app for now.

</deferred>

---

*Phase: 1-Validate-Close-Territory-Core*
*Context gathered: 2026-05-14*
*Auto-mode log: gray areas selected = all 10 (field-test, MapScreen, SessionManager, big-track, closure-feedback, summary screen, region picker, adaptive sampling, SLC, token rotation, closure docs). All decisions made with reasonable defaults grounded in existing codebase + RUNNING_ECOSYSTEM_TZ + DEVELOPMENT_PLAN. Single-pass — no re-read of own output.*
