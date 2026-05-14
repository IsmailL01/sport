# Phase 1: Validate & Close Territory Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 1-validate-close-territory-core
**Mode:** Autonomous (`--auto`-equivalent — persistent "no clarifying questions" instruction in effect)
**Areas discussed:** Field-testing strategy, MapScreen hook extraction, SessionManager extraction, Big-track simplification, Closure haptic+toast, Summary screen, Manual offline region picker, Adaptive sampling, SLC fallback, Token rotation, Phase 1 closure docs

---

## Field-Testing Strategy (PHASE1-01..04)

| Option | Description | Selected |
|--------|-------------|----------|
| Owner-driven, ad-hoc | Run tests when devices arrive; capture results in chat | |
| Owner-driven, structured | Fill `tests/FIELD_PROTOCOL.md` (already scaffolded) with timestamped rows + GPX exports | ✓ |
| Hire field testers | Outsource to physical testers; faster but $$$ | |

**Auto-selected rationale:** Protocol scaffold already exists per `STATUS.md 2026-05-06`. Owner controls device acquisition; structured capture format unblocks downstream verification + ADR (D-36).

**Device order:** Pixel → iPhone → Chinese Android (Pixel APK already builds; iPhone blocked on Xcode install; Chinese Android variance highest, run last).

---

## MapScreen Hook Extraction (P1-B / PHASE1-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Full screen-level extraction | Move MapScreen to its own file; rebuild from scratch | |
| Hook-level extraction (incremental) | Screen already exists as TrackerLiveScreen; extract reusable hooks | ✓ |
| No-op (already done) | Skip — accept current shape | |

**Auto-selected rationale:** Screen extraction was already done in a prior round (per STATUS.md "App.tsx работает... — P1-B-* в Phase 1.5"). Remaining is hook structure. No new dependencies.

---

## SessionManager Extraction (P1-C / PHASE1-07)

| Option | Description | Selected |
|--------|-------------|----------|
| Rip-and-replace | Rewrite activity.ts as a class; touch every consumer | |
| Gradual delegation | Introduce class alongside store; store delegates; UI untouched | ✓ |
| Skip — accept god-store | Living with 15KB activity.ts | |

**Auto-selected rationale:** CONCERNS.md flags `useActivityStore` as god-store. Gradual delegation matches existing patterns (`permissions/`, `feed/` modules) and minimizes UI churn. Pairs with R5 real-SQLite integration tests.

---

## Big-Track Simplification (P1-D-04 / PHASE1-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Douglas-Peucker via `@turf/simplify` | Already in deps; deterministic; well-tested | ✓ |
| Visvalingam–Whyatt | Better for noisy GPS but no library; custom impl | |
| No simplification, rely on Mapbox tile generalization | Hope FPS holds at 5000+ pts | |

**Auto-selected rationale:** `@turf/simplify ^7.3.5` is already a dependency — zero new deps. Two-tier source (simplified for render, raw for area calc) preserves accuracy. VW kept as fallback if DP proves insufficient (Deferred).

---

## Closure Haptic + Toast (P1-G-09 / PHASE1-08)

| Option | Description | Selected |
|--------|-------------|----------|
| `expo-haptics` + in-house Toast | Lightweight; 1 new dep | ✓ |
| `react-native-toast-message` + `expo-haptics` | Standard library; 2 new deps | |
| Native modal banner | No deps; more visual weight | |

**Auto-selected rationale:** `expo-haptics` is the standard Expo path; in-house Toast keeps the bundle small and matches existing theme palette (`#0F1419` / `#10B981`). Trigger source (`closureFired` event) already wired in `activity.ts:119`.

---

## Summary Screen After Stop+Save (P1-J-05 / PHASE1-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild new screen | Fresh implementation | |
| Reuse existing RunDetailsScreen + verify navigation | Already 13KB implementation with metrics tiles + map + splits | ✓ |
| Inline summary on TrackerStart | No new screen — show last session card | |

**Auto-selected rationale:** RunDetailsScreen already implements full-map render + 6 metric tiles + splits table + GPX share. Remaining work is navigation verification (push after Save) + snapshot test.

---

## Manual Offline Region Picker UI (P1-K-04 / PHASE1-10)

| Option | Description | Selected |
|--------|-------------|----------|
| Draggable rectangle + size estimate | Visual; tight cost control | ✓ |
| Center + radius slider | Simpler UX but less precise | |
| Polygon free-draw | Most flexible; highest impl complexity | |

**Auto-selected rationale:** Matches Strava/Komoot precedent users expect. `Mapbox.offlineManager.createPack` (already wrapped in `src/map/offline.ts`) accepts a bounds rectangle. Size cap 50 MB protects against accidental large downloads.

---

## Adaptive GPS Sampling (P1-I-05 / PHASE1-11)

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `LocationAdapter.setSamplingMode` | Single seam; adapter pattern preserved | ✓ |
| Inline rate switching in store | Faster to ship but couples store to platform code | |
| Skip — battery acceptable with current settings | Defer until T6 shows a problem | |

**Auto-selected rationale:** Adapter abstraction is a CLAUDE.md hard rule. Mode-driven API is testable via mock adapter. Triggers off `PauseDetector` (already exists in pipeline).

---

## SignificantLocationChanges Fallback (P1-I-02 / PHASE1-12)

| Option | Description | Selected |
|--------|-------------|----------|
| iOS SLC + Android battery-hint Alert | iOS-only SLC API; Android has no equivalent | ✓ |
| Custom native module for both platforms | Most reliable; highest dev cost | |
| Skip; rely on foreground service alone | Risks iOS kill in edge cases | |

**Auto-selected rationale:** `expo-location` ships SLC for iOS. Android lacks an equivalent — existing foreground service + battery-hint Alert is the pragmatic mitigation. Gap-detection threshold (30s) configurable; tune from field-test results.

---

## Mapbox Token Rotation (PHASE1-13)

| Option | Description | Selected |
|--------|-------------|----------|
| Manual rotation + ESLint guard + audit | User regenerates `sk.…`; ESLint rejects pattern; grep history | ✓ |
| Vault-based rotation now | Introduces Vault dependency too early | |
| Defer to Phase 2 | Phase 1 closure depends on this per success criteria | |

**Auto-selected rationale:** Direct manual rotation is simplest; ESLint guard prevents regression; Vault deferred until Phase 2/3 when backend secret storage actually exists. Documented in `docs/SECRETS.md` rotation playbook.

---

## Phase 1 Closure Documentation (PHASE1-14)

| Option | Description | Selected |
|--------|-------------|----------|
| Update STATUS.md + DEVELOPMENT_PLAN.md + ADR-0005 + GSD STATE.md | Full closure + decision capture | ✓ |
| Update STATUS.md only | Minimal — misses decision capture | |
| Skip docs; close in next phase | Leaves Phase 1 ambiguous | |

**Auto-selected rationale:** ADR-0005 captures any field-test surprises (e.g., Chinese-Android failures). All four docs touched preserve traceability for downstream phases.

---

## Claude's Discretion

- Test placement (colocated `__tests__/`)
- Commit granularity (atomic per REQ-ID)
- Branch strategy (planner decides based on `feat/cursona-redesign` merge timing)
- Visvalingam–Whyatt fallback (kept as deferred idea, not blocking)

## Deferred Ideas

- Mapbox Studio custom style (P0-A-02) — explicitly out of scope per PROJECT.md
- HR-zone time breakdown on session detail — STATUS.md Phase 6.5 deferred
- Splits-over-time line chart — Phase 6.5 deferred enhancement
- Privacy zone masking — Phase 4
- In-app OEM auto-start guidance (Xiaomi etc.) — capture in field-test ADR instead

---

*Mode note: This session ran in autonomous mode per persistent user instruction to "work without stopping for clarifying questions." Alternatives table above lists what would have been presented via AskUserQuestion in interactive mode; the ✓ column shows the auto-selected option. The user can redirect any decision by editing CONTEXT.md directly — downstream agents read CONTEXT.md, not this log.*
