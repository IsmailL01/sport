# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-14)

**Core value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.
**Current focus:** GSD Phase 1 — Validate & Close Territory Core (field-test on 3 OEMs + finish Phase 1 refactors + rotate Mapbox tokens)

**Brownfield note:** Codebase is at Phase 8 / M10 (tracking stats shipped) on active branch `feat/cursona-redesign`. GSD phases below cover remaining work only. Existing planning artefacts in `docs/` are the canonical implementation breakdown — GSD plans roll up to those P-IDs.

## Current Position

Phase: 1 of 8 (Validate & Close Territory Core)
Plan: 9 of 10 (field-test execution — protocol scaffold landed; device runs pending user action)
Status: PARTIAL — Plan 09 Task 1 complete (`c1af7c7`); Tasks 2-4 (Pixel / iPhone / Chinese-Android field runs) await physical device execution
Last activity: 2026-05-14 — Plan 09 Task 1 protocol scaffold committed

Progress: [████████░░] 80% (8 of 10 plans landed; Plan 09 partial, Plan 10 awaits Plan 09 Pixel rows for ADR-0005)

## Performance Metrics

**Velocity:**
- Total plans completed: 0 (GSD-tracked; existing project has shipped Phases 0–8 + M10 via `docs/DEVELOPMENT_PLAN.md`)
- Average duration: N/A
- Total execution time: N/A

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: N/A (no GSD plans run yet)
- Trend: N/A

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log in `docs/DECISIONS/` (ADRs) and `.planning/PROJECT.md` §Key Decisions.

Recent / load-bearing decisions affecting current work:

- **ADR-0001**: Expo RN over Flutter — locked; Flutter archived in `apps/mobile_flutter.archived/`.
- **ADR-0002**: Guest mode deferred — revisit if signup friction blocks adoption.
- **ADR-0003**: OAuth Google + Apple via `AuthProvider` interface — stub-safe; backend exchange endpoints still pending (Phase 2 / Phase 3 work).
- **ADR-0004**: Feed/Stories backend do-nothing — preserved when feed came back on `feat/cursona-redesign`; revisit at 90 days or on security audit.
- **GSD init 2026-05-14**: REQ-IDs (`PHASE1-*`, `HEALTH-*`, `SOCIAL-*`, `COACH-*`, `PREMIUM-*`, `XCUT-*`) provide GSD-side traceability; existing `P<phase>-<section>-<number>` task IDs remain the canonical implementation breakdown.

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

None yet (folder not initialized).

### Blockers/Concerns

[Issues that affect future work — see `.planning/codebase/CONCERNS.md` for full list]

- **P0 (must address before public launch)**: `IDENTITY_DEV_MODE=true` default in identity service; missing rate-limit on `/auth/*` endpoints; OTP code unconditionally logged in stdout.
- **Phase 1 dependency (user action)**: Plan 08 Task 4 — Mapbox `sk.` token rotation in dashboard; required in `~/.netrc` (iOS) + `~/.gradle/gradle.properties` (Android) before Plan 09 Tasks 2-4 device builds can be cut. See `01-08-SUMMARY.md` §CHECKPOINT REQUIRED.
- **Phase 1 dependency (user action)**: Plan 09 Tasks 2-4 — physical device field runs (Pixel / iPhone / Chinese-Android × T1, T2, T6, T7, T8, T9). Protocol scaffold ready in `tests/FIELD_PROTOCOL.md`. Pixel runnable now (gated only on Plan 08 Task 4); iPhone gated additionally on Xcode install; Chinese-Android gated on device acquisition. See `01-09-SUMMARY.md` §CHECKPOINT REQUIRED.
- **Phase 2 dependency**: backend `/integrations/strava/{exchange,refresh}` endpoints do not exist yet (R1 partial); env-var naming inconsistent (`EXPO_PUBLIC_API_BASE` vs `EXPO_PUBLIC_API_URL`).
- **R18 (cross-cutting schema)**: `personal_records` and `sessions` lack `user_id` columns — must add before Phase 4 visibility or any Guest-mode revisit.
- **Active branch**: `feat/cursona-redesign` must be merged to `main` (Phase 3) before deeper phases ship to avoid drift.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Auth | Guest mode | Deferred per ADR-0002 | 2026-05-14 (init) |
| Map | Mapbox Studio custom style | Deferred from `P0-A-02` | 2026-05-14 (init) |
| Backend | Feed/Stories endpoint deprecation | Do-nothing per ADR-0004 | 2026-05-14 (init) |
| i18n | Languages beyond RU+EN | On-demand only | 2026-05-14 (init) |
| Platform | Web client (athlete-facing) | Out of scope | 2026-05-14 (init) |
| Platform | Watch native apps (Garmin IQ / watchOS) | HealthKit/Health Connect strategy | 2026-05-14 (init) |

## Session Continuity

Last session: 2026-05-14 — Plan 09 Task 1 (field-test protocol scaffold) landed as commit `c1af7c7`.
Stopped at: `.planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md` §CHECKPOINT REQUIRED — USER ACTION. Tasks 2-4 await physical device execution.
Resume file: `.planning/phases/01-validate-close-territory-core/01-09-SUMMARY.md`.

**Next action**: Owner-driven field runs per `tests/FIELD_PROTOCOL.md` (Pixel first, per D-02). After Pixel rows filled in + committed, run `/gsd-execute-plan 01-10` to close Phase 1 (ADR-0005 + STATUS.md / ROADMAP.md updates).

## Artifacts Created (this init)

- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md` (this file)
- `.planning/config.json`
- `.planning/codebase/STACK.md`
- `.planning/codebase/INTEGRATIONS.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- `.planning/codebase/TESTING.md`
- `.planning/codebase/CONCERNS.md`

## Source-of-Truth References

- `docs/RUNNING_ECOSYSTEM_TZ.md` — master technical spec (961 lines)
- `docs/DEVELOPMENT_PLAN.md` — canonical implementation tasks (`P<phase>-<section>-<number>`)
- `STATUS.md` — living phase + task status (updated on every close)
- `docs/DECISIONS/` — ADR 0001..0004 (framework, guest mode, OAuth, feed cleanup)
- `docs/AUDIT.md`, `docs/REVIEW_ROUNDS_1-3.md` — review outputs feeding `CONCERNS.md`
