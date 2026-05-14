# Running Ecosystem

## What This Is

Мобильная экосистема для **полупрофессиональных бегунов** (iOS + Android): точный GPS-трекинг с игровой механикой «захвата территории», структурированные тренировки, интеграции с часами/HealthKit/HealthConnect/Strava, социальный слой (чаты/лента/истории/модерация) и серверный backend на Go. Команда: 2 разработчика. Целевой пользователь — атлет, который сравнивает свои данные с Garmin и ждёт точности Strava + аналитики TrainingPeaks.

## Core Value

**Записать пробежку → увидеть свою территорию на карте → сохранить → видеть историю.** Если всё остальное падает, это должно работать офлайн, точно, и без сбоев фоновой записи на 30-минутной пробежке.

## Requirements

### Validated

<!-- Shipped (code-level) capabilities inferred from STATUS.md, CHANGELOG, codebase map. -->

- ✓ **Phase 0** — Framework selection: Expo RN + TypeScript chosen, Flutter archived — see `DECISION.md` / `docs/DECISIONS/0001-framework-react-native.md`
- ✓ **Phase 1 Territory Core (P1-A..L)** — карта (Mapbox via `MapAdapter`), GPS pipeline (Kalman + filters, 93% coverage), live track / zone / corridor / history layers, area calc (95%+ coverage), closure detection, auto-pause, recovery after force-kill, SQLite persistence, GPX export, offline tile pack (10×10 km auto-download), history viewer
- ✓ **Phase 2 Account & Cloud Sync** — code-level done
- ✓ **Phase 3 Production Backend** — Hetzner-like VPS deploy, Caddy + Let's Encrypt, Postgres+TimescaleDB
- ✓ **Phase 4 Profile & Stats** — code-level done; M10 tracking stats (records, streak, week/month, best pace) shipped
- ✓ **Phase 5 Sensors & HRM** — code-level done
- ✓ **Phase 6 Training Engine (P6-A-01..10)** — TSS / rTSS, Banister CTL/ATL/TSB, PMC UI, LTHR / VO2max estimation, Riegel/Cameron predictors, workout structure, workout player, library
- ✓ **Phase 6.5 polish** — per-km splits, HR aggregation, SessionDetail screen, real expo-speech TTS
- ✓ **Phase 7 scaffold** — `HealthAdapter` abstraction + `MockHealthAdapter` + sync helper; `HealthKitAdapter` (lazy `react-native-health` on iOS); `HealthConnectAdapter` stub-safe; `StravaAdapter` pull-only env-driven (PKCE-ready, refresh via backend-proxy)
- ✓ **Phase 8 / A — Messenger MVP** — 4 Go services (social-graph, messaging, realtime-gw, notifications), NATS JetStream, Redis, mobile chats with 3 screens
- ✓ **Phase 8 / B — Groups + media** — group conversations, member roles, reactions/replies/edits, media service with MinIO presigned URLs
- ✓ **Phase 8 / C–D — Stories + Feed (posts/likes/comments)** — `feed` Go service, modular `modules/stories|feed/{domain,storage,state,sync,ui}` mobile pattern, offline-first drafts, e2e smoke tests
- ✓ **Phase 8 / E — Moderation** — reports + audit log + admin queue (mobile + web)
- ✓ **Phase 8 / F — Realtime + push for feed events** — end-to-end pipeline action → NATS → WS + Expo Push
- ✓ **Phase 8 / G — Admin Queue UI (in-app)** — AdminQueueScreen / AdminResolveSheet behind `isAdmin` gate
- ✓ **Phase 8 / H — Realtime for stories**
- ✓ **Phase 8 / I — Rate limiting** — Redis ZSET sliding window in shared `pkg/ratelimit`, wired into hot endpoints
- ✓ **Phase 8 / J — Inline-prepend + push deep-linking** — instant story insertion, deep-link routing to ChatsModal/FeedModal
- ✓ **Phase 8 / K — Унифицированная RBAC** — shared `pkg/permissions` (Go) + `modules/permissions` (mobile) mirror, 16 + 29 unit tests, capability strings, ban / moderator-override / ownership / conv-role chain
- ✓ **Phase 8 / L — ABAC + muted + audit + web admin** — attribute-based rules (premium gating), `muted_until` enforcement, shared `pkg/audit`, `/admin/audit` endpoint, static HTML admin dashboard via Caddy
- ✓ **Phase 8 / M9.6–M10 (current branch `feat/cursona-redesign`)** — production audit fix, feed ranking, stories mutual-friends, Follow UI, people search, RunCard author press, SQLite relations cache, tracking stats (records / streak / week / month / best pace)
- ✓ **Sport-agnostic activity types** — run/trail/walk/cycle/treadmill, MET tables + HR-based calories (Keytel 2005), calories+currency routed per type
- ✓ **Lap functional** — SQLite v18 `laps` table, stopwatch button in TrackerLive, fastest/slowest highlighting
- ✓ **Currency / Wallet** — domain + storage + store + WalletScreen + ShopScreen (9 placeholder items, 4 categories)
- ✓ **OAuth providers scaffold** — Google + Apple via `AuthProvider` interface (stub-safe; UI conditional on native package availability) — see `docs/DECISIONS/0003-oauth-providers.md`
- ✓ **Integrations contract** — `HealthAdapter.pullSince`, `importRepo.importFromAdapter` with `UNIQUE(source, external_uuid)` dedup, `checkWorkoutSanity`
- ✓ **Tests** — jest 435/435 passing, tsc clean (per latest STATUS.md round); domain/pipeline ≥80%, area ≥90% coverage targets met

### Active

<!-- Forward-looking scope. Building toward these. Detailed REQ-IDs in REQUIREMENTS.md. -->

- [ ] **Phase 1 closure** — field testing (P1-M T1–T15 on iOS + Pixel + Chinese Android), background reliability ≥95%, battery ≤10%/h, summary screen with big map (P1-J-05), manual offline region UI (P1-K-04), adaptive sampling (P1-I-05), SignificantLocationChanges (P1-I-02)
- [ ] **Phase 1.5 refactor** — MapScreen extraction (P1-B), `SessionManager` class (P1-C), big-track simplification when FPS drops at 5000+ pts (P1-D-04), closure haptic + toast (P1-G-09)
- [ ] **Phase 7 real adapters** — HealthKit READ/WRITE (P7-A-01/02 real impl), HealthConnect Android 14+ real impl (P7-A-03), Strava OAuth bidirectional with `client_secret` rotation + webhooks (P7-A-04), Garmin Connect ingest (P7-A-05), backend FIT parser (P7-A-06), Sensor Sync service (P7-A-07)
- [ ] **Phase 8 deferred** — Segments (P8-A-06), Leaderboards (P8-A-07), Territory / zone-wars game mechanic (P8-A-08)
- [ ] **Phase 9 Coaching & Plans** — Coach role in Identity (P9-A-01 scaffold exists), Coach↔Athlete link & data sharing, drag&drop training plan builder, plan execution in athlete's calendar, coach dashboard, per-workout feedback
- [ ] **Phase 10 Premium & Marketplace** — Stripe / RevenueCat, Free/Pro/Coach tiers, feature gating, plans marketplace, receipt validation
- [ ] **Cursona redesign** — ongoing branch `feat/cursona-redesign`: feed ranking, social discovery, tracking stats, registration flow — finalize and merge
- [ ] **Cross-cutting** — token rotation (`server-secret` was created as `pk.…` not `sk.…`); GDPR consent flow + data export + right-to-be-forgotten; pen-test before public launch; privacy zones (home/work track masking)

### Out of Scope

- **Mobile-side Feed/Stories cleanup paths** — the original removal (Round 1) was reversed on `feat/cursona-redesign`; the do-nothing backend cleanup remains valid — see `docs/DECISIONS/0004-feed-backend-cleanup.md`
- **Guest mode** — deferred indefinitely per `docs/DECISIONS/0002-guest-mode.md`
- **Flutter codebase** — archived in `apps/mobile_flutter.archived/`, not developed (see `DECISION.md`)
- **Web client** — not on roadmap; web admin dashboard exists (`/admin/`) for moderation only
- **Mapbox Studio custom style** — deferred from Phase 0 (P0-A-02), using standard `mapbox/outdoors-v12` until Phase 1 wrap
- **Backend feed/stories endpoint deprecation** — backend stays running per ADR-0004; no API breakage
- **Localization beyond Russian + English** — RU only until Phase 6+, EN added there; further languages on-demand only

## Context

**Existing planning system (source of truth):**
- `docs/RUNNING_ECOSYSTEM_TZ.md` — 961-line TZ: vision, requirements (FR/NFR), architecture, sensor specs, area calc, map stack
- `docs/DEVELOPMENT_PLAN.md` — 1273-line phased plan with atomic task IDs (`P<phase>-<section>-<number>`)
- `STATUS.md` — living status; updated after each closed task
- `docs/DECISIONS/` — ADRs 0001 (RN), 0002 (guest mode deferred), 0003 (OAuth Google/Apple), 0004 (feed backend do-nothing)
- `docs/AUDIT.md`, `docs/REVIEW_ROUNDS_1-3.md` — review outputs, known bug fixes (R1–R8)
- `.planning/codebase/` — 7-doc codebase map generated 2026-05-14 (STACK / INTEGRATIONS / ARCHITECTURE / STRUCTURE / CONVENTIONS / TESTING / CONCERNS)

**Tech stack:**
- Mobile: Expo SDK 54.0.33, RN 0.81.5, React 19.1, TypeScript 5.9; Mapbox via `@rnmapbox/maps ^10.3`; Zustand state; `expo-sqlite` (sync API + WAL); MMKV v5; `@turf/turf`; `expo-location` + `expo-task-manager` for background
- Backend: Go monorepo in `services/backend/` — services `social-graph`, `messaging`, `realtime-gw`, `notifications`, `feed`, `media`, plus shared `pkg/{permissions,ratelimit,audit}`. Caddy gateway. NATS JetStream. Postgres + TimescaleDB. Redis. MinIO. Deployed on Hetzner-like VPS at `148-253-214-156.sslip.io` with Let's Encrypt
- Integrations: `LocationAdapter`, `MapAdapter`, `HealthAdapter`, `AuthProvider`, `SensorAdapter`, `RealtimeAdapter`, `NotificationsAdapter`, `MediaAdapter` — all behind interfaces; native SDKs lazy-imported and stub-safe

**Architectural rules (from CLAUDE.md):**
- Domain-driven: `src/domain/` pure, no UI/DB deps
- Sensor-agnostic: GPS is one source, not the only one; always via `LocationAdapter`
- `MapAdapter` abstraction: Mapbox SDK only allowed inside `src/map/adapters/`
- Offline-first
- Multi-tenant with `user_id` from day 1
- Track rendered via `LineLayer + GeoJsonSource` only (never `PolylineAnnotation` / `AnnotationManager`) — see `docs/RUNNING_ECOSYSTEM_TZ.md` §10.5
- Area calc always via local projection, never raw lat/lon — see TZ §6.6

**Test posture:** jest with `jest-expo` preset; 435/435 passing latest round. Targets: pipeline ≥80% (current 93%), area ≥90% (current 95%+).

**Current branch:** `feat/cursona-redesign` — active, recent commits include M9.6 production audit, M9.7 feed ranking + stories mutual-friends + Follow UI, M9.8 people search, M10 tracking stats. Will merge to `main` after cursona-redesign wrap.

## Constraints

- **Tech stack**: Expo RN + Mapbox + Go backend — locked per `DECISION.md` (revisit only if iOS background reliability < 80%)
- **Map adapter**: never import `@rnmapbox/maps` outside `src/map/adapters/` — ESLint `no-restricted-imports` enforces. Reason: keep MapLibre/native escape hatch.
- **Background reliability**: ≥95% record-time on 3 OEMs (iPhone, Pixel, Xiaomi/Realme/Oppo) — NFR-005, currently runtime-blocked on device acquisition (`P0-A-04`)
- **Distance accuracy**: ≤3% error on reference 5km loop (NFR-001) — compared to Garmin
- **Area accuracy**: ≤5% error on reference football field (~7140 m²) (NFR-002)
- **Battery**: ≤10%/h record mode, screen off (NFR-003)
- **Performance**: P99 backend API <500ms; map FPS ≥50 at 1000+ pts
- **GDPR / health data**: privacy by design from day 1; data export + right-to-be-forgotten before public launch
- **Token hygiene**: Mapbox tokens rotated; `server-secret` upgrade pending (currently `pk.…`); Strava `client_secret` lives in backend-proxy only (PKCE on mobile)
- **Team size**: 2 developers — Dev A client (app, pipeline, UI), Dev B map/geo/infra (Mapbox, rendering, offline, backend post-Phase 2)
- **Localization**: RU-only Phase 1–5, EN added at Phase 6+

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Expo RN over Flutter (ADR-0001) | Faster iteration, shared TS types with Go via openapi-typescript, EAS Build snags fewer dev-env blockers, team TS experience | ✓ Good — phases 1–8 shipped on RN with no fallback needed |
| Guest mode deferred (ADR-0002) | Requires anonymous SQLite store + later merge-to-account migration; not enough product evidence yet | — Pending revisit if signup friction proves blocking |
| OAuth Google + Apple via `AuthProvider` interface (ADR-0003) | Native packages optional; stub-safe pattern keeps mobile build green without OAuth deps; Apple required by store policy | ✓ Good |
| Feed/Stories backend do-nothing on mobile-removal (ADR-0004) | Backend already deployed; removing endpoints risks breaking unknown consumers; keep endpoints idle | ✓ Good — preserved when feed came back on `feat/cursona-redesign` |
| Modular `modules/<feature>/{domain,storage,state,sync,ui}/` pattern | Each feature self-contained with clear seams; mirrors backend service boundaries | ✓ Good — applied to stories, feed, moderation, permissions |
| Shared `pkg/permissions` (Go) ↔ `modules/permissions` (TS) RBAC mirror | Single source of truth for capabilities; UI gate only shows actions server will permit | ✓ Good — caught 3 bugs + 6 architectural issues during Phase 8/K |
| Mapbox `@rnmapbox/maps` (community) over native bridge | Pkg active, MapAdapter abstraction provides fallback path | — Pending — revisit if SDK release mismatch causes prod incidents |
| Currency / Wallet domain on mobile (no backend yet) | Allow gamification + coin awards before backend monetization | — Pending — backend wiring at Phase 10 |
| `feat/cursona-redesign` branch (active) | Restore Feed/Stories with redesign, add tracking stats, people search, follow UI | — Pending — merge after wrap |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-14 after GSD brownfield initialization on `feat/cursona-redesign` (post Phase 8 / M10).*
