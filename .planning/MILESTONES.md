# Milestones

Tracks major milestone cycles for Running Ecosystem. Each milestone scopes a coherent set of phases toward a release-quality outcome.

---

## v1.0 Production Readiness — IN PROGRESS

**Opened:** 2026-05-14 (GSD brownfield init); formalized as Milestone v1.0 on 2026-05-15.
**Target close:** Phase 8 (GDPR & Compliance) ship + pen-test pass — the public-launch gate.
**Goal:** Take Running Ecosystem from Phase 8 / M10 code-complete state to a publicly launchable v1.0 with field-validated GPS pipeline, real platform integrations, privacy controls, gamification (segments/territory), coaching, monetization, and GDPR readiness.

### Phase progress

| Phase | Title | Status | REQ-IDs |
|-------|-------|--------|---------|
| 1 | Validate & Close Territory Core | 🟡 Code-complete (deferred-aware closure 2026-05-14) — 35 commits, 536 tests; awaits Mapbox dashboard rotation + 3-OEM field tests (NFR-001..007) | PHASE1-01..14 |
| 2 | Real Health Integrations | ⏳ Pending — HealthKit / Health Connect / Strava / Garmin / FIT-parser / Sensor Sync | HEALTH-01..10 |
| 3 | Cursona Redesign Wrap | ⏳ Pending — finalize `feat/cursona-redesign`, merge to `main` | SOCIAL-04 |
| 4 | Privacy Zones & Visibility | ⏳ Pending — home/work mask zones + per-session visibility | SOCIAL-05..06 |
| 5 | Segments & Territory Game | ⏳ Pending — segments + leaderboards + zone-wars | SOCIAL-01..03 |
| 6 | Coaching & Plans | ⏳ Pending — Coach role, plan builder, dashboard, per-workout feedback | COACH-01..06 |
| 7 | Premium & Marketplace | ⏳ Pending — Stripe / RevenueCat, tiers, gating, marketplace | PREMIUM-01..06 |
| 8 | GDPR & Compliance | ⏳ Pending — consent, export, right-to-be-forgotten, pen-test, bug bounty, i18n EN, CI perf regression | XCUT-01..03 (+ XCUT-04..08 per-phase) |

### Acceptance criteria for v1.0 close

1. All 8 phases formally complete with their Phase-N `Maps to existing plan` P-IDs closed in `docs/DEVELOPMENT_PLAN.md`.
2. Phase 1 NFR-001..007 measured on at least Pixel + iPhone with each ≤ target (NFR-001 ≤3% distance error, NFR-002 ≤5% area error, NFR-003 ≤10%/h battery, NFR-005 ≥95% record-time, NFR-006 ≥50 fps, NFR-007 ≤100MB memory growth).
3. External pen-test passed; high/critical findings remediated (XCUT-04).
4. GDPR consent + data export + right-to-be-forgotten user flows shipped (XCUT-01..03).
5. App Store + Google Play submissions pass review.
6. `docs/DECISIONS/0005-phase-1-field-test-outcomes.md` flipped from `Accepted (deferred-aware closure)` to `Accepted (closed)` with measured NFR values.

### Pre-v1.0 baseline (already shipped at code level — see PROJECT.md §Validated)

Phases 0–8 of the original `docs/DEVELOPMENT_PLAN.md` were code-complete when GSD planning was initialized on this codebase (2026-05-14). Notable shipped capabilities: Expo RN + Mapbox + Go backend; Territory Core (Kalman pipeline + area calc); Account & Cloud Sync; Production Backend on Hetzner-like VPS; Profile & Stats incl. M10 tracking stats; Sensors & HRM; Training Engine (TSS / Banister / Riegel / Cameron / Workout Player); Phase 6.5 polish; Phase 7 scaffold (Mock + HealthKit/HealthConnect stub-safe + Strava pull-only); full Phase 8 / A–L Social stack (messenger, groups+media, stories, feed, moderation, realtime, rate-limiting, deep-linking, RBAC, ABAC); recent M9.6–M10 cursona-redesign work on the active branch.

The v1.0 Production Readiness milestone takes that code-complete baseline through formal validation, integration realism, gamification, monetization, and compliance to a launchable product.

---

## Milestone History

*(none yet — v1.0 is the first formalized milestone via GSD)*
