# Requirements: Running Ecosystem

**Defined:** 2026-05-14
**Core Value:** Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю. Офлайн, точно, без сбоев фоновой записи.

**Scope note:** This document covers **remaining work** for the running ecosystem project. Phases 0–8 (incl. M10 tracking stats) are already shipped at code-level — see PROJECT.md `Validated` section for the full list. Forward-looking REQ-IDs below; each is mapped to a roadmap phase in §Traceability.

## v1 Requirements

### Phase 1 Field Validation (PHASE1)

- [ ] **PHASE1-01**: Run field protocol T1 (5km reference loop) on iPhone, Pixel, и китайском Android — fill `tests/FIELD_PROTOCOL.md` with results
- [ ] **PHASE1-02**: Run T2/T9 (reference area + closed-loop area) on all three devices — verify ≤5% error (NFR-002)
- [ ] **PHASE1-03**: Run T6 (2-hour session) on all three devices — verify battery ≤10%/h (NFR-003), memory growth ≤100 MB (NFR-007)
- [ ] **PHASE1-04**: Run T8 (background reliability, 30 min in pocket) — verify ≥95% record-time on all three devices (NFR-005)
- [ ] **PHASE1-05**: Run T7 (map FPS at 5000+ points) — verify ≥50 fps panning (NFR-006); if fails, implement `P1-D-04` Douglas-Peucker simplification for big tracks
- [ ] **PHASE1-06**: Refactor MapScreen into dedicated screen with hook structure (`P1-B`)
- [ ] **PHASE1-07**: Extract `SessionManager` class from `activityStore` (`P1-C`)
- [ ] **PHASE1-08**: Add closure haptic feedback + toast notification on first zone closure (`P1-G-09`)
- [ ] **PHASE1-09**: Build summary screen with full-map after Stop+Save (`P1-J-05`)
- [ ] **PHASE1-10**: Build manual offline-region picker UI (`P1-K-04`)
- [ ] **PHASE1-11**: Implement adaptive GPS sampling (high freq when moving, low when paused) (`P1-I-05`)
- [ ] **PHASE1-12**: Add SignificantLocationChanges fallback for iOS when background activity terminates (`P1-I-02`)
- [ ] **PHASE1-13**: Rotate Mapbox `server-secret` token (currently `pk.…`, must become `sk.…`); add Android SHA-256 fingerprint restriction; remove tokens from any chat history per `docs/SECRETS.md` TODOs
- [ ] **PHASE1-14**: Document field-testing acceptance results and close Phase 1 in STATUS.md / DEVELOPMENT_PLAN.md

### Phase 7 Health Platform & Integrations (HEALTH)

- [ ] **HEALTH-01**: Replace `MockHealthAdapter` with real `HealthKitAdapter` (iOS) via `react-native-health`; READ workouts since timestamp (`P7-A-01`)
- [ ] **HEALTH-02**: Write our sessions to Apple Health as workouts (`P7-A-02`) — idempotent via `externalId`
- [ ] **HEALTH-03**: Real `HealthConnectAdapter` (Android 14+) via `react-native-health-connect`; READ + WRITE (`P7-A-03`)
- [ ] **HEALTH-04**: Strava bidirectional OAuth with PKCE on mobile + backend-proxy refresh; ingest activities; push our sessions when user opts in (`P7-A-04`)
- [ ] **HEALTH-05**: Strava webhooks → backend → push to mobile (`P7-A-04` continued)
- [ ] **HEALTH-06**: Garmin Connect ingest (OAuth + webhooks; gated API approval required) (`P7-A-05`)
- [ ] **HEALTH-07**: FIT-parser on backend (`P7-A-06`) — Go service or Python adapter for FIT → our internal Session schema
- [ ] **HEALTH-08**: Sensor Sync service on backend (`P7-A-07`) — orchestrates pulls/pushes per user, handles rate limits, dedup
- [ ] **HEALTH-09**: Add LTHR test wizard (30-minute all-out) — deferred from Phase 6
- [ ] **HEALTH-10**: Aggregate `avg_hr_bpm` correctly when sensor readings span pauses; verify Phase 5 `sensor_readings` query

### Phase 8 Social — Deferred Items (SOCIAL)

- [ ] **SOCIAL-01**: Segments (geo-defined route portion) — `P8-A-06`: domain model, segment creation flow, segment match detection (route ∩ segment with tolerance), segment storage backend service + endpoints
- [ ] **SOCIAL-02**: Segment leaderboards (`P8-A-07`) — per-segment fastest times, age/gender filters, achievement notifications
- [ ] **SOCIAL-03**: Territory / zone-wars game mechanic (`P8-A-08`) — territory ownership on map grid, contest mechanics, club territories, leaderboards by area captured
- [ ] **SOCIAL-04**: Cursona-redesign wrap — finalize feed ranking algorithm, stories mutual-friends visibility, Follow UI polish, people search, registration flow on `feat/cursona-redesign`; merge to `main`
- [ ] **SOCIAL-05**: Privacy zones — user can mask home/work areas; tracks within zone are not exported / not visible to followers (Strava-equivalent)
- [ ] **SOCIAL-06**: Activity visibility controls (private / followers / public) per session — both retroactive and at-save

### Phase 9 Coaching & Plans (COACH)

- [ ] **COACH-01**: Coach role in Identity (`P9-A-01`) — extend `profiles.global_role` enum or new `is_coach` flag + verification flow
- [ ] **COACH-02**: Coach↔Athlete link with bidirectional acceptance; data-share scope picker (workouts only / + HR / + GPS / everything) (`P9-A-02`)
- [ ] **COACH-03**: Training plan builder (drag&drop) — UI to compose multi-week structured plans from workouts (`P9-A-03`)
- [ ] **COACH-04**: Plan execution — apply plan to athlete calendar, surface today's workout in TrackerStart (`P9-A-04`)
- [ ] **COACH-05**: Coach dashboard — list of athletes with adherence %, recent workouts, PMC summary (`P9-A-05`)
- [ ] **COACH-06**: Per-workout coach feedback — text comments + reactions visible only to coach↔athlete pair (`P9-A-06`)

### Phase 10 Premium & Marketplace (PREMIUM)

- [ ] **PREMIUM-01**: Stripe (Android) + RevenueCat (iOS) integration; checkout flow (`P10-A-01`)
- [ ] **PREMIUM-02**: Tier definitions: Free / Pro / Coach with feature matrix (`P10-A-02`)
- [ ] **PREMIUM-03**: Feature gating — wire `pkg/permissions` ABAC `is_premium` to actually gate (currently mocked via `global_role`); UI surfacing of upgrade CTA (`P10-A-03`)
- [ ] **PREMIUM-04**: Plans marketplace — coaches publish plans, athletes browse / purchase; revenue split; rating system (`P10-A-04`)
- [ ] **PREMIUM-05**: Receipt validation (server-side via App Store / Play / Stripe webhook) — fraud-resistant entitlement (`P10-A-05`)
- [ ] **PREMIUM-06**: Wallet/coin↔fiat bridge decision — either keep coins as soft-currency only (decide policy) or wire to real payments

### Cross-Cutting (XCUT)

- [ ] **XCUT-01**: GDPR consent flow on signup (data processing, location data, marketing opt-in)
- [ ] **XCUT-02**: Data export — full user data dump (sessions, profile, social, integrations) as zip+JSON
- [ ] **XCUT-03**: Right-to-be-forgotten — full account deletion incl. backend cascade + integration revocation
- [ ] **XCUT-04**: Penetration test before public launch — external vendor, fix critical findings
- [ ] **XCUT-05**: i18n infrastructure (i18next on mobile, equivalent on web admin); RU + EN strings extracted; wrap remaining hardcoded strings
- [ ] **XCUT-06**: Bug bounty program documented at launch (HackerOne or self-hosted)
- [ ] **XCUT-07**: Dependabot / Snyk for both mobile-rn and services/backend; weekly cadence
- [ ] **XCUT-08**: CI performance regression tests — distance/area accuracy on synthetic GPS traces; map FPS smoke

## v2 Requirements (deferred)

### Social v2 (SOCIAL2)

- **SOCIAL2-01**: Clubs (groups of athletes with shared territory + segments)
- **SOCIAL2-02**: Club-vs-club zone-wars with weekly leaderboards
- **SOCIAL2-03**: Public profile pages with shareable URLs

### Coaching v2 (COACH2)

- **COACH2-01**: AI-assisted plan generation (LLM proposes structure based on athlete's PMC + race goal)
- **COACH2-02**: Adaptive plans (auto-adjust based on actual TSS vs planned)
- **COACH2-03**: Coach-side analytics (athlete progress charts, periodization view)

### Training Engine v2 (TRAIN2)

- **TRAIN2-01**: Zone-based race predictor (ZRH)
- **TRAIN2-02**: Adaptive training plan (fitness-prediction model)
- **TRAIN2-03**: Backend Training Engine service (when data inflow justifies)

### Sensors v2 (SENS2)

- **SENS2-01**: Power meter support (Stryd)
- **SENS2-02**: Running dynamics (ground contact time, vertical oscillation)
- **SENS2-03**: Foot pod / cadence

## Out of Scope

| Feature | Reason |
|---------|--------|
| Web client (athlete-facing) | Mobile-first; web admin exists for moderation only |
| Flutter mobile codebase | Archived per `DECISION.md`; no parallel development |
| Guest mode | Deferred per ADR-0002 — no anonymous-then-merge migration path planned |
| Mapbox Studio custom style | Deferred from Phase 0 (P0-A-02); using standard `outdoors-v12` until field-test wrap |
| Backend feed/stories endpoint deprecation | Per ADR-0004 — do-nothing on backend; endpoints stay running |
| Localization beyond RU+EN | On-demand only; no commitments to DE/ES/IT until market signal |
| Cycling-first features | App is sport-agnostic but **running-primary**; cycling is supported via activity-type chip but no cycling-specific power-zone analytics |
| Real-time live tracking ("share my run live") | Privacy + battery cost vs. value unclear; revisit post-Phase 10 |
| Smart watch native app (Garmin Connect IQ / Apple Watch app) | Integration via HealthKit/Health Connect/FIT is the strategy; standalone watch app deferred |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PHASE1-01..14 | Phase 1: Validate & Close Territory Core | Pending |
| HEALTH-01..10 | Phase 2: Real Health Integrations | Pending |
| SOCIAL-04 | Phase 3: Cursona Redesign Wrap | Pending |
| SOCIAL-05..06 | Phase 4: Privacy Zones & Visibility | Pending |
| SOCIAL-01..03 | Phase 5: Segments & Territory Game | Pending |
| COACH-01..06 | Phase 6: Coaching & Plans | Pending |
| PREMIUM-01..06 | Phase 7: Premium & Marketplace | Pending |
| XCUT-01..03 | Phase 8: GDPR & Compliance | Pending |
| XCUT-04..08 | Cross-cutting (per-phase) | Pending |

**Coverage:**
- v1 requirements: 49 total
- Mapped to phases: 49
- Unmapped: 0 ✓

**Note:** Existing `docs/DEVELOPMENT_PLAN.md` task IDs (`P<phase>-<section>-<number>`) remain the canonical implementation breakdown — REQ-IDs above provide GSD-side traceability and roll up to GSD phase plans which will reference the P-IDs.

---
*Requirements defined: 2026-05-14*
*Last updated: 2026-05-14 after GSD brownfield initialization*
