<!-- refreshed: 2026-05-23 -->
# Architecture

**Analysis Date:** 2026-05-23

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                        Mobile Client (Expo RN)                            │
│                        `apps/mobile-rn/App.tsx`                           │
├───────────────────┬────────────────────┬─────────────────────────────────┤
│  UI / Navigation  │    State Stores    │  Domain (pure, no platform)     │
│  React Navigation │  Zustand + MMKV    │  SessionManager, AreaCalculator │
│  `src/ui/`        │  `src/state/`      │  `src/domain/`                  │
│  `src/navigation/`│                    │                                 │
└────────┬──────────┴──────────┬─────────┴──────────────────┬──────────────┘
         │                     │                            │
         ▼                     ▼                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       Adapter Layer (interfaces)                          │
│  LocationAdapter `src/location/`   MapAdapter (MapboxView) `src/map/`    │
│  SensorAdapter   `src/sensors/`    HealthAdapter `src/health/`           │
│  RealtimeAdapter `src/realtime/`   NotificationsAdapter `src/notifications/`│
│  MediaAdapter    `src/media/`                                            │
└────────┬──────────────────────┬──────────────────────────┬───────────────┘
         │                      │                          │
         ▼                      ▼                          ▼
┌────────────────────┐  ┌────────────────────┐   ┌────────────────────────┐
│ Native / Platform  │  │  Local Persistence  │   │  HTTP / WebSocket API  │
│ expo-location,     │  │  expo-sqlite (WAL), │   │  apiClient → Go        │
│ expo-task-manager, │  │  MMKV (settings),   │   │  backend (services/)   │
│ @rnmapbox/maps,    │  │  expo-secure-store  │   │                        │
│ expo-notifications │  │  (tokens)           │   │                        │
└────────────────────┘  └─────────────────────┘   └────────┬───────────────┘
                                                            │
                                                            ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                  Backend (Go monorepo, services/backend/)                 │
│                                                                            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ identity │ │activity- │ │messaging │ │  feed    │ │ notifications│    │
│  │ :8081    │ │ sync     │ │ :8084    │ │ :8086    │ │ :8087        │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘    │
│       │            │            │            │              │              │
│  ┌────┴────┐ ┌─────┴────┐ ┌─────┴────┐ ┌────┴─────┐ ┌──────┴───────┐    │
│  │  media  │ │realtime- │ │  social- │ │ gateway  │ │   pkg/       │    │
│  │         │ │ gw       │ │  graph   │ │ (admin)  │ │  (shared)    │    │
│  └─────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────┘    │
│                                                                            │
│  Each service: cmd/server/main.go → internal/{handler,service,             │
│  repository,domain} (clean architecture per Go DDD conventions)            │
└──────────────────────────────────────────────────────────────────────────┘
         │                                                  │
         ▼                                                  ▼
┌──────────────────────┐                  ┌──────────────────────────────┐
│ Postgres (per-service │                  │ Observability VPS            │
│ migrations in         │                  │ Loki + Prometheus + Grafana  │
│ services/backend/     │                  │ `infra/observability-stack/` │
│ migrations/)          │                  │ + Grafana Alloy log shipper  │
│ NATS (events)         │                  │ + DebugSessionMiddleware     │
└──────────────────────┘                  └──────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App root | Polyfills, Mapbox token init, ThemeProvider, ErrorBoundary, RootNavigator | `apps/mobile-rn/App.tsx` |
| RootNavigator | Auth gate, push deep-link routing, realtime/push/sync lifecycle | `apps/mobile-rn/src/navigation/RootNavigator.tsx` |
| SessionManager | Pure imperative session lifecycle (start/pause/resume/ingest/markLap/stop) | `apps/mobile-rn/src/domain/session/SessionManager.ts` |
| useActivityStore | Zustand wrapper over SessionManager; cross-cutting wallet/records/calories orchestration | `apps/mobile-rn/src/state/activity.ts` |
| LocationAdapter | Interface for GPS sensor (start/stop/sampling mode); only expo-location-impl | `apps/mobile-rn/src/location/LocationAdapter.ts` |
| ExpoLocationAdapter | TaskManager-based background GPS task; calls `ingestRawPoint` from activity store | `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` |
| Pipeline | Composes filters (Accuracy → Kalman → Jump → MinSegment); first null prunes point | `apps/mobile-rn/src/pipeline/Pipeline.ts` |
| MapboxView | Sole entry-point to @rnmapbox/maps; nothing else may import the SDK | `apps/mobile-rn/src/map/MapboxView.tsx` |
| SQLite database | Singleton, migration runner with `PRAGMA user_version` (v19 current) | `apps/mobile-rn/src/storage/database.ts` |
| Repositories | Per-aggregate persistence (session, point, lap, sensor, records, wallet, social) | `apps/mobile-rn/src/storage/*Repository.ts` |
| Backend pkg | Shared Go packages (auth/JWT, observability, audit, ratelimit, featureflags, clientversion) | `services/backend/pkg/` |
| Identity service | OAuth + JWT issuance, OTP, feature flags endpoint | `services/backend/identity/` |
| Realtime-gw | WebSocket fanout subscribed to NATS for chat/XP events | `services/backend/realtime-gw/` |
| Observability stack | Loki + Prometheus + Grafana colocated on `srv1561293`, Caddy ingress | `infra/observability-stack/docker-compose.yml` |
| Ansible deploy | Bootstraps app VPS (docker, ufw, sport-stack) + alloy-shipper to obs VPS | `infra/ansible/site.yml` |

## Pattern Overview

**Overall:** Hexagonal / Ports-and-Adapters layered on top of Domain-Driven Design. Mobile is a single Expo RN app with strict adapter pattern around every platform/SDK boundary. Backend is a Go microservice monorepo where each service follows the same handler → service → repository → domain layering.

**Key Characteristics:**
- **Adapter discipline:** Mapbox, expo-location, BLE, push, media, WebSocket each sit behind a TypeScript interface; concrete SDKs may only be imported inside `src/<name>/adapters/` (enforced by ESLint `no-restricted-imports` for `@rnmapbox/maps`).
- **Domain purity:** `src/domain/` has zero React / Mapbox / SQLite imports. `SessionManager` receives its dependencies (`SessionRepo`, `LocationAdapter`, filters) by constructor injection.
- **Offline-first:** SQLite is the source of truth; sync engine (`src/sync/syncEngine.ts`) push/pulls via outbox pattern. Token storage in `expo-secure-store`; settings/feature flags in MMKV with TTL guards.
- **Multi-tenant from day 1:** `user_id` is a column in every backend Postgres table and in every social/wallet/messages table in the SQLite schema (see migrations `services/backend/migrations/` + `src/storage/database.ts` schema notes v8-v19).
- **Sensor-agnostic GPS:** `LocationAdapter` exposes `SamplingMode` (`active` | `paused` | `background-slc`); the pipeline does not know which sensor produced the point.

## Layers

**Domain layer:**
- Purpose: Pure business logic — value objects, entities, calculations, session lifecycle
- Location: `apps/mobile-rn/src/domain/` (mobile), `services/backend/<svc>/internal/domain/` (Go services)
- Contains: `SessionManager`, `AreaCalculator`, `ClosureDetector`, `calories`, `records`, `currency`, `streak`, `types`, athlete, lap, splits
- Depends on: nothing platform-specific; only stdlib + other domain modules
- Used by: state stores (mobile), service-layer code (backend)

**Pipeline layer (mobile):**
- Purpose: GPS data refinement (filters composed in order)
- Location: `apps/mobile-rn/src/pipeline/`
- Contains: `Pipeline.ts`, `Filter.ts`, `filters/AccuracyFilter.ts`, `filters/KalmanFilter.ts`, `filters/JumpFilter.ts`, `filters/MinSegmentFilter.ts`, `filters/PauseDetector.ts`
- Depends on: `domain/types` (RawPoint, Point) only
- Used by: `SessionManager` and `state/activity.ts`

**Adapter layer (mobile):**
- Purpose: Platform abstraction (port = interface, adapter = concrete impl)
- Location: `apps/mobile-rn/src/{location,map,sensors,realtime,notifications,media,health}/`
- Contains: One `*Adapter.ts` interface file per area + `adapters/` subdir with concrete classes
- Depends on: domain types + Expo/RN SDKs (only inside `adapters/`)
- Used by: state stores and screens; SDK imports are walled off from the rest of `src/`

**State layer (mobile):**
- Purpose: Zustand stores hold UI snapshots, coordinate side effects, persist via MMKV where needed
- Location: `apps/mobile-rn/src/state/`
- Contains: `activity`, `auth`, `sync`, `settings`, `featureflags`, `history`, `training`, `wallet`, `workoutPlayer`, `sensors`, `social/`, `map`, `forceUpdate`
- Depends on: domain + storage + adapters
- Used by: UI components and navigation

**Storage layer (mobile):**
- Purpose: SQLite persistence, one repository per aggregate
- Location: `apps/mobile-rn/src/storage/`
- Contains: `database.ts` (singleton + migrations v1-v19), `sessionRepository`, `pointRepository`, `lapRepository`, `sensorRepository`, `recordsRepository`, `relationsRepository`, `walletRepository`, `socialRepository`
- Depends on: `expo-sqlite` + domain types
- Used by: state stores; never by UI directly

**UI layer:**
- Purpose: React Native components and screens
- Location: `apps/mobile-rn/src/ui/`, `apps/mobile-rn/src/navigation/`, `apps/mobile-rn/src/design/`
- Contains: Modals (HistoryModal, ProfileModal, …), screens (`navigation/screens/` per tab: auth/chats/journal/me/record), design system in `src/design/` (ThemeProvider + tokens + reusable components)
- Depends on: state stores + design tokens
- Used by: App.tsx root

**Backend per-service layering (Go):**
- `cmd/server/main.go` — wires env config, opens pgx pool, builds middleware chain (DebugSession → Promhttp → SentryRecovery → OtelHTTP → clientversion → mux), serves HTTP
- `internal/handler/` — HTTP handlers + router
- `internal/service/` — business logic, transactions
- `internal/repository/` — interface + `postgres/` impl + `memory/` impl for tests
- `internal/domain/` — pure entities (User, RefreshToken, …)

## Data Flow

### Primary GPS Recording Path

1. User taps "Start" → `useActivityStore.start()` invokes `SessionManager.start()` (`apps/mobile-rn/src/state/activity.ts`, `apps/mobile-rn/src/domain/session/SessionManager.ts`)
2. SessionManager calls `locationAdapter.start()` → `ExpoLocationAdapter` registers/updates the `BACKGROUND_LOCATION_TASK` via `expo-task-manager` (`apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts:80-92`)
3. expo-location pushes `LocationObject` to the headless task callback; adapter converts to `RawPoint` and calls `ingestRawPoint(...)` exported from `state/activity.ts`
4. `ingestRawPoint` runs the raw point through `Pipeline.process(raw)` (Accuracy → Kalman → Jump → MinSegment) (`apps/mobile-rn/src/pipeline/Pipeline.ts:35-46`)
5. If accepted, `PauseDetector` is consulted as a sidecar; on event, `setSamplingMode('paused' | 'active')` toggles GPS profile without stop/start gap
6. Accepted point appended to `manager.points` buffer; every 10 points it flushes to SQLite via `pointRepository.appendPoints()` (`apps/mobile-rn/src/storage/pointRepository.ts`)
7. UI selectors (`useActivityStore(s => s.points)`) re-render `TrackLayer` (`src/map/components/TrackLayer.tsx`) which uses a Mapbox `LineLayer + GeoJsonSource` — never `PolylineAnnotation` (CLAUDE.md constraint)

### Session Finalization Path

1. `SessionManager.stop()` computes total distance, area (via `AreaCalculator` with local-plane projection), HR aggregates (`sensorRepository.aggregateHrForSession`)
2. `finalizeSession()` writes the closed row to SQLite (`apps/mobile-rn/src/storage/sessionRepository.ts`)
3. Wrapper in `state/activity.ts` reads snapshot and orchestrates cross-cutting concerns: calories estimate (`domain/calories.estimateCaloriesBest`), new personal records (`domain/records.detectNewRecords`), wallet credit (`useWalletStore`)
4. `useSyncStore.trigger()` later picks up un-synced sessions through the outbox pattern and POSTs to backend `activity-sync` service via `apiClient`

### Auth + API Path

1. Login screen calls `apiClient.post('/auth/...')` → identity service `:8081`
2. JWT pair returned; access stored in memory state, refresh stored in `expo-secure-store` via `src/auth/tokenStorage.ts`
3. `apiClient` (`src/auth/apiClient.ts`) attaches `Authorization: Bearer <access>`, transparently refreshes on 401, surfaces 426 → `useForceUpdateStore.setState({ required: true })` so `ForceUpdateScreen` displays a blocking modal
4. Backend `clientversion.Middleware` (`services/backend/pkg/clientversion/`) returns 426 when client version is below `CLIENT_MIN_VERSION` env

### Realtime / Push Path

1. After authenticated state, `RootNavigator` connects `useRealtimeStore.connect()` (`apps/mobile-rn/src/navigation/RootNavigator.tsx:59-95`)
2. `WebSocketRealtimeAdapter` (`src/realtime/adapters/WebSocketRealtimeAdapter.ts`) opens WS to `realtime-gw` `:8085`
3. realtime-gw subscribes to NATS topics; receives `message.new`, `user.xp.changed`, etc., fans out to authorized WS subscribers
4. Push token registered via `expo-notifications` adapter; identity service stores token, `notifications` service uses Expo Push to fan out

**State Management:**
- Zustand vanilla `create()` stores in `src/state/`
- MMKV persist (`react-native-mmkv`) wraps settings + feature flags via `createJSONStorage`
- Secure storage (`expo-secure-store`) for JWT refresh + OAuth tokens
- SQLite (WAL mode, `running_ecosystem.db`) as authoritative store for sessions/points/laps/sensors/wallet/social-cache
- Module-level singletons: `_db` in `src/storage/database.ts`, the single `SessionManager` in `src/state/activity.ts`, registered `TaskManager.defineTask` for background GPS

## Key Abstractions

**LocationAdapter:**
- Purpose: Abstract GPS source (expo-location today, native module / mock later)
- Examples: `apps/mobile-rn/src/location/LocationAdapter.ts`, `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`
- Pattern: Port-and-Adapter with module-level singleton exported from `src/location/index.ts`

**MapAdapter (de-facto: `MapboxView` boundary):**
- Purpose: Single ingress to Mapbox SDK; SDK imports are physically confined to `src/map/`
- Examples: `apps/mobile-rn/src/map/MapboxView.tsx`, `apps/mobile-rn/src/map/components/TrackLayer.tsx`, `apps/mobile-rn/src/map/index.ts`
- Pattern: Façade + composed Layer components, all `@rnmapbox/maps` imports gated by ESLint rule

**SensorAdapter:**
- Purpose: BLE HR/cadence/power sensors
- Examples: `apps/mobile-rn/src/sensors/SensorAdapter.ts`, `src/sensors/adapters/BleSensorAdapter.ts`, `src/sensors/adapters/MockSensorAdapter.ts`
- Pattern: Listener-based async adapter (scan / connect / readings stream)

**RealtimeAdapter:**
- Purpose: WebSocket abstraction for chat + XP fanout
- Examples: `apps/mobile-rn/src/realtime/RealtimeAdapter.ts`, `src/realtime/adapters/WebSocketRealtimeAdapter.ts`, `src/realtime/adapters/MockRealtimeAdapter.ts`

**HealthAdapter:**
- Purpose: External activity import from HealthKit / Health Connect / Strava
- Examples: `apps/mobile-rn/src/health/HealthAdapter.ts`, `HealthKitAdapter.ts`, `HealthConnectAdapter.ts`, `StravaAdapter.ts`, `MockHealthAdapter.ts`

**SessionRepo (interface in domain layer):**
- Purpose: Minimal storage contract that `SessionManager` needs — composed in state-layer wrapper from `sessionRepository + pointRepository + lapRepository + sensorRepository`
- Examples: `apps/mobile-rn/src/domain/session/SessionManager.ts:39-60`

**Backend repository interfaces:**
- Purpose: Postgres abstraction per service
- Examples: `services/backend/identity/internal/repository/repository.go` (UserRepo, RefreshTokenRepo), with `postgres/` and `memory/` impls

## Entry Points

**Mobile:**
- Location: `apps/mobile-rn/index.ts` → `registerRootComponent(App)` → `apps/mobile-rn/App.tsx`
- Triggers: Expo runtime on app launch
- Responsibilities: Polyfill `react-native-get-random-values`, set Mapbox token, set TTS adapter, kick feature-flag refresh, wrap tree in `ErrorBoundary` → `SafeAreaProvider` → `ThemeProvider` → `ToastProvider` → `RootNavigator` + `ForceUpdateScreen`

**Background GPS task:**
- Location: `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` (`TaskManager.defineTask('BACKGROUND_LOCATION_TASK', ...)` at module top-level)
- Triggers: expo-task-manager when `startLocationUpdatesAsync` is active and platform delivers updates (foreground service on Android, background mode on iOS)
- Responsibilities: Convert each `LocationObject` → `RawPoint` → `ingestRawPoint()` (which runs pipeline + flushes to SQLite)

**Backend services (one entry per service):**
- `services/backend/identity/cmd/server/main.go` — port `:8081`
- `services/backend/activity-sync/cmd/server/main.go`
- `services/backend/feed/cmd/server/main.go`
- `services/backend/social-graph/cmd/server/main.go`
- `services/backend/messaging/cmd/server/main.go`
- `services/backend/notifications/cmd/server/main.go` (`:8087`)
- `services/backend/realtime-gw/cmd/server/main.go`
- `services/backend/media/cmd/server/main.go`
- Each: reads env (`*_HTTP_ADDR`, `*_DB_URL`, `IDENTITY_JWT_SECRET`), opens `pgxpool`, builds middleware chain, registers `/metrics`, blocks until SIGINT/SIGTERM

## Architectural Constraints

- **Threading (mobile):** Single JS thread + native modules. The TaskManager GPS task runs headless (no React lifecycle) and must call store-level functions like `ingestRawPoint`, never React hooks.
- **Threading (backend):** Goroutine-per-request via stdlib `net/http`; pgxpool is the only shared concurrency primitive; rate limiting in `pkg/ratelimit`.
- **Global state (mobile):** `_db` singleton in `src/storage/database.ts:6`; module-level `SessionManager` in `src/state/activity.ts`; module-level Mapbox access-token side effect in `App.tsx`; one TaskManager task name (`BACKGROUND_LOCATION_TASK`).
- **Mapbox isolation (hard rule):** ESLint `no-restricted-imports` forbids `@rnmapbox/maps` outside `src/map/` (`apps/mobile-rn/eslint.config.js`). The only allowed importer is `src/map/MapboxView.tsx` and `src/map/components/*`.
- **No `:latest` Docker tag:** Backend CD pipeline enforces `flavor: latest=false` + a no-latest-tag-guard job (`.github/workflows/backend-cd.yml`).
- **Area computation:** Never compute area on raw lat/lon — must project to local plane (CLAUDE.md + `src/domain/AreaCalculator.ts`).
- **Track rendering:** Only `LineLayer + GeoJsonSource`, never `PolylineAnnotation` / `AnnotationManager` (CLAUDE.md, ТЗ §10.5).
- **Multi-module Go monorepo:** Each backend service has its own `go.mod`; `services/backend/pkg/` is a separate module imported by replace-directive or path (see `services/backend/identity/go.mod`).
- **Secrets:** SOPS+age-encrypted YAML in `.secrets/<env>/`; CI uses `SOPS_AGE_KEY_CI` secret; never commit plaintext (see `.sops.yaml`, ADR-0012).

## Anti-Patterns

### Importing `@rnmapbox/maps` outside `src/map/`

**What happens:** A screen or business module reaches into the Mapbox SDK directly to render or compute geometry.
**Why it's wrong:** Defeats the MapAdapter boundary, blocks future migration (e.g., MapLibre), and breaks the ESLint guard, failing CI.
**Do this instead:** Add a new Layer component in `src/map/components/`, re-export it from `src/map/index.ts`, and consume it from the screen. See `apps/mobile-rn/src/map/MapboxView.tsx:1-12` rationale.

### Computing area / distance directly on lat/lon

**What happens:** A function multiplies degrees to estimate meters or uses raw shoelace on geographic coordinates.
**Why it's wrong:** Distorts area outside the equator and breaks ClosureDetector / record detection.
**Do this instead:** Use `domain/AreaCalculator.ts` (projects to local plane); for distance use `util/geo.totalDistance` which uses the equirectangular approximation tuned per-segment.

### Putting platform side effects inside `src/domain/`

**What happens:** A domain module imports `expo-sqlite`, `@rnmapbox/maps`, or Zustand.
**Why it's wrong:** Breaks domain purity, makes unit tests require Expo runtime, breaks the SessionManager DI contract.
**Do this instead:** Keep domain modules stdlib-only; inject any IO via constructor (see `SessionRepo` interface in `apps/mobile-rn/src/domain/session/SessionManager.ts:39-60`).

### Letting CD push `:latest` Docker tags

**What happens:** A workflow change starts tagging GHCR images as `:latest` for convenience.
**Why it's wrong:** Breaks the deterministic-deploy contract; rollback target ambiguity; against ROADMAP hard rule + ADR-0011.
**Do this instead:** Use `:<sha>`, `:<short-sha>`, and `:vX.Y.Z` only. See `.github/workflows/backend-cd.yml:6-20`.

### Bare `echo "X=$value" >> $GITHUB_ENV` for secret materials

**What happens:** CI exposes a decrypted secret (e.g., keystore password) to subsequent steps without masking.
**Why it's wrong:** GitHub Actions only auto-masks `${{ secrets.X }}` references; plain `echo` leaks the value in logs (see ADR-0012 incident 2026-05-22).
**Do this instead:** Emit `::add-mask::$value` first, then write to `$GITHUB_ENV`. See `.github/workflows/android-release.yml` Step 4 commentary.

## Error Handling

**Strategy:** Layered.

**Mobile patterns:**
- Root `ErrorBoundary` in `apps/mobile-rn/App.tsx:48-74` shows a fallback screen and logs to `console.error`
- `apiClient` translates HTTP errors → typed exceptions; 426 → `useForceUpdateStore`; 401 → silent refresh + retry; network → store-level `error` field
- Sync engine swallows pull failures (best-effort), logs via `console.warn`
- Domain functions return `null` for "not enough data" rather than throwing (see `Pipeline.process` returning null)

**Backend patterns:**
- `pkg/observability/sentry_init.go` captures panics via `SentryRecovery` middleware
- Handlers return Go errors → mapped to JSON `{ code, message }` in `internal/handler/http.go`
- `pkg/observability/debug_session_middleware.go` enables per-user DEBUG slog level when `X-Debug-Session` header + tester JWT + featureflag match

## Cross-Cutting Concerns

**Logging:**
- Mobile: `console.warn` / `console.error` prefixed with subsystem (`[RootNavigator]`, `[App ErrorBoundary]`, `[location task]`)
- Backend: `slog` JSON handler from `services/backend/pkg/observability/slog_handler.go`, default attrs include `service`, `env`, `version`

**Validation:**
- Mobile: TypeScript at compile time; runtime validation done inside domain functions (e.g., reject empty arrays)
- Backend: per-handler manual validation; OpenAPI specs in `services/backend/api/*.yaml` checked via `scripts/openapi-routes-check/`

**Authentication:**
- JWT (`services/backend/pkg/auth/jwt.go`, HS256, secret ≥32 bytes enforced)
- Refresh tokens hashed at rest, ConstantTime compared
- Mobile tokens in `expo-secure-store` keystore

**Observability:**
- Middleware chain (outermost first): DebugSession → Promhttp → SentryRecovery → OtelHTTP → clientversion → mux
- Metrics scraped by Prometheus on `:9090`
- Logs shipped to Loki by Grafana Alloy systemd service on the prod VPS
- Grafana dashboards provisioned in `infra/observability-stack/grafana/provisioning/`

**Feature flags:**
- Backend authoritative via identity service (`/feature-flags`)
- Mobile cached in MMKV with TTL guard (`apps/mobile-rn/src/state/featureflags.ts`)
- Used to gate tester-only debug logging, mobile rollout switches

---

*Architecture analysis: 2026-05-23*
