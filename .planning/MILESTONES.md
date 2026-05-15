# Milestones

Tracks major milestone cycles for Running Ecosystem. Each milestone scopes a coherent set of phases toward a release-quality outcome.

---

## v1.0 Production Readiness — IN PROGRESS

**Opened:** 2026-05-14 (GSD brownfield init).
**Formalized:** 2026-05-15 (initial 8-phase feature scope).
**Redefined:** 2026-05-15 (current 21-phase hardening scope — supersedes the initial feature scope).
**Target close:** Tagged `v1.0-rc.1` after 48-hour staging soak with ≥8 real runners (Phase 21 acceptance).
**Goal:** Take Running Ecosystem from Phase 8/M10 code-complete state on `feat/cursona-redesign` (working on dev machine, deployed by hand to single Hetzner-like VPS) to **closed-beta deployable** with iOS + Android signed release builds, automated infra deployable to a fresh Hetzner account from IaC, observability that doesn't leak GPS/PII, and a tagged release for ≥8 real runners to soak for 48 hours.

### Phase progress (21 phases, 5 workstreams)

| Phase | Title | Workstream | Status | REQ-IDs |
|-------|-------|------------|--------|---------|
| 1 | Release contract & version baseline | `shared` | ⏳ Pending | REL-01..05 |
| 2 | Secrets & config hardening | `backend` | ⏳ Pending (NON-NEGOTIABLE, gates Phase 3) | SEC-01..09 |
| 3 | Infrastructure as code | `backend` | ⏳ Pending (strict after 2) | INFRA-01..07 |
| 4 | CI/CD pipeline | `backend` | ⏳ Pending | CICD-01..06 |
| 5 | Observability backend (Sentry self-hosted) | `backend` | ⏳ Pending | OBS-01..08 |
| 6 | Edge protection & rate-limiting | `backend` | ⏳ Pending | EDGE-01..05 |
| 7 | DB + queues + state ops (pgBackRest + R18 migration) | `backend` | ⏳ Pending | DB-01..08 |
| 8 | Load + chaos baselines | `backend` | ⏳ Pending | LOAD-01..06 |
| 9 | Android release signing | `android` | ⏳ Pending | AND-SIGN-01..05 |
| 10 | iOS release signing | `ios` | ⏳ Pending | IOS-SIGN-01..05 |
| 11 | Android release build config + HEALTH-04 Android | `android` | ⏳ Pending | AND-BUILD-01..06 + HEALTH-04 |
| 12 | iOS release build config + HEALTH-04 iOS | `ios` | ⏳ Pending | IOS-BUILD-01..05 + HEALTH-04 |
| 13 | Mapbox SDK 11.x migration | `mobile-shared` | ⏳ Pending | MAPBOX11-01..05 |
| 14 | Android native + ABI matrix | `android` | ⏳ Pending | AND-NATIVE-01..05 |
| 15 | iOS native + device class compat | `ios` | ⏳ Pending | IOS-NATIVE-01..03 |
| 16 | Background reliability in release builds (inherits Pixel field-test gating) | `mobile-shared` | ⏳ Pending (CONTEXT skeleton seeded) | BG-01..08 |
| 17 | Crash reporting (mobile Sentry, PII-strip) | `shared` | ⏳ Pending | CRASH-01..06 |
| 18 | Android self-hosted update channel | `android` | ⏳ Pending | AND-DIST-01..06 |
| 19 | iOS TestFlight pipeline | `ios` | ⏳ Pending | IOS-DIST-01..04 |
| 20 | Device matrix + physical tests (8 device classes) | `shared` | ⏳ Pending | DEVICES-01..08 |
| 21 | Staging E2E + go/no-go + tag `v1.0-rc.1` | `shared` | ⏳ Pending | E2E-01..07 |

**Total:** 96 REQ-IDs across 21 phases. 100% mapped.

### Critical path

```
1 (shared) → 2 (backend) ────────────────────────────┬──────────────┐
                                                     │              │
                                                     ▼              ▼
                          ┌────────────────┐    backend track    mobile tracks
                          ▼                ▼    3 → 4/5/6/7      9 → 11        10 → 12
                          android          ios  → 8              parallel    parallel
                          9 → 11 → 14      10 → 12 → 15                      
                                                     │              │
                                                     ▼              ▼
                                                 13 (Mapbox SDK 11.x migration, mobile-shared)
                                                     │
                                                     ▼
                                                 14, 15 (native + ABI per platform)
                                                     │
                                                     ▼
                                                 16 (background reliability — Pixel/iPhone gating)
                                                     │
                                                     ▼
                                                 17 (crash reporting), 18 (android dist), 19 (ios dist)
                                                     │
                                                     ▼
                                                 20 (device matrix, 8 classes)
                                                     │
                                                     ▼
                                                 21 (staging E2E + go/no-go + tag v1.0-rc.1)
```

### Hard sequencing constraints (per user redlines)

- **Phase 2 → Phase 3 strict, no parallelization.** Ansible templates must consume from SOPS, not from inline values that get retroactively cleaned.
- **Phase 13 (Mapbox SDK 11.x) gated on debug-build regression** of ALL old Phase 1 tracker features (SessionManager, hooks, simplifyForDisplay, createCustomPack bounds, closure feedback, RegionPickerScreen) before any release-build work touches it.
- **Phase 16 inherits Pixel + iPhone field-test acceptance** from old Phase 1 — re-validated on RELEASE builds with rotated Mapbox token + R8/ProGuard + Hermes + SDK 11.x bump all in play. Acceptance criteria copied verbatim into `.planning/phases/16-background-reliability-in-release/16-CONTEXT.md`.

### Acceptance criteria for v1.0 close (8 hard criteria)

1. Backend deployable to fresh Hetzner account from IaC in **<60 minutes** (Phase 3 + 4)
2. One-command rollback proven **with a real DB migration in the rolled-back version** — no-op rollback doesn't count (Phase 4)
3. Zero secrets in repo or history — `gitleaks` + `trufflehog` clean on full clone (Phase 2)
4. Zero critical/high findings in CI security scans — `gosec` + `semgrep` + `govulncheck` + `trivy` (Phase 4)
5. Production-signed APK + IPA installs and runs on all 8 device classes (Phase 20)
6. **48-hour staging soak with ≥8 real runners** (mix iOS/Android, ≥2 de-Googled Android, ≥1 vendor-aggressive-killer like Xiaomi MIUI), zero P0/P1 issues (Phase 21)
7. **Restore drill passed + Rollback drill passed + On-call rotation documented in `docs/RUNBOOKS/oncall.md`** with weekly schedule + response-time SLA + fallback flow (Phase 7 + Phase 4 + Phase 21)
8. Runbooks exist: deploy, rollback, Mapbox-token-rotation, secret-rotation, incident-response, keystore-loss, crash-spike, rate-limit-storm

### Pre-v1.0 baseline (already shipped at code level — see PROJECT.md §Validated)

Phases 0–8 of the original `docs/DEVELOPMENT_PLAN.md` plus M10 tracking stats were code-complete when GSD planning was initialized on this codebase (2026-05-14). Notable shipped capabilities: Expo RN + Mapbox + Go backend on Hetzner-like VPS; Territory Core (Kalman pipeline + area calc); Account & Cloud Sync; Profile & Stats; Sensors & HRM; Training Engine (TSS / Banister / Riegel / Cameron / Workout Player); Phase 6.5 polish; Phase 7 scaffold (Mock + HealthKit/HealthConnect stub-safe + Strava pull-only); full Phase 8 / A–L Social stack (messenger, groups+media, stories, feed, moderation, realtime, rate-limiting, RBAC, ABAC); recent M9.6–M10 cursona-redesign work on the active branch.

The earlier v1.0 scope (2026-05-15, since superseded) executed Phase 1 of the feature-roadmap on `feat/cursona-redesign` — 35 commits of territory-core refactors (SessionManager, tracker hooks, closure feedback, offline region picker bounds fix, adaptive sampling + SLC, ESLint v9 + token-secret guard). Those commits remain on the branch; planning artifacts moved to `.planning/phases/_archive/pre-v1.0-territory-refactors/`. Pixel + iPhone field-test acceptance gating relocated to new Phase 16 CONTEXT skeleton.

### What got deferred from v1.0 (now v1.1+)

Per the redefined scope: feature work slides out of v1.0 to keep the milestone purely about hardening. Tracked in `.planning/REQUIREMENTS.md` §Deferred from v1.0:

- **HEALTH** (except HEALTH-04 Strava read-only, which stays in v1.0 because closed-beta runners want to compare with their existing Strava data) → v1.1
- **SOCIAL** privacy zones + per-session visibility → v1.1; segments + leaderboards + zone-wars → v1.2
- **COACH** coach role + plan builder + dashboard → v1.3
- **PREMIUM** Stripe + RevenueCat + tiers + marketplace → v1.4
- **XCUT** GDPR consent + export + RTBF + pen-test + bug bounty → v1.5 (public-launch gate)
- **i18n** EN scaffolding → v1.1 (RU-only acceptable for closed beta per user decision)

---

## Milestone History

*(none yet — v1.0 is the first formalized milestone via GSD; first redefinition happened mid-milestone before any v1.0-specific phase shipped)*
