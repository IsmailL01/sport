# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-14)

**Core value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.
**Current focus:** GSD Phase 1 — Validate & Close Territory Core (field-test on 3 OEMs + finish Phase 1 refactors + rotate Mapbox tokens)

**Brownfield note:** Codebase is at Phase 8 / M10 (tracking stats shipped) on active branch `feat/cursona-redesign`. GSD phases below cover remaining work only. Existing planning artefacts in `docs/` are the canonical implementation breakdown — GSD plans roll up to those P-IDs.

## Current Position

Phase: 1 of 8 (Validate & Close Territory Core)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-05-14 — GSD brownfield init completed (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, codebase analysis docs)

Progress: [░░░░░░░░░░] 0% (0 / 49 v1 REQ-IDs delivered via GSD; ≈70 atomic tasks already shipped per `STATUS.md`)

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
- **Phase 1 dependency**: Mapbox `server-secret` is currently `pk.…` — must rotate to `sk.…` before Phase 1 closes (PHASE1-13).
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

Last session: 2026-05-14 — GSD brownfield init on `feat/cursona-redesign`.
Stopped at: ROADMAP.md + STATE.md written; ready to plan Phase 1.
Resume file: None.

**Next action**: `/gsd-discuss-phase 1` (to refine scope before planning) or `/gsd-plan-phase 1` (to break Phase 1 into plans).

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
