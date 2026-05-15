# Project State

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-05-15 — milestone v1.0 redefined)
See: `.planning/MILESTONES.md` (milestone history + per-milestone phase progress)

**Milestone:** v1.0 Production Readiness — IN PROGRESS, **REDEFINED 2026-05-15** as 21-phase hardening scope. Earlier 8-phase feature scope superseded. Feature work (privacy zones, segments, coaching, premium, GDPR) slides to v1.1+. Target close: tagged `v1.0-rc.1` after 48h staging soak with ≥8 real runners.
**Core value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.
**Current focus:** **Phase 1 of v1.0 hardening — Release Contract & Version Baseline** (`shared` workstream). Ready for `/gsd-discuss-phase 1`.

**Brownfield note:** Codebase remains at Phase 8 / M10 code-complete on `feat/cursona-redesign` (35 commits of pre-v1.0 territory-core refactors landed under the superseded scope — kept as-is in git history; planning artifacts archived to `.planning/phases/_archive/pre-v1.0-territory-refactors/`). Pixel + iPhone field-test acceptance criteria inherited by new Phase 16 (CONTEXT skeleton seeded).

## Current Position

Phase: **2 of 21** (Secrets & config hardening) — `backend` workstream
Plan: 02-01 (SOPS+age scaffold) + 02-02 (envRequire + DEV_MODE) + 02-03 (scanners + pre-commit) executed; 02-04 (Mapbox incident + docs) pending
Status: Phase 2 substrate + scanners complete — SOPS encryption + envRequire fail-fast + gitleaks/trufflehog/pre-commit all shipped. Remaining work: ADR-0006 + Mapbox dashboard rotation (02-04, requires user action).
Last activity: 2026-05-16 — Plan 02-03 executed: `.gitleaks.toml` (extends default + 2 custom Mapbox rules + 4 allowlists), `.pre-commit-config.yaml` (pinned v8.30.1), `.trufflehog/config.yaml`, `make scan-secrets` Makefile target, `init-pre-commit.sh` idempotent installer, full-history scan (160 commits, ZERO findings via gitleaks + trufflehog), `docs/SECRETS.md ## Incident Log` skeleton. 3 atomic commits 28acb2d..9c101a4. SEC-08 closed; SEC-01 partial (CI wiring deferred to Phase 4 / CICD-01).

Progress: [▓░░░░░░░░░] ~9% of new v1.0 scope (REL-01..05 + SEC-02-substrate + SEC-05/06/08/09 delivered; 8-of-96 REQ-IDs complete, SEC-01 partial pending Phase 4 CI wiring, SEC-02 substrate-only pending 02-04 closure)
**Pre-v1.0 baseline:** 35 commits of territory-core refactors already on `feat/cursona-redesign` from the superseded scope (SessionManager, tracker hooks, closure feedback, offline region picker bounds fix, adaptive sampling + SLC, ESLint v9 + token-secret guard). These kept as-is; field-test validation moves to Phase 16.

**Next phase (gated):** Phase 2 (Secrets & config hardening) — `backend` workstream. NON-NEGOTIABLE prerequisite for all subsequent phases. **Strict no-parallelization with Phase 3** per user redline.

## Performance Metrics

**Velocity:**
- Total v1.0 hardening plans completed: 3 (Plan 01-01..03; Phase 1 wave 1+2)
- Pre-v1.0 baseline (superseded scope): 10 plans (9 code-complete + 1 deferred-aware) executed 2026-05-14, ~25-35 min per plan; commits remain on `feat/cursona-redesign`

**By Phase:**

| Phase | Plans | Total       | Avg/Plan |
|-------|-------|-------------|----------|
| 1     | 3     | ~3.5h total | ~70 min  |
| 2     | 3/4   | ~27 min so far | ~9 min   |

Plan 01-03 actual: ~75 min (single executor pass, 5 commits, 33 new tests).
Plan 02-01 actual: ~12 min (single executor pass, 3 commits, 14 created files, Pitfall 1 round-trip smoke green for dev/staging/prod).
Plan 02-02 actual: ~10 min (per 02-02-SUMMARY metrics).
Plan 02-03 actual: ~5 min (single executor pass, 3 commits 28acb2d..9c101a4; 6 created files + 2 modified; full-history scan ZERO findings).

**Recent Trend:**
- Last activity: 2026-05-16 — Plan 02-03 scanners + pre-commit shipped (SEC-08 closed; SEC-01 partial pending Phase 4 CI; commits 28acb2d..9c101a4).
- 2026-05-15 — Plan 02-01 SOPS+age scaffold shipped (SEC-02 substrate; commits 5e73162..04f44b8).
- 2026-05-15 — Plan 02-02 envRequire + DEV_MODE shipped (SEC-05/06/09; 8 services migrated, 10 new test cases).
- 2026-05-15 — Plan 01-03 Feature Flags end-to-end shipped (REL-03); Phase 1 code-complete.
- 2026-05-15 — Plan 01-02 Version Negotiation (REL-02) shipped (8 services + mobile X-Client-Version).
- 2026-05-15 — Plan 01-01 API Contract + ADR-0007 (REL-01/04/05) shipped.
- 2026-05-15 — v1.0 scope redefined; planning artifacts rewritten atomically.

*Updated after each plan completion.*

## Accumulated Context

### Decisions

Full decision log in `docs/DECISIONS/` (ADRs) and `.planning/PROJECT.md` §Key Decisions.

Recent / load-bearing decisions affecting current work:

- **ADR-0001**: Expo RN over Flutter — locked; Flutter archived.
- **ADR-0002**: Guest mode deferred.
- **ADR-0003**: OAuth Google + Apple via `AuthProvider` interface — stub-safe; backend exchange endpoints pending (in v1.0 Phase 11/12 for Strava only per HEALTH-04).
- **ADR-0004**: Feed/Stories backend do-nothing.
- **ADR-0005**: Phase 1 (old scope) field-test outcomes — Code Closeout, Deferred Validation (2026-05-14). **Now relocated**: field-test acceptance gating moved into new Phase 16 (`.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`); ADR-0005 still tracks the eventual `Accepted (closed)` flip after Phase 21 soak.
- **2026-05-15 — Milestone v1.0 redefinition**: 8-phase feature scope superseded by 21-phase hardening scope. Workstream tags `shared` | `backend` | `android` | `ios` | `mobile-shared`. Phase 2 → Phase 3 strict sequencing (SOPS-first). Mapbox 11.x migration inserted as Phase 13 (between mobile build config and native+ABI), gated on debug-build regression of all old Phase 1 tracker features. HEALTH-04 (Strava read-only OAuth) pulled into v1.0 as standalone REQ-ID with split impl (Phase 11+12) and validation (Phase 21).
- **Future ADRs scheduled in v1.0:**
  - `0006-mapbox-token-incident.md` — Phase 2: documents the dual-token rotation (deferred pk.→sk. CI token + prod runtime pk.* token) as treated-as-compromise incident
  - `0007-v1.0-release-contract.md` — Phase 1: locks mobile↔backend wire contract + version negotiation policy
  - `0008-mapbox-sdk-11-migration.md` — Phase 13: documents `@rnmapbox/maps` 10.x→11.x breaking changes and resolution

### Pending Todos

[Carry-forward from pre-v1.0 baseline — relocated into v1.0 phases]

**Old Phase 1 (superseded scope) user actions — now part of new Phase 2 + Phase 16:**

1. ☐ **Mapbox dashboard rotation** — folded into new Phase 2 SEC-03 + SEC-04 (broader incident-reset scope: BOTH deferred pk.→sk. CI token AND production runtime pk.* token; ADR-0006 to write)
2. ☐ **Field test execution** (Pixel → iPhone → Chinese-Android × T1/T2/T6/T7/T8/T9) — folded into new Phase 16 BG-01..08; acceptance criteria preserved in `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`
3. ☐ **Flip ADR-0005** to `Accepted (closed)` with measured NFR values — folded into new Phase 21 E2E-07

### Blockers/Concerns

[Issues that affect future work — see `.planning/codebase/CONCERNS.md` for full list]

**P0 items distributed across new v1.0 phases per user redline:**
- `IDENTITY_DEV_MODE=true` default → **Phase 2 SEC-05** (secrets/config hardening)
- Missing `/auth/*` rate-limit → **Phase 6 EDGE-01** (edge protection)
- OTP unconditional log → **Phase 5 OBS-04** (observability — no PII in logs)
- R18 missing `user_id` on `personal_records`/`sessions` → **Phase 7 DB-03** (zero-downtime migration; backfill strategy LOUDLY DEFERRED to `/gsd-discuss-phase 7` for agent DB inspection)

**Active branch:** `feat/cursona-redesign` IS the v1.0 line. Merge to `main` no longer a separate phase — handled in Phase 21 E2E acceptance when `v1.0-rc.1` is tagged.

## Deferred Items

Items acknowledged and carried forward:

| Category | Item | Status | Reference |
|----------|------|--------|-----------|
| Features | HEALTH-01/02/03/05/06/07/08/09/10 (HealthKit/HealthConnect/Strava write/Garmin/FIT/Sensor Sync) | v1.1 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | SOCIAL-01..03 (segments/leaderboards/zone-wars) | v1.2 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | SOCIAL-05..06 (privacy zones, visibility) | v1.1 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | COACH-01..06 (coaching & plans) | v1.3 | REQUIREMENTS.md §Deferred from v1.0 |
| Features | PREMIUM-01..06 (Stripe/RevenueCat/tiers/marketplace) | v1.4 | REQUIREMENTS.md §Deferred from v1.0 |
| Compliance | XCUT-01..06 (GDPR consent/export/RTBF/pen-test/bug-bounty) | v1.5 (public launch gate) | REQUIREMENTS.md §Deferred from v1.0 |
| i18n | XCUT-05 (RU + EN scaffolding) | v1.1 — **do not pre-wire in v1.0 code** | User redline |
| Auth | Guest mode | Deferred per ADR-0002 | — |
| Map | Mapbox Studio custom style | `outdoors-v12` fine for closed beta | — |
| Backend | Feed/Stories endpoint deprecation | Do-nothing per ADR-0004 | — |
| Platform | Web client (athlete-facing) | Out of scope | — |
| Platform | Watch native apps (Garmin IQ / watchOS) | HealthKit/Health Connect strategy | — |
| Distribution | Public TestFlight + Play Store submission | Closed beta uses internal TestFlight + self-hosted Android channel | — |
| Distribution | Hardware HSM for Android keystore | v1.1 upgrade if/when public Play Store; closed beta uses encrypted file + 2 offline backups | User decision |
| Infra | Multi-region geographic expansion | v2.0 | User decision |

## Session Continuity

Last session: 2026-05-16 — Plan 02-03 (Scanners + Pre-commit) closed end-to-end. 3 atomic commits `28acb2d..9c101a4`. Custom Mapbox `sk.`/`pk.` gitleaks rules close RESEARCH Pitfall 2; pre-commit pinned to v8.30.1; `make scan-secrets` Makefile target + `init-pre-commit.sh` idempotent installer; full-history scan via gitleaks `--log-opts="--all"` + trufflehog `--only-verified` → ZERO findings across 160 commits / 5.55 MB; `docs/SECRETS.md ## Incident Log` skeleton in place. Smoke tests: synthetic `sk.…` literal blocked (exit 1); allowlisted lint-fixture passes (exit 0); `pre-commit run gitleaks --all-files` PASSED on real repo; auto-hook fired on Task 2 + Task 3 commits, both passed.
Stopped at: 02-03 complete. SEC-08 closed. SEC-01 partial (configs + clean history scan; CI invocation deferred to Phase 4 / CICD-01). Plan 02-04 (Mapbox dashboard rotation — `autonomous: false`) is the next user-action checkpoint.
Resume file: `.planning/phases/02-secrets-and-config-hardening/02-04-PLAN-*.md` (next plan).

**Next action**: Surface 02-04 user_setup requirements (Mapbox dashboard token rotation — 5 tokens treated as compromised due to Phase 0 chat-leak) as Wave 3 checkpoint via `/gsd-execute-phase 2`.

## Artifacts Created (cumulative)

**From 2026-05-14 GSD init:**
- `.planning/config.json`
- `.planning/codebase/{STACK,INTEGRATIONS,ARCHITECTURE,STRUCTURE,CONVENTIONS,TESTING,CONCERNS}.md`

**Rewritten 2026-05-15 (milestone v1.0 redefinition):**
- `.planning/PROJECT.md` (Current Milestone section)
- `.planning/REQUIREMENTS.md` (full rewrite — 96 v1.0 REQ-IDs + Deferred section)
- `.planning/ROADMAP.md` (full rewrite — 21 phases across 5 workstreams)
- `.planning/MILESTONES.md` (v1.0 entry updated to new scope)
- `.planning/STATE.md` (this file)

**Created 2026-05-15:**
- `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md` (skeleton with inherited Pixel field-test acceptance criteria)

**Archived 2026-05-15:**
- `.planning/phases/_archive/pre-v1.0-territory-refactors/` (was `.planning/phases/01-validate-close-territory-core/` — 14 files: CONTEXT/RESEARCH/PATTERNS/DISCUSSION-LOG + 10 PLAN.md + 10 SUMMARY.md from the superseded scope)

**Future ADRs scheduled (will write as their phases execute):**
- `docs/DECISIONS/0006-mapbox-token-incident.md` (Phase 2)
- `docs/DECISIONS/0007-v1.0-release-contract.md` (Phase 1)
- `docs/DECISIONS/0008-mapbox-sdk-11-migration.md` (Phase 13)

## Source-of-Truth References

- `docs/RUNNING_ECOSYSTEM_TZ.md` — master technical spec (961 lines); §2.4 NFR table is canonical for Phase 16 acceptance numbers
- `docs/DEVELOPMENT_PLAN.md` — canonical pre-v1.0 implementation tasks (P-IDs)
- `STATUS.md` — living per-task status
- `docs/DECISIONS/` — ADR 0001..0005; future 0006/0007/0008 scheduled
- `docs/AUDIT.md`, `docs/REVIEW_ROUNDS_1-3.md` — review outputs feeding `CONCERNS.md`
- `tests/FIELD_PROTOCOL.md` — field-test capture table (541 lines, seeded by pre-v1.0 Plan 09 Task 1; consumed by new Phase 16/20)
- `.planning/phases/_archive/pre-v1.0-territory-refactors/` — superseded scope's planning artifacts, retained for historical reference
