# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-15)
See: `.planning/MILESTONES.md` (milestone history + per-milestone phase progress)

**Milestone:** v1.0 Production Readiness — IN PROGRESS (opened 2026-05-14, formalized 2026-05-15). Target close: Phase 8 GDPR & Compliance ship + pen-test pass.
**Core value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.
**Current focus:** v1.0 Phase 1 — Validate & Close Territory Core (🟡 code-complete; awaits Mapbox dashboard rotation + 3-OEM field tests). Phase 2 (Real Health Integrations) ready to start in parallel with Phase 1 field-test work.

**Brownfield note:** Codebase is at Phase 8 / M10 (tracking stats shipped) on active branch `feat/cursona-redesign`. GSD phases below cover remaining work only. Existing planning artefacts in `docs/` are the canonical implementation breakdown — GSD plans roll up to those P-IDs.

## Current Position

Phase: 1 of 8 (Validate & Close Territory Core) — **code-complete, field-tests pending**
Plan: 10 of 10 (Phase 1 closure docs — deferred-aware mode)
Status: Phase 1 closed at code-level 2026-05-14 via Plans 01-10; **NOT formally closed** until Plan 08 Task 4 (Mapbox dashboard rotation) + Plan 09 Tasks 2-4 (per-device field runs) complete. See ADR-0005.
Last activity: 2026-05-14 — Plan 10 closure docs landed in deferred-aware mode (ADR-0005 + STATUS + DEVELOPMENT_PLAN + STATE + ROADMAP + REQUIREMENTS)

Progress: [█████████░] 90% (9 of 10 plans landed at code-level; Plan 09 partial — Task 1 done, Tasks 2-4 deferred-on-user; Plan 10 complete deferred-aware)

**Next phase (gated):** Phase 2 (Real Health Integrations) — code-level work can start in parallel via `/gsd-discuss-phase 2`. Production release of Phase 2 features is gated on Phase 1 formal closure (per ADR-0005 Consequences).

## Performance Metrics

**Velocity:**
- Total plans completed: 9 of 10 code-level + 1 deferred-aware (Plan 10) = 10 of 10 with caveats. Phase 1 baseline 2026-05-14.
- Average duration: ~25-35 minutes per code plan (Plans 02..09 SUMMARY metrics)
- Total execution time: ~4-5 hours of agent work (Plans 01-09 across multi-active sessions on 2026-05-14)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 (Validate & Close Territory Core) | 10 | 10 (9 code-complete + Plan 10 deferred-aware) | ~25-35 min |

**Recent Trend:**
- Last 5 plans (chronological): 01-06 → 01-01 → 01-07 → 01-02 → 01-03 → 01-08 → 01-05 → 01-04 → 01-09 → 01-10 (parallel waves)
- Trend: Phase 1 closeout shipped on schedule; field validation remains owner-driven and deferred.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log in `docs/DECISIONS/` (ADRs) and `.planning/PROJECT.md` §Key Decisions.

Recent / load-bearing decisions affecting current work:

- **ADR-0001**: Expo RN over Flutter — locked; Flutter archived in `apps/mobile_flutter.archived/`.
- **ADR-0002**: Guest mode deferred — revisit if signup friction blocks adoption.
- **ADR-0003**: OAuth Google + Apple via `AuthProvider` interface — stub-safe; backend exchange endpoints still pending (Phase 2 / Phase 3 work).
- **ADR-0004**: Feed/Stories backend do-nothing — preserved when feed came back on `feat/cursona-redesign`; revisit at 90 days or on security audit.
- **ADR-0005**: Phase 1 field-test outcomes — Code Closeout, Deferred Validation (2026-05-14). Phase 1 closed at code-level; formal closure gated on Mapbox dashboard rotation + 3-device field runs. See `docs/DECISIONS/0005-phase-1-field-test-outcomes.md`.
- **GSD init 2026-05-14**: REQ-IDs (`PHASE1-*`, `HEALTH-*`, `SOCIAL-*`, `COACH-*`, `PREMIUM-*`, `XCUT-*`) provide GSD-side traceability; existing `P<phase>-<section>-<number>` task IDs remain the canonical implementation breakdown.

### Pending Todos

[From `.planning/todos/pending/` — ideas captured during sessions]

**Phase 1 formal closure (USER ACTIONS — see ADR-0005 §«Список user actions»):**

1. ☐ **Mapbox dashboard rotation** (Plan 08 Task 4, ~10 минут) — generate new `sk.<…>` token with `DOWNLOADS:READ` scope, store in `~/.netrc` (iOS) + `~/.gradle/gradle.properties` (Android), delete old leaked tokens, append entry to `docs/SECRETS.md` §«История ротаций». Full procedure: `01-08-SUMMARY.md` §CHECKPOINT REQUIRED — Task 4.
2. ☐ **Field test execution** (Plan 09 Tasks 2-4): Pixel → iPhone → Chinese-Android, each running T1 / T2 / T6 / T7 / T8 / T9. Fill per-device tables in `tests/FIELD_PROTOCOL.md`; place GPX + battery photos under `tests/runs/<device>/<test>/`. Commit per-device: `test(phase1): pixel field results … (PHASE1-01..04)`. iPhone gated additionally on Xcode install; Chinese-Android gated on device acquisition.
3. ☐ **Update ADR-0005** after Pixel + iPhone runs minimum — replace `deferred` with measured values, flip status to `Accepted (closed)`, sync STATUS.md / DEVELOPMENT_PLAN.md / STATE.md / ROADMAP.md.

### Blockers/Concerns

[Issues that affect future work — see `.planning/codebase/CONCERNS.md` for full list]

- **P0 (must address before public launch)**: `IDENTITY_DEV_MODE=true` default in identity service; missing rate-limit on `/auth/*` endpoints; OTP code unconditionally logged in stdout.
- **Phase 1 formal closure (USER ACTION, blocks Phase 2 production release)**: Plan 08 Task 4 (Mapbox `sk.` token rotation in dashboard + `~/.netrc` / `~/.gradle/gradle.properties`) + Plan 09 Tasks 2-4 (per-device field runs Pixel/iPhone/Chinese-Android × T1/T2/T6/T7/T8/T9) + ADR-0005 update with measured NFR values. Full checklist: `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` §«Список user actions для разблокирования formal closure». Phase 2 code-level work can start in parallel.
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

Last session: 2026-05-14 — Plan 10 (Phase 1 closure docs) executed in **deferred-aware mode**. ADR-0005 written (`af32b77`); STATUS.md + DEVELOPMENT_PLAN.md updated (`7c8b865`); STATE.md + ROADMAP.md + REQUIREMENTS.md being updated in current session.
Stopped at: Phase 1 code-complete; formal closure deferred — see `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` §«Список user actions для разблокирования formal closure».
Resume file: `.planning/phases/01-validate-close-territory-core/01-10-SUMMARY.md` (this plan's SUMMARY, written deferred-aware).

**Next action options:**
1. **User actions** (recommended path to Phase 1 formal closure): execute the 3-step checklist in ADR-0005 — Mapbox rotation → field tests → ADR update.
2. **Phase 2 code-level start** (parallel): run `/gsd-discuss-phase 2` to begin discussing Real Health Integrations. Plans for Phase 2 can land at code-level while Phase 1 field tests are in flight, but production release of Phase 2 features is gated on Phase 1 formal closure (per ADR-0005 Consequences).

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
