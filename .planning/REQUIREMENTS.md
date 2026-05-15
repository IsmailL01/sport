# Requirements: Running Ecosystem — Milestone v1.0 Production Readiness

**Milestone:** v1.0 Production Readiness — IN PROGRESS
**Milestone redefined:** 2026-05-15 (replacing earlier feature-focused v1.0 scope)
**Core Value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.

**Scope note:** This document covers **v1.0 hardening work** — taking the Phase 8/M10 code-complete baseline through infra automation, signed release builds, observability without PII leak, and a tagged release after 48h staging soak. Feature work (privacy zones, segments, coaching, premium, GDPR consent flow) is **explicitly out of v1.0** and tracked under §Deferred from v1.0.

## v1.0 Requirements

Total: **96 REQ-IDs across 21 phases**.

### Phase 1 — Release Contract & Version Baseline (REL)

- [ ] **REL-01**: `docs/API-CONTRACT-v1.0.md` enumerates every backend endpoint mobile depends on with request/response schemas
- [ ] **REL-02**: Version negotiation header (`X-Client-Version` + server-side compatibility map) implemented on representative endpoint with documented pattern
- [ ] **REL-03**: `pkg/featureflags` package on backend + mirror module on mobile with v1.0 flag set
- [ ] **REL-04**: `docs/v1.0-SCOPE.md` lists IN capabilities (Territory Core, Activity Journal, Chat, Stats, Wallet, HEALTH-04 Strava read) and explicit OUT capabilities
- [ ] **REL-05**: Decision recorded in `docs/DECISIONS/0007-v1.0-release-contract.md`

### Phase 2 — Secrets & Config Hardening (SEC)

- [ ] **SEC-01**: `gitleaks` + `trufflehog` run on full clone (`--no-shallow`) report zero findings
- [ ] **SEC-02**: SOPS-encrypted secrets in `.secrets/` for all 10 secret types (Mapbox public, Mapbox secret, Postgres, NATS, MinIO, Expo Push, Google OAuth, Apple OAuth, Strava OAuth, Caddy ACME)
- [ ] **SEC-03**: Mapbox token **incident reset** — rotate BOTH deferred `pk.→sk.` CI token AND production runtime `pk.*` token; old tokens REVOKED in dashboard
- [ ] **SEC-04**: `docs/DECISIONS/0006-mapbox-token-incident.md` documents the rotation as treated-as-compromise incident
- [ ] **SEC-05**: `IDENTITY_DEV_MODE=true` default removed from identity service (CONCERNS.md P0)
- [ ] **SEC-06**: 12-factor config split — no hardcoded URLs/keys/tokens in code; all via env vars sourced from SOPS
- [ ] **SEC-07**: Rotation playbooks in `docs/SECRETS.md` for all 10 secret types
- [ ] **SEC-08**: Pre-commit hook scanning for AWS/AKIA/GitHub PAT/Mapbox `sk.` patterns
- [ ] **SEC-09**: Secret loading audit: every Go service starts with SOPS-decrypt-on-boot, never with inline values

### Phase 3 — Infrastructure as Code (INFRA)

- [ ] **INFRA-01**: `infra/ansible/` playbooks idempotently install Caddy + Postgres+TimescaleDB + Redis + NATS + MinIO + 6 Go service systemd units
- [ ] **INFRA-02**: `infra/terraform/` manages Hetzner Cloud resources (VPS hosts, Storage Box, DNS, firewall)
- [ ] **INFRA-03**: Environments `dev` / `staging` / `prod` with inventory in `infra/ansible/inventory/{env}/`
- [ ] **INFRA-04**: Terraform state in Hetzner Storage Box with remote locking; never in repo
- [ ] **INFRA-05**: Network firewall rules explicit; no `0.0.0.0/0` except documented (443, 4222, presigned MinIO)
- [ ] **INFRA-06**: Separate VPS provisioned for Sentry with separate DNS `sentry.<domain>` and separate ACME cert (isolation per user redline)
- [ ] **INFRA-07**: Fresh deploy from `git clone` to all services running in <60 minutes (measured, documented in `docs/RUNBOOKS/deploy.md`)

### Phase 4 — CI/CD Pipeline (CICD)

- [ ] **CICD-01**: GitHub Actions matrix on every PR — Go `test -race`, `golangci-lint`, `gosec`, `semgrep`, `govulncheck`, Docker multi-stage build, Trivy image scan
- [ ] **CICD-02**: Container images signed with `cosign` and pinned to SHA256 digests in production manifests (no `latest` ever)
- [ ] **CICD-03**: SLSA-style build provenance attestation attached to each release tag
- [ ] **CICD-04**: **Rollback drill validated with real DB migration in path** — deploy N+1 with migration → `make rollback v=N` reverts service AND runs down-migration → integration test confirms restored state (no-op rollback doesn't count, per user redline)
- [ ] **CICD-05**: Deployment freeze toggle runbook step pauses CD on incident declaration
- [ ] **CICD-06**: Branch protection requires all matrix checks passing

### Phase 5 — Observability Backend (OBS)

- [ ] **OBS-01**: Sentry self-hosted on separate Hetzner VPS at `sentry.<domain>` with separate ACME cert, NOT behind same Caddy as app
- [ ] **OBS-02**: 4 Sentry projects scoped: `staging-mobile`, `prod-mobile`, `staging-backend`, `prod-backend`
- [ ] **OBS-03**: Structured JSON logs (Zap or slog) on all Go services with level tags
- [ ] **OBS-04**: **OTP codes never logged** (CONCERNS.md P0 closes under "no PII in logs" rule)
- [ ] **OBS-05**: Prom metrics at `/metrics` per service; Grafana dashboards for P99 latency, error rate, queue depth, JWT-validation failures
- [ ] **OBS-06**: **No GPS coordinates, phone numbers, displayName, DM content, external_uuid in logs** — verified via grep audit + runtime sample inspection
- [ ] **OBS-07**: Cardinality budget — no per-`user_id` labels on metrics; bucketed cohorts only; verified via Prom label-cardinality probe
- [ ] **OBS-08**: Tester-mode debug-logging opt-in per session via Settings toggle with explicit RU consent banner

### Phase 6 — Edge Protection & Rate-Limiting (EDGE)

- [ ] **EDGE-01**: `/auth/login`, `/auth/register`, `/auth/otp/*` rate-limited 5/min per IP via `pkg/ratelimit` (closes CONCERNS.md P0)
- [ ] **EDGE-02**: Existing rate limits (feed/messaging/social-graph) re-verified under k6 load; no Redis-down false-allows
- [ ] **EDGE-03**: Caddy WAF rules block bad UAs, scanners, malformed TLS, rate-limit unauth at edge
- [ ] **EDGE-04**: Anti-replay budget on JWT (jti + Redis dedup with TTL)
- [ ] **EDGE-05**: DDoS mitigation strategy documented in `docs/RUNBOOKS/incident-response.md`

### Phase 7 — DB + Queues + State Ops (DB)

- [ ] **DB-01**: pgBackRest configured for daily full + continuous WAL archiving to Hetzner Storage Box, 30-day retention, encrypted at rest
- [ ] **DB-02**: **Restore drill proven on clean VPS** — fresh VPS, install Postgres+Timescale, pgBackRest restore from Storage Box, verify schema + sample data, time-to-restore <30 min. No deferral (per user redline).
- [ ] **DB-03**: R18 zero-downtime migration adds `user_id` to `personal_records` + `sessions`. **Backfill strategy loudly deferred to `/gsd-discuss-phase 7`** — agent inspects schema + row counts before choosing (a) `users.email` join, (b) JWT log archive backfill, (c) hybrid with `orphaned=true` flag
- [ ] **DB-04**: NATS JetStream durability config audit; retention/max-age/replicas documented in `docs/RUNBOOKS/nats-ops.md`
- [ ] **DB-05**: MinIO bucket policies tightened — presigned URL expiry ≤24h, max upload size, public buckets gated by Caddy auth
- [ ] **DB-06**: Schema-drift detection in CI — `golang-migrate version` vs DB mismatch fails build
- [ ] **DB-07**: `docs/RUNBOOKS/db-ops.md` covers routine backup verification, PITR, replication setup (deferred docs for v1.1)
- [ ] **DB-08**: Dead-letter queue for failed NATS messages with admin UI access via `/admin/`

### Phase 8 — Load + Chaos Baselines (LOAD)

- [ ] **LOAD-01**: k6 scenarios in `infra/loadtest/` — feed scroll (100 users × 10min), session save burst (10 simultaneous 5000-pt payloads), realtime push fanout (100 stories → 1000 followers), auth burst (1000 logins / 10min)
- [ ] **LOAD-02**: Chaos drill — kill `messaging` mid-conversation, mobile clients reconnect within SLO (<30s)
- [ ] **LOAD-03**: Partition test — simulate social-graph ↔ feed network partition, verify graceful degradation
- [ ] **LOAD-04**: Baselines published in `docs/PERF-BASELINE.md` with P50/P95/P99 per endpoint
- [ ] **LOAD-05**: Reconnect storm — kill `realtime-gw`, 100 clients reconnect, measure recovery latency
- [ ] **LOAD-06**: Load-test integration with CI — nightly run on staging, regression alerts via Grafana

### Phase 9 — Android Release Signing (AND-SIGN)

- [ ] **AND-SIGN-01**: Release keystore generated offline (air-gapped or single workstation, immediately deleted from disk after encryption)
- [ ] **AND-SIGN-02**: Encrypted keystore in `.secrets/android-release.keystore.sops`; Git history clean
- [ ] **AND-SIGN-03**: Two offline physical backups in separate physical locations (per user redline)
- [ ] **AND-SIGN-04**: Recovery playbook in `docs/SECRETS.md` §"Android Keystore Loss" with explicit steps; keystore loss = app dies (critical)
- [ ] **AND-SIGN-05**: Reproducible build flags set; SLSA provenance attestation included in CI artifacts

### Phase 10 — iOS Release Signing (IOS-SIGN)

- [ ] **IOS-SIGN-01**: Apple Developer Program enrolled and verified
- [ ] **IOS-SIGN-02**: Distribution certificate generated, private key encrypted in SOPS
- [ ] **IOS-SIGN-03**: Distribution provisioning profile generated for app bundle ID, refresh automation documented
- [ ] **IOS-SIGN-04**: App Store Connect API key (P8 file) stored in SOPS for unattended CI uploads
- [ ] **IOS-SIGN-05**: EAS-managed credentials OR fastlane Match approach decided + documented in `docs/SECRETS.md`

### Phase 11 — Android Release Build Config (AND-BUILD + HEALTH-04 Android side)

- [ ] **AND-BUILD-01**: EAS profile `production` in `apps/mobile-rn/eas.json` points at production backend; `staging` profile points at staging
- [ ] **AND-BUILD-02**: R8 + ProGuard rules tested — do NOT strip Mapbox SDK JNI, MMKV native, react-native-health JNI, expo-task-manager background classes, Hermes runtime
- [ ] **AND-BUILD-03**: Resource shrinking enabled; APK size measured baseline vs after
- [ ] **AND-BUILD-04**: BuildConfig surfaces clean — no `__DEV__` true in release, no `EXPO_PUBLIC_*_LOCAL` debug flags
- [ ] **AND-BUILD-05**: Debug symbols uploaded to Sentry on CI; not bundled in APK
- [ ] **AND-BUILD-06**: Reproducible build verified — two CI runs of same tag produce byte-identical APK (modulo signature)

### Phase 12 — iOS Release Build Config (IOS-BUILD + HEALTH-04 iOS side)

- [ ] **IOS-BUILD-01**: EAS profile `production` for iOS targets production backend; `staging` for staging
- [ ] **IOS-BUILD-02**: Hermes engine enabled (SDK 54 default verified)
- [ ] **IOS-BUILD-03**: Bitcode disabled (Xcode 14+)
- [ ] **IOS-BUILD-04**: BuildConfig + Info.plist clean for release (no dev-mode flags, no NSAllowsLocalNetworking in prod)
- [ ] **IOS-BUILD-05**: Reproducible build verified — two CI runs of same tag produce byte-identical IPA (modulo signature)

### Strava Read-Only OAuth — shared between Phase 11 + Phase 12, validated in Phase 21 (HEALTH)

- [ ] **HEALTH-04**: Strava read-only OAuth — PKCE flow on iOS + Android (no client_secret on device), backend `/integrations/strava/{exchange,refresh}` endpoints, READ scope (`activity:read`) only. Implementation code in Phase 11 (Android side) + Phase 12 (iOS side); validation in Phase 21 staging soak ("≥1 tester connects Strava and imports historical data"). *(Registered as standalone REQ-ID per user redline — not embedded silently in mobile-build phases.)*

### Phase 13 — Mapbox SDK 11.x Migration (MAPBOX11)

- [ ] **MAPBOX11-01**: `@rnmapbox/maps` bumped to `^11.0` (or specific 11.x pin TBD); breaking changes documented in `docs/DECISIONS/0008-mapbox-sdk-11-migration.md`
- [ ] **MAPBOX11-02**: **Debug build regresses ALL Phase 1 tracker features** — SessionManager lifecycle, tracker hooks, simplifyForDisplay dual-source, createCustomPack NE-first bounds, closure feedback Toast, RegionPickerScreen 4-corner draggable
- [ ] **MAPBOX11-03**: All 536+ existing tests green after SDK bump
- [ ] **MAPBOX11-04**: Native libs build on iOS + Android, no JNI crashes on emulator
- [ ] **MAPBOX11-05**: Decision flagged if any 11.x breaking change cannot be reconciled — phase blocks the milestone until resolved

### Phase 14 — Android Native + ABI Matrix (AND-NATIVE)

- [ ] **AND-NATIVE-01**: `arm64-v8a` release APK installs and runs on Pixel + Samsung + Xiaomi physical devices
- [ ] **AND-NATIVE-02**: `armeabi-v7a` release APK installs and runs on older device (low-end target from Phase 20)
- [ ] **AND-NATIVE-03**: 16 KB page-size validated — `android:extractNativeLibs="false"` + rebuilt Mapbox + MMKV native with 16 KB ELF alignment on Android 15+ device
- [ ] **AND-NATIVE-04**: APK splits per ABI vs universal APK decision documented (lean: universal for closed beta)
- [ ] **AND-NATIVE-05**: Mapbox + MMKV + react-native-health native libs verified loading on each ABI

### Phase 15 — iOS Native + Device Class Compat (IOS-NATIVE)

- [ ] **IOS-NATIVE-01**: arm64-only IPA installs and runs on iPhone 13+, iPhone 11/12, iPhone SE
- [ ] **IOS-NATIVE-02**: iOS 16 baseline confirmed
- [ ] **IOS-NATIVE-03**: Native libs (Mapbox 11.x post-Phase-13, MMKV, react-native-health) verified loading on each device class

### Phase 16 — Background Reliability in Release Builds (BG)

- [ ] **BG-01**: **Pixel field tests pass on RELEASE APK** (inherited from old Phase 1) — T1 ≤3% distance, T2/T9 ≤5% area, T6 ≤10%/h battery + ≤100MB memory, T7 ≥50fps, T8 ≥95% record-time
- [ ] **BG-02**: **iPhone field tests pass on RELEASE IPA** — same NFR thresholds
- [ ] **BG-03**: Xiaomi MIUI/HyperOS — recording survives ≥30 min in pocket; auto-start permission UX surfaces in-app dialog; battery saver kill recovered via recoverLast
- [ ] **BG-04**: Huawei EMUI (no GMS) — same as Xiaomi; no Google Play Services dependency in critical path
- [ ] **BG-05**: Samsung One UI — power saving mode handled; deep sleep apps whitelist guidance shown
- [ ] **BG-06**: Generic Doze + App Standby — foreground service notification visible; location at degraded cadence
- [ ] **BG-07**: Low-end memory pressure (3GB RAM) — 2h session no OOM; SQLite WAL ≤64MB
- [ ] **BG-08**: iOS SLC fallback — gap-resume on AppState foreground verified on iOS 16/17/18 release IPA; no interpolation

### Phase 17 — Crash Reporting (CRASH)

- [ ] **CRASH-01**: Mobile Sentry SDK installed on iOS + Android; routed to `staging-mobile` / `prod-mobile` Sentry projects based on EAS profile
- [ ] **CRASH-02**: PII-strip middleware in `apps/mobile-rn/src/observability/sentry.ts` removes GPS coords, session_id, external_uuid, DM content, phone numbers, Strava OAuth tokens, Mapbox tokens — verified via test fixtures
- [ ] **CRASH-03**: Staging vs prod Sentry projects strictly separate (hard rule from milestone brief)
- [ ] **CRASH-04**: Opt-in telemetry screen in Settings with explicit event list; default-OFF until user opts in
- [ ] **CRASH-05**: Telemetry event allowlist documented in `docs/TELEMETRY.md`; nothing else fires
- [ ] **CRASH-06**: Debug symbols upload from CI to corresponding Sentry project on each release

### Phase 18 — Android Self-Hosted Update Channel (AND-DIST)

- [ ] **AND-DIST-01**: Caddy serves `/android/manifest.json` with Ed25519 signature; manifest contains latest version, APK signed-URL, min-supported-version, force-update flag
- [ ] **AND-DIST-02**: APKs uploaded to Hetzner Storage Box; served via 24h signed URLs (regenerated on each request)
- [ ] **AND-DIST-03**: In-app check-on-launch + Settings "Check for updates" button — both verify manifest signature before showing update UI
- [ ] **AND-DIST-04**: "Update available" UX with download progress; install via Android `ACTION_VIEW` on APK
- [ ] **AND-DIST-05**: Force-update path — `min-supported-version > installed` blocks app usage until update
- [ ] **AND-DIST-06**: Crash-rate auto-halt — Sentry crash-free sessions below 99% on a new release reverts manifest to previous version automatically; manual override in admin UI

### Phase 19 — iOS TestFlight Pipeline (IOS-DIST)

- [ ] **IOS-DIST-01**: CI workflow `.github/workflows/ios-release.yml` triggers on `v1.0-*` tags; uploads to TestFlight via ASC API
- [ ] **IOS-DIST-02**: Build number auto-bumps on each CI run (CFBundleVersion += 1)
- [ ] **IOS-DIST-03**: Internal TestFlight group seeded with closed-beta testers' Apple IDs
- [ ] **IOS-DIST-04**: Crash report integration with Sentry (Phase 17); ASC review-rejection alerts routed to on-call

### Phase 20 — Device Matrix + Physical Tests (DEVICES)

- [ ] **DEVICES-01**: Pixel 6+ — T1/T2/T6/T7/T8/T9 all pass on release APK (re-verified after distribution channel wired)
- [ ] **DEVICES-02**: Samsung Galaxy A/S (One UI) — full per-device protocol passes
- [ ] **DEVICES-03**: Xiaomi flagship (MIUI/HyperOS) — same; auto-start whitelist UX validated
- [ ] **DEVICES-04**: Huawei (no GMS) — same; verifies non-Google distribution path
- [ ] **DEVICES-05**: Low-end <4GB RAM Android — full protocol with extra memory monitoring
- [ ] **DEVICES-06**: Android 15+ device — 16 KB page-size validation in real-world conditions
- [ ] **DEVICES-07**: iPhone 13+ — T1/T2/T6/T7/T8/T9 on release IPA
- [ ] **DEVICES-08**: iPhone older (iPhone 11/12 or SE) — same protocol

### Phase 21 — Staging E2E + Go/No-Go + Tag `v1.0-rc.1` (E2E)

- [ ] **E2E-01**: Staging environment fully deployed via `infra/ansible/` to fresh Hetzner VPS in <60min (Phase 3 acceptance re-verified)
- [ ] **E2E-02**: ≥8 real runners enrolled — mix iOS + Android, ≥2 on de-Googled Android (Huawei or LineageOS), ≥1 on Xiaomi MIUI or equivalent aggressive killer (per user redline)
- [ ] **E2E-03**: 48-hour soak — each tester runs ≥3 real sessions, opens chats, scrolls feed, **connects Strava (HEALTH-04 validation)**, zero P0/P1 issues
- [ ] **E2E-04**: Restore drill passed (Phase 7 acceptance re-verified in soak window)
- [ ] **E2E-05**: Rollback drill passed (Phase 4 acceptance re-verified)
- [ ] **E2E-06**: **On-call rotation documented in `docs/RUNBOOKS/oncall.md`** per user redline — weekly schedule (primary/backup), explicit response-time SLA, fallback flow if primary unreachable. NOT just "rotation set up" — actual schedule + ETAs + fallback flow committed.
- [ ] **E2E-07**: If all green — tag `v1.0-rc.1`; flip `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` from `Accepted (deferred-aware closure)` to `Accepted (closed)` with measured NFR values; update STATUS.md + DEVELOPMENT_PLAN.md

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

**Coverage:**
- v1.0 requirements: **96 REQ-IDs** across 21 phases (HEALTH-04 shared between Phases 11+12)
- Mapped to phases: **96/96** ✓
- Unmapped: 0
- Deferred to v1.1+: HEALTH-01/02/03/05/06/07/08/09/10, SOCIAL-01..06 (except SOCIAL-04 implicit), COACH-01..06, PREMIUM-01..06, XCUT-01..06 (XCUT-07/08 partially in v1.0)
- Resolved by new Phase 16: PHASE1-01..14 (old REQ-IDs)

| Requirement Range | Phase | Status |
|-------------------|-------|--------|
| REL-01..05 | Phase 1: Release contract | Pending |
| SEC-01..09 | Phase 2: Secrets hardening | Pending |
| INFRA-01..07 | Phase 3: IaC | Pending |
| CICD-01..06 | Phase 4: CI/CD | Pending |
| OBS-01..08 | Phase 5: Observability backend | Pending |
| EDGE-01..05 | Phase 6: Edge + rate-limit | Pending |
| DB-01..08 | Phase 7: DB + queues + state | Pending |
| LOAD-01..06 | Phase 8: Load + chaos | Pending |
| AND-SIGN-01..05 | Phase 9: Android signing | Pending |
| IOS-SIGN-01..05 | Phase 10: iOS signing | Pending |
| AND-BUILD-01..06 | Phase 11: Android build config | Pending |
| HEALTH-04 (shared) | Phase 11+12 impl, Phase 21 validation | Pending |
| IOS-BUILD-01..05 | Phase 12: iOS build config | Pending |
| MAPBOX11-01..05 | Phase 13: Mapbox SDK 11.x migration | Pending |
| AND-NATIVE-01..05 | Phase 14: Android native + ABI | Pending |
| IOS-NATIVE-01..03 | Phase 15: iOS native + device class | Pending |
| BG-01..08 | Phase 16: Background reliability | Pending |
| CRASH-01..06 | Phase 17: Crash reporting | Pending |
| AND-DIST-01..06 | Phase 18: Android self-hosted distribution | Pending |
| IOS-DIST-01..04 | Phase 19: iOS TestFlight | Pending |
| DEVICES-01..08 | Phase 20: Device matrix | Pending |
| E2E-01..07 | Phase 21: Staging E2E + go/no-go | Pending |

---

*Requirements redefined: 2026-05-15*
*Replaces earlier feature-focused v1.0 scope (2026-05-14)*
*Old `docs/DEVELOPMENT_PLAN.md` task IDs (`P<phase>-<section>-<number>`) remain canonical implementation breakdown where applicable; new REQ-IDs above provide GSD-side traceability for v1.0 hardening work.*
