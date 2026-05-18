# Roadmap: Running Ecosystem — Milestone v1.0 Production Readiness

## Overview

This roadmap defines **21 phases** to take the Running Ecosystem from "Phase 8 / M10 code-complete on `feat/cursona-redesign`" to **closed-beta deployable with iOS + Android signed release builds, hardened backend on automated infrastructure, observability that doesn't leak GPS/PII, and a tagged `v1.0-rc.1` release after 48-hour staging soak with ≥8 real runners**.

**Workstream tags:** `shared` | `backend` | `android` | `ios` | `mobile-shared`

**Critical path:** Phase 1 (shared) → Phase 2 (backend, gates everything) → {backend Phase 3–8 || android Phase 9/11/14/18 || ios Phase 10/12/15/19} → Phase 13 (Mapbox SDK 11.x migration, mobile-shared) → Phase 14+15 (native + ABI per platform) → Phase 16 (background reliability) → Phase 20 (device matrix) → Phase 21 (staging E2E + go/no-go).

**Hard sequencing:** Phase 2 → Phase 3 is **strict, no parallelization** per user redline. Ansible templates must consume from SOPS, not from inline values that get retroactively cleaned.

**Replaces:** The earlier feature-focused v1.0 scope (privacy zones + segments + coaching + premium + GDPR). Old Phase 1 commits remain in git history on `feat/cursona-redesign`; old planning artifacts moved to `.planning/phases/_archive/pre-v1.0-territory-refactors/`. Feature phases slide to v1.1+ (see REQUIREMENTS.md §Deferred from v1.0).

## Phases

**Phase numbering convention:** Integer 1–21. Original draft used `9a/9b` letter-pair notation for platform-symmetric phases; these are integer-numbered here for `/gsd-execute-phase N` compatibility. Mapping in the phase list below.

- [x] **Phase 1: Release contract & version baseline** — `shared` — Lock mobile↔backend wire contract, version negotiation, feature-flag matrix, v1.0 IN/OUT freeze — **Code-complete 2026-05-15** (Plans 01-01..03 shipped on `feat/cursona-redesign`; REL-01..05 all delivered. Live deployment + OpenAPI YAML extension follow-ups tracked in 01-03-SUMMARY.md).
- [x] **Phase 2: Secrets & config hardening** — `backend` — `gitleaks`+`trufflehog` clean (0 findings full-history), SOPS-encrypted secrets, Mapbox token incident reset (ADR-0006), `IDENTITY_DEV_MODE` fix — **DONE 2026-05-16**, 4/4 plans, commits 5e73162..d6fe1f3
- [x] **Phase 3: Infrastructure as code** — `backend` — Ansible-only deploy на existing prod VPS, sport-stack systemd umbrella + containerized Caddy + UFW; provider-agnostic RUNBOOK — **DONE 2026-05-17** (3/3 plans; pivoted mid-execution from Hetzner Cloud к provider-agnostic VPS; INFRA-07 baseline 66.5s on 148.253.214.156; INFRA-02/04 deferred v1.1, INFRA-06 moved Phase 5)
- [ ] **Phase 4: CI/CD pipeline** — `backend` — GitHub Actions matrix, signed images pinned to digests, one-button rollback **proven with real DB migration in path**
- [ ] **Phase 5: Observability (backend)** — `backend` — Sentry self-hosted on separate VPS with separate DNS, Prom+OTLP, OTP log redaction (CONCERNS.md P0)
- [ ] **Phase 6: Edge protection & rate-limiting** — `backend` — Verify `pkg/ratelimit` under load, **add `/auth/*` rate-limit** (CONCERNS.md P0), Caddy WAF
- [ ] **Phase 7: DB + queues + state ops** — `backend` — pgBackRest → Hetzner Storage Box, **proven restore drill to clean VPS**, R18 `user_id` zero-downtime migration (backfill strategy deferred to discuss-phase 7)
- [ ] **Phase 8: Load + chaos baselines** — `backend` — k6 scenarios + service-kill chaos + partition test, baselines published
- [ ] **Phase 9: Android release signing** — `android` (was draft 9a) — Encrypted keystore + 2 offline physical backups, recovery playbook in `docs/SECRETS.md`
- [ ] **Phase 10: iOS release signing** — `ios` (was draft 9b) — Apple Developer certs, distribution provisioning, ASC API key in SOPS
- [ ] **Phase 11: Android release build config** — `android` (was draft 10a) — EAS production profile, R8 + ProGuard rules for Mapbox/MMKV/health JNI/Hermes/expo-task-manager; **HEALTH-04 Android impl**
- [ ] **Phase 12: iOS release build config** — `ios` (was draft 10b) — EAS production profile, Hermes, bitcode disabled, staging↔prod flavor switching; **HEALTH-04 iOS impl**
- [ ] **Phase 13: Mapbox SDK 11.x migration** — `mobile-shared` (was draft 11a-pre, **inserted per redline**) — Bump `@rnmapbox/maps@^10.3` → 11.x; gated on debug-build regression of ALL Phase 1 tracker features
- [ ] **Phase 14: Android native + ABI matrix** — `android` (was draft 11a) — arm64-v8a + armeabi-v7a + 16 KB page-size compat for Android 15+
- [ ] **Phase 15: iOS native + device class compat** — `ios` (was draft 11b) — arm64, iOS 16+ baseline, device class compat
- [ ] **Phase 16: Background reliability in release** — `mobile-shared` (was draft 12) — Foreground service + iOS SLC + 4 vendor killers (MIUI/HyperOS/EMUI/One UI); **inherits Pixel field-test gating from old Phase 1 (CONTEXT skeleton seeded)**
- [ ] **Phase 17: Crash reporting** — `shared` (was draft 13) — 4 Sentry projects (staging-mobile/prod-mobile/staging-backend/prod-backend), GPS/PII strip, opt-in telemetry
- [ ] **Phase 18: Android self-hosted update channel** — `android` (was draft 14a) — Signed-JSON manifest via Caddy, APKs on Hetzner Storage Box behind signed URLs
- [ ] **Phase 19: iOS TestFlight pipeline** — `ios` (was draft 14b) — ASC API + internal TestFlight group, automated upload on tagged release
- [ ] **Phase 20: Device matrix + physical tests** — `shared` (was draft 15) — 8 device classes across both platforms on signed release builds
- [ ] **Phase 21: Staging E2E + go/no-go** — `shared` (was draft 16) — 48h soak with ≥8 real runners, restore + rollback drills, on-call rotation documented, tag `v1.0-rc.1`

**HEALTH-04 Strava read-only OAuth placement (per user redline):** Implementation code lives in Phase 11 (Android impl) and Phase 12 (iOS impl) — registered as its own REQ-ID `HEALTH-04`. Validation acceptance lives in Phase 21 (Staging E2E — testers connect Strava during soak). Not embedded silently in mobile-build phases.

## Phase Details

### Phase 1: Release contract & version baseline
**Workstream:** `shared`
**Goal:** Lock the mobile↔backend wire contract for v1.0, decide version-negotiation policy, define feature-flag matrix for staged rollout, freeze the explicit list of v1.0 capabilities (everything else is OUT — deferred to v1.1+).
**Depends on:** —
**Requirements:** REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria:**
1. `docs/API-CONTRACT-v1.0.md` enumerates every backend endpoint mobile depends on with request/response schemas
2. Version negotiation header (`X-Client-Version` + server-side compatibility map) implemented on a representative endpoint; pattern documented for Phase 2+ rollout
3. `pkg/featureflags` package on backend + mirror on mobile with the v1.0 flag set
4. `docs/v1.0-SCOPE.md` lists IN capabilities (Territory Core, Activity Journal, Chat, Stats, Wallet, Strava-read-only-OAuth) and explicit OUT capabilities (privacy zones, segments, coaching, premium, GDPR consent flow — all v1.1+)
5. Decision recorded in `docs/DECISIONS/0007-v1.0-release-contract.md`
**Plans**: 3 plans across 2 waves
- [ ] `01-01-PLAN.md` — Contract & ADR (REL-01, REL-04, REL-05) — Wave 1 — OpenAPI 3.1.0 extension to 7 services + `_shared/` components + Redocly lint + Go drift-check tool + `docs/v1.0-SCOPE.md` IN/OUT freeze + ADR-0007
- [ ] `01-02-PLAN.md` — Version negotiation E2E (REL-02) — Wave 1 — `pkg/clientversion` shared Go lib + per-service mount in 8 services + Caddy passthrough + mobile `version.ts` + `apiClient.ts` 426 intercept + `ForceUpdateScreen` + `expo-application` added to package.json
- [ ] `01-03-PLAN.md` — Feature flags (REL-03) — Wave 2 (depends on 01-02; same main.go files) — Migration `0021_featureflags` + `pkg/featureflags` (FNV-1a rollout with 0x00 separator, 30s cache + singleflight) + identity handlers + 8 main.go wirings + admin UI extension + mobile Zustand+MMKV store + offline-first defaults + clearAll-on-logout wiring
**Maps to existing plan**: New scope (v1.0 hardening); no pre-v1.0 P-IDs apply.

### Phase 2: Secrets & config hardening
**Workstream:** `backend` (NON-NEGOTIABLE — gates Phase 3 strictly per user redline)
**Goal:** Take a repo that has historically passed Mapbox tokens through chat, has `IDENTITY_DEV_MODE=true` as default, and stores secrets in mixed locations → to a state where every secret is in SOPS-encrypted files (or Vault), every rotation has a documented playbook, and `gitleaks`+`trufflehog` are clean on full history.
**Depends on:** Phase 1
**Requirements:** SEC-01..09
**Success Criteria:**
1. `gitleaks` + `trufflehog` run on full clone (`--no-shallow`) report zero findings
2. SOPS-encrypted secrets in `.secrets/` (or HashiCorp Vault) for: Mapbox public + secret, Postgres password, NATS auth, MinIO credentials, Expo Push key, Google/Apple/Strava OAuth client secrets, Caddy ACME account
3. Mapbox token **incident reset**: rotate BOTH the deferred `pk.→sk.` CI/build-time token AND the production runtime `pk.*` runtime token. Old tokens REVOKED in dashboard (not just unused). Incident documented in `docs/DECISIONS/0006-mapbox-token-incident.md` as treated-as-compromise
4. `IDENTITY_DEV_MODE=true` default removed from identity service (CONCERNS.md P0)
5. 12-factor config split for every Go service — no hardcoded URLs/keys/tokens in code; all via env vars sourced from SOPS
6. Rotation playbooks in `docs/SECRETS.md` for all 10 secret types
7. Pre-commit hook scanning for AWS/AKIA/GitHub PAT/Mapbox `sk.` patterns
**Plans**: 4 plans across 3 waves
- [x] `02-01-PLAN-sops-scaffold.md` — SOPS+age scaffold + 9 encrypted .secrets/<env>/{shared,mapbox,oauth}.yaml + Pitfall-1 round-trip smoke (SEC-02) — Wave 1 — autonomous=false (Task 0 needs per-dev age keys) — **DONE 2026-05-15, commits 5e73162..04f44b8**
- [x] `02-02-PLAN-envrequire-and-devmode.md` — envRequire across 8 services + IDENTITY_DEV_MODE flip + isLocalDBURL prod-detection + smoke_otp.py SMOKE_DEV_MODE flip (SEC-05, SEC-06, SEC-09) — Wave 1 — autonomous (independent of 02-01) — **DONE 2026-05-15, 8 services + 10 new test cases**
- [x] `02-03-PLAN-scanners-and-precommit.md` — .gitleaks.toml + custom Mapbox rules + .pre-commit-config.yaml + Makefile scan-secrets + init-pre-commit.sh + one-time full-history scan (SEC-01, SEC-08) — Wave 2 (depends on 02-01 for .secrets/** path coverage) — **DONE 2026-05-16, commits 28acb2d..ac2ebd5, 0 findings in full-history scan**
- [x] `02-04-PLAN-mapbox-incident-and-docs.md` — ADR-0006 + sops-edit RUNBOOK + 10-playbook SECRETS.md extension + Mapbox dashboard rotation USER ACTION + SOPS-populate new tokens (SEC-03, SEC-04, SEC-07) — Wave 3 — autonomous=false (Tasks 1+3 are user-action checkpoints) — **DONE 2026-05-16, commits a67beb0..d6fe1f3, single-token strategy chosen for v1.0 (per-env split deferred v1.1)**
**Maps to existing plan**: New scope (v1.0 hardening); no pre-v1.0 P-IDs apply. SEC-03/04 inherit context from pre-v1.0 archive 01-08-SUMMARY.md (Mapbox token chat-leak inventory).

### Phase 3: Infrastructure as code
**Workstream:** `backend` (Phase 2 → Phase 3 strict gate LIFTED 2026-05-16)
**Goal:** Move from "deployed by hand on the prod VPS via SSH + `git pull` + `/opt/sport/deploy.sh`" → to "Ansible-driven idempotent deploy на тот же VPS в <60 минут от `git clone + ansible-playbook` alone, provider-agnostic". SSH is the only deploy seam (provider-side automation deferred to v1.1 per pivot 2026-05-17).
**Depends on:** Phase 2 (Ansible vars source from SOPS, not inline)
**Requirements:** INFRA-01, INFRA-03, INFRA-05, INFRA-07 (INFRA-02 + INFRA-04 deferred to v1.1; INFRA-06 moved to Phase 5)
**Success Criteria:**
1. `infra/ansible/` playbooks idempotently install: containerized Caddy + Postgres+TimescaleDB + Redis + NATS JetStream + MinIO + all 8 Go service containers under a single `sport-stack.service` systemd umbrella on the existing prod VPS (current code on `feat/cursona-redesign` has 8 services: identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph)
2. Environments: `dev` (localhost docker-compose, no Ansible) + `prod` (existing VPS) with inventory in `infra/ansible/inventory/{dev,prod}/`. Staging deferred to v1.1.
3. UFW (OS-level) firewall rules explicit; no `0.0.0.0/0` except 443 Caddy + 22 from dev-IPs-only. NATS 4222 / Postgres 5432 / Redis 6379 / MinIO 9000 closed to public (internal-only via docker network — defense in depth with UFW).
4. Fresh deploy from `git clone` to all services running in <60 minutes (measured on the existing prod VPS first-clean-Ansible-deploy; recorded in `docs/RUNBOOKS/deploy.md` §9)

**Deferred from Phase 3 (per 2026-05-17 pivot to provider-agnostic VPS scope):**
- Terraform / cloud-API provisioning → v1.1 (revisit if migrating to a cloud-API provider)
- Staging environment → v1.1 (manual spinup at provider's UI when needed)
- Sentry VPS provisioning (originally INFRA-06) → Phase 5 (sentry-prep role + colocate-vs-separate-VPS decision belongs there)
- TF state backend → N/A while no Terraform
- Object Storage / Storage Box → N/A while no Terraform; pgBackRest backup target choice deferred to Phase 7

**Plans**: 3 plans across 3 waves (was 5 plans across 4 waves pre-pivot; see commits `00bcb39` revert + `c16e9bb`/`9cf1c63` pivot)

**Wave 1** (sequential — blocks everything; user-action for DEV_B SSH+age pubkeys + user provides current VPS IP/SSH-user)
- [ ] `03-01-PLAN.md` — Ansible scaffold + common + docker + UFW roles + stub sport-stack + dev/prod inventory + group_vars (INFRA-01 partial, INFRA-03, INFRA-05) — Wave 1, autonomous=false — `sport_repo_url` from `git remote get-url origin`; sudoers regex without username; SSH hardening (no root login, no password auth); UFW idempotent enforcement of ports policy. Caddy stays containerized inside sport-stack umbrella (D-16 KEPT) — Caddyfile synced via docker-compose volume mount в Wave 2, NOT as a standalone Ansible role.

**Wave 2** *(blocked on Wave 1 completion)*
- [ ] `03-02-PLAN.md` — sport-stack role: SOPS-decrypt via `delegate_to: localhost` (drops hetzner.yaml — no VPS SOPS slot per D-26) + migration play + `sport-stack.service` systemd umbrella (`docker compose` space-form per D-04) + `/run/sport.env` tmpfs mode 0600 + `shred -u` on stop + smoke probe + INFRA-07 timing measurement on the existing prod VPS (INFRA-01, INFRA-07) — Wave 2, autonomous=true — split `<automated>` (template greps + syntax-check + check-mode) / `<manual>` (live deploy + `awk '/^real/'` programmatic verdict from `/usr/bin/time -p`); HOME-explicit SOPS env construct

**Wave 3** *(blocked on Wave 2 completion)*
- [ ] `03-03-PLAN.md` — Prod cutover (explicit `docker compose down` of existing manual stack BEFORE Ansible play per B4 — preserves zero-downtime invariant) + provider-agnostic `docs/RUNBOOKS/deploy.md` (9 sections, `<vps-ip>` placeholders) + ROADMAP text-fix (8 services + criteria 2/4 deferred + criterion 6 moved) + REQUIREMENTS INFRA-02/04 deferred + INFRA-06 moved (INFRA-01 verify, INFRA-07 RUNBOOK) — Wave 3, autonomous=false — 4 tasks; sed-fills `<fill ...>` timing placeholders programmatically with `! grep -q '<fill'` verify

**Cross-cutting constraints (truths shared by 2+ plans):**
- SOPS-decrypt happens via `delegate_to: localhost`; age key stays on dev workstation (never on remote VPS) — 03-02, 03-03
- All Caddy is containerized (`caddy:2.8-alpine` in compose); no apt-install (would double-bind port 443) — 03-01, 03-02, 03-03
- `docker compose` space-form (Compose plugin) in systemd ExecStart; never `docker-compose` dash-form (Ubuntu 24.04 removed it) — 03-02
- UFW (OS-level) enforces firewall policy; never Hetzner Cloud Firewall (D-24 NEW post-pivot) — 03-01, 03-03 verify
- RUNBOOK is provider-agnostic (D-25 NEW post-pivot) — `<vps-ip>` placeholders, no `hetzner`/`digitalocean`/`aws`/`gcp` literals — 03-03

**Maps to existing plan**: New scope (v1.0 hardening); no pre-v1.0 P-IDs apply. INFRA-* inherit context from Phase 2's SOPS deploy seam (`docs/RUNBOOKS/sops-edit.md §Deploy script`). **Pivot note 2026-05-17:** User clarified that no Hetzner Cloud account exists — only an SSH-accessible Linux VPS at the prod address. 21 D-XX decisions from original CONTEXT.md classified SUPERSEDED/KEPT; new D-22..D-26 added (drop Terraform, single VPS, UFW, provider-agnostic RUNBOOK, no VPS SOPS slot). See `.planning/phases/03-infrastructure-as-code/03-CONTEXT.md §PIVOT NOTICE`.

### Phase 4: CI/CD pipeline
**Workstream:** `backend`
**Goal:** Every push to main runs the full quality-gate matrix; merged commits build signed container images pinned to immutable digests; one-button rollback with a real DB migration in the rolled-back version is proven on staging.
**Depends on:** Phase 3
**Requirements:** CICD-01..06
**Success Criteria:**
1. GitHub Actions matrix runs on every PR: Go `test -race`, `golangci-lint`, `gosec`, `semgrep`, `govulncheck`, multi-stage Docker build, Trivy image scan
2. Container images signed with `cosign` and pinned to SHA256 digests in production manifests (no `latest` tags ever — hard rule)
3. Build provenance attestation (SLSA-style) attached to each release tag
4. **Rollback drill validated with real DB migration**: deploy version N with a migration in path → deploy N+1 with second migration → `make rollback v=N` reverts service binaries AND the N+1 migration (down migration runs successfully) → integration test confirms N's data + behavior restored. No-op rollback (same code, same schema) does NOT count.
5. Deployment freeze toggle: a runbook step that pauses CD on incident declaration
6. Branch protection: required passing checks include all matrix items above
**Plans**: 7 plans across 4 waves
- [x] `04-01-PLAN.md` — GitHub repo + remote + GHCR namespace bootstrap (CICD-01 prereq) — Wave 1, autonomous=false — `gh repo create runningecosystem/sport --private` + push feat/cursona-redesign + create main; delete Phase 0 placeholder ci.yml; bookmark GHCR public-package flip for after Plan 04-03a
- [x] `04-02-PLAN.md` — Extend backend-ci.yml: 8-service matrix + lint + 5 scanners + Trivy + secret-scan-full.yml + .golangci.yml + .trivyignore.yaml (CICD-01, SEC-01 closure) — Wave 2, autonomous=false — iterate on scratch PR until all-green; first-green-CI-run-record is sequence guard для Plan 04-05
- [x] `04-03a-PLAN.md` — Create backend-cd.yml: cosign keyless + SLSA L2 (`attest-build-provenance@v2` per RESEARCH correction) + GHCR push for 8 services + docker-compose.prod.yml image-pin (CICD-02, CICD-03) — Wave 3, autonomous=false — first CD run supervision; flip GHCR package visibility=public per RESEARCH §Open Q recommendation
- [x] `04-03b-PLAN.md` — Top-level Makefile с `make rollback v=N` + drill migrations 9990/9991 + drill_assert_schema.sh (CICD-04 scaffold) — Wave 3, autonomous=true — scaffolding only; drill execution = Plan 04-04
- [x] `04-04-PLAN.md` — Execute rollback drill on prod VPS (live, supervised); extend deploy.md §6.4 с drill results (CICD-04 execution acceptance — "no-op doesn't count") — Wave 4, autonomous=false — pre-drill pg_dump snapshot mandatory; backward-compat NULLABLE migrations per RESEARCH Pitfall 5
- [ ] `04-05-PLAN.md` — Branch protection setup: setup-branch-protection.sh + USER ACTION к run it + deploy.md §10 (CICD-06) — Wave 4, autonomous=false — depends_on=[04-02] enforces sequence guard per RESEARCH Pitfall 1 (first green CI run before lock-down); 8 required checks + 0 reviewers + no force-push + no deletes
- [ ] `04-06-PLAN.md` — Deployment freeze toggle: deploy.md §11 с 3 paths (production env disable [future seam] / workflow disable [v1.0 PRIMARY] / immediate revert [Path #3]) + verify + incident-response log template (CICD-05) — Wave 4, autonomous=true — docs-only

### Phase 5: Observability (backend)
**Workstream:** `backend`
**Goal:** Backend services produce structured JSON logs, Prometheus metrics, and OTLP traces — observable enough to diagnose production incidents, restricted enough that GPS coordinates, phone numbers, DMs, and other PII never appear. Sentry self-hosted on a separate Hetzner VPS with separate DNS (`sentry.<domain>`) and separate TLS cert — isolation is non-negotiable per user redline (losing both app and crash reports during an incident is unacceptable).
**Depends on:** Phase 3
**Requirements:** OBS-01..08
**Success Criteria:**
1. Sentry self-hosted instance running on separate Hetzner VPS at `sentry.<domain>` with separate ACME cert (NOT behind same Caddy as app)
2. 4 Sentry projects scoped: `staging-mobile`, `prod-mobile`, `staging-backend`, `prod-backend` (mobile projects consumed by Phase 17)
3. Structured JSON logs (Zap or slog) on all Go services with level tags; **OTP codes never logged** (CONCERNS.md P0 — closes the unconditional-OTP-log finding under the "no PII in logs" rule)
4. Prom metrics exposed at `/metrics` on each service; Grafana dashboards for P99 latency, error rate, queue depth, JWT-validation failures
5. **No GPS coordinates ever in logs.** No phone numbers. No `displayName`. No DM content. No `external_uuid` from third-party imports. Verified via grep audit + runtime sample inspection.
6. Cardinality budget: no per-`user_id` labels on metrics (use bucketed cohorts). Verified via Prom label-cardinality probe.
7. Tester-mode debug logging opt-in per session via Settings toggle with explicit RU consent banner
8. Alert rules with on-call thresholds wired to PagerDuty (or simple SMS escalation for the 2-dev team)
**Plans**: TBD

### Phase 6: Edge protection & rate-limiting
**Workstream:** `backend`
**Goal:** Verify existing `pkg/ratelimit` (Redis ZSET sliding window) holds under k6-driven load; close the CONCERNS.md P0 gap by adding rate-limit to `/auth/*` endpoints; add Caddy WAF basic rules for edge defense.
**Depends on:** Phase 3
**Requirements:** EDGE-01..05
**Success Criteria:**
1. `/auth/login`, `/auth/register`, `/auth/otp/*` all rate-limited (5/min per IP) via `pkg/ratelimit` — closes CONCERNS.md P0
2. Existing rate limits re-verified under k6 load — limits hold, no Redis-down false-allows
3. Caddy WAF rules: block known bad UAs, rate-limit at edge for unauthenticated paths, reject malformed TLS, block obvious scanners
4. Anti-replay budget on JWT (jti + Redis dedup with TTL)
5. DDoS mitigation strategy documented; decision on Cloudflare/Fastly proxy (lean: skip for closed beta, Caddy edge sufficient)
**Plans**: TBD

### Phase 7: DB + queues + state ops
**Workstream:** `backend`
**Goal:** Production-grade Postgres+TimescaleDB operations: pgBackRest streaming WAL + daily full backups to Hetzner Storage Box (30-day retention); restore drill to clean VPS proven (no green tick without it per user redline); R18 zero-downtime migration adds `user_id` to `personal_records` + `sessions`. **Backfill strategy LOUDLY DEFERRED to `/gsd-discuss-phase 7`** — agent inspects schema + row counts before choosing (a) `users.email` join, (b) JWT log archive backfill, (c) hybrid with `orphaned=true` flag.
**Depends on:** Phase 3
**Requirements:** DB-01..08
**Success Criteria:**
1. pgBackRest configured: daily full + continuous WAL archiving to Hetzner Storage Box, 30-day retention, encrypted at rest
2. **Restore drill proven on clean VPS:** spin fresh VPS → install Postgres+Timescale → pgBackRest restore from Storage Box → verify schema + sample data → time-to-restore <30 min. No deferral allowed — acceptance gate.
3. R18 zero-downtime migration adds `user_id` to `personal_records` + `sessions`. **Backfill strategy chosen in `/gsd-discuss-phase 7` after agent inspects DB schema + row counts** (loudly flagged in Phase 7 CONTEXT — do not guess; inspect first).
4. NATS JetStream durability config audit: stream retention policies, max-age, replicas; document in `docs/RUNBOOKS/nats-ops.md`
5. MinIO bucket policies tightened: presigned URL expiry ≤24h, max upload size, public buckets gated by Caddy auth
6. Schema-drift detection in CI: `golang-migrate version` vs DB version mismatch fails the build
7. `docs/RUNBOOKS/db-ops.md` covers: routine backup verification, point-in-time recovery procedure, replication setup (deferred but documented for v1.1)
8. Dead-letter queue for failed NATS messages with admin UI access via `/admin/`
**Plans**: TBD

### Phase 8: Load + chaos baselines
**Workstream:** `backend`
**Goal:** Establish performance baselines via k6 load scenarios and chaos drills; verify the backend survives service-kill mid-session, network partition between social-graph and feed services, and reconnect storms.
**Depends on:** Phase 4, Phase 5, Phase 6, Phase 7
**Requirements:** LOAD-01..06
**Success Criteria:**
1. k6 scenarios in `infra/loadtest/`: feed scroll (100 users × 10min), session save burst (10 simultaneous 5000-pt payloads), realtime push fanout (100 stories → 1000 followers), auth burst (1000 logins / 10min)
2. Chaos drill: kill `messaging` service mid-conversation → mobile clients reconnect within SLO (target <30s)
3. Partition test: simulate social-graph ↔ feed network partition → verify graceful degradation
4. Baselines published in `docs/PERF-BASELINE.md` with P50/P95/P99 per endpoint
5. Reconnect storm: kill `realtime-gw`, 100 clients reconnect → measure recovery latency
6. Load-test integration with CI: nightly run on staging, regression alerts via Grafana
**Plans**: TBD

### Phase 9: Android release signing
**Workstream:** `android`
**Goal:** Generate release keystore offline, store as encrypted file with two offline physical backups in separate locations, document recovery playbook. Signing config sourced from SOPS at build time, never in repo. Hardware HSM upgrade flagged for v1.1 public-launch readiness.
**Depends on:** Phase 2 (keystore lives in SOPS)
**Requirements:** AND-SIGN-01..05
**Success Criteria:**
1. Release keystore generated offline (air-gapped or single workstation, immediately deleted from disk after encryption)
2. Encrypted keystore in `.secrets/android-release.keystore.sops` (or Vault path) — Git history clean
3. Two offline physical backups in separate physical locations (e.g., USB-encrypted drive in safe + sealed envelope at 2nd address)
4. Recovery playbook in `docs/SECRETS.md` §"Android Keystore Loss" — explicit steps; keystore loss = app dies, this is critical
5. Reproducible build flags set; SLSA-style provenance attestation included in CI artifacts
**Plans**: TBD

### Phase 10: iOS release signing
**Workstream:** `ios`
**Goal:** Apple Developer Program account set up, distribution certificate generated, distribution provisioning profile for `com.runningecosystem.mobile`, App Store Connect API key stored in SOPS for CI automation.
**Depends on:** Phase 2
**Requirements:** IOS-SIGN-01..05
**Success Criteria:**
1. Apple Developer Program enrolled and verified
2. Distribution certificate generated, private key encrypted in SOPS
3. Distribution provisioning profile generated for app bundle ID, refresh automation documented
4. App Store Connect API key (P8 file) stored in SOPS for unattended CI uploads
5. EAS-managed credentials configured OR local fastlane Match approach decided + documented
**Plans**: TBD

### Phase 11: Android release build config
**Workstream:** `android`
**Goal:** EAS Build production profile produces a signed Android APK targeted at production backend, with R8 + ProGuard rules tuned for Mapbox SDK, MMKV, react-native-health JNI, Hermes runtime, expo-task-manager background entry points; resource shrinking on; debug symbols uploaded to Sentry (Phase 17 wires) but not in APK. **HEALTH-04 Strava read-only OAuth Android-side implementation lives here.**
**Depends on:** Phase 9
**Requirements:** AND-BUILD-01..06, HEALTH-04 (shared with Phase 12)
**Success Criteria:**
1. EAS profile `production` in `apps/mobile-rn/eas.json` points at production backend host; `staging` profile points at staging
2. R8 + ProGuard rules tested: do NOT strip Mapbox SDK JNI, MMKV native, react-native-health JNI, expo-task-manager background classes, Hermes runtime, protobuf reflection
3. Resource shrinking enabled; APK size measured baseline vs after
4. BuildConfig surfaces clean: no `__DEV__` true in release, no `EXPO_PUBLIC_*_LOCAL` debug flags
5. Debug symbols uploaded to Sentry (when Phase 17 lands); not bundled in APK
6. **HEALTH-04 Android impl**: Strava OAuth PKCE flow on Android (no client_secret on device), backend exchange/refresh endpoints wired; READ-only scope (`activity:read`); validation deferred to Phase 21 soak
**Plans**: TBD

### Phase 12: iOS release build config
**Workstream:** `ios`
**Goal:** EAS Build production profile produces a signed iOS IPA targeted at production backend, with Hermes engine, bitcode disabled (Xcode 14+ default), staging↔prod flavor switching via EAS profiles + secrets injection. **HEALTH-04 iOS-side implementation lives here.**
**Depends on:** Phase 10
**Requirements:** IOS-BUILD-01..05, HEALTH-04 (shared with Phase 11)
**Success Criteria:**
1. EAS profile `production` for iOS targets production backend; `staging` for staging
2. Hermes engine enabled (SDK 54 default)
3. Bitcode disabled (Xcode 14+)
4. BuildConfig + Info.plist clean for release (no dev-mode flags, no NSAllowsLocalNetworking in prod)
5. **HEALTH-04 iOS impl**: Strava OAuth PKCE flow on iOS, mirror of Phase 11 wiring
**Plans**: TBD

### Phase 13: Mapbox SDK 11.x migration (INSERTED per user redline)
**Workstream:** `mobile-shared`
**Goal:** Bump `@rnmapbox/maps` from `^10.3` to `11.x` for 16 KB page-size compatibility on Android 15+ (Phase 14 prerequisite). **Migration gated on debug-build regression of ALL Phase 1 tracker features** (SessionManager, tracker hooks, simplifyForDisplay, offline `createCustomPack` bounds order, closure feedback Toast, RegionPickerScreen) before any release-build work touches it.
**Depends on:** Phase 11 (Android build config), Phase 12 (iOS build config)
**Requirements:** MAPBOX11-01..05
**Success Criteria:**
1. `@rnmapbox/maps` bumped to `^11.0` (or specific 11.x pin TBD by research); breaking changes documented in `docs/DECISIONS/0008-mapbox-sdk-11-migration.md`
2. **Debug build regresses ALL Phase 1 tracker features:**
   - SessionManager: session lifecycle works, pauses, resumes, saves, recovers from force-kill
   - Tracker hooks: `useTrackerCamera`, `useLayerVisibility`, `usePauseUI` render correctly
   - `simplifyForDisplay`: dual-source render with raw points for area, simplified for LineLayer
   - `createCustomPack`: NE-first bounds order preserved; offline region picker works
   - Closure feedback: Haptic + Toast fire on `closureFired` event
   - Offline region picker: 4-corner draggable rectangle + size estimator + 50 MB cap
3. All 536+ existing tests still green after SDK bump
4. Native libs build on both iOS and Android; no JNI crashes on emulator
5. Decision flagged if any breaking change in 11.x cannot be reconciled — phase blocks the milestone until resolved
**Plans**: TBD

### Phase 14: Android native + ABI matrix
**Workstream:** `android`
**Goal:** Validate release APK builds and runs on `arm64-v8a` + `armeabi-v7a` ABIs (drop `x86`); validate 16 KB page-size compatibility for Android 15+ devices.
**Depends on:** Phase 11, Phase 13
**Requirements:** AND-NATIVE-01..05
**Success Criteria:**
1. `arm64-v8a` release APK installs and runs on Pixel + Samsung + Xiaomi physical devices
2. `armeabi-v7a` release APK installs and runs on older device (low-end <4GB target from Phase 20)
3. 16 KB page-size validated: `android:extractNativeLibs="false"` + rebuilt Mapbox SDK native + MMKV native with 16 KB ELF alignment
4. APK splits per ABI vs universal APK decision documented (lean: universal for closed beta)
5. Mapbox + MMKV + react-native-health native libs verified loading correctly on each ABI
**Plans**: TBD

### Phase 15: iOS native + device class compat
**Workstream:** `ios`
**Goal:** Validate release IPA builds and runs on iPhone 13+, iPhone 11/12 (older), iPhone SE (mid-range); iOS 16 baseline + iOS 17 + iOS 18 compat.
**Depends on:** Phase 12, Phase 13
**Requirements:** IOS-NATIVE-01..03
**Success Criteria:**
1. arm64-only IPA installs and runs on iPhone 13+, iPhone 11/12, iPhone SE
2. iOS 16 baseline confirmed
3. Native libs (Mapbox SDK 11.x post-Phase-13, MMKV, react-native-health) verified loading on each device class
**Plans**: TBD

### Phase 16: Background reliability in release builds
**Workstream:** `mobile-shared`
**Goal:** Validate that signed RELEASE builds (not debug) survive 4 vendor battery killers (Xiaomi MIUI/HyperOS, Huawei EMUI, Samsung One UI, generic Doze) + low-end memory pressure + iOS SLC fallback. **Inherits Pixel + iPhone field-test gating from old Phase 1** — those tests rerun on release builds with all hardening (Phase 2 token rotation, Phase 11/12 R8+ProGuard, Phase 13 SDK 11.x) in place. **CONTEXT skeleton seeded at `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md` with acceptance criteria copied verbatim from archived old Phase 1 (per user redline).**
**Depends on:** Phase 14, Phase 15
**Requirements:** BG-01..08
**Success Criteria:**
1. **Pixel field tests pass on RELEASE APK** (inherited from old Phase 1): T1 ≤3% distance, T2/T9 ≤5% area, T6 ≤10%/h battery + ≤100MB memory, T7 ≥50fps, T8 ≥95% record-time
2. **iPhone field tests pass on RELEASE IPA**: same NFR thresholds
3. Xiaomi MIUI/HyperOS: recording survives ≥30 min in pocket; auto-start permission UX surfaces in-app dialog; battery saver kill recovered via recoverLast
4. Huawei EMUI (no GMS): same as MIUI; no Google Play Services dependency in critical path verified
5. Samsung One UI: power saving mode handled; deep sleep apps whitelist guidance shown
6. Generic Doze + App Standby: foreground service notification visible; location at degraded cadence
7. Low-end memory pressure (3GB RAM): 2h session no OOM; SQLite WAL ≤64MB
8. iOS SLC fallback: gap-resume on AppState foreground verified on iOS 16/17/18 release IPA; no interpolation
**Plans**: TBD
**CONTEXT skeleton:** `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md` (seeded with Pixel acceptance criteria from old Phase 1 archive per user redline)

### Phase 17: Crash reporting
**Workstream:** `shared`
**Goal:** Wire mobile Sentry SDK (both platforms) into the 4 Sentry projects from Phase 5; PII-strip middleware removes GPS coords, session IDs, phone numbers, DM content, Strava tokens, Mapbox tokens from breadcrumbs; staging vs prod never cross.
**Depends on:** Phase 5 (Sentry instance + projects), Phase 11 (Android build), Phase 12 (iOS build)
**Requirements:** CRASH-01..06
**Success Criteria:**
1. Mobile Sentry SDK installed on iOS + Android; routed to `staging-mobile` / `prod-mobile` Sentry projects based on EAS profile
2. PII-strip middleware in `apps/mobile-rn/src/observability/sentry.ts` removes: GPS coords, session_id, external_uuid, DM content, phone numbers, Strava OAuth tokens, Mapbox tokens — verified via test fixtures
3. Staging vs prod Sentry projects strictly separate (hard rule from milestone brief)
4. Opt-in telemetry screen in Settings with explicit event list; default-OFF until user opts in
5. Telemetry event allowlist documented in `docs/TELEMETRY.md`; nothing else fires
6. Debug symbols upload from CI to corresponding Sentry project on each release
**Plans**: TBD

### Phase 18: Android self-hosted update channel
**Workstream:** `android`
**Goal:** Build a self-hosted Android distribution channel that works for de-Googled testers (no Firebase, no Google Play). Caddy serves a signed-JSON manifest at `/android/manifest.json`; APKs hosted on Hetzner Storage Box behind 24h signed URLs.
**Depends on:** Phase 11, Phase 14, Phase 3 (Caddy + Storage Box)
**Requirements:** AND-DIST-01..06
**Success Criteria:**
1. Caddy serves `/android/manifest.json` with Ed25519 signature; manifest contains latest version, APK signed-URL, min-supported-version, force-update flag
2. APKs uploaded to Hetzner Storage Box; served via 24h signed URLs
3. In-app check-on-launch + Settings "Check for updates" button — both verify manifest signature before showing update UI
4. "Update available" UX in app with download progress; install via Android `ACTION_VIEW` on APK
5. Force-update path: if `min-supported-version > installed`, block app usage until update
6. Crash-rate auto-halt: if Sentry crash-free sessions drop below 99% on a new release, the manifest reverts to previous version automatically
**Plans**: TBD

### Phase 19: iOS TestFlight pipeline
**Workstream:** `ios`
**Goal:** Automated TestFlight upload via App Store Connect API on tagged release; internal TestFlight group seeded with closed-beta testers; build-number bumping on every CI run.
**Depends on:** Phase 12, Phase 15
**Requirements:** IOS-DIST-01..04
**Success Criteria:**
1. CI workflow `.github/workflows/ios-release.yml` triggers on `v1.0-*` tags; uploads to TestFlight via ASC API
2. Build number auto-bumps on each CI run (CFBundleVersion += 1)
3. Internal TestFlight group seeded with the closed-beta testers' Apple IDs
4. Crash report integration with Sentry (Phase 17); ASC review-rejection alerts routed to on-call
**Plans**: TBD

### Phase 20: Device matrix + physical tests
**Workstream:** `shared`
**Goal:** Run the per-device protocol on signed RELEASE builds across all 8 device classes. Builds on Phase 16's Pixel/iPhone gating + extends to Samsung, Xiaomi, Huawei, low-end Android, Android 15+, iPhone older.
**Depends on:** Phase 16, Phase 17, Phase 18, Phase 19
**Requirements:** DEVICES-01..08
**Success Criteria:**
1. Pixel 6+: T1/T2/T6/T7/T8/T9 all pass on release APK (re-verified after distribution channel wired)
2. Samsung Galaxy A/S (One UI): full per-device protocol passes
3. Xiaomi flagship (MIUI/HyperOS): same; auto-start whitelist UX validated
4. Huawei (no GMS): same; verifies non-Google distribution path
5. Low-end <4GB RAM Android: full protocol with extra memory monitoring
6. Android 15+ device: 16 KB page-size validation in real-world conditions
7. iPhone 13+: T1/T2/T6/T7/T8/T9 on release IPA
8. iPhone older (iPhone 11/12 or SE): same protocol
**Plans**: TBD

### Phase 21: Staging E2E + go/no-go + tag `v1.0-rc.1`
**Workstream:** `shared`
**Goal:** Deploy full backend stack to staging via Phase 3 IaC; ≥8 real runners (mix iOS/Android, ≥2 de-Googled Android, ≥1 vendor-aggressive-killer like Xiaomi MIUI) soak the app for 48 hours; restore drill + rollback drill + on-call rotation set up; if green, tag `v1.0-rc.1`.
**Depends on:** ALL prior phases (1–20)
**Requirements:** E2E-01..07
**Success Criteria:**
1. Staging environment fully deployed via `infra/ansible/` to fresh Hetzner VPS in <60min (Phase 3 acceptance re-verified)
2. **≥8 real runners enrolled**: mix iOS + Android, **≥2 on de-Googled Android** (Huawei or LineageOS), **≥1 on Xiaomi MIUI or equivalent aggressive killer** (per user redline)
3. **48-hour soak**: each tester runs ≥3 real sessions, opens chats, scrolls feed, **connects Strava (HEALTH-04 validation)**; zero P0/P1 issues
4. **Restore drill passed** (Phase 7 acceptance re-verified in soak window): restore staging DB from pgBackRest to clean VPS, swap traffic, verify
5. **Rollback drill passed** (Phase 4 acceptance re-verified): deploy a controlled regression to staging, `make rollback v=N-1`, verify
6. **On-call rotation documented in `docs/RUNBOOKS/oncall.md`** per user redline: weekly schedule (primary/backup), explicit response-time SLA, fallback flow if primary unreachable. NOT just "rotation set up" — actual schedule + ETAs + fallback flow committed to the file.
7. If all green: tag `v1.0-rc.1`; flip `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` from `Accepted (deferred-aware closure)` to `Accepted (closed)` with measured NFR values; update STATUS.md + DEVELOPMENT_PLAN.md
**Plans**: TBD

## Acceptance Gate for Milestone v1.0 Closure

The 8 hard criteria (mirrors AetherMorph brief, adapted with user redlines):

1. Backend deployable to fresh Hetzner account from IaC in <60 minutes (Phase 3 + 4)
2. One-command rollback proven **with a real DB migration in the rolled-back version** (Phase 4)
3. Zero secrets in repo or history — `gitleaks` + `trufflehog` clean on full clone (Phase 2)
4. Zero critical/high in CI security scans — `gosec` + `semgrep` + `govulncheck` + `trivy` (Phase 4)
5. Production-signed APK + IPA installs and runs on all 8 device classes (Phase 20)
6. **48-hour staging soak with ≥8 real runners** (mix iOS/Android, ≥2 de-Googled Android, ≥1 vendor-aggressive-killer like Xiaomi MIUI), zero P0/P1 issues (Phase 21)
7. **Restore drill passed + Rollback drill passed + On-call rotation documented in `docs/RUNBOOKS/oncall.md`** with weekly schedule + response-time SLA + fallback flow (Phase 7 + Phase 4 + Phase 21)
8. Runbooks exist: deploy, rollback, Mapbox-token-rotation, secret-rotation, incident-response, keystore-loss, crash-spike, rate-limit-storm

## Hard Rules for Agents (Milestone-wide)

- No secret ever committed, even in examples or fixtures. Use placeholders like `EXPO_PUBLIC_MAPBOX_TOKEN_EXAMPLE_DO_NOT_USE` and `sk.EXAMPLE_DO_NOT_USE`.
- No `latest` image tags in production manifests. Pin to immutable SHA256 digests.
- No `--no-verify` on commits. Pre-commit hooks must pass.
- **No telemetry event that could correlate a runner to a specific location they ran.** Default to NOT sending if unsure.
- Crash reports from production → separate Sentry project from staging. Never cross.
- Release APK must be reproducible: two independent CI runs of same tag → byte-identical APKs (modulo signature).
- **Phase 2 → Phase 3 strict sequencing**: Ansible templates source from SOPS, never from inline values that get retroactively cleaned.

## v1.0.1 Backlog (debt items surfaced during v1.0 execution)

Tracked for the first post-v1.0 maintenance milestone. Not blocking v1.0-rc.1 cut.

| ID | Item | Source | Rationale |
|----|------|--------|-----------|
| GHCR-PULL-AUTH | Direct GHCR pull on prod (replace save/scp/load) | Plan 04-04 D-04-04-A | Save/scp/load via controller adds ~5 min wall-clock per deploy. Options: flip 8 packages public via web UI (manual one-shot) OR Ansible `delegate_to: localhost` short-lived registry-token push (avoids prod-side PAT). Blocking automation: CI-only deploy без локального controller невозможен пока. |
| MIGRATE-RSYNC-DELETE | rsync --delete for migrations subtree only | Plan 04-04 T-04-04-STALE-MIGRATIONS | Current Makefile workaround `--skip-tags=run-migrations` hides design fragility: obsolete migration files linger on prod after deploy of older code. Fix: scoped `--delete --include=migrations/` rsync invocation in synchronize task. |
| METADATA-RAW-TAG | metadata-action `pattern={{raw}}` для semver tags | Plan 04-04 D-04-04-A discovery | CD currently strips `v` prefix from semver (publishes `1.0.0-rc.test-a` not `v1.0.0-rc.test-a`). Ansible normalizes via Jinja, но raw git tag и GHCR tag-string не совпадают — confusing для ops. |
| CD-SMOKE-VERIFY | Fix `cosign-verify-smoke` job in backend-cd.yml | Plan 04-04 CICD-02 carry | Workflow's own verify-smoke job fails on UNAUTHORIZED for private packages. Need `cosign verify` with workflow-token auth OR retire job в favor of post-publish OCI referrer check (currently mitigated by external `gh attestation verify`). |
| DIGEST-PINNING | SHA256 digest-pin compose images (Option (a) per RESEARCH §E) | Plan 04-03a deferred + Plan 04-04 | Current `${SPORT_STACK_TAG}` tag-pin is mutable. v1.0.1: separate workflow that commits digest-update PR + cosign-verify-pre-pull gate в Ansible (delegate_to: localhost). |
| SECRETS-ROTATE | Rotate compromised secrets (POSTGRES_PASSWORD, JWT_SECRET, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD) | Phase 3 chat-leak 2026-05-17 | Pasted in chat during Phase 3 SOPS-fill; injected via `sops --set`. Must rotate before Phase 21 staging soak. |

## What This Replaces (Pre-v1.0 Planning Artifacts)

The earlier feature-focused 8-phase v1.0 scope is superseded by this 21-phase hardening scope.

| Old artifact | New disposition |
|--------------|-----------------|
| Old Phase 1 (Validate & Close Territory Core) — 35 commits on `feat/cursona-redesign` | Commits kept as-is in git history. Planning dir moved to `.planning/phases/_archive/pre-v1.0-territory-refactors/`. Pixel field-test gating relocated to Phase 16 (CONTEXT skeleton seeded). |
| Old Phase 2 (Real Health Integrations) | HEALTH-04 (Strava read-only OAuth) pulled into v1.0 scope as its own REQ-ID. Rest deferred to v1.1. |
| Old Phases 3-8 (Cursona wrap, Privacy zones, Segments, Coaching, Premium, GDPR) | All deferred to v1.1+ in REQUIREMENTS.md §Deferred from v1.0 with reasons. |
| Old `01-CONTEXT.md` + `01-RESEARCH.md` + `01-PATTERNS.md` + 10 PLAN.md files + 10 SUMMARY.md files | Preserved in `.planning/phases/_archive/pre-v1.0-territory-refactors/` as historical reference. New phases get fresh CONTEXT/RESEARCH/PATTERNS/PLAN files as planned. |

---

*Roadmap defined: 2026-05-15*
*Milestone: v1.0 Production Readiness*
*Status: Phase 1 ready to plan via `/gsd-discuss-phase 1`*
