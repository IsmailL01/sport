<!-- refreshed: 2026-05-14 -->
# Architecture

**Analysis Date:** 2026-05-14

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MOBILE CLIENT (Expo RN)                            │
│                       `apps/mobile-rn/App.tsx` → RootNavigator              │
├─────────────────────────────────────────────────────────────────────────────┤
│  UI layer (screens + design system)                                         │
│  `src/navigation/screens/`  +  `src/ui/`  +  `src/design/`                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  State layer (Zustand stores)                                               │
│  `src/state/*.ts`  +  `src/state/social/*.ts`  +  `src/modules/*/state/`    │
├──────────────────────────────────────────┬──────────────────────────────────┤
│  Domain (pure TS, no platform deps)      │  Pipeline (GPS filters chain)    │
│  `src/domain/*.ts`, `src/domain/training`│  `src/pipeline/*.ts` + filters/  │
├──────────────────────────────────────────┴──────────────────────────────────┤
│  Adapter layer — interfaces only at top, vendor SDK in `./adapters/` only   │
│  Location | Sensors | Map | Realtime | Notifications | Media | Health       │
│  `src/location/`  `src/sensors/`  `src/map/`  `src/realtime/`               │
│  `src/notifications/`  `src/media/`  `src/health/`                          │
├──────────────────────────────────────────┬──────────────────────────────────┤
│  Storage (SQLite repositories)           │  Sync engine (outbox pattern)    │
│  `src/storage/*Repository.ts`            │  `src/sync/syncEngine.ts`        │
└──────────────────────────────────────────┴──────────────────┬───────────────┘
                                                              │ HTTPS / WSS
                                                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              API GATEWAY (Caddy reverse-proxy)                              │
│              `services/backend/gateway/Caddyfile`  :8080                    │
└────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────┘
     │          │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼          ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────────────┐
│identity │ │activity-│ │social-  │ │messaging│ │  feed   │ │notifications  │
│  :8081  │ │  sync   │ │ graph   │ │  :8084  │ │  :8085  │ │   :8086       │
│         │ │  :8082  │ │  :8083  │ │         │ │         │ │               │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └───────┬───────┘
     │           │           │           │           │              │
     └───────────┴─────┬─────┴───────────┴───────────┴──────────────┘
                       │
        ┌──────────────┼──────────────┬──────────────┐
        ▼              ▼              ▼              ▼
   ┌────────┐    ┌─────────┐   ┌──────────┐  ┌────────────┐
   │Postgres│    │  NATS   │   │  Redis   │  │ media-svc  │
   │+Time-  │    │JetStream│   │ (cache + │  │   :8087    │
   │ scale  │    │         │   │ rate-lim)│  │  (S3 sign) │
   └────────┘    └────┬────┘   └──────────┘  └────────────┘
                      │
                      ▼
              ┌──────────────────┐
              │ realtime-gw :8090 │ ── WebSocket ── back to mobile
              └──────────────────┘
```

## Component Responsibilities

### Mobile (`apps/mobile-rn/`)

| Component | Responsibility | File |
|-----------|----------------|------|
| App root | Polyfills, error boundary, theme, mapbox token init, TTS adapter wiring | `apps/mobile-rn/App.tsx` |
| RootNavigator | Auth gate, push deep-link routing, realtime/push lifecycle on auth change | `apps/mobile-rn/src/navigation/RootNavigator.tsx` |
| AppTabs | 4-tab shell (Record / Journal / Chats / Me), per-tab native stack | `apps/mobile-rn/src/navigation/AppTabs.tsx` |
| Domain types | `RawPoint`, `Point`, `Session`, `Track`, `Stats`, `Pause`, `ActivityType`, `EnrichedPoint` | `apps/mobile-rn/src/domain/types.ts` |
| Domain calcs | Area (shoelace+proj), closure detection, calories (MET), currency, splits, records, streak | `apps/mobile-rn/src/domain/AreaCalculator.ts`, `ClosureDetector.ts`, `calories.ts`, `currency.ts`, `splits.ts`, `records.ts`, `streak.ts` |
| Training domain | Banister fitness model, TSS, VO2max, race predictor, plan generator, HR zones | `apps/mobile-rn/src/domain/training/` |
| Pipeline | Composes `Filter[]` (Accuracy → Kalman → Jump → MinSegment), emits drop events | `apps/mobile-rn/src/pipeline/Pipeline.ts` |
| Pipeline filters | `AccuracyFilter`, `KalmanFilter`, `JumpFilter`, `MinSegmentFilter`, `PauseDetector` | `apps/mobile-rn/src/pipeline/filters/` |
| `LocationAdapter` | Interface for GPS source (start/stop/permission). Impl: `ExpoLocationAdapter` | `apps/mobile-rn/src/location/LocationAdapter.ts` |
| `SensorAdapter` | Interface for BLE HR/cadence/power. Impl: `BleSensorAdapter`, `MockSensorAdapter` | `apps/mobile-rn/src/sensors/SensorAdapter.ts` |
| `MapboxView` | Sole entry to Mapbox SDK; no `@rnmapbox/maps` import is allowed outside `src/map/` | `apps/mobile-rn/src/map/MapboxView.tsx` |
| `RealtimeAdapter` | Interface + `WebSocketRealtimeAdapter` / `MockRealtimeAdapter` for `/ws` events | `apps/mobile-rn/src/realtime/RealtimeAdapter.ts` |
| `NotificationsAdapter` | Push token request + foreground/response handlers (Expo Push) | `apps/mobile-rn/src/notifications/NotificationsAdapter.ts` |
| `MediaAdapter` | Image picker + upload bridge (`ExpoMediaAdapter`) | `apps/mobile-rn/src/media/MediaAdapter.ts` |
| `HealthAdapter` | HealthKit / Health Connect / Strava import + write workouts | `apps/mobile-rn/src/health/HealthAdapter.ts` |
| `AuthProvider` | OAuth + OTP provider registry (`GoogleAuthProvider`, `AppleAuthProvider`) | `apps/mobile-rn/src/auth/authProviders.ts` |
| `ApiClient` | fetch wrapper + JWT refresh + per-service base URLs | `apps/mobile-rn/src/auth/apiClient.ts` |
| `importRepo` | Pull workouts via `HealthAdapter`, dedupe by `(source, external_uuid)`, insert into `sessions` | `apps/mobile-rn/src/health/importRepo.ts` |
| Storage repos | One repository per domain table (points, sessions, sensors, laps, records, wallet, social, relations) | `apps/mobile-rn/src/storage/*Repository.ts` |
| `database.ts` | SQLite singleton + migrations (target v19), Phase 0..Phase 8 schema evolution | `apps/mobile-rn/src/storage/database.ts` |
| State stores | Zustand stores for each bounded concern: `useActivityStore`, `useAuthStore`, `useSyncStore`, `useWalletStore`, `useRealtimeStore`, … | `apps/mobile-rn/src/state/`, `apps/mobile-rn/src/state/social/` |
| Sync engine | Outbox pattern: pending sessions → POST to `activity-sync`, batched point upload | `apps/mobile-rn/src/sync/syncEngine.ts` |
| Modules | Self-contained slices with own `domain/state/sync/ui/index.ts`: `gamification`, `moderation`, `permissions` | `apps/mobile-rn/src/modules/` |
| Design system | Cursona tokens + primitives (`Button`, `Card`, `Avatar`, `TabBar`, `Metric`, `XPBadge`, `GradeBadge`, …) | `apps/mobile-rn/src/design/` |
| Util | Geo math (`douglasPeucker`, `selfIntersection`, `corridor`, `geojson`), TTS adapter, formatting | `apps/mobile-rn/src/util/` |

### Backend (`services/backend/`)

| Service | Responsibility | Entry point |
|---------|----------------|-------------|
| identity | Email/password + OTP login, JWT issuing/refresh, `/me`, user registration | `services/backend/identity/cmd/server/main.go` (`:8081`) |
| activity-sync | Session + points upsert from mobile outbox; XP/grade ledger | `services/backend/activity-sync/cmd/server/main.go` (`:8082`) |
| social-graph | Follow/block/profile/reports/moderation queue | `services/backend/social-graph/cmd/server/main.go` (`:8083`) |
| messaging | Chats + messages + reactions; NATS outbox publisher; ABAC permissions | `services/backend/messaging/cmd/server/main.go` (`:8084`) |
| feed | Stories + posts + comments + cleanup job | `services/backend/feed/cmd/server/main.go` (`:8085`) |
| notifications | Expo Push delivery + device tokens + per-event templates | `services/backend/notifications/cmd/server/main.go` (`:8086`) |
| media | S3-compatible upload signing, media records | `services/backend/media/cmd/server/main.go` (`:8087`) |
| realtime-gw | WebSocket terminus; subscribes to NATS, fans out per-user/per-device | `services/backend/realtime-gw/cmd/server/main.go` (`:8090`) |
| gateway | Caddy reverse-proxy; path-routes `/auth/*`, `/sessions*`, `/healthz`, etc. | `services/backend/gateway/Caddyfile` (`:8080`) |
| `pkg/auth` | JWT signer + verifier shared by every service | `services/backend/pkg/auth/jwt.go` |
| `pkg/permissions` | ABAC capability checks + role loader | `services/backend/pkg/permissions/` |
| `pkg/ratelimit` | Token-bucket rate limit (Redis-backed) | `services/backend/pkg/ratelimit/ratelimit.go` |
| `pkg/gamification` | XP + grade formulas reused by mobile (`pkg/gamification` mirrors mobile `modules/gamification/domain`) | `services/backend/pkg/gamification/` |
| `pkg/audit` | Append-only audit log helpers | `services/backend/pkg/audit/audit.go` |

## Pattern Overview

**Overall:** Domain-Driven Design with hexagonal-style adapters + offline-first outbox sync + microservice backend with NATS-fanout WebSocket gateway.

**Key Characteristics:**
- **Mobile** = pure-TS core (`domain/`, `pipeline/`) wrapped by **adapters** that quarantine every native SDK or vendor (Mapbox, expo-location, BLE, Expo Push, HealthKit, Strava, WebSocket).
- **Multi-tenant from day 1**: `user_id` columns in SQLite (`wallet_balance`, `social_relations`, `feed_posts`, ...) even though only one user is logged in locally — same shape as backend Postgres.
- **Offline-first**: every write goes through SQLite repos first; `sync/syncEngine.ts` and per-feature outbox tables (`messages.status='pending'`, `feed_posts.is_draft=1`, `stories.is_draft=1`) reconcile to backend when online.
- **Backend** uses a uniform per-service layout (`cmd/server` + `internal/{domain,handler,service,repository}`) and a shared `pkg/` module (auth, permissions, ratelimit, gamification, audit), all wired together by `go.work`.
- **Realtime fanout**: services publish events to NATS JetStream; `realtime-gw` is the only service that holds WebSocket connections and forwards events to mobile.

## Layers

**Domain (pure TS):**
- Purpose: Bounded-context entities and pure functions. Zero React, zero SQLite, zero fetch.
- Location: `apps/mobile-rn/src/domain/`
- Contains: Types (`types.ts`), value objects, calculators (`AreaCalculator.ts`, `ClosureDetector.ts`), training models (`domain/training/`), social/wallet/records types.
- Depends on: `util/geo.ts` (also pure)
- Used by: Pipeline, state stores, UI for formatting.

**Pipeline (signal processing):**
- Purpose: Transform `RawPoint` → `Point | null` through composable filters; emit pause events as sidecar.
- Location: `apps/mobile-rn/src/pipeline/`
- Contains: `Pipeline.ts`, `Filter.ts` (interface), `filters/AccuracyFilter.ts`, `KalmanFilter.ts`, `JumpFilter.ts`, `MinSegmentFilter.ts`, `PauseDetector.ts`
- Depends on: `domain/types.ts`
- Used by: `state/activity.ts` (constructs default pipeline on session start).

**Adapter (platform isolation):**
- Purpose: Hide every native/vendor SDK behind an interface. Concrete implementations live in `./adapters/` subfolders.
- Location: `apps/mobile-rn/src/{location,sensors,map,realtime,notifications,media,health}/`
- Contains: `<Name>Adapter.ts` (interface), `adapters/<Impl>Adapter.ts`, `index.ts` (singleton + public surface).
- Depends on: Vendor SDK (Mapbox, expo-location, react-native-ble-plx, WebSocket, Expo Notifications, etc.) — but only inside `./adapters/`.
- Used by: State stores. Domain code never imports adapters directly.

**State (orchestration):**
- Purpose: Stitch domain + pipeline + adapters + storage into UI-consumable observable state.
- Location: `apps/mobile-rn/src/state/`, `apps/mobile-rn/src/state/social/`, `apps/mobile-rn/src/modules/*/state/`
- Contains: Zustand stores — one per bounded concern (~17 stores total).
- Depends on: Everything above.
- Used by: UI screens, RootNavigator side-effects.

**Storage (persistence):**
- Purpose: SQLite repositories — one per table; raw SQL with prepared statements.
- Location: `apps/mobile-rn/src/storage/`
- Contains: `database.ts` (singleton + migrations), per-table repos (`pointRepository.ts`, `sessionRepository.ts`, `sensorRepository.ts`, `lapRepository.ts`, `recordsRepository.ts`, `walletRepository.ts`, `socialRepository.ts`, `relationsRepository.ts`).
- Depends on: `expo-sqlite`, domain types.
- Used by: State stores, sync engine.

**Sync (outbox):**
- Purpose: Reconcile local SQLite with backend Postgres. Idempotent upserts; per-table cursors in `sync_cursors`.
- Location: `apps/mobile-rn/src/sync/`
- Contains: `syncEngine.ts` (sessions+points), `messageSync.ts` (chat outbox), `mediaUpload.ts` (S3 presign + upload).
- Depends on: Storage repos, `auth/apiClient`.
- Used by: `state/sync.ts`, `state/social/useChatStore.ts`, `RootNavigator` on auth.

**UI (presentation):**
- Purpose: React components — screens, modals, charts. Only here do we mount adapters via state-store hooks.
- Location: `apps/mobile-rn/src/ui/`, `apps/mobile-rn/src/navigation/screens/`, `apps/mobile-rn/src/design/`, `apps/mobile-rn/src/modules/moderation/ui/`
- Depends on: State stores, design system, React Navigation.

**Backend services (per-service hexagon):**
- Purpose: Stateless HTTP services; each owns a slice of Postgres + emits NATS events.
- Location: `services/backend/<service>/`
- Layout: `cmd/server/main.go` (composition root) → `internal/handler/http.go` (thin transport, `net/http`) → `internal/service/*.go` (business logic) → `internal/repository/postgres/*.go` (pgx queries) → `internal/domain/types.go` (entities).

## Data Flow

### Primary Request Path — Recording a run

1. **Sensor → pipeline**: `ExpoLocationAdapter` headless task fires raw GPS points → `useActivityStore.getState().acceptPoint(...)` from outside React lifecycle (`apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`).
2. **Pipeline filter chain**: `state/activity.ts` runs each `RawPoint` through `createDefaultPipeline()` — `AccuracyFilter → KalmanFilter → JumpFilter → MinSegmentFilter`. Drop events feed `droppedCount` / `lastDropFilter` (`apps/mobile-rn/src/state/activity.ts:67`+, `apps/mobile-rn/src/pipeline/index.ts:30`).
3. **Domain calculations**: After each accepted point, `state/activity.ts` calls `totalDistance()`, `isClosed()`, `calculateArea()`, `ClosureDetector` — all pure domain logic (`apps/mobile-rn/src/domain/AreaCalculator.ts`, `domain/ClosureDetector.ts`, `util/geo.ts`).
4. **Buffered persistence**: Accepted `Point[]` is buffered (`FLUSH_THRESHOLD = 10`) and flushed via `appendPoints()` → `pointRepository.ts` (`apps/mobile-rn/src/state/activity.ts:88`).
5. **Finalize**: On Stop, `finalizeSession()` in `sessionRepository.ts` writes summary, `aggregateHrForSession()` rolls HR up, `estimateCaloriesBest()` writes calories, `detectNewRecords()` upserts personal records, `useWalletStore.awardForSession()` mints coins.
6. **Background sync (online)**: `useSyncStore.pullDown()` / `runOutboxSync()` push pending sessions → `apiClient.sync('POST /sessions')` → `activity-sync` → Postgres + Timescale points (`apps/mobile-rn/src/sync/syncEngine.ts:44`, `services/backend/activity-sync/internal/service/sync.go`).
7. **UI**: `state/activity.ts` is subscribed by `screens/record/TrackerLiveScreen.tsx`, `MetricsBar.tsx`, `TrackLayer` etc. for live metrics + map overlay.

### Auth flow

1. User picks provider on `screens/auth/ScreenEmail.tsx` → `useAuthStore.requestCode(email)` → `apiClient.identity('POST /auth/request-code')` (`apps/mobile-rn/src/auth/apiClient.ts`).
2. Identity service routes via `services/backend/identity/internal/handler/http.go` → `service.OtpService` → Postgres `otp_codes`. In dev returns the code in response.
3. `loginWithCode(email, code)` → `POST /auth/login-with-code` → token pair (access + refresh) → `apiClient.setTokens()` → SecureStore (`auth/tokenStorage.ts`).
4. `RootNavigator` `useEffect` reacts to `authState === 'authenticated'`: hydrates wallet, fetches admin role, calls `useSyncStore.pullDown()`, connects realtime, registers push token.

### Realtime flow

1. Mobile: `useRealtimeStore.connect(userId, accessToken, deviceId)` opens WSS to `${API_URL}/ws?token=…&device_id=…` (`apps/mobile-rn/src/realtime/index.ts:12`, `adapters/WebSocketRealtimeAdapter.ts`).
2. Backend `realtime-gw` validates JWT via `pkg/auth.Signer.VerifyAccess`, then subscribes the connection to NATS subjects `user.<userId>.>` and `device.<deviceId>.>` (`services/backend/realtime-gw/internal/gw/handler.go`, `connection.go`, `registry.go`).
3. Other services publish events to NATS (e.g. `messaging/internal/outbox/publisher.go` after a chat message commit; `activity-sync` after XP delta).
4. `realtime-gw` fans out to all connections for that user → mobile `WebSocketRealtimeAdapter` decodes → `RealtimeListener` in `useRealtimeStore` dispatches to `useChatStore`, `useChatsStore`, `useXpStore`.

### Wallet / currency flow

1. Session finalize → `useWalletStore.awardForSession({ userId, sessionId, activity, kcal, durationS, distanceM, avgHrBpm })` (`apps/mobile-rn/src/state/wallet.ts:43`).
2. Pure `decideCoinsForSession()` in `domain/currency.ts` runs anti-fraud + multipliers.
3. `walletRepository.recordTransaction()` inserts into `wallet_transactions` with `UNIQUE (user_id, source_session_id)` for idempotency (`apps/mobile-rn/src/storage/walletRepository.ts`, see `database.ts` v15+v19).
4. UI: `WalletScreen.tsx`, `ShopScreen.tsx` read from `useWalletStore`.

### Integrations (HealthKit / Health Connect / Strava) flow

1. `index.ts` picks platform default: `HealthKitAdapter` on iOS, `HealthConnectAdapter` on Android, `MockHealthAdapter` elsewhere (`apps/mobile-rn/src/health/index.ts:16`).
2. UI invokes `importFromAdapter(sinceMs)` (`apps/mobile-rn/src/health/importRepo.ts:34`).
3. Adapter `pullSince()` returns `ImportedWorkout[]`.
4. `checkWorkoutSanity()` rejects clearly broken records (`importSanity.ts`).
5. `INSERT OR IGNORE INTO sessions (..., source, external_uuid, ...)` deduplicates by the `UNIQUE (source, external_uuid)` index (migration v16, `database.ts:421`).
6. Caller iterates `result.workouts` and awards coins per row.

**State Management:**
- Zustand stores subscribed by React components.
- Single source of truth: SQLite. Stores hydrate from SQLite on auth + maintain in-memory caches for performance.
- Cross-store calls allowed but explicit (e.g. `state/activity.ts` reaches into `useWalletStore.getState().awardForSession()` on finalize).

## Key Abstractions

**`LocationAdapter`** — Sensor-agnostic GPS source.
- Purpose: Hide `expo-location` + headless `TaskManager` from domain code.
- Examples: `apps/mobile-rn/src/location/LocationAdapter.ts` (interface), `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`
- Pattern: Interface + singleton (`export const locationAdapter = new ExpoLocationAdapter()`); concrete impl pushes points directly into `useActivityStore` because the TaskManager task runs outside React.

**`MapAdapter` (de facto `MapboxView`)** — Sole Mapbox entry point.
- Purpose: Quarantine `@rnmapbox/maps` to `src/map/` only. Verified: grep of the whole `src/` tree finds Mapbox imports only inside `src/map/` (`MapboxView.tsx`, `offline.ts`, `components/*.tsx`).
- Examples: `apps/mobile-rn/src/map/MapboxView.tsx`, `apps/mobile-rn/src/map/components/TrackLayer.tsx`, `apps/mobile-rn/src/map/index.ts`
- Pattern: Public re-export from `src/map/index.ts`; layers exposed as React components (`TrackLayer`, `ZoneLayer`, `CorridorLayer`, `LocationPuckLayer`, `HistoryTerritoryLayer`). ТЗ §10.5 mandates `LineLayer + GeoJsonSource` — no `PolylineAnnotation`.

**`SensorAdapter`** — BLE HR / cadence / power abstraction (ТЗ §7).
- Examples: `apps/mobile-rn/src/sensors/SensorAdapter.ts`, `adapters/BleSensorAdapter.ts`, `adapters/MockSensorAdapter.ts`

**`RealtimeAdapter`** — WebSocket / SSE / mock event delivery.
- Examples: `apps/mobile-rn/src/realtime/RealtimeAdapter.ts`, `adapters/WebSocketRealtimeAdapter.ts`, `adapters/MockRealtimeAdapter.ts`
- Pattern: Swap-able singleton (`getRealtimeAdapter()` / `setRealtimeAdapter()`).

**`NotificationsAdapter`** — Push token + foreground/response (Expo Push).
- Examples: `apps/mobile-rn/src/notifications/NotificationsAdapter.ts`, `adapters/ExpoNotificationsAdapter.ts`

**`MediaAdapter`** — Image picker + upload bridge.
- Examples: `apps/mobile-rn/src/media/MediaAdapter.ts`, `adapters/ExpoMediaAdapter.ts`

**`HealthAdapter` + `HealthPlatform`** — HealthKit / Health Connect / Strava / Garmin / mock.
- Examples: `apps/mobile-rn/src/health/HealthAdapter.ts`, `HealthKitAdapter.ts`, `HealthConnectAdapter.ts`, `StravaAdapter.ts`, `MockHealthAdapter.ts`
- Pattern: Adapter chooses itself by `Platform.OS` at module load. `pullSince()` returns `ImportedWorkout[]` deduped by `(platform, sourceUuid)` in `importRepo.ts`.

**`AuthProvider`** — OAuth + OTP provider registry.
- Examples: `apps/mobile-rn/src/auth/authProviders.ts` (`GoogleAuthProvider`, `AppleAuthProvider`), `apps/mobile-rn/src/auth/tokenStorage.ts`, `apps/mobile-rn/src/auth/apiClient.ts`
- Pattern: `getAuthProviders()` returns registry; `availableProviders()` filters by platform + env; `email-otp` is handled directly by `useAuthStore`.

**`importRepo`** — Health import outbox (idempotent insert into `sessions`).
- File: `apps/mobile-rn/src/health/importRepo.ts`
- Pattern: `INSERT OR IGNORE` + sanity check + returns dedup metadata.

**Filter chain** — Composable GPS denoiser.
- File: `apps/mobile-rn/src/pipeline/Filter.ts`, `Pipeline.ts`
- Pattern: `interface Filter { name; apply(p): Point|null; reset() }`. First null in chain wins → drop event.

## Entry Points

**Mobile root (Expo):**
- Location: `apps/mobile-rn/index.ts` → `registerRootComponent(App)` from `App.tsx`
- Triggers: Expo loader at app start.
- Responsibilities: Polyfills (`react-native-get-random-values`), Mapbox token init, TTS adapter, error boundary, `<ThemeProvider>`, `<RootNavigator>`.

**RootNavigator:**
- Location: `apps/mobile-rn/src/navigation/RootNavigator.tsx`
- Triggers: Mount once.
- Responsibilities: Auth hydrate on mount; on auth state change — connect realtime, register push, pull sessions, fetch admin role, hydrate wallet; push-tap deep-link router; global `navRef`.

**Backend (Go) — one `main.go` per service:**
| Service | File | Default port |
|---------|------|--------------|
| identity | `services/backend/identity/cmd/server/main.go` | `:8081` |
| activity-sync | `services/backend/activity-sync/cmd/server/main.go` | `:8082` |
| social-graph | `services/backend/social-graph/cmd/server/main.go` | `:8083` |
| messaging | `services/backend/messaging/cmd/server/main.go` | `:8084` |
| feed | `services/backend/feed/cmd/server/main.go` | `:8085` |
| notifications | `services/backend/notifications/cmd/server/main.go` | `:8086` |
| media | `services/backend/media/cmd/server/main.go` | `:8087` |
| realtime-gw | `services/backend/realtime-gw/cmd/server/main.go` | `:8090` |

Common bootstrap pattern in every service `main.go`:
1. `slog` JSON logger as default.
2. ENV config (`<SERVICE>_HTTP_ADDR`, `<SERVICE>_DB_URL`, `IDENTITY_JWT_SECRET`, optional `NATS_URL`, `REDIS_URL`).
3. `auth.NewSigner(jwtSecret)` from `pkg/auth`.
4. `pgxpool.New(ctx, dbURL)` + `Ping`.
5. (optional) NATS / Redis connect.
6. Construct repos → service → handler.
7. `http.Server` with `ReadHeaderTimeout=5s`, `Read/Write=15s`, `Idle=60s` (realtime-gw uses `0` to allow long-lived WS).
8. `signal.NotifyContext(SIGINT, SIGTERM)` for graceful shutdown.

**Gateway (Caddy):**
- File: `services/backend/gateway/Caddyfile` (dev), `Caddyfile.prod` (prod).
- Port: `:8080`. Path-routes `/auth/*` + `/me` → identity, `/sessions*` → activity-sync, etc. JWT validation lives in each service (`requireAuth` middleware), not in the gateway (yet).

## Architectural Constraints

- **Threading (mobile)**: Single JS thread (RN). Headless GPS task (`expo-task-manager`) runs in a native background context — that is why `ExpoLocationAdapter` pushes points directly into `useActivityStore` instead of relying on React.
- **Threading (backend)**: Standard Go goroutines per request via `net/http`; per-WS connection goroutines in `realtime-gw/internal/gw/connection.go`.
- **Global state**:
  - `apps/mobile-rn/App.tsx` sets Mapbox token + TTS adapter at module load.
  - Singletons in adapter `index.ts` (`locationAdapter`, `getHealthAdapter()`, `getRealtimeAdapter()`, `getNotificationsAdapter()`).
  - SQLite `_db` singleton in `apps/mobile-rn/src/storage/database.ts`.
  - Zustand stores — module-level instances.
- **Circular imports**: None detected. `state` cross-references other stores only via `useX.getState()` at call time (not import time), e.g. `state/activity.ts` → `useWalletStore.getState().awardForSession`.
- **No Mapbox SDK outside `src/map/`** — enforced by convention (CLAUDE.md, ТЗ §3 п.10). Verified: zero offending imports.
- **Multi-tenant from day 1**: every relevant SQLite table carries `user_id` (`wallet_balance`, `wallet_transactions`, `social_relations`, `feed_posts.author_id`, `messages.sender_id`, …).
- **Offline-first**: Outbox columns (`status`, `synced_at`, `client_id`, `attempts`, `last_error`) on every write-heavy table.
- **JWT shared secret**: `IDENTITY_JWT_SECRET` (≥32 bytes) signs in identity and is verified by every other service through `pkg/auth.Signer`. Realtime-gw shares the same secret.
- **Migrations are forward-only on mobile**: SQLite `PRAGMA user_version` linear ladder v1→v19 in `database.ts`. Server uses golang-migrate with `.up.sql/.down.sql` pairs in `services/backend/migrations/`.

## Anti-Patterns

### Direct Mapbox SDK import outside `src/map/`

**What happens:** A new screen `import Mapbox from '@rnmapbox/maps'` to draw a layer.
**Why it's wrong:** Breaks the MapAdapter quarantine (CLAUDE.md, ТЗ §10.6). Any future migration to MapLibre / native module must touch only `src/map/`.
**Do this instead:** Add a new layer component inside `apps/mobile-rn/src/map/components/<Name>Layer.tsx` and re-export from `apps/mobile-rn/src/map/index.ts`.

### Computing area on raw lat/lon

**What happens:** Calling `shoelace` directly on degrees.
**Why it's wrong:** Square-degrees → wildly wrong meters² (ТЗ §6.6).
**Do this instead:** Use `calculateArea()` in `apps/mobile-rn/src/domain/AreaCalculator.ts` which projects into a local plane first.

### Using `PolylineAnnotation` / `AnnotationManager` for the live track

**What happens:** Convenient `<PolylineAnnotation>` per session.
**Why it's wrong:** Annotation managers re-render on every update — janky at 50k+ points (ТЗ §10.5).
**Do this instead:** `TrackLayer` uses `LineLayer + GeoJsonSource` (`apps/mobile-rn/src/map/components/TrackLayer.tsx`).

### Importing adapters from `domain/`

**What happens:** A new domain helper pulls `import { locationAdapter } from '../location'`.
**Why it's wrong:** Domain must stay platform-agnostic and trivially unit-testable (CLAUDE.md).
**Do this instead:** Pass concrete values into the domain function; perform the I/O in `state/*` or the adapter caller.

### Skipping outbox on writes

**What happens:** A new screen does `fetch('POST /sessions')` directly.
**Why it's wrong:** Loses offline-first guarantee; duplicates code in `sync/syncEngine.ts`; no idempotency.
**Do this instead:** Persist to SQLite via the corresponding repository → mark `synced_at = NULL` → let `runOutboxSync` push.

### Storing tokens in plain AsyncStorage

**What happens:** `AsyncStorage.setItem('accessToken', t)`.
**Why it's wrong:** Bypasses `expo-secure-store` (ТЗ §3, no secrets in plaintext).
**Do this instead:** Use `apps/mobile-rn/src/auth/tokenStorage.ts` (already wraps SecureStore).

### Mixing transport concerns into Go `service` layer

**What happens:** A new endpoint puts `json.NewDecoder(r.Body)` inside `service.AuthService`.
**Why it's wrong:** Breaks the per-service `handler → service → repository` separation. `service` must be HTTP-unaware.
**Do this instead:** Keep DTO parsing in `internal/handler/http.go`; pass plain Go structs into `service`.

## Error Handling

**Strategy:**
- **Mobile**: Top-level `<ErrorBoundary>` in `App.tsx` catches render-time crashes and shows a styled fail screen. Async errors are logged via `console.warn/error` with prefix tags (`[sync]`, `[wallet]`, `[RootNavigator]`, ...). Repos throw plain `Error`s; stores `try/catch` and surface a UI-friendly `loading=false, error=string` shape.
- **Backend**: Each handler returns `(status, code, message)` JSON shape via helpers in `handler/http.go`. Domain errors are wrapped with `fmt.Errorf("op: %w", err)`. Graceful shutdown on `SIGINT/SIGTERM`.

**Patterns:**
- `parseRateLimit(resp)` in `apiClient.ts` recognises HTTP 429 and surfaces `retryAfterS`.
- Sync engine catches per-session errors and continues with the rest (`apps/mobile-rn/src/sync/syncEngine.ts:76`).
- Realtime adapter status events (`'reconnecting' | 'error'`) feed `useRealtimeStore.status` for UI banner.

## Cross-Cutting Concerns

**Logging:**
- Mobile: `console.{log,warn,error}` with module prefix tags. No structured logger yet.
- Backend: `slog.New(slog.NewJSONHandler(os.Stdout, ...))` set as default; per-handler `loggingMiddleware` in each `internal/handler/http.go`.

**Validation:**
- Mobile: Manual checks in repos + domain functions; no schema lib (no Zod yet).
- Backend: Manual `if email == "" { return badRequest(...) }` style in handlers; tighter input contracts in `service` layer.

**Authentication:**
- Mobile: `ApiClient` injects `Authorization: Bearer <accessToken>` and auto-refreshes on 401 via the refresh-token endpoint (`apps/mobile-rn/src/auth/apiClient.ts`).
- Backend: `pkg/auth.Signer` verifies HS256 JWTs; each service exposes a `requireAuth` middleware around protected routes (`identity/internal/handler/http.go:48`).

**Authorization:**
- Backend: `pkg/permissions` implements role + capability ABAC checks. Used most heavily by `messaging/internal/permissions/permissions.go` and `social-graph/internal/handler/moderation.go`.

**Rate limiting:**
- `pkg/ratelimit/ratelimit.go` — Redis-backed token bucket, wired into feed/messaging handlers.

**Audit:**
- `pkg/audit/audit.go` — append-only audit trail used by moderation actions.

**Observability:**
- `services/backend/observability/` — Prometheus / Loki / Grafana configs; `docker-compose.observability.yml` stack lives outside the main app compose.

---

*Architecture analysis: 2026-05-14*
