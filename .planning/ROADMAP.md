# Roadmap: Running Ecosystem

## Overview

This roadmap covers the **remaining work** for the Running Ecosystem project. Phases 0–8 plus M10 tracking stats are already shipped at code-level (see `.planning/PROJECT.md` §Validated). The GSD phases below are derived from forward-looking REQ-IDs in `.planning/REQUIREMENTS.md` and roll up to the existing atomic task IDs in `docs/DEVELOPMENT_PLAN.md` (`P<phase>-<section>-<number>`) — the canonical implementation breakdown.

The journey: close Phase 1 with real-device field validation and final refactors → land real Health platform adapters (HealthKit / Health Connect / Strava / Garmin / FIT) → wrap the active `feat/cursona-redesign` branch and merge to `main` → ship privacy controls (zones + per-session visibility) → unlock the game layer (segments, leaderboards, zone-wars) → enable coach role and training-plan distribution → monetize via Stripe / RevenueCat with feature gating → and complete GDPR readiness (consent, export, right-to-be-forgotten, pen-test) before public launch.

Cross-cutting concerns (i18n infrastructure, dependency scanning, CI performance regression, bug bounty) are tracked as per-phase obligations rather than a phase of their own — they get attached to whichever phase first surfaces a strong need (or completes alongside the GDPR phase before launch).

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Validate & Close Territory Core** - Field-test on 3 OEMs, finish Phase 1 refactors, rotate Mapbox tokens, close Phase 1 in `STATUS.md`
- [ ] **Phase 2: Real Health Integrations** - Replace mock health adapters with real HealthKit / Health Connect / Strava / Garmin / FIT + Sensor Sync backend
- [ ] **Phase 3: Cursona Redesign Wrap** - Finalize feed ranking, stories visibility, Follow UI, people search, registration on `feat/cursona-redesign`; merge to `main`
- [ ] **Phase 4: Privacy Zones & Visibility** - User-defined home/work mask zones + per-session visibility (private / followers / public)
- [ ] **Phase 5: Segments & Territory Game** - Segments, per-segment leaderboards, territory / zone-wars game mechanic
- [ ] **Phase 6: Coaching & Plans** - Coach role, coach↔athlete link with scoped data sharing, drag&drop plan builder, plan execution, coach dashboard, per-workout feedback
- [ ] **Phase 7: Premium & Marketplace** - Stripe + RevenueCat checkout, Free/Pro/Coach tiers, feature gating, plans marketplace, receipt validation
- [ ] **Phase 8: GDPR & Compliance** - Consent flow, data export, right-to-be-forgotten, pen-test, bug bounty, dependency scanning, i18n EN, CI performance regression

## Phase Details

### Phase 1: Validate & Close Territory Core
**Goal**: Prove Territory Core meets NFR targets on real iPhone + Pixel + Chinese-Android, close residual Phase 1 refactors, and rotate the `pk.…` Mapbox token to `sk.…` so Phase 1 can be formally closed in `STATUS.md` / `DEVELOPMENT_PLAN.md`.
**Depends on**: Nothing (codebase is already at Phase 8 / M10; this is the formal closure of Phase 1).
**Requirements**: PHASE1-01, PHASE1-02, PHASE1-03, PHASE1-04, PHASE1-05, PHASE1-06, PHASE1-07, PHASE1-08, PHASE1-09, PHASE1-10, PHASE1-11, PHASE1-12, PHASE1-13, PHASE1-14
**Success Criteria** (what must be TRUE):
  1. `tests/FIELD_PROTOCOL.md` shows T1 (5km reference loop) executed on iPhone, Pixel, and a Chinese-Android device, all with ≤3% distance error vs. Garmin (NFR-001).
  2. T2/T9 area tests pass with ≤5% error on the reference football field (NFR-002); T6 2-hour session shows ≤10%/h battery + ≤100MB memory growth (NFR-003 / NFR-007); T8 in-pocket 30-min run shows ≥95% record-time on all three devices (NFR-005).
  3. After Stop+Save, the user lands on a Summary screen with a full-map territory render; user can open a manual offline-region picker UI and download a custom region; closure of a zone triggers haptic + toast.
  4. Mapbox `server-secret` is a real `sk.…` token with Android SHA-256 fingerprint restriction; no secret token strings remain in chat history or `.env` checked into git; ESLint guard rejects `EXPO_PUBLIC_*_SECRET`.
  5. `STATUS.md` and `docs/DEVELOPMENT_PLAN.md` mark Phase 1 as closed; ADR captures any field-test surprises or deferred follow-ups.
**Plans**: TBD
**Maps to existing plan**: `P1-B` (MapScreen refactor), `P1-C` (SessionManager extraction), `P1-D-04` (big-track simplification), `P1-G-09` (closure haptic + toast), `P1-I-02` (SignificantLocationChanges), `P1-I-05` (adaptive sampling), `P1-J-05` (summary screen with big map), `P1-K-04` (manual offline region UI), `P1-M T1..T15` (field protocol).
**Concerns to address (from `.planning/codebase/CONCERNS.md`)**: token rotation (`docs/SECRETS.md` TODOs); split `useActivityStore` god-store as part of P1-C SessionManager extraction; add SQLite real-DB integration tests (R5) alongside any storage changes; resume-from-crash path (R: recoverLast).
**UI hint**: no

### Phase 2: Real Health Integrations
**Goal**: Replace the stub `MockHealthAdapter` and partial Strava scaffold with production HealthKit, Health Connect, Strava (PKCE + bidirectional + webhooks), Garmin Connect, a backend FIT parser, and a Sensor Sync orchestrator — so users can pull workouts from any source and push our sessions back.
**Depends on**: Phase 1 (field-test signoff so we ship integrations on top of a validated GPS pipeline).
**Requirements**: HEALTH-01, HEALTH-02, HEALTH-03, HEALTH-04, HEALTH-05, HEALTH-06, HEALTH-07, HEALTH-08, HEALTH-09, HEALTH-10
**Success Criteria** (what must be TRUE):
  1. iOS user toggles "Sync with Apple Health" in Settings; subsequent native workouts appear in Journal within 60s and our sessions appear in the Health app — idempotent via `(source, external_uuid)`.
  2. Android 14+ user toggles "Sync with Health Connect" with equivalent READ + WRITE behavior.
  3. Strava connect flow opens a PKCE authorization page (no `client_secret` on device); backend `/integrations/strava/{exchange,refresh}` handles the exchange and refresh; Strava webhooks deliver new activities to mobile within 2 minutes.
  4. Backend FIT parser ingests a Garmin `.fit` upload (or Garmin Connect webhook) and emits an internal Session record; cross-source dedup merges overlapping `[startedAt, endedAt]` windows from different sources into a single user-facing session.
  5. LTHR test wizard (30-min all-out) runs end-to-end and writes the resulting LTHR back into the athlete profile; aggregate `avg_hr_bpm` is correct across sessions that span pauses.
**Plans**: TBD
**Maps to existing plan**: `P7-A-01` (HealthKit READ), `P7-A-02` (HealthKit WRITE), `P7-A-03` (Health Connect READ + WRITE), `P7-A-04` (Strava OAuth + webhooks), `P7-A-05` (Garmin Connect), `P7-A-06` (FIT parser), `P7-A-07` (Sensor Sync service); HEALTH-09 deferred LTHR from Phase 6.
**Concerns to address**: R1 partial Strava fix (stubbed `requestPermissions`, missing backend endpoints, env-var unification `EXPO_PUBLIC_API_BASE` vs `EXPO_PUBLIC_API_URL`); R12 HealthKit `grantedScopes` readback limitation — wire "Reconnect HealthKit" prompt; R14 `importRepo` `startedAt` PK collision risk for bulk imports; R10 sync DTO v2 bump for `activity_type` + `laps` columns.
**UI hint**: yes

### Phase 3: Cursona Redesign Wrap
**Goal**: Finalize the active `feat/cursona-redesign` branch — feed ranking, stories mutual-friends visibility, Follow UI polish, people search, registration flow — and merge to `main` so all subsequent phases build on a single trunk.
**Depends on**: Phase 1 (token rotation must precede production-ready merge); can run in parallel with Phase 2 since branches do not conflict.
**Requirements**: SOCIAL-04
**Success Criteria** (what must be TRUE):
  1. Feed ranking algorithm signed off: self + followee posts merge with stable cursor pagination; Prometheus latency p95 < 500ms.
  2. Stories visibility honors mutual-friends rule; Follow UI shows accurate follower/following counts via the SQLite `relationsRepository` cache.
  3. People search returns matches by display name and handle in <300ms with trigram index; press-on-author from RunCard navigates to ForeignProfileScreen with no jank.
  4. Registration flow accepts new users end-to-end on a fresh install (email-OTP → onboarding → first record), no Round-1 Feed/Stories regression in the merged trunk.
  5. `feat/cursona-redesign` is merged into `main`; `STATUS.md` records the merge; ADR-0005 (or update to ADR-0004) documents the Feed-back-on outcome.
**Plans**: TBD
**Maps to existing plan**: Phase 8 / M9.6 (production audit fix), M9.7 (feed ranking + stories mutual-friends + Follow UI), M9.8 (people search + RunCard author press + relations cache), M10 (tracking stats baseline). ADR-0004 (Feed backend do-nothing) revisit.
**Concerns to address**: identity service `IDENTITY_DEV_MODE=true` default — flip before merging to `main` (P0 security); rate-limit `/auth/*` (P0); WebSocket token-in-query log redaction; permission-matrix Go↔TS sync CI check.
**UI hint**: yes

### Phase 4: Privacy Zones & Visibility
**Goal**: Give users explicit control over what gets shared — define one or more mask zones (home / work) that clip tracks before export, and let them choose per-session visibility (private / followers / public) both retroactively and at save-time.
**Depends on**: Phase 3 (cursona-redesign merged so the visibility chip surfaces correctly in feed + Journal).
**Requirements**: SOCIAL-05, SOCIAL-06
**Success Criteria** (what must be TRUE):
  1. User opens Settings → Privacy → Mask Zones, picks a center + radius (default 500m) on a map; subsequent recordings have track segments inside the zone hidden from any view consumed by followers / public.
  2. At Stop+Save, user picks visibility (private / followers / public) before the session syncs; default visibility is configurable in Settings.
  3. User can change visibility on an existing session from the Journal detail screen; backend `activity-sync` honors the new visibility flag for follower/public reads within one sync cycle.
  4. GPX export and any Strava push of a masked-zone session truncates / hides the masked portion consistently with what followers see.
**Plans**: TBD
**Maps to existing plan**: New under Phase 8 social extension. Touches `sessions` schema (visibility column), `activity-sync` API, `feed` service feed-eligibility filter, mobile `modules/privacy/`.
**Concerns to address**: `sessions` table lacks `user_id` column today — add as part of the visibility migration (multi-tenant + future Guest mode); `personal_records` likewise (R18); ensure HealthKit / Strava push respects mask + visibility (XCUT-side legal alignment with GDPR consent).
**UI hint**: yes

### Phase 5: Segments & Territory Game
**Goal**: Ship the gamification layer — geo-defined segments with leaderboards, plus the territory / zone-wars mechanic that turns the Territory Core area calc into a multiplayer game.
**Depends on**: Phase 4 (privacy visibility decides which sessions are eligible for leaderboards and territory contests).
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03
**Success Criteria** (what must be TRUE):
  1. User creates a segment by drawing a polyline on a recorded session or by selecting a published segment; subsequent qualifying runs match the segment within tolerance and post a time.
  2. Segment leaderboard ranks fastest times per user with age/gender filters; achievement notifications fire when a user takes a top-10 slot or improves a personal best.
  3. Territory map shows ownership by grid cell; ownership flips when a user runs a contesting closure inside an opponent's cell; club-aggregate ownership leaderboard surfaces in `me/Clubs`.
  4. Backend `segments` and territory tables index by `(user_id, geo_cell)` with bounded fan-out per publish; no N+1 query on leaderboard reads (Postgres EXPLAIN clean).
**Plans**: TBD
**Maps to existing plan**: `P8-A-06` (Segments), `P8-A-07` (Leaderboards), `P8-A-08` (Territory / zone-wars).
**Concerns to address**: Feed-ranking server load (Phase 8/M9 perf note) — apply similar caching/materialization strategy to segment leaderboards; ensure `MapAdapter` quarantine respected for any new territory layer (LineLayer + GeoJsonSource, never `PolylineAnnotation`).
**UI hint**: yes

### Phase 6: Coaching & Plans
**Goal**: Unlock the coach side of the product — coach role with verification, coach↔athlete link with scoped data sharing, drag&drop training plan builder, plan execution in the athlete's calendar, coach dashboard with adherence + PMC, and per-workout feedback.
**Depends on**: Phase 5 (training engine is already shipped at code-level; coach features need a fully-merged trunk with privacy + segments so coaches can review athletes' game-layer activity).
**Requirements**: COACH-01, COACH-02, COACH-03, COACH-04, COACH-05, COACH-06
**Success Criteria** (what must be TRUE):
  1. User toggles "I'm a coach" with verification; profile `global_role` (or `is_coach` flag) lights up the Coach UI surface.
  2. Coach sends a link request to an athlete; athlete accepts and picks data-share scope (workouts only / + HR / + GPS / everything); the coach dashboard reflects only the granted scope.
  3. Coach builds a 4-week plan via drag&drop in the Plan Builder, assigns it to athlete A; A sees today's workout in TrackerStart with one tap to "Start prescribed workout".
  4. Coach dashboard lists athletes sorted by adherence %, with recent workouts and PMC (CTL/ATL/TSB) summary; per-workout coach comments are visible only to the coach↔athlete pair.
**Plans**: TBD
**Maps to existing plan**: `P9-A-01` (Coach role scaffold extension), `P9-A-02` (link + scope), `P9-A-03` (plan builder), `P9-A-04` (plan execution), `P9-A-05` (dashboard), `P9-A-06` (per-workout feedback).
**Concerns to address**: `pkg/permissions` ABAC needs a coach-relation capability stream that mirrors mobile module; permission-matrix CI sync check (deferred from Phase 3 if not yet) must be in place before adding coach capabilities; XP/grade gamification policy for coach-prescribed workouts.
**UI hint**: yes

### Phase 7: Premium & Marketplace
**Goal**: Monetize the product — Stripe (Android web checkout) + RevenueCat (iOS IAP), three tiers (Free / Pro / Coach) with documented feature matrix, real `is_premium` ABAC gating, plans marketplace where coaches publish and athletes purchase, server-side receipt validation, and a policy decision on Wallet/coin↔fiat bridging.
**Depends on**: Phase 6 (Coach tier requires Coach role + plan builder to be a sellable product).
**Requirements**: PREMIUM-01, PREMIUM-02, PREMIUM-03, PREMIUM-04, PREMIUM-05, PREMIUM-06
**Success Criteria** (what must be TRUE):
  1. User taps "Upgrade to Pro" from the upgrade CTA; Stripe / RevenueCat checkout completes; entitlement flips to Pro within 60s via receipt webhook.
  2. Free / Pro / Coach feature matrix is enforced both server-side (`pkg/permissions` reads `is_premium` from a real entitlement, not the mocked `global_role`) and surfaced in UI as locked rows with upgrade CTA.
  3. Coach publishes a plan to the marketplace with price and description; athlete browses, purchases, and the plan appears in their calendar; revenue split is recorded server-side.
  4. Receipt validation rejects forged receipts in tests; subscription-state mismatches between App Store / Play / Stripe and our DB are reconciled within one daily cron pass.
  5. Wallet/coin policy is decided and documented in an ADR (either "soft-only — no fiat bridge" or "wired to real payments at conversion rate X").
**Plans**: TBD
**Maps to existing plan**: `P10-A-01` (checkout), `P10-A-02` (tier matrix), `P10-A-03` (feature gating), `P10-A-04` (marketplace), `P10-A-05` (receipt validation); ADR for PREMIUM-06.
**Concerns to address**: existing `is_premium` mock via `global_role` must be flipped to real entitlement source without breaking ABAC tests; `walletRepository` already has CHECK constraints and per-session idempotency (R5 noted unit tests in place; integration tests against real SQLite still missing — close before money flows).
**UI hint**: yes

### Phase 8: GDPR & Compliance
**Goal**: Finish all launch-blocking compliance — consent flow on signup, data export, right-to-be-forgotten, third-party pen-test with critical findings remediated, bug bounty program launched, dependency scanning on weekly cadence, i18n infrastructure with RU+EN strings extracted, and CI performance regression tests for distance/area/FPS — all required before opening the public store listing.
**Depends on**: Phases 1–7 are functionally complete; this phase must finish before public launch. Runs in parallel with later phases internally, but the launch gate is here.
**Requirements**: XCUT-01, XCUT-02, XCUT-03
**Success Criteria** (what must be TRUE):
  1. New-user signup includes a GDPR consent screen with explicit toggles for data processing, location data, and marketing; consent state is recorded server-side with timestamp + version; user can revisit and revise at any time in Settings.
  2. User taps "Export my data" in Settings → Privacy; receives a downloadable zip with JSON dumps of sessions, points (sampled), profile, social graph, integrations, wallet transactions, and audit log within 24 hours.
  3. User taps "Delete my account"; flow confirms with re-auth; account + cascade rows deleted across all backend services within 30 days; integrations (Strava / Garmin / HealthKit) are revoked or have their tokens invalidated on our side.
  4. External pen-test report shows zero unresolved critical findings; bug bounty program is live (HackerOne or self-hosted); Dependabot/Snyk run weekly with no high-severity vulns aged >7 days.
  5. CI runs distance/area accuracy tests on synthetic GPS traces and a map-FPS smoke test on every PR; failure blocks merge. EN strings are extracted alongside RU; i18next switches at runtime.
**Plans**: TBD
**Maps to existing plan**: New phase, no prior `P<n>` IDs. Cross-cuts XCUT-04 (pen-test), XCUT-05 (i18n), XCUT-06 (bug bounty), XCUT-07 (Dependabot/Snyk), XCUT-08 (CI performance regression).
**Concerns to address**: all P0 security items from `.planning/codebase/CONCERNS.md` — `IDENTITY_DEV_MODE` default flip (if not done in Phase 3), rate-limit `/auth/*`, OTP stdout log redaction, admin dashboard CSP/HSTS headers, WebSocket token-in-query redaction. Pen-test scope must include backend feed orphan service (ADR-0004) — confirm idle endpoints don't expose data.
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8.
Phase 3 (Cursona Redesign Wrap) may run in parallel with Phase 2 since they touch different subsystems.
Phase 8 (GDPR & Compliance) must complete before public launch but may start in parallel with later phases internally.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Validate & Close Territory Core | 0/TBD | Not started | - |
| 2. Real Health Integrations | 0/TBD | Not started | - |
| 3. Cursona Redesign Wrap | 0/TBD | Not started | - |
| 4. Privacy Zones & Visibility | 0/TBD | Not started | - |
| 5. Segments & Territory Game | 0/TBD | Not started | - |
| 6. Coaching & Plans | 0/TBD | Not started | - |
| 7. Premium & Marketplace | 0/TBD | Not started | - |
| 8. GDPR & Compliance | 0/TBD | Not started | - |

---

*Roadmap created: 2026-05-14 (brownfield init on `feat/cursona-redesign`, post Phase 8 / M10).*
*Source of truth for implementation tasks: `docs/DEVELOPMENT_PLAN.md` (`P<phase>-<section>-<number>` IDs).*
*Source of truth for project status: `STATUS.md`.*
*Source of truth for architectural decisions: `docs/DECISIONS/0001..0004`.*
