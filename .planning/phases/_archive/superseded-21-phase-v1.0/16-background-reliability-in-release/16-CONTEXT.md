# Phase 16: Background Reliability in Release Builds — Context Skeleton

**Status:** Skeleton (will be expanded by `/gsd-discuss-phase 16` after Phases 1–15 progress)
**Milestone:** v1.0 Production Readiness
**Workstream:** `mobile-shared`
**Depends on:** Phase 14 (Android native + ABI), Phase 15 (iOS native + device class)
**Carries forward from:** Old Phase 1 PHASE1-01..04 + PHASE1-09 (Pixel field-test gating originally written in `.planning/phases/_archive/pre-v1.0-territory-refactors/01-09-PLAN-field-test-execution.md`)

<domain>
## Phase Boundary

**What this phase delivers:** Validate that the v1.0 Production Readiness signed release builds (NOT debug builds) meet Territory Core NFR targets and survive aggressive vendor battery killers on 8 device classes. The work splits into:

1. **Inherited from old Phase 1** — Pixel + iPhone field-test acceptance numbers, originally written for debug-build runs, **must be re-run on release builds with rotated Mapbox token, R8/ProGuard active, Hermes, and the Mapbox SDK 11.x bump (Phase 13) all in play**.
2. **New for v1.0** — vendor-killer survival on Xiaomi MIUI/HyperOS, Huawei EMUI, Samsung One UI, plus low-end <4GB RAM device behavior under memory pressure.

**Out of scope:** Public TestFlight distribution (Phase 19), Play Store submission (deferred), iOS background tasks framework migration (v1.1+).

</domain>

<inherited_acceptance_criteria>
## Inherited from Old Phase 1 (Pixel/iPhone/Chinese-Android × T1/T2/T6/T7/T8/T9)

**Source:** `.planning/phases/_archive/pre-v1.0-territory-refactors/01-09-PLAN-field-test-execution.md` §`test_thresholds`
**Copied verbatim per user redline:** "Archive is not a source of truth for live phases."

### Acceptance thresholds (from `docs/RUNNING_ECOSYSTEM_TZ.md` §2.4)

| Test | NFR | Threshold | Source |
|------|-----|-----------|--------|
| T1 (5km loop) | NFR-001 | distance error ≤ **3%** vs Garmin baseline | TZ §2.4 |
| T2 (reference area, football field) | NFR-002 | area error ≤ **5%** vs surveyed area | TZ §2.4 |
| T6 (2-hour session, screen on) | NFR-003 + NFR-007 | battery ≤ **10%/h**, memory growth ≤ **100 MB** | TZ §2.4 |
| T7 (5000+ pts panning) | NFR-006 | ≥ **50 fps** panning | TZ §2.4 |
| T8 (in-pocket 30 min) | NFR-005 | ≥ **95% record-time** when phone in pocket | TZ §2.4 |
| T9 (closed-loop area) | NFR-002 | area error ≤ **5%** vs reference closed shape | TZ §2.4 |

### Device order (inherited from old Plan 09 §D-02)

Pixel → iPhone → Chinese Android (Xiaomi or equivalent vendor with aggressive battery killer).

### Build prerequisite for this phase

The APK / IPA under test MUST be built from a commit containing ALL of:
- Phase 2 (Mapbox `sk.…` rotation landed in `~/.netrc` + `~/.gradle/gradle.properties`)
- Phase 11 + 12 (Android + iOS release build config with R8/ProGuard + Hermes + EAS production profile)
- Phase 13 (`@rnmapbox/maps` 11.x migration, gated on debug-build regression of all old Phase 1 tracker features)
- Phase 14 + 15 (Android ABI matrix arm64-v8a + armeabi-v7a + 16 KB page-size validated; iOS arm64 validated)
- The 35 commits of old Phase 1 code refactors (SessionManager, tracker hooks, closure feedback, summary screen, big-track simplify, offline region picker bounds fix, adaptive sampling + SLC, ESLint token-secret guard) — already on `feat/cursona-redesign`

### Capture format (inherited from old Plan 09)

Each run produces:
1. Timestamped row in [tests/FIELD_PROTOCOL.md](../../../tests/FIELD_PROTOCOL.md) with columns: Date, Device, OS, Build hash, Baseline, Outcome value, Pass/Fail, GPX file path, Notes.
2. GPX export saved to `tests/runs/<device>/<test>/<YYYY-MM-DD-HHMM>.gpx`.
3. For T6/T8 specifically: `battery_before.jpg` + `battery_after.jpg` next to the GPX.
4. Commit per device class: `test(phase16): <device> field results T1/T2/T6/T7/T8/T9 (BG-XX)`.

### Pixel gate is BLOCKING

Old Plan 09 noted: "Plan 09 is considered COMPLETE when Pixel rows are filled in; iPhone + Chinese-Android may complete in parallel or land later via independent checkpoint resumes."

For Phase 16 v1.0 closure: **Pixel + iPhone field-test acceptance numbers measured ≤ target on signed release builds is a hard prerequisite for Phase 20 (Device Matrix) and Phase 21 (Staging E2E + go/no-go).** Chinese-Android can land in parallel with Phase 20 device-matrix work.

</inherited_acceptance_criteria>

<new_v1.0_scope>
## New for v1.0 (beyond inherited Phase 1 criteria)

### Vendor-killer survival (4 OEM matrices)

| OEM family | Killer behaviors to validate | Acceptance |
|------------|------------------------------|------------|
| Xiaomi MIUI / HyperOS | Auto-start permission required; battery saver kills foreground service; Memory cleanup app whitelist | Recording survives ≥30 min in pocket; resume-after-kill recovery shows last session |
| Huawei EMUI (no GMS) | Protected apps list; app launch manager; battery optimization | Same as MIUI; **no Google Play Services dependency in critical path** |
| Samsung One UI | Power saving mode; deep sleep apps; sleeping apps | Same as MIUI |
| Vendor-agnostic Doze + App Standby | Standard Android background restrictions | Foreground service notification visible; location updates continue at degraded cadence |

### Low-end memory pressure (Android <4GB RAM)

- 2-hour session on a 3GB-RAM device with 5+ background apps
- Memory budget: ≤100 MB growth (NFR-007 inherited) PLUS GC-pressure check — no OOM kills
- SQLite WAL not bloated past 64 MB (existing pattern)

### iOS background reliability (release builds)

- SLC fallback (already extended in old Phase 1 PHASE1-12) validated on release IPA
- Always-On VPN N/A (no VPN feature)
- iOS 16, iOS 17, iOS 18 — separate test cells; iOS 18 has more aggressive background management
- Gap-resume on AppState foreground transition verified (no interpolation, gap stays visible)

</new_v1.0_scope>

<decisions_inherited>
## Decisions Inherited from Old Phase 1 CONTEXT

Per user redline on archive: relevant decisions copied here rather than left in archive.

- **D-01 (Field-Testing Strategy):** Owner-driven; structured capture in `tests/FIELD_PROTOCOL.md`. *Carried forward.*
- **D-02 (Device Order):** Pixel → iPhone → Chinese Android. *Carried forward; extended with Samsung + Huawei + low-end + Android 15+ in Phase 20.*
- **D-03 (Result Capture Format):** Timestamped table row + GPX export + battery photo for T6/T8. *Carried forward verbatim.*
- **D-04 (Parallelization):** Code work parallelizable with device blockers. *Carried forward — Phase 16 is gated on signed releases from Phases 11/12, not on completing all backend Phases 3-8.*
- **D-29 (SLC fallback):** iOS-only; `expo-location` Accuracy.Lowest + distanceInterval:500 approximation; no interpolation on gap resume. *Already shipped in code; validates here on release IPA.*
- **D-31 (Gap threshold):** `settingsStore.gpsGapTriggerS = 30`. *Configurable; tune from field-test outcomes if needed.*

</decisions_inherited>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.0 Milestone & Phase Specs
- `.planning/PROJECT.md` §Current Milestone v1.0 Production Readiness
- `.planning/REQUIREMENTS.md` §BG-01..08 (this phase's REQ-IDs)
- `.planning/ROADMAP.md` §Phase 16
- `.planning/MILESTONES.md` v1.0 phase progress table

### Old Phase 1 Archive (historical reference only)
- `.planning/phases/_archive/pre-v1.0-territory-refactors/01-09-PLAN-field-test-execution.md` — original Pixel/iPhone/Chinese-Android protocol
- `.planning/phases/_archive/pre-v1.0-territory-refactors/01-09-SUMMARY.md` — Plan 09 Task 1 completion notes
- `.planning/phases/_archive/pre-v1.0-territory-refactors/01-CONTEXT.md` — original decisions (D-01..D-37)

### Source-of-truth Project Specs
- `docs/RUNNING_ECOSYSTEM_TZ.md` §2.4 NFR table — acceptance numbers (canonical)
- `docs/RUNNING_ECOSYSTEM_TZ.md` §2.5 test protocol T1–T10
- `tests/FIELD_PROTOCOL.md` — the live test runs table (541 lines, scaffolded by old Plan 09 Task 1)
- `tests/runs/README.md` — capture convention
- `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` — deferred-aware closure ADR (must be flipped to `Accepted (closed)` after Phase 16 completes)

### Code Anchors (for reference when Phase 16 plans are written)
- `apps/mobile-rn/src/domain/session/SessionManager.ts` — pure-domain session class (validated in release build here)
- `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` — `setSamplingMode` + SLC fallback impl
- `apps/mobile-rn/src/map/util/simplify.ts` — `simplifyForDisplay` helper validated at scale here

</canonical_refs>

<deferred>
## Deferred Ideas

- **iOS background tasks framework migration** (`BGProcessingTask` instead of SLC approximation) — v1.1+; requires Apple developer-mode background-tasks entitlement and is materially different code path.
- **Vendor whitelist hint UI** (in-app dialog suggesting user adds the app to Xiaomi auto-start whitelist) — captured here for Phase 16 plan to consider; could land as a small UX addition or defer to v1.1.
- **Adaptive memory pressure response** (drop sensor-readings buffer below LowMem threshold) — v1.1+; complex, not blocking for closed beta.

</deferred>

---

*Phase: 16-Background-Reliability-in-Release*
*Context skeleton seeded: 2026-05-15 during milestone v1.0 redefinition*
*Will be expanded via `/gsd-discuss-phase 16` after Phases 1–15 progress*
