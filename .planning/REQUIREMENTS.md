# Requirements: Running Ecosystem — Milestone v1.0 Closed Beta

**Milestone:** v1.0 Closed Beta — IN PROGRESS
**Milestone redefined:** 2026-05-20 per [ADR-0011](../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md) (was 21-phase enterprise-hardening scope from 2026-05-15)
**Core Value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.

**Scope note:** This document tracks REQ-IDs across **Phases 1-9 of the closed-beta scope**. Phases 1-5 already shipped (REL/SEC/INFRA/CICD/OBS). Phases 6-9 (SIGN/BUILD/STAB/DIST/LAUNCH) remain. Many REQ-IDs from the retired 21-phase scope are **flagged "dropped per ADR-0011"** below — preserved for audit trail, not active scope.

## v1.0 Requirements

Total: **96 REQ-IDs originally enumerated; ~64 IDs across the dropped phases are now flagged "dropped per ADR-0011"**. Active scope per current ROADMAP.md: REL-01..05 + SEC-01..09 + INFRA-01/03/05/07 + CICD-01..06 + OBS-01/03..07 (OBS-02/08 dropped or amended) + SIGN-01..02 + BUILD-01..02 + STAB-01 + DIST-01..02 + LAUNCH-01..02.

### Phase 1 — Release Contract & Version Baseline (REL)

- [x] **REL-01**: `docs/API-CONTRACT-v1.0.md` enumerates every backend endpoint mobile depends on with request/response schemas — delivered in Plan 01-01.
- [x] **REL-02**: Version negotiation header (`X-Client-Version` + server-side compatibility map) implemented on representative endpoint with documented pattern — delivered in Plan 01-02 (`pkg/clientversion` + mobile apiClient + force-update UX).
- [x] **REL-03**: `pkg/featureflags` package on backend + mirror module on mobile with v1.0 flag set — delivered in Plan 01-03 (migration 0021 + Postgres+cache+singleflight + FNV-1a rollout + identity admin CRUD + 8-service wiring + mobile Zustand+MMKV store + auth-aware refresh/clearAll).
- [x] **REL-04**: `docs/v1.0-SCOPE.md` lists IN capabilities (Territory Core, Activity Journal, Chat, Stats, Wallet, HEALTH-04 Strava read) and explicit OUT capabilities — delivered in Plan 01-01.
- [x] **REL-05**: Decision recorded in `docs/DECISIONS/0007-v1.0-release-contract.md` — delivered in Plan 01-01.

### Phase 2 — Secrets & Config Hardening (SEC)

- [ ] **SEC-01**: `gitleaks` + `trufflehog` run on full clone (`--no-shallow`) report zero findings — configs + one-time scan DONE 2026-05-16 (Plan 02-03, 0 findings across 160 commits); CI invocation deferred to Phase 4 / CICD-01
- [ ] **SEC-02**: SOPS-encrypted secrets in `.secrets/` for all 10 secret types (Mapbox public, Mapbox secret, Postgres, NATS, MinIO, Expo Push, Google OAuth, Apple OAuth, Strava OAuth, Caddy ACME)
- [ ] **SEC-03**: Mapbox token **incident reset** — rotate BOTH deferred `pk.→sk.` CI token AND production runtime `pk.*` token; old tokens REVOKED in dashboard
- [ ] **SEC-04**: `docs/DECISIONS/0006-mapbox-token-incident.md` documents the rotation as treated-as-compromise incident
- [ ] **SEC-05**: `IDENTITY_DEV_MODE=true` default removed from identity service (CONCERNS.md P0)
- [ ] **SEC-06**: 12-factor config split — no hardcoded URLs/keys/tokens in code; all via env vars sourced from SOPS
- [ ] **SEC-07**: Rotation playbooks in `docs/SECRETS.md` for all 10 secret types
- [x] **SEC-08**: Pre-commit hook scanning for AWS/AKIA/GitHub PAT/Mapbox `sk.` patterns — DONE 2026-05-16 (Plan 02-03, commits 28acb2d..9c101a4)
- [ ] **SEC-09**: Secret loading audit: every Go service starts with SOPS-decrypt-on-boot, never with inline values

### Phase 3 — Infrastructure as Code (INFRA)

> **Scope pivot 2026-05-17:** User clarified that no Hetzner Cloud account exists — only an SSH-accessible Linux VPS at the prod address. INFRA-02 and INFRA-04 (Terraform / cloud-API + TF state backend) deferred to v1.1; INFRA-06 (Sentry VPS provisioning) moved to Phase 5. INFRA-01/03/05/07 reworded for provider-agnostic Ansible-only scope.

- [ ] **INFRA-01**: `infra/ansible/` playbooks idempotently install Caddy + Postgres+TimescaleDB + Redis + NATS + MinIO + 8 Go service containers (identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph) under a single `sport-stack.service` systemd umbrella on the prod VPS
- [ ] **INFRA-02**: **DEFERRED to v1.1** — Pivoted 2026-05-17 to provider-agnostic VPS scope; no cloud-API provisioning in v1.0. Will revisit if migrating to a cloud-API provider in v1.1.
- [ ] **INFRA-03**: Environments `dev` (localhost docker-compose, no Ansible) + `prod` (existing VPS) with inventory in `infra/ansible/inventory/{dev,prod}/`. Staging deferred to v1.1.
- [ ] **INFRA-04**: **DEFERRED to v1.1** — No Terraform in v1.0 post-pivot (2026-05-17). Will revisit alongside INFRA-02.
- [ ] **INFRA-05**: UFW (OS-level) firewall rules explicit; no `0.0.0.0/0` except documented (443 Caddy + 22 from dev IPs). NATS 4222 / Postgres 5432 / Redis 6379 / MinIO 9000 closed to public (internal-only via docker network — defense in depth with UFW).
- [ ] **INFRA-06**: **MOVED to Phase 5** — Sentry self-hosted requires additional VPS; provisioning decision (colocate on prod VPS vs separate VPS) belongs in Phase 5 alongside Sentry install. Phase 5 owner decides.
- [ ] **INFRA-07**: Fresh deploy from `git clone` to all services running in <60 minutes (measured on existing prod VPS first-clean-Ansible-deploy, documented in `docs/RUNBOOKS/deploy.md` §9)

### Phase 4 — CI/CD Pipeline (CICD)

- [ ] **CICD-01**: GitHub Actions matrix on every PR — Go `test -race`, `golangci-lint`, `gosec`, `semgrep`, `govulncheck`, Docker multi-stage build, Trivy image scan
- [ ] **CICD-02**: Container images signed with `cosign` and pinned to SHA256 digests in production manifests (no `latest` ever)
- [ ] **CICD-03**: SLSA-style build provenance attestation attached to each release tag
- [ ] **CICD-04**: **Rollback drill validated with real DB migration in path** — deploy N+1 with migration → `make rollback v=N` reverts service AND runs down-migration → integration test confirms restored state (no-op rollback doesn't count, per user redline)
- [ ] **CICD-05**: Deployment freeze toggle runbook step pauses CD on incident declaration
- [ ] **CICD-06**: Branch protection requires all matrix checks passing

### Phase 5 — Observability Backend (OBS)

- [x] **OBS-01**: Sentry self-hosted on separate Hetzner VPS at `sentry.<domain>` with separate ACME cert, NOT behind same Caddy as app — **AMENDED per ADR-0010 (SaaS) + ADR-0010 amendment 2026-05-19 PM (D-38 dormant substrate):** SDK code paths wired-and-dormant via Plan 05-05 (commits a7831c3..5f1e276); empty-DSN guard short-circuits both `MustInitSentry` and `MustInitTracer` with INFO log. Activation post-v1.0 = SOPS edit к populate SENTRY_DSN_BACKEND + redeploy (no code change).
- [ ] **OBS-02**: 4 Sentry projects scoped: `staging-mobile`, `prod-mobile`, `staging-backend`, `prod-backend` — **DEFERRED post-v1.0** per ADR-0010 amendment (Sentry SaaS org + 4 projects = USER ACTION outside v1.0 scope)
- [x] **OBS-03**: Structured JSON logs (Zap or slog) on all Go services with level tags — **DONE Plan 05-03** (slog handler + PII scrub + 8-service wire; commits 6dfcef3..ea1e65d)
- [x] **OBS-04**: **OTP codes never logged** (CONCERNS.md P0 closes under "no PII in logs" rule) — **DONE Plan 05-03** (otp.go logOTPIssued helper + defense-in-depth gating at 3 layers; commit 320975c)
- [x] **OBS-05**: Prom metrics at `/metrics` per service; Grafana dashboards for P99 latency, error rate, queue depth, JWT-validation failures — **DONE Plan 05-04** (metrics.go + promhttp_middleware.go + 3 dashboards JSON + 8-service wire; commits 975a048..515ca90)
- [x] **OBS-06**: **No GPS coordinates, phone numbers, displayName, DM content, external_uuid in logs** — verified via grep audit + runtime sample inspection — **slog scrub + CI grep DONE Plan 05-03; OTel span scrub DONE Plan 05-05 (piiScrubProcessor reuses PIIDenyList per D-21); runtime sampling probe pending Plan 05-06**
- [x] **OBS-07**: Cardinality budget — no per-`user_id` labels on metrics; bucketed cohorts only; verified via Prom label-cardinality probe — **DONE Plan 05-04** (`scripts/cardinality_probe.py` + CI gate + branch protection 10 required checks)
- [ ] **OBS-08**: Tester-mode debug-logging opt-in per session via Settings toggle with explicit RU consent banner — **PENDING Plan 05-06** (DebugSessionMiddleware; backend seam ready in `slog_handler.go` via `WithLogLevel(ctx, lvl)` / `LogLevelFromContext(ctx)`)

---

## Active New-Scope Requirements (Phases 6-9 per ADR-0011)

### Phase 6 — Release Signing (SIGN)

- [ ] **SIGN-01**: Android release keystore — generated offline (single workstation, deleted from disk after encryption); encrypted to `.secrets/android-release.keystore.sops`; **2 offline physical backups in separate physical locations**; recovery playbook in `docs/SECRETS.md` §"Android Keystore Loss"
- [ ] **SIGN-02**: iOS Apple Developer Program enrolled; distribution certificate (private key in SOPS); distribution provisioning profile for app bundle ID; ASC API key (P8 file) in SOPS for unattended TestFlight uploads; EAS-managed-credentials vs fastlane-Match decision in `docs/SECRETS.md` §"iOS signing"

### Phase 7 — Release Builds + Mobile Stability (BUILD + STAB)

- [ ] **BUILD-01**: EAS `production` profile (Android) — points at production backend; R8 + ProGuard verified (no strip Mapbox JNI / MMKV / react-native-health JNI / Hermes / expo-task-manager); `arm64-v8a` only (drop `armeabi-v7a` per ADR-0011)
- [ ] **BUILD-02**: EAS `production` profile (iOS) — Hermes enabled, bitcode disabled, staging↔prod flavor switching, iOS 16+ baseline
- [ ] **STAB-01**: Background reliability — Android foreground service notification visible; iOS SLC fallback works on app foregrounding; MIUI + One UI mitigations only (in-app auto-start dialog + battery-saver-kill recovery via `recoverLast`); 4-vendor matrix from old Phase 16 deferred — monitor remaining vendors during beta. 1-hour pocket-walk session on Pixel + iPhone records ≥95% of expected GPS points.

### Phase 8 — Closed-Beta Distribution (DIST)

- [ ] **DIST-01**: Android self-hosted update channel — Caddy serves `/android/manifest.json` (Ed25519-signed) with latest version + APK signed-URL + min-supported-version + force-update flag; APKs on Hetzner Storage Box behind 24h signed URLs (regenerated per request); in-app check-on-launch + Settings "Check for updates" both verify signature; force-update path blocks app usage when `min-supported > installed`
- [ ] **DIST-02**: iOS TestFlight pipeline — `.github/workflows/ios-release.yml` triggers on `v1.0-*` tags; auto-bumps CFBundleVersion; uploads to internal TestFlight group via ASC API; closed-beta testers seeded by Apple ID

### Phase 9 — Closed-Beta Launch (LAUNCH)

- [ ] **LAUNCH-01**: Solo-dev smoke — tag `v1.0.0-beta.1` → CI publishes Android APK to Caddy manifest + iOS build to TestFlight internal group; install on own Android + own/friend iPhone; complete 1 full GPS-track session per platform; no crashes; no data loss
- [ ] **LAUNCH-02**: Closed-beta watchlist — invite 5-10 testers (TestFlight + Android manifest URL); 72h triage via `scripts/debug-tail.sh <user-id>` (Loki on `srv1561293`); feedback intake decided in plan (GitHub Issues template OR Telegram channel); P0 surfaces → hotfix → re-tag → re-distribute; ship-when-stable (no formal soak gate)

---

## Dropped per ADR-0011 (preserved for audit trail)

The following REQ-IDs were defined in the 21-phase enterprise-hardening scope and are **dropped from v1.0 closed-beta scope** per [ADR-0011](../docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md). Not deleted — kept for audit traceability and re-expansion triggers documented in ROADMAP.md.

### Dropped: Phase 6 (was Edge Protection & Rate-Limiting) — EDGE-*

- ~~EDGE-01..05~~ — **DROPPED per ADR-0011.** Residual risk: `/auth/*` rate-limit gap (CONCERNS.md P0). Mitigation: closed-beta blast radius = 5-10 friend testers. Logged in ROADMAP.md v1.0.1 backlog as `AUTH-RATELIMIT`.

### Dropped: Phase 7 (was DB + Queues + State Ops) — DB-*

- ~~DB-01..08~~ — **DROPPED per ADR-0011.** Residual risk: no proven pgBackRest restore drill; no dead-letter queue; no schema-drift CI detection beyond what shipped in Phase 4 CICD; NATS durability audit deferred. Mitigation: `pg_dump` snapshot before each migration (already in `docs/RUNBOOKS/deploy.md §6.4`); DB-03 R18 `user_id` zero-downtime migration deferred to v1.0.x if/when needed.

### Dropped: Phase 8 (was Load + Chaos Baselines) — LOAD-*

- ~~LOAD-01..06~~ — **DROPPED per ADR-0011.** Residual risk: no load profile, no chaos drill, no perf baseline. Mitigation: 5-10 testers won't hit limits. Re-expand if beta passes >50 users.

### Renamed: Phase 9-10 (was Android+iOS Release Signing) — AND-SIGN-* / IOS-SIGN-* → consolidated as **SIGN-01..02** (above)

- ~~AND-SIGN-01..05~~ → consolidated into **SIGN-01** above (5 ID granularity → 1 acceptance gate; keystore + 2 offline backups + recovery playbook are the load-bearing items; SLSA provenance attestation explicitly best-effort per ADR-0011)
- ~~IOS-SIGN-01..05~~ → consolidated into **SIGN-02** above

### Renamed/Reduced: Phase 11-12 (was Android+iOS Release Build Config) — AND-BUILD-* / IOS-BUILD-* → consolidated as **BUILD-01..02** (above)

- ~~AND-BUILD-01..06~~ → consolidated into **BUILD-01** above. Dropped sub-IDs: `AND-BUILD-03` (resource shrinking measurement — nice-to-have); `AND-BUILD-05` (Sentry symbol upload — mobile Sentry dropped per CRASH-* drop); `AND-BUILD-06` (reproducible-build byte-identical verification — funded-team rigor, not closed-beta gate).
- ~~IOS-BUILD-01..05~~ → consolidated into **BUILD-02** above. Dropped sub-IDs: `IOS-BUILD-05` (reproducible-build verification, same reason).

### Dropped: HEALTH-04 (was shared Phase 11+12 + Phase 21 validation)

- ~~HEALTH-04~~ — **DROPPED per ADR-0011.** Strava read-only OAuth integration deferred to v1.1. Mitigation: closed-beta testers can import historical data manually if interested; not a launch-gate feature.

### Dropped: Phase 13 (was Mapbox SDK 11.x Migration) — MAPBOX11-*

- ~~MAPBOX11-01..05~~ — **DROPPED per ADR-0011.** Stay on `@rnmapbox/maps@^10.3` for closed beta. Residual risk: no known native crashes at 10.3; SDK 11 has API breaks unrelated to stability gains. Re-expand if 10.3 hits an EOL or security advisory.

### Dropped: Phase 14-15 (was Native + ABI Matrix) — AND-NATIVE-* / IOS-NATIVE-*

- ~~AND-NATIVE-01..05~~ — **DROPPED per ADR-0011.** `arm64-v8a` only (per **BUILD-01** above). No 16KB page-size validation for Android 15+ — risk reviewed if tester reports Android 15+ failure.
- ~~IOS-NATIVE-01..03~~ — **DROPPED per ADR-0011.** arm64 + iOS 16+ baseline kept in **BUILD-02**; multi-device-class validation reduced to "works on dev's phone + friend's phone" per LAUNCH-01.

### Reduced: Phase 16 (was Background Reliability) — BG-* → folded into STAB-01 (above)

- ~~BG-01..02~~ (Pixel + iPhone full NFR matrix on release builds) → reduced to **STAB-01** "1h pocket-walk records ≥95% of expected GPS points" (single threshold instead of 6 NFRs × 2 platforms)
- ~~BG-03~~ (Xiaomi MIUI/HyperOS) → kept as MIUI mitigation in **STAB-01**
- ~~BG-04~~ (Huawei EMUI no-GMS) → **DROPPED.** Monitor during beta; mitigate if a tester surfaces it
- ~~BG-05~~ (Samsung One UI) → kept as One UI mitigation in **STAB-01**
- ~~BG-06..08~~ (Generic Doze, low-end memory, iOS SLC) → SLC kept in **STAB-01**; Doze + low-end-memory monitored in beta

### Dropped: Phase 17 (was Crash Reporting) — CRASH-*

- ~~CRASH-01..06~~ — **DROPPED per ADR-0011.** No mobile Sentry SDK in v1.0. Backend Sentry already dormant per D-38. Crashes surface via tester reports + Loki tails (`scripts/debug-tail.sh`). Re-expand if beta passes >50 users.

### Renamed: Phase 18-19 (was Distribution) — AND-DIST-* / IOS-DIST-* → consolidated as **DIST-01..02** (above)

- ~~AND-DIST-01..06~~ → consolidated into **DIST-01** above. Dropped sub-ID: `AND-DIST-06` (crash-rate auto-halt — depends on mobile Sentry which was dropped).
- ~~IOS-DIST-01..04~~ → consolidated into **DIST-02** above. Dropped sub-ID: `IOS-DIST-04` (Sentry crash integration + ASC review-rejection alerts — mobile Sentry dropped; ASC review applies to public submission, not internal TestFlight).

### Dropped: Phase 20 (was Device Matrix + Physical Tests) — DEVICES-*

- ~~DEVICES-01..08~~ — **DROPPED per ADR-0011.** Solo dev = 2 devices (own Android + own/friend iPhone). Testers contribute ~5-10 additional devices total. No structured 8-class protocol; vendor-specific failures discovered by tester reports.

### Dropped: Phase 21 (was Staging E2E + Go/No-Go) — E2E-*

- ~~E2E-01~~ (Hetzner staging in <60min) — **DROPPED per ADR-0011.** No separate staging; prod = single VPS shipped in Phase 3.
- ~~E2E-02~~ (≥8 real runners, ≥2 de-Googled, ≥1 MIUI) — **DROPPED per ADR-0011.** Replaced by LAUNCH-02 (5-10 friend testers, no enforced device-class distribution).
- ~~E2E-03~~ (48h soak + Strava + zero P0/P1) — **DROPPED per ADR-0011.** Replaced by LAUNCH-02 72h watchlist with ship-when-stable policy (no formal soak gate).
- ~~E2E-04~~ (restore drill re-verified) — **DROPPED per ADR-0011.** DB-* dropped; `pg_dump` snapshot policy substitutes.
- ~~E2E-05~~ (rollback drill re-verified) — **DROPPED.** Drill already passed on prod 2026-05-18 (Phase 4 CICD-04); no re-verification gate.
- ~~E2E-06~~ (on-call rotation + SLA + fallback) — **DROPPED per ADR-0011.** Solo dev = no on-call rotation; if asleep, P0 surfaces in the morning.
- ~~E2E-07~~ (tag `v1.0-rc.1`) — **REPLACED** by LAUNCH-01 tag `v1.0.0-beta.1`.

---

## Deferred from v1.0 (preserved REQ-IDs from earlier scope)

Per user redline: "Old REQ-IDs (except HEALTH-04) move to v1.1+ in REQUIREMENTS.md under a clearly-marked 'Deferred from v1.0' section — don't delete, mark deferred with reason."

### Phase 1 Field Validation — RESOLVED VIA NEW PHASE 16

- ~~**PHASE1-01..14**~~ — **Resolved via new Phase 16** (Background Reliability in Release). Pixel/iPhone field-test acceptance criteria copied verbatim into `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`. Old Phase 1 code refactor commits (35 commits) remain on `feat/cursona-redesign`.

### Health Platform & Integrations (HEALTH) — except HEALTH-04 carried into v1.0

| REQ-ID | Description | Deferred Reason |
|--------|-------------|-----------------|
| **HEALTH-01** | HealthKit READ workouts since timestamp (P7-A-01) | v1.1 — Strava read covers closed-beta need; Apple Health write integration adds platform-specific complexity not justified for v1.0 soak |
| **HEALTH-02** | Write our sessions to Apple Health (P7-A-02) | v1.1 — bidirectional sync is a v1.1 feature |
| **HEALTH-03** | Real HealthConnect Android 14+ (P7-A-03) | v1.1 — same justification as HEALTH-02 |
| ~~**HEALTH-04**~~ | ~~Strava read-only OAuth (P7-A-04)~~ | **Pulled INTO v1.0** — registered above as standalone REQ-ID |
| **HEALTH-05** | Strava webhooks → backend → mobile push | v1.1 — write+webhooks together |
| **HEALTH-06** | Garmin Connect ingest (P7-A-05) | v1.1 — gated API; complex onboarding |
| **HEALTH-07** | Backend FIT parser (P7-A-06) | v1.1 — depends on Garmin |
| **HEALTH-08** | Sensor Sync service on backend (P7-A-07) | v1.1 — orchestrator for HEALTH-05..07 |
| **HEALTH-09** | LTHR test wizard (30-min all-out) | v1.1 — not user-facing critical |
| **HEALTH-10** | Aggregate `avg_hr_bpm` across pauses | v1.1 — correctness improvement |

### Phase 8 Social — Deferred Items (SOCIAL)

| REQ-ID | Description | Deferred Reason |
|--------|-------------|-----------------|
| **SOCIAL-01** | Segments — geo-defined route portions | v1.2 — game mechanic, not v1.0 hardening |
| **SOCIAL-02** | Segment leaderboards | v1.2 — depends on SOCIAL-01 |
| **SOCIAL-03** | Territory / zone-wars game mechanic | v1.2 — game mechanic |
| **SOCIAL-04** | Cursona-redesign wrap (feed ranking, people search, etc.) | v1.0.x — work already shipped on `feat/cursona-redesign`; merge to `main` handled in Phase 21 E2E acceptance (branch IS the v1.0 line) |
| **SOCIAL-05** | Privacy zones (home/work mask) | v1.1 — privacy feature, not closed-beta hardening |
| **SOCIAL-06** | Per-session visibility (private/followers/public) | v1.1 — same as SOCIAL-05 |

### Coaching & Plans (COACH)

| REQ-ID | Description | Deferred Reason |
|--------|-------------|-----------------|
| **COACH-01..06** | Coach role + link + plan builder + dashboard + per-workout feedback | v1.3 — major feature surface, requires its own milestone scope |

### Premium & Marketplace (PREMIUM)

| REQ-ID | Description | Deferred Reason |
|--------|-------------|-----------------|
| **PREMIUM-01..06** | Stripe + RevenueCat + tiers + feature gating + marketplace + receipt validation | v1.4 — monetization is post-launch decision |

### Cross-Cutting (XCUT)

| REQ-ID | Description | Deferred Reason |
|--------|-------------|-----------------|
| **XCUT-01** | GDPR consent flow on signup | v1.5 — required for public launch, not closed beta |
| **XCUT-02** | Data export — full user data dump | v1.5 — required for public launch |
| **XCUT-03** | Right-to-be-forgotten — full account deletion | v1.5 — required for public launch |
| **XCUT-04** | Penetration test before public launch | v1.5 — gates public launch, not closed beta (v1.0 has "zero critical/high CI scans" via Phase 4 instead) |
| **XCUT-05** | i18n infrastructure (RU + EN strings) | v1.1 — RU-only is acceptable for closed beta per user decision; **do not pre-wire i18n scaffolding in v1.0 code** per user redline |
| **XCUT-06** | Bug bounty program | v1.5 — public-launch gate |
| **XCUT-07** | Dependabot / Snyk weekly | **Partially v1.0** — covered by Phase 4 CICD-01 security scanning (gosec/semgrep/govulncheck/trivy); full weekly cadence is v1.1 nice-to-have |
| **XCUT-08** | CI performance regression tests | **Partially v1.0** — covered by Phase 8 LOAD-06 (nightly k6 on staging with regression alerts); broader CI-perf-regression matrix v1.1 |

## Out of Scope (Hard No)

| Feature | Reason |
|---------|--------|
| Web client (athlete-facing) | Mobile-first; web admin already exists for moderation only |
| Flutter mobile codebase | Archived per `DECISION.md`; no parallel development |
| Guest mode | Deferred per ADR-0002 |
| Mapbox Studio custom style | Standard `outdoors-v12` is fine for closed beta |
| Public TestFlight / Play Store submission | Closed beta uses internal TestFlight + self-hosted Android channel; public submission is a separate post-v1.0 milestone |
| Server geographic expansion | Single Hetzner VPS for v1.0 closed beta; multi-region is v2.0 |
| Cycling-first features | Sport-agnostic but running-primary; no cycling-specific analytics |
| Real-time live tracking | Privacy + battery cost unclear; revisit post-v1.0 |
| Smart watch native app | Integration via HealthKit/Health Connect/FIT (when shipped); standalone watch app deferred |

## Traceability

**Active closed-beta coverage (per ADR-0011):**

| Requirement Range | Phase | Status |
|-------------------|-------|--------|
| REL-01..05 | Phase 1: Release contract | **Complete** 2026-05-15 (Plans 01-01..03) |
| SEC-01..09 | Phase 2: Secrets hardening | **Complete** 2026-05-16 (Plans 02-01..04) |
| INFRA-01/03/05/07 | Phase 3: IaC | **Complete** 2026-05-17 (Plans 03-01..03; -02/-04 deferred v1.1, -06 moved Phase 5) |
| CICD-01..06 | Phase 4: CI/CD | **Complete** 2026-05-18 (Plans 04-01..06). Cosign/SLSA kept wired, best-effort per ADR-0011. |
| OBS-01/03..07 | Phase 5: Observability backend | **Complete** 2026-05-20 (Plans 05-02..07). OBS-02 deferred per ADR-0010; OBS-08 mobile UX dropped per ADR-0011 (backend seam shipped; env-allowlist refactor lazy). |
| SIGN-01..02 | Phase 6: Release signing | Pending |
| BUILD-01..02 + STAB-01 | Phase 7: Release builds + mobile stability | Pending |
| DIST-01..02 | Phase 8: Closed-beta distribution | Pending |
| LAUNCH-01..02 | Phase 9: Closed-beta launch | Pending |

**Dropped per ADR-0011 (preserved above for audit trail):** EDGE-01..05, DB-01..08, LOAD-01..06, AND-SIGN-01..05, IOS-SIGN-01..05, AND-BUILD-01..06, IOS-BUILD-01..05, HEALTH-04, MAPBOX11-01..05, AND-NATIVE-01..05, IOS-NATIVE-01..03, BG-01..08, CRASH-01..06, AND-DIST-01..06, IOS-DIST-01..04, DEVICES-01..08, E2E-01..07.

**Re-expansion triggers:** revisit the dropped section if (a) beta passes >50 users, (b) a P0 incident exposes a dropped phase's gap, OR (c) team grows beyond 1 dev. See ROADMAP.md "Archived Phases" + ADR-0011 §Re-expansion triggers.

---

*Requirements rewritten: 2026-05-20 per ADR-0011 (was 21-phase enterprise-hardening scope from 2026-05-15)*
*Replaces earlier feature-focused v1.0 scope (2026-05-14) — the 2026-05-15 21-phase scope was an interstitial overshoot*
*Old `docs/DEVELOPMENT_PLAN.md` task IDs (`P<phase>-<section>-<number>`) remain canonical implementation breakdown where applicable; new REQ-IDs above provide GSD-side traceability for the closed-beta scope.*
