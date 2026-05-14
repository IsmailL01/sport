# Codebase Structure

**Analysis Date:** 2026-05-14

## Directory Layout

```
sport/                                       # repo root (monorepo, no workspace tool yet)
├── CLAUDE.md                                # Mandatory pre-task reading (project rules)
├── STATUS.md                                # Current phase + in-progress / done tasks
├── DECISION.md                              # Phase-0 framework decision log
├── CHANGELOG.md                             # Per-phase changelog
├── README.md                                # Repo entry README
├── CODEOWNERS                               # GitHub ownership map
├── .editorconfig                            # Editor formatting baseline
├── .gitignore
├── .github/                                 # CI workflows
├── .claude/                                 # Claude Code per-repo state
├── .planning/                               # GSD planning artefacts (this folder)
│   └── codebase/                            # Codebase analysis docs (current)
├── apps/
│   └── mobile-rn/                           # Expo React Native client
│       ├── App.tsx                          # Root component (theme + RootNavigator)
│       ├── index.ts                         # registerRootComponent
│       ├── app.json                         # Expo config (plugins, permissions, scheme)
│       ├── eas.json                         # EAS build profiles
│       ├── package.json
│       ├── package-lock.json
│       ├── tsconfig.json
│       ├── jest.config.js                   # Jest + babel-jest preset
│       ├── android/                         # Generated Android project (prebuild output)
│       ├── assets/                          # Icons, splash, fonts
│       ├── coverage/                        # Jest coverage output (gitignored)
│       └── src/
│           ├── __tests__/                   # Jest unit tests (33 files)
│           ├── auth/                        # OAuth providers + apiClient + tokenStorage
│           ├── design/                      # Cursona design system (tokens + components)
│           │   ├── components/              # Button, Card, Avatar, TabBar, Metric, ...
│           │   ├── icons/                   # SVG icon set
│           │   ├── tokens.ts                # Colors / spacing / typography tokens
│           │   ├── ThemeProvider.tsx
│           │   └── DevPreviewScreen.tsx
│           ├── domain/                      # PURE domain (no React, no SQLite, no fetch)
│           │   ├── types.ts                 # RawPoint / Point / Session / Track / Stats
│           │   ├── AreaCalculator.ts        # Shoelace + local projection (ТЗ §6.6)
│           │   ├── ClosureDetector.ts       # Loop-close detection
│           │   ├── athlete.ts, calories.ts, currency.ts, gpx.ts, lap.ts
│           │   ├── metrics.ts, records.ts, recordsFormat.ts, sensorAssociation.ts
│           │   ├── social.ts, splits.ts, stats.ts, streak.ts, walletDomain.ts
│           │   └── training/                # Banister, TSS, VO2max, plan generator
│           ├── health/                      # HealthKit / Health Connect / Strava
│           │   ├── HealthAdapter.ts         # Interface + types
│           │   ├── HealthKitAdapter.ts      # iOS impl
│           │   ├── HealthConnectAdapter.ts  # Android impl
│           │   ├── StravaAdapter.ts         # OAuth-based fallback
│           │   ├── MockHealthAdapter.ts     # In-memory for tests
│           │   ├── importPlan.ts, importRepo.ts, importSanity.ts
│           │   ├── sync.ts
│           │   └── index.ts                 # Public surface + platform default picker
│           ├── location/                    # GPS adapter
│           │   ├── LocationAdapter.ts       # Interface only
│           │   ├── adapters/
│           │   │   └── ExpoLocationAdapter.ts    # expo-location + TaskManager
│           │   └── index.ts                 # Singleton export
│           ├── map/                         # SOLE Mapbox SDK quarantine
│           │   ├── MapboxView.tsx           # Only place @rnmapbox/maps is imported
│           │   ├── offline.ts               # Offline pack download/list/delete
│           │   ├── components/              # Layer components (LineLayer + GeoJsonSource)
│           │   │   ├── TrackLayer.tsx
│           │   │   ├── ZoneLayer.tsx
│           │   │   ├── CorridorLayer.tsx
│           │   │   ├── LocationPuckLayer.tsx
│           │   │   └── HistoryTerritoryLayer.tsx
│           │   └── index.ts                 # Public surface
│           ├── media/                       # Image picker + S3 upload bridge
│           │   ├── MediaAdapter.ts
│           │   ├── adapters/ExpoMediaAdapter.ts
│           │   └── index.ts
│           ├── modules/                     # Self-contained vertical slices
│           │   ├── gamification/
│           │   │   ├── domain/              # xp.ts, grade.ts (pure)
│           │   │   ├── state/useXpStore.ts  # Zustand
│           │   │   ├── sync/xpApi.ts        # HTTP wrappers
│           │   │   └── index.ts             # Public surface
│           │   ├── moderation/
│           │   │   ├── domain/types.ts
│           │   │   ├── state/useModerationStore.ts
│           │   │   ├── sync/moderationApi.ts
│           │   │   ├── ui/                  # AdminModal, AdminQueueScreen, ReportSheet
│           │   │   └── index.ts
│           │   └── permissions/index.ts
│           ├── navigation/                  # React Navigation glue
│           │   ├── RootNavigator.tsx        # Auth gate + push deep-link + side-effects
│           │   ├── AppTabs.tsx              # Bottom-tabs shell with per-tab native stacks
│           │   ├── AuthStack.tsx            # Splash → Email → Code
│           │   ├── OnboardingStack.tsx      # Name → Birthday → Permissions
│           │   ├── types.ts                 # Per-stack ParamList types
│           │   └── screens/                 # Real screens (Phase M4-M10)
│           │       ├── auth/                # ScreenSplash, ScreenEmail, ScreenCode, ...
│           │       ├── record/              # TrackerStart, TrackerLive, RunDetails
│           │       ├── journal/             # JournalScreen, SessionDetailScreen
│           │       ├── chats/               # ChatsList, Chat, CreateChat, PeopleSearch
│           │       ├── me/                  # MeScreen, Settings, Clubs, Records, Stats, Wallet, Shop
│           │       └── ForeignProfileScreen.tsx
│           ├── notifications/               # Push token + foreground
│           │   ├── NotificationsAdapter.ts
│           │   ├── adapters/ExpoNotificationsAdapter.ts
│           │   └── index.ts
│           ├── pipeline/                    # GPS denoiser
│           │   ├── Pipeline.ts              # Filter chain composer
│           │   ├── Filter.ts                # Interface
│           │   ├── filters/
│           │   │   ├── AccuracyFilter.ts
│           │   │   ├── KalmanFilter.ts
│           │   │   ├── JumpFilter.ts
│           │   │   ├── MinSegmentFilter.ts
│           │   │   └── PauseDetector.ts
│           │   └── index.ts                 # createDefaultPipeline() helper
│           ├── realtime/                    # WebSocket adapter
│           │   ├── RealtimeAdapter.ts
│           │   ├── adapters/
│           │   │   ├── WebSocketRealtimeAdapter.ts
│           │   │   └── MockRealtimeAdapter.ts
│           │   └── index.ts                 # Swap-able singleton
│           ├── sensors/                     # BLE HR / cadence / power
│           │   ├── SensorAdapter.ts
│           │   ├── adapters/
│           │   │   ├── BleSensorAdapter.ts        # react-native-ble-plx (Phase 5)
│           │   │   └── MockSensorAdapter.ts
│           │   └── index.ts
│           ├── state/                       # Zustand stores
│           │   ├── activity.ts              # useActivityStore — recording state
│           │   ├── auth.ts                  # useAuthStore — JWT + user + hydrate
│           │   ├── history.ts, map.ts, sensors.ts, settings.ts, sync.ts,
│           │   │   training.ts, wallet.ts, workoutPlayer.ts
│           │   └── social/                  # Chat / users / notifications / realtime
│           │       ├── useChatStore.ts
│           │       ├── useChatsStore.ts
│           │       ├── useNotificationsStore.ts
│           │       ├── useRealtimeStore.ts
│           │       └── useUsersStore.ts
│           ├── storage/                     # SQLite repositories
│           │   ├── database.ts              # Singleton + migrations (target v19)
│           │   ├── pointRepository.ts       # points table
│           │   ├── sessionRepository.ts     # sessions
│           │   ├── lapRepository.ts         # laps
│           │   ├── sensorRepository.ts      # sensor_readings + HR aggregate
│           │   ├── recordsRepository.ts     # personal_records
│           │   ├── walletRepository.ts      # wallet_balance + wallet_transactions
│           │   ├── socialRepository.ts      # social_users + chats + messages
│           │   └── relationsRepository.ts   # social_relations cache
│           ├── sync/                        # Outbox sync to backend
│           │   ├── syncEngine.ts            # Sessions + points outbox
│           │   ├── messageSync.ts           # Chat outbox + delta pull
│           │   └── mediaUpload.ts           # S3 presign + upload
│           ├── ui/                          # Legacy + cross-stack widgets
│           │   ├── _legacy/                 # Pre-Cursona UI (deprecated)
│           │   ├── charts/BarChart.tsx
│           │   ├── social/                  # ChatScreen, UserSearchScreen (Phase 8 alt)
│           │   ├── AuthScreen.tsx, HistoryModal.tsx, ManualEntryModal.tsx,
│           │   │   MetricsBar.tsx, ProfileModal.tsx, SensorsModal.tsx,
│           │   │   SessionDetailModal.tsx, StatsModal.tsx, TodayCard.tsx,
│           │   │   TrainingModal.tsx, WorkoutPlayer.tsx
│           │   └── format.ts                # Display formatters (pace / distance / duration)
│           └── util/                        # Pure helpers
│               ├── geo.ts                   # totalDistance, isClosed, projection
│               ├── douglasPeucker.ts        # Trace simplification
│               ├── selfIntersection.ts      # Polygon validation
│               ├── corridor.ts              # Corridor area method
│               ├── geojson.ts               # Track → GeoJSON
│               ├── speech.ts                # TTS adapter interface
│               └── expoSpeechAdapter.ts     # Real expo-speech impl
├── services/
│   └── backend/                             # Go microservices
│       ├── Makefile                         # up / migrate / run-<svc> / test
│       ├── go.work                          # Workspace listing every service module
│       ├── go.work.sum
│       ├── docker-compose.yml               # postgres + stack profile (identity, sync, gateway)
│       ├── docker-compose.prod.yml          # Production overlay
│       ├── docker-compose.observability.yml # Prometheus + Loki + Grafana
│       ├── README.md
│       ├── api/                             # OpenAPI specs (per service)
│       │   ├── identity.yaml
│       │   └── activity-sync.yaml
│       ├── gateway/                         # Caddy reverse-proxy
│       │   ├── Caddyfile                    # dev (path-routes by service)
│       │   ├── Caddyfile.prod
│       │   └── admin/                       # admin panel assets
│       ├── identity/                        # Auth + JWT + users
│       │   ├── Dockerfile
│       │   ├── go.mod / go.sum
│       │   ├── cmd/server/main.go           # entrypoint
│       │   └── internal/
│       │       ├── domain/user.go
│       │       ├── handler/{http.go,http_test.go,otp.go}
│       │       ├── service/{auth.go,auth_test.go,otp.go}
│       │       └── repository/
│       │           ├── repository.go        # Interface
│       │           ├── memory/              # In-memory impl for tests
│       │           └── postgres/{user.go,refresh_token.go,otp.go}
│       ├── activity-sync/                   # Sessions + points outbox sink
│       │   ├── Dockerfile, go.mod, cmd/server/main.go
│       │   └── internal/{domain,handler,service,repository/{memory,postgres}}
│       ├── social-graph/                    # Follow / block / profile / moderation
│       │   └── cmd + internal/{domain,handler,service,repository/postgres}
│       ├── messaging/                       # Chats + messages + reactions + NATS outbox
│       │   ├── cmd + internal/{domain,handler,service,outbox,permissions,
│       │   │   repository/postgres}
│       │   └── internal/outbox/publisher.go # Postgres → NATS publisher loop
│       ├── feed/                            # Stories + posts + comments + cleanup
│       │   └── cmd + internal/{domain,handler,service,cleanup,repository/postgres}
│       ├── notifications/                   # Expo Push
│       │   └── cmd + internal/{domain,handler,service,expopush,repository/postgres}
│       ├── media/                           # Media records + S3 sign
│       │   └── cmd + internal/{domain,handler,service,s3,repository/postgres}
│       ├── realtime-gw/                     # WebSocket terminus + NATS fanout
│       │   ├── cmd/server/main.go
│       │   └── internal/gw/{handler.go,connection.go,registry.go}
│       ├── pkg/                             # Shared Go modules
│       │   ├── auth/{jwt.go,jwt_test.go}    # Signer / VerifyAccess
│       │   ├── permissions/{capability,check,loader,role}.go
│       │   ├── ratelimit/ratelimit.go       # Redis token-bucket
│       │   ├── gamification/{xp,grade}.go   # Mirrors mobile gamification module
│       │   └── audit/audit.go
│       ├── migrations/                      # golang-migrate SQL (0000_… 0020_…)
│       │   └── *.{up,down}.sql              # 0000_extensions, 0001_users, 0002_activities, ...
│       ├── observability/                   # prometheus.yml, loki.yml, grafana-datasources.yml
│       ├── deploy/                          # Helm charts
│       │   └── helm/identity/               # K8s chart for identity (other services TBD)
│       └── scripts/                         # Smoke tests (Python)
│           ├── smoke_otp.py, smoke_posts.py, smoke_realtime_feed.py,
│           ├── smoke_realtime_stories.py, smoke_stories.py, smoke_xp.py,
│           ├── smoke_moderation.py, smoke_abac_muted.py, smoke_permissions.py,
│           └── smoke_ratelimit.py
├── tests/                                   # Cross-cutting test docs
│   └── FIELD_PROTOCOL.md                    # Manual field-test protocol
└── docs/
    ├── RUNNING_ECOSYSTEM_TZ.md              # Master requirements / architecture spec
    ├── DEVELOPMENT_PLAN.md                  # Phase + task IDs
    ├── INTEGRATIONS.md                      # External integrations spec
    ├── CURRENCY.md                          # Wallet rules
    ├── SECRETS.md                           # Secrets handling
    ├── AUDIT.md                             # Audit-log conventions
    ├── REVIEW_ROUNDS_1-3.md                 # Review-round notes
    └── DECISIONS/                           # ADR (Architecture Decision Records)
        ├── 0001-framework-react-native.md
        ├── 0002-guest-mode.md
        ├── 0003-oauth-providers.md
        └── 0004-feed-backend-cleanup.md
```

## Directory Purposes

**`apps/mobile-rn/src/domain/`:**
- Purpose: Bounded-context types and pure functions. No React, no SQLite, no fetch.
- Contains: Type definitions (`types.ts`), value-object helpers (`AreaCalculator.ts`, `ClosureDetector.ts`, `splits.ts`, `records.ts`, `streak.ts`, `lap.ts`), feature submodules (`training/`).
- Key files: `apps/mobile-rn/src/domain/types.ts`, `apps/mobile-rn/src/domain/AreaCalculator.ts`, `apps/mobile-rn/src/domain/currency.ts`, `apps/mobile-rn/src/domain/training/planGenerator.ts`

**`apps/mobile-rn/src/pipeline/`:**
- Purpose: GPS signal-processing chain.
- Contains: `Pipeline.ts` (composer), `Filter.ts` (interface), `filters/*.ts` (Accuracy / Kalman / Jump / MinSegment / PauseDetector).
- Key files: `apps/mobile-rn/src/pipeline/Pipeline.ts`, `apps/mobile-rn/src/pipeline/index.ts` (default chain factory)

**`apps/mobile-rn/src/map/`:**
- Purpose: SOLE Mapbox SDK quarantine. `@rnmapbox/maps` is forbidden outside this folder (CLAUDE.md, ТЗ §10.6).
- Contains: `MapboxView.tsx` (only file importing `@rnmapbox/maps` directly), `components/*.tsx` (layer components — LineLayer + GeoJsonSource), `offline.ts` (offline pack ops).
- Key files: `apps/mobile-rn/src/map/MapboxView.tsx`, `apps/mobile-rn/src/map/index.ts`, `apps/mobile-rn/src/map/components/TrackLayer.tsx`

**`apps/mobile-rn/src/location/`, `sensors/`, `realtime/`, `notifications/`, `media/`, `health/`:**
- Purpose: Adapter folders, all sharing the same shape.
- Pattern: `XxxAdapter.ts` (interface only) at the top; concrete implementations in `adapters/` subfolder; public surface re-exported by `index.ts`. Native SDK imports are confined to `adapters/`.
- Key files: `apps/mobile-rn/src/location/LocationAdapter.ts`, `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`, `apps/mobile-rn/src/sensors/adapters/BleSensorAdapter.ts`, `apps/mobile-rn/src/realtime/adapters/WebSocketRealtimeAdapter.ts`, `apps/mobile-rn/src/health/HealthAdapter.ts`

**`apps/mobile-rn/src/state/`:**
- Purpose: Zustand stores — one per bounded concern.
- Contains: `activity.ts`, `auth.ts`, `history.ts`, `map.ts`, `sensors.ts`, `settings.ts`, `sync.ts`, `training.ts`, `wallet.ts`, `workoutPlayer.ts`; nested `social/` for chat-and-friends stores.
- Key files: `apps/mobile-rn/src/state/activity.ts`, `apps/mobile-rn/src/state/auth.ts`, `apps/mobile-rn/src/state/social/useRealtimeStore.ts`

**`apps/mobile-rn/src/storage/`:**
- Purpose: SQLite repositories with raw `db.runSync` / `db.getAllSync` calls.
- Contains: `database.ts` (singleton + linear migrations v1..v19), one `<table>Repository.ts` per write-heavy table.
- Key files: `apps/mobile-rn/src/storage/database.ts`, `apps/mobile-rn/src/storage/pointRepository.ts`, `apps/mobile-rn/src/storage/sessionRepository.ts`, `apps/mobile-rn/src/storage/walletRepository.ts`

**`apps/mobile-rn/src/sync/`:**
- Purpose: Outbox bridges between SQLite and backend.
- Key files: `apps/mobile-rn/src/sync/syncEngine.ts`, `apps/mobile-rn/src/sync/messageSync.ts`, `apps/mobile-rn/src/sync/mediaUpload.ts`

**`apps/mobile-rn/src/auth/`:**
- Purpose: HTTP client + OAuth providers + secure token storage.
- Key files: `apps/mobile-rn/src/auth/apiClient.ts`, `apps/mobile-rn/src/auth/tokenStorage.ts`, `apps/mobile-rn/src/auth/authProviders.ts`

**`apps/mobile-rn/src/navigation/`:**
- Purpose: React-Navigation glue.
- Contains: `RootNavigator.tsx`, `AppTabs.tsx`, `AuthStack.tsx`, `OnboardingStack.tsx`, per-tab `screens/<tab>/<Screen>.tsx`.
- Key files: `apps/mobile-rn/src/navigation/RootNavigator.tsx`, `apps/mobile-rn/src/navigation/AppTabs.tsx`, `apps/mobile-rn/src/navigation/types.ts`

**`apps/mobile-rn/src/design/`:**
- Purpose: Cursona design system (Phase 8 / M2 redesign).
- Contains: `tokens.ts`, `ThemeProvider.tsx`, primitives in `components/`, icon set in `icons/`.
- Key files: `apps/mobile-rn/src/design/tokens.ts`, `apps/mobile-rn/src/design/components/TabBar.tsx`, `apps/mobile-rn/src/design/components/Button.tsx`, `apps/mobile-rn/src/design/components/Metric.tsx`

**`apps/mobile-rn/src/modules/`:**
- Purpose: Self-contained vertical slices. Each module owns its own domain / state / sync / ui and exposes a curated `index.ts`.
- Contents: `gamification/` (XP + grade), `moderation/` (admin queue + reports), `permissions/` (capability helpers).
- Key files: `apps/mobile-rn/src/modules/gamification/index.ts`, `apps/mobile-rn/src/modules/moderation/index.ts`

**`apps/mobile-rn/src/util/`:**
- Purpose: Pure utility helpers (geo math, GeoJSON conversion, speech adapter).
- Key files: `apps/mobile-rn/src/util/geo.ts`, `apps/mobile-rn/src/util/douglasPeucker.ts`, `apps/mobile-rn/src/util/selfIntersection.ts`

**`apps/mobile-rn/src/__tests__/`:**
- Purpose: Jest unit tests, one file per domain / module concern (~33 specs).
- Key files: `apps/mobile-rn/src/__tests__/pipeline.test.ts`, `apps/mobile-rn/src/__tests__/AreaCalculator.test.ts`, `apps/mobile-rn/src/__tests__/walletDomain.test.ts`, `apps/mobile-rn/src/__tests__/gamification.test.ts`

**`services/backend/`:**
- Purpose: Go monorepo of microservices. Workspace-mode (`go.work`) — one module per service plus shared `pkg/`.
- Pattern per service: `cmd/server/main.go` + `internal/{domain,handler,service,repository}`.
- Key files: `services/backend/go.work`, `services/backend/Makefile`, `services/backend/docker-compose.yml`

**`services/backend/<service>/cmd/server/main.go`:**
- Purpose: Composition root for one HTTP service.
- Pattern: ENV config → pgx pool → optional NATS/Redis → repos → service → handler → `http.Server` with graceful shutdown.

**`services/backend/<service>/internal/handler/`:**
- Purpose: Thin HTTP transport. Parses DTOs, calls service, writes JSON responses. No business logic.
- Files: `http.go` (routes + handlers), per-feature splits (`otp.go`, `posts.go`, `moderation.go`).

**`services/backend/<service>/internal/service/`:**
- Purpose: Business logic. Receives plain Go structs, calls repositories, emits NATS events. HTTP-agnostic.

**`services/backend/<service>/internal/repository/`:**
- Purpose: Persistence. `repository.go` (interface), `postgres/` (pgx impl), sometimes `memory/` (in-memory for tests).

**`services/backend/<service>/internal/domain/`:**
- Purpose: Entities + value objects for the service.

**`services/backend/pkg/`:**
- Purpose: Code shared by every service.
- Contents: `auth/` (JWT signer + verifier), `permissions/` (ABAC), `ratelimit/` (Redis token-bucket), `gamification/` (XP/grade — mirrors mobile), `audit/` (audit log writer).

**`services/backend/migrations/`:**
- Purpose: golang-migrate forward + rollback SQL pairs. Numbered `0000_…`..`0020_…`.

**`services/backend/gateway/`:**
- Purpose: Caddy reverse-proxy entry on `:8080`. Path-routes `/auth/*`, `/sessions*`, `/healthz`, etc.

**`services/backend/realtime-gw/`:**
- Purpose: WebSocket terminus that fans NATS events out to mobile clients. Sole holder of WS connections.

**`services/backend/scripts/`:**
- Purpose: Python smoke tests against the running stack. Generated: yes (developer-run, not CI fixtures).

**`services/backend/observability/`:**
- Purpose: Prometheus + Loki + Grafana config. Loaded by `docker-compose.observability.yml`.

**`services/backend/deploy/helm/`:**
- Purpose: Helm charts. Currently only `identity/` is filled; other services to follow.

**`docs/`:**
- Purpose: Single-source-of-truth specs and ADRs.
- Key files: `docs/RUNNING_ECOSYSTEM_TZ.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/INTEGRATIONS.md`, `docs/CURRENCY.md`, `docs/DECISIONS/0001-framework-react-native.md`

**`tests/`:**
- Purpose: Cross-cutting test documentation (field test protocols). Not Jest/Go tests.

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis artefacts (this folder).

**`.github/`, `.claude/`:**
- Purpose: Tooling configs. CI workflows in `.github/workflows/`; Claude Code per-repo state in `.claude/`.

## Key File Locations

**Entry Points:**
- `apps/mobile-rn/index.ts` → registers `App.tsx` for Expo.
- `apps/mobile-rn/App.tsx` → mounts polyfills, error boundary, theme, RootNavigator.
- `apps/mobile-rn/src/navigation/RootNavigator.tsx` → auth gate, push deep-link, realtime/push/sync lifecycle.
- Backend: 8 `services/backend/<service>/cmd/server/main.go` files (identity, activity-sync, social-graph, messaging, feed, notifications, media, realtime-gw).

**Configuration:**
- `apps/mobile-rn/app.json` → Expo config + plugins + permissions + scheme.
- `apps/mobile-rn/eas.json` → EAS build profiles.
- `apps/mobile-rn/tsconfig.json` → TS settings.
- `apps/mobile-rn/jest.config.js` → test runner.
- `services/backend/go.work` → workspace listing of Go modules.
- `services/backend/Makefile` → standard commands (`make up`, `make run-identity`, `make migrate`, `make test`).
- `services/backend/gateway/Caddyfile` → path routing rules.
- `services/backend/docker-compose.yml` → dev stack.

**Core Logic:**
- Domain: `apps/mobile-rn/src/domain/`.
- Pipeline: `apps/mobile-rn/src/pipeline/`.
- Adapters: `apps/mobile-rn/src/{location,sensors,map,realtime,notifications,media,health}/`.
- Stores: `apps/mobile-rn/src/state/` + `apps/mobile-rn/src/state/social/`.
- Repos: `apps/mobile-rn/src/storage/`.
- Backend services: `services/backend/<service>/internal/service/`.

**Domain types live in:**
- Mobile: `apps/mobile-rn/src/domain/types.ts` (core) + per-feature siblings (`social.ts`, `walletDomain.ts`, `lap.ts`, `records.ts`, ...) + `apps/mobile-rn/src/domain/training/*.ts`.
- Per-module: `apps/mobile-rn/src/modules/<mod>/domain/types.ts` (or `xp.ts`, `grade.ts`).
- Backend per service: `services/backend/<service>/internal/domain/types.go`.

**Stores (Zustand) live in:**
- `apps/mobile-rn/src/state/*.ts` for cross-app concerns.
- `apps/mobile-rn/src/state/social/*.ts` for chat/social.
- `apps/mobile-rn/src/modules/<mod>/state/useXxxStore.ts` for vertical-slice modules.

**Mapbox SDK is isolated to:**
- `apps/mobile-rn/src/map/MapboxView.tsx` (only `import Mapbox from '@rnmapbox/maps'` in the repo).
- Layer components in `apps/mobile-rn/src/map/components/` (they import `@rnmapbox/maps` directly because they live inside the quarantine).
- `apps/mobile-rn/src/map/offline.ts` (offline packs).
- All external code uses `import { MapboxView, TrackLayer, ... } from 'src/map'` (or relative path).

**Adapters live in:**
- Interface: `apps/mobile-rn/src/<area>/<Name>Adapter.ts`
- Implementations: `apps/mobile-rn/src/<area>/adapters/<Impl>Adapter.ts`
- Public surface: `apps/mobile-rn/src/<area>/index.ts`
- Concrete examples:
  - `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`
  - `apps/mobile-rn/src/sensors/adapters/BleSensorAdapter.ts`
  - `apps/mobile-rn/src/sensors/adapters/MockSensorAdapter.ts`
  - `apps/mobile-rn/src/realtime/adapters/WebSocketRealtimeAdapter.ts`
  - `apps/mobile-rn/src/realtime/adapters/MockRealtimeAdapter.ts`
  - `apps/mobile-rn/src/notifications/adapters/ExpoNotificationsAdapter.ts`
  - `apps/mobile-rn/src/media/adapters/ExpoMediaAdapter.ts`
  - `apps/mobile-rn/src/health/{HealthKitAdapter,HealthConnectAdapter,StravaAdapter,MockHealthAdapter}.ts` (kept at the top level of `health/` instead of `health/adapters/` — only deviation from the otherwise-uniform pattern).

**Testing:**
- Unit: `apps/mobile-rn/src/__tests__/*.test.ts` (Jest).
- Go unit: `services/backend/<service>/internal/**/*_test.go` and `services/backend/pkg/**/*_test.go`.
- Smoke: `services/backend/scripts/smoke_*.py` (Python, run against live stack).
- Field: `tests/FIELD_PROTOCOL.md` (manual).

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` — `MapboxView.tsx`, `TrackerLiveScreen.tsx`, `Button.tsx`, `RootNavigator.tsx`.
- Modules / utils / stores: `camelCase.ts` — `apiClient.ts`, `geo.ts`, `syncEngine.ts`, `pointRepository.ts`, `useAuthStore`... but the *file* still uses module-style (`useChatStore.ts`, `activity.ts`).
- Adapter interfaces: `PascalCaseAdapter.ts` — `LocationAdapter.ts`, `SensorAdapter.ts`, `RealtimeAdapter.ts`, `HealthAdapter.ts`.
- Concrete adapter impls: `<Vendor>PascalCaseAdapter.ts` — `ExpoLocationAdapter.ts`, `WebSocketRealtimeAdapter.ts`, `BleSensorAdapter.ts`, `HealthKitAdapter.ts`.
- SQLite repos: `<table>Repository.ts` — `pointRepository.ts`, `sessionRepository.ts`, `walletRepository.ts`.
- Zustand stores: `use<Concern>Store.ts` (Phase 8 social/modules) **or** plain `<concern>.ts` (older state). Both styles coexist — see Conventions doc.
- Tests: `<feature>.test.ts` colocated under `src/__tests__/`.
- Go files: `snake_case.go` rare — almost everything is single-word or `lowercase.go` (`http.go`, `posts.go`, `moderation.go`, `repository.go`, `user.go`).
- Go tests: `<file>_test.go` next to the implementation.
- SQL migrations: `NNNN_snake_case.{up,down}.sql` — `0011_messaging.up.sql`, `0019_xp_grades.up.sql`.

**Directories:**
- Mobile: lower-case single word (`domain`, `pipeline`, `auth`, `state`, `storage`, `ui`, `util`, `navigation`, `design`, `modules`).
- Adapter folder: literally named `adapters/` (lowercase plural).
- Backend service: lower-case-with-dash for multi-word (`activity-sync`, `social-graph`, `realtime-gw`); single word otherwise (`identity`, `messaging`, `feed`, `media`, `notifications`).
- Go internal: standard `cmd/server/`, `internal/{domain,handler,service,repository}`. Postgres-specific code lives under `repository/postgres/`. In-memory test impls under `repository/memory/`.

**Symbols (Go):**
- Packages: lower-case, one word — `handler`, `service`, `repository`, `domain`, `auth`, `permissions`, `gw`.
- Imports: `github.com/runningecosystem/backend/<service>/internal/<pkg>` or `github.com/runningecosystem/backend/pkg/<area>`.

## Where to Add New Code

**New domain feature (e.g. new metric, formula):**
- Primary code: `apps/mobile-rn/src/domain/<feature>.ts` (or `apps/mobile-rn/src/domain/training/<feature>.ts`).
- Tests: `apps/mobile-rn/src/__tests__/<feature>.test.ts`.
- Must stay pure (no React, no SQLite, no fetch).

**New native integration (new sensor, vendor SDK):**
- Primary code: new folder `apps/mobile-rn/src/<area>/` with `<Name>Adapter.ts` (interface), `adapters/<Impl>Adapter.ts`, `index.ts` (singleton + public surface). Mirror the shape of `location/` or `sensors/`.
- Tests: `apps/mobile-rn/src/__tests__/<area>.test.ts` exercising the mock impl.
- Do NOT import the vendor SDK anywhere outside `adapters/`.

**New screen:**
- Implementation: `apps/mobile-rn/src/navigation/screens/<tab>/<ScreenName>.tsx`.
- Param types: extend `<Tab>StackParamList` in `apps/mobile-rn/src/navigation/types.ts`.
- Wire into the appropriate stack in `apps/mobile-rn/src/navigation/AppTabs.tsx` (or `AuthStack.tsx` / `OnboardingStack.tsx`).

**New design-system primitive:**
- Implementation: `apps/mobile-rn/src/design/components/<Name>.tsx`.
- Re-export from `apps/mobile-rn/src/design/index.ts`.
- Use tokens from `apps/mobile-rn/src/design/tokens.ts` — no hard-coded colours.

**New Zustand store:**
- For cross-app concerns: `apps/mobile-rn/src/state/<concern>.ts` exporting `use<Concern>Store`.
- For chat / social: `apps/mobile-rn/src/state/social/use<Concern>Store.ts`.
- For a vertical slice: `apps/mobile-rn/src/modules/<module>/state/use<Concern>Store.ts` + add to module `index.ts`.

**New SQLite table:**
- Append a new migration block `if (current < N)` in `apps/mobile-rn/src/storage/database.ts` and bump `TARGET_VERSION`.
- Add `apps/mobile-rn/src/storage/<table>Repository.ts` with `getAllSync` / `runSync` queries.
- Multi-tenant: add `user_id TEXT` column (CLAUDE.md, ТЗ §3).
- If write-heavy: add outbox columns (`status`, `synced_at`, `client_id`, `attempts`, `last_error`).

**New backend microservice:**
- Create `services/backend/<service>/` with `cmd/server/main.go` + `internal/{domain,handler,service,repository/postgres}` (mirror `identity/`).
- Add `<service>/go.mod` and add the path to `services/backend/go.work`.
- Wire `<service>/Dockerfile` and add a service to `docker-compose.yml` (under the `stack` profile).
- Path-route in `services/backend/gateway/Caddyfile`.
- Add migration `NNNN_<name>.up.sql / down.sql` under `services/backend/migrations/`.
- Add smoke test under `services/backend/scripts/smoke_<feature>.py`.

**New backend endpoint within an existing service:**
- DTOs + route registration: `services/backend/<service>/internal/handler/http.go` (or a new feature file like `posts.go`).
- Business logic: `services/backend/<service>/internal/service/<feature>.go`.
- Persistence: `services/backend/<service>/internal/repository/postgres/<feature>.go`.
- Update OpenAPI spec under `services/backend/api/<service>.yaml` if applicable.

**New ADR / decision:**
- File: `docs/DECISIONS/NNNN-<slug>.md` (next number after the highest existing).
- Reference from `STATUS.md` / `CLAUDE.md` when relevant.

**Utilities:**
- Shared pure helpers: `apps/mobile-rn/src/util/<name>.ts`.
- Backend shared helpers: `services/backend/pkg/<area>/<name>.go` (only when used by ≥2 services).

## Special Directories

**`apps/mobile-rn/android/`:**
- Purpose: Expo prebuild output (native Android project). Edited only when adding native modules.
- Generated: Yes (via `npx expo prebuild`).
- Committed: Yes (current Phase 8 — needed for Mapbox/BLE native deps).

**`apps/mobile-rn/coverage/`:**
- Purpose: Jest coverage report.
- Generated: Yes.
- Committed: No (`.gitignore`).

**`apps/mobile-rn/node_modules/`:**
- Generated: Yes (`npm install`).
- Committed: No.

**`apps/mobile-rn/src/ui/_legacy/`:**
- Purpose: Pre-Cursona UI (kept until Phase 8 stabilises). Not for new code.
- Committed: Yes (temporary).

**`services/backend/deploy/helm/`:**
- Purpose: Helm charts for K8s deployment. Currently only `identity/` is populated.
- Generated: No.

**`services/backend/scripts/`:**
- Purpose: Python smoke tests run against a live stack. Not part of CI yet.
- Generated: No.

**`.planning/`:**
- Purpose: GSD planning artefacts (this analysis lives in `.planning/codebase/`).
- Generated: Partly (created by `/gsd-*` commands).
- Committed: Yes.

**`.claude/`:**
- Purpose: Claude Code per-repo state.
- Committed: Partial (depends on team convention).

**`docs/DECISIONS/`:**
- Purpose: ADRs. Append-only history of significant decisions (framework choice, OAuth providers, feed cleanup, ...).
- Committed: Yes.

---

*Structure analysis: 2026-05-14*
