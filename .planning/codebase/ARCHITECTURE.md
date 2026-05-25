<!-- refreshed: 2026-05-25 -->
# Architecture

**Analysis Date:** 2026-05-25

## System Overview

Running Ecosystem is a polyglot monorepo: an Expo React Native mobile client (`apps/mobile-rn/`) plus a Go backend split into eight services (`services/backend/`) fronted by Caddy. Infrastructure-as-code (`infra/`), CI workflows (`.github/workflows/`), release tooling (`scripts/`), and SOPS-encrypted secrets (`.secrets/`) live at the repo root. Mobile follows domain-driven layering with adapter abstractions for every platform integration (map, location, sensors, notifications, media, realtime, health); backend follows the standard Go `cmd/` + `internal/{handler,service,repository,domain}` per-service layout.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          Mobile (Expo RN)                                │
│                       `apps/mobile-rn/App.tsx`                           │
│                                  │                                       │
│   ┌──────────────────────────────┴──────────────────────────────────┐   │
│   │  UI / screens / design system                                    │   │
│   │  `src/ui/`, `src/navigation/screens/`, `src/design/`             │   │
│   └──────────────────────────────┬──────────────────────────────────┘   │
│                                  │ (Zustand selectors)                   │
│   ┌──────────────────────────────┴──────────────────────────────────┐   │
│   │  State (Zustand + MMKV persist)                                  │   │
│   │  `src/state/`, `src/update/`, `src/modules/*/state/`             │   │
│   └────────────┬──────────────────┬───────────────────────┬─────────┘   │
│                │                  │                       │              │
│                ▼                  ▼                       ▼              │
│   ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐ │
│   │ Domain (pure TS)   │ │ Pipeline (filters) │ │ Adapters           │ │
│   │ `src/domain/`      │ │ `src/pipeline/`    │ │ map/, location/,   │ │
│   │                    │ │                    │ │ sensors/, etc.     │ │
│   └─────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘ │
│             └────────────┬─────────┴────────────┬─────────┘            │
│                          ▼                      ▼                       │
│              ┌─────────────────────┐  ┌─────────────────────┐          │
│              │ Storage (SQLite)    │  │ Sync / Realtime     │          │
│              │ `src/storage/`      │  │ `src/sync/`, WS     │          │
│              └──────────┬──────────┘  └──────────┬──────────┘          │
└─────────────────────────┼─────────────────────────┼─────────────────────┘
                          │                         │
                          ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│             Backend (Go) — `services/backend/`                           │
│             Caddy reverse proxy `services/backend/gateway/`              │
│  identity │ activity-sync │ feed │ social-graph │ messaging │            │
│  realtime-gw │ notifications │ media  (each: cmd/server/main.go +        │
│                                              internal/{handler,service,  │
│                                              repository,domain})          │
└──────┬──────────────┬──────────────┬──────────────┬──────────────┬──────┘
       ▼              ▼              ▼              ▼              ▼
  PostgreSQL+    Redis        NATS          MinIO          Sentry SaaS
  TimescaleDB                JetStream      (S3-compatible
                                             object storage)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Mobile root | Bootstrap polyfills, side-effects, ErrorBoundary, providers; mount Plan 07-03 + Plan 08-01 hooks | `apps/mobile-rn/App.tsx` |
| Expo registration | Single `registerRootComponent(App)` call | `apps/mobile-rn/index.ts` |
| Root navigator | Auth gate, push deep-link, realtime/push/wallet bootstrap on auth | `apps/mobile-rn/src/navigation/RootNavigator.tsx` |
| Tab navigator | 4-tab bottom navigator; aggregates `chats[*].unreadCount` into `<TabBar badges>` | `apps/mobile-rn/src/navigation/AppTabs.tsx` |
| Session manager | Pure state machine for an active recording session; pause-window accumulator + `effectiveElapsedMs(nowMs)` for frozen UI timer | `apps/mobile-rn/src/domain/session/SessionManager.ts` |
| Activity store | Zustand wrapper over SessionManager + cross-cutting orchestration; exposes `pausedAt`, `pausedDurationMs` | `apps/mobile-rn/src/state/activity.ts` |
| GPS pipeline | Composable filter chain (Accuracy/Jump/Kalman/MinSegment/PauseDetector with optional WarmupConfig gate) | `apps/mobile-rn/src/pipeline/Pipeline.ts` + `src/pipeline/filters/*` |
| Map adapter | Single Mapbox boundary; never imported outside `src/map/` | `apps/mobile-rn/src/map/index.ts`, `MapboxView.tsx` |
| Location adapter | Sensor-agnostic location source (Expo impl in `adapters/`) | `apps/mobile-rn/src/location/LocationAdapter.ts` |
| Sensor adapter | BLE HR/Power/Cadence + mock | `apps/mobile-rn/src/sensors/SensorAdapter.ts` |
| Foreground notification | Sticky Android notification subscribed to activity store | `apps/mobile-rn/src/foreground/notification.ts` |
| Vendor (OEM) | Detect Xiaomi/Samsung/Huawei + deep-link to autostart settings | `apps/mobile-rn/src/vendor/oem.ts`, `openOEMSettings.ts`, `AutostartDialog.tsx` |
| Update flow | Manifest fetch + Ed25519 verify + 3-state dispatch (force/banner/silent); GATED off until Phase 8 ships | `apps/mobile-rn/src/update/manifestCheck.ts` and siblings |
| Storage layer | Per-aggregate repositories over expo-sqlite | `apps/mobile-rn/src/storage/*Repository.ts` |
| API client | Fetch wrapper with 426 force-update interception | `apps/mobile-rn/src/auth/apiClient.ts` |
| Design primitives | Cursona tokens + atomic components incl. `TabBar` (with `badges`), `Avatar` (gradient + initials fallback), `Skeleton` family | `apps/mobile-rn/src/design/components/` |
| Backend gateway | Caddy reverse proxy + admin static UI | `services/backend/gateway/Caddyfile`, `Caddyfile.prod` |
| Backend services | 8 independent Go binaries under `services/backend/<svc>/cmd/server/main.go` | identity, activity-sync, feed, social-graph, messaging, realtime-gw, notifications, media |
| Shared Go packages | Cross-service helpers (auth, ratelimit, observability, audit, …) | `services/backend/pkg/*` |
| OpenAPI contracts | Per-service YAML + `_shared/{parameters,schemas,responses}.yaml` | `services/backend/api/*.yaml` |
| DB migrations | Numbered `000N_*.up/down.sql` for Postgres + TimescaleDB | `services/backend/migrations/` |
| Release pipeline | Tag-triggered EAS build + MinIO distribute + Ed25519 manifest sign | `.github/workflows/android-release.yml`, `scripts/release-distribute.sh` |
| Dev debug APK pipeline | Branch-push universal debug APK artifact (BlueStacks/internal testers) | `.github/workflows/android-debug-apk.yml` |

## Pattern Overview

**Overall:** Domain-driven design with a strict adapter boundary for every platform/external dependency. Mobile is offline-first; multi-tenant from day 1 (every persisted row carries `user_id`). Backend is a service-per-bounded-context Go monorepo behind a single Caddy reverse proxy.

**Key Characteristics:**
- Sensor-agnostic GPS — all location input flows through `LocationAdapter`; no direct Expo/Mapbox calls in domain or pipeline code.
- Single point of Mapbox import (`src/map/`); enforced by repo convention (see `CLAUDE.md`).
- Pure domain layer (`src/domain/`) — no React, no Expo, no storage imports; only TypeScript + math.
- State stores wrap domain — Zustand stores hold snapshots derived from domain objects (e.g., `useActivityStore` wraps `SessionManager`); UI selects from stores.
- Per-service Go layout — `cmd/server/main.go` boots; `internal/handler` exposes HTTP; `internal/service` orchestrates; `internal/repository` persists; `internal/domain` holds entities.
- Tag-driven distribution — git tag `v1.0.0-beta.*` / `v1.0.0-rc.*` is the only release trigger; manifest signed in CI; mobile verifies on every foreground.
- Update module is fully gated behind ADR-0011 Amendment 5 — code is in-tree but `manifestCheck.ts` early-returns when `EXPO_PUBLIC_UPDATE_MANIFEST_URL` is unset.

## Layers

**Mobile — UI Layer (`apps/mobile-rn/src/ui/` + `src/navigation/screens/` + `src/design/`):**
- Purpose: Render screens, components, design-system primitives.
- Depends on: state stores, design tokens, navigation types.
- Used by: `RootNavigator`.

**Mobile — Design system (`apps/mobile-rn/src/design/`):**
- Purpose: Cursona tokens, ThemeProvider, atomic components (Card, Button, FAB, TopBar, Avatar, Skeleton, TabBar, …).
- Notable primitives:
  - `TabBar` accepts `badges?: Partial<Record<TabId, number>>` — renders a red circular badge (capped "99+") in the top-right of each tab's icon. Consumed by `AppTabs.tsx` which aggregates `chats[*].unreadCount`.
  - `Avatar` with `src=null|''` renders a deterministic `LinearGradient` (12-color palette indexed by `hashName(name)`) overlaid with up to 2 uppercase initials via `src/design/avatarInitials.ts`. Replaces former pravatar.cc external lookup.
  - `Skeleton` family — generic `<Skeleton />` shimmer (RN Animated opacity loop, native driver) plus pre-shaped `ChatRowSkeleton` and `MessageBubbleSkeleton` exported from `src/design/components/Skeleton.tsx`.
- Helpers: `src/design/avatarInitials.ts` (deterministic initials + gradient palette).
- Used by: every UI + screen file.

**Mobile — State Layer (`apps/mobile-rn/src/state/`):**
- Purpose: Zustand stores; some MMKV-persisted (`featureflags`, `settings`), some in-memory (`forceUpdate`, `activity`, `sync`).
- Plan 08-01 stores live OUTSIDE `src/state/` under `src/update/` (module-internal stores): `updateBannerStore` (MMKV) and `updateCheckStore` (MMKV). `forceUpdate` is the cross-path sink shared with REL-02 and lives in `src/state/forceUpdate.ts`.
- Convention: One MMKV instance per persistent store (`createMMKV({ id: '...' })`); JSON storage adapter via `createJSONStorage`.
- Depends on: domain, adapters, storage.

**Mobile — Domain Layer (`apps/mobile-rn/src/domain/`):**
- Purpose: Pure entities + value objects: `Point`, `Lap`, `PersonalRecord`, `WorkoutSession`, `AreaCalculator`, `ClosureDetector`, `splits`, `tss`, `vo2max`, `banister`, `racePredictor`, `lthr`, `hrZoneBreakdown`, `streak`, `calories`, `metrics`, `currency`, `walletDomain`, `social`, `gpx`, `records`, `recordsFormat`, `stats`, `athlete`, `sensorAssociation`. Subfolders: `session/SessionManager.ts` (state machine, pause-accounting, `effectiveElapsedMs`), `training/` (planner + analytics).
- Depends on: nothing platform-specific.
- Used by: state, pipeline, sometimes UI for formatting.

**Mobile — Pipeline Layer (`apps/mobile-rn/src/pipeline/`):**
- Purpose: Composable GPS filters. `Pipeline.ts` chains `Filter[]`; concrete filters in `filters/`: `AccuracyFilter`, `JumpFilter`, `KalmanFilter`, `MinSegmentFilter`, `PauseDetector` (with optional `WarmupConfig`).
- Depends on: domain types, `src/util/geo` (haversine).
- Used by: `useActivityStore` via `createDefaultPipeline()`.

**Mobile — Adapter Layer (`apps/mobile-rn/src/{map,location,sensors,notifications,media,realtime,health}/`):**
- Purpose: Boundary between platform/SDK code and the rest of the app. Each module exposes an interface and one or more `adapters/` implementations.
- Pattern: `<Domain>Adapter.ts` interface + `adapters/<Concrete>Adapter.ts` impls + `index.ts` factory/setter.
- Examples:
  - `src/map/index.ts` exports `setMapboxAccessToken`; only `MapboxView.tsx` imports Mapbox SDK.
  - `src/location/LocationAdapter.ts` interface + `adapters/ExpoLocationAdapter.ts`.
  - `src/realtime/RealtimeAdapter.ts` + `adapters/WebSocketRealtimeAdapter.ts` + `adapters/MockRealtimeAdapter.ts`.
  - `src/health/` — concrete adapters: `HealthConnectAdapter`, `HealthKitAdapter`, `StravaAdapter`, `MockHealthAdapter`.

**Mobile — Storage Layer (`apps/mobile-rn/src/storage/`):**
- Purpose: Per-aggregate repositories over expo-sqlite (`database.ts` initialises connection). Files: `sessionRepository`, `pointRepository`, `lapRepository`, `sensorRepository`, `recordsRepository`, `relationsRepository`, `walletRepository`, `socialRepository`.
- Multi-tenant: every table has `user_id` column.

**Mobile — Foreground / Vendor / Update (`apps/mobile-rn/src/foreground/`, `src/vendor/`, `src/update/`):**
- Purpose: Three small, focused subsystems wired into the app root (`foreground`, `update`) or surfaced from screens (`vendor`).
- See dedicated sections below.

**Mobile — Auth (`apps/mobile-rn/src/auth/`):**
- Purpose: `apiClient.ts` (fetch wrapper, 426 interception), `authProviders.ts` (Google/Apple/Email), `tokenStorage.ts` (secure-store).

**Mobile — Sync (`apps/mobile-rn/src/sync/`):**
- Purpose: `syncEngine.ts` orchestrates upload of pending sessions; `mediaUpload.ts` chunks media; `messageSync.ts` reconciles chat backlog.

**Mobile — Modules (`apps/mobile-rn/src/modules/`):**
- Purpose: Cross-cutting feature bundles that own their own state/domain/sync/ui: `gamification/`, `moderation/`, `permissions/`. Mini-DDD inside each module.

**Mobile — Utility Layer (`apps/mobile-rn/src/util/`):**
- Purpose: Cross-cutting helpers without platform SDK dependencies.
- Notable: `geo.ts` (haversine, distance, isClosed), `douglasPeucker.ts`, `corridor.ts`, `selfIntersection.ts`, `speech.ts` + `expoSpeechAdapter.ts`, `version.ts`, `timeFormat.ts` (Telegram-style chat timestamp formatter — today→`HH:mm`, yesterday→`Вчера`, within-6-days→short weekday, older→`dd.mm[.yy]`).

**Backend — Service Layer (`services/backend/<svc>/`):**
- Purpose: Each of the 8 services is an independent binary. Layout per service: `cmd/server/main.go` (boot), `internal/handler/` (HTTP), `internal/service/` (business), `internal/repository/` (Postgres + in-memory test impls), `internal/domain/` (entities).
- Services: `identity`, `activity-sync`, `feed`, `social-graph`, `messaging`, `realtime-gw`, `notifications`, `media`.

**Backend — Shared (`services/backend/pkg/`):**
- Purpose: Cross-cutting utilities: `auth`, `ratelimit`, `observability`, `audit`, `clientversion`, `gamification`, `permissions`, `featureflags`.

**Backend — Gateway (`services/backend/gateway/`):**
- Purpose: `Caddyfile` + `Caddyfile.prod` reverse-proxy routes; `admin/index.html` static admin UI.

**Backend — API contracts (`services/backend/api/`):**
- Purpose: OpenAPI specs (one YAML per service) + `_shared/` reusable parameters/schemas/responses + `redocly.yaml` bundling config. Drift gate script: `services/backend/scripts/openapi-routes-check/`.

**Backend — Deploy (`services/backend/deploy/helm/`):**
- Purpose: Helm chart skeleton (currently only `identity/` chart materialised; others pending).

**Backend — Observability (`services/backend/observability/`):**
- Purpose: Prometheus scrape config (`prometheus.yml` + `.j2` template), Loki, Grafana datasources, dashboards.

## Data Flow

### Primary recording session path

1. User opens TrackerStartScreen (`apps/mobile-rn/src/navigation/screens/record/TrackerStartScreen.tsx`).
2. `useActivityStore.startSession()` boots `SessionManager` (`src/domain/session/SessionManager.ts`); pipeline (`createDefaultPipeline()` in `src/pipeline/`) is constructed. `PauseDetector` is constructed with the warmup config so the early GPS-lock period does not auto-pause the session.
3. `LocationAdapter` (`src/location/adapters/ExpoLocationAdapter.ts`) emits raw `Point` → pipeline filters → `Point` accepted into `useActivityStore.state.points`.
4. `subscribeToRecordingTick()` (mounted in `App.tsx`) detects `state === 'recording'` transition and starts a 5s `setInterval` posting the sticky Android notification with duration + distance (`src/foreground/notification.ts`).
5. Map renders track via `LineLayer + GeoJsonSource` only (no `PolylineAnnotation`); components in `src/map/components/{TrackLayer,CorridorLayer,ZoneLayer,HistoryTerritoryLayer,LocationPuckLayer}.tsx`.
6. **Pause cycle:** on auto-paused (PauseDetector emits `auto-paused`) or manual pause, wrapper calls `manager.setPaused(true)` — `SessionManager` stamps `pausedAt = Date.now()` and toggles `LocationAdapter.setSamplingMode('paused')`. On resume, `pausedDurationMs += (now - pausedAt)` and `pausedAt` is cleared. TrackerLiveScreen renders the live timer via `manager.effectiveElapsedMs(nowMs)` so the clock freezes during pause windows.
7. User stops: `useActivityStore.stopSession()` calls `manager.stop()` (folds any open pause window into `pausedDurationMs` so final elapsed reading is consistent), then orchestrates wallet/records/calories follow-ups, persists laps + points via `src/storage/{lapRepository,pointRepository,sessionRepository}.ts`.
8. `useSyncStore.pullDown()` (and matching push) pushes the session to backend `activity-sync` service via `apiClient`.

### Pause-detector warmup gate (FR-010/011 supplement)

`PauseDetector` accepts an optional `WarmupConfig = { warmupMs: number; warmupMeters: number }` constructor parameter (default `null` — backward compat). When set:
- On first observed point, stamp `firstObservedTs` and start accumulating `distanceTraveled` (haversine deltas between consecutive points).
- `inWarmup(ts)` returns `true` while BOTH `(ts - firstObservedTs) < warmupMs` AND `distanceTraveled < warmupMeters`.
- `auto-paused` emission is SUPPRESSED while `inWarmup(ts) === true` even if the 5s slow-speed window is fully filled. Used to prevent the live tracker UI from showing "ПРОДОЛЖИТЬ" immediately on session start while GPS is still locking.
- `auto-resumed` is never gated.
- Production wiring: 10s timeout + 2m distance threshold.

### Update-check path (Plan 08-01; gated)

1. `App.tsx` mounts `useUpdateCheckOnForeground()` (`src/update/useUpdateCheckOnForeground.ts`) on first render — fires once immediately and subscribes to `AppState.addEventListener('change')` for every `'active'` transition.
2. `checkForUpdate()` (`src/update/manifestCheck.ts`) enforces 6h throttle via `useUpdateCheckStore.lastCheckedAt`. **Early-returns silently if `EXPO_PUBLIC_UPDATE_MANIFEST_URL` is unset** (ADR-0011 Amendment 5 gate). This gate is currently CLOSED in production builds — Plan 08-01 ships the code but Phase 9 will enable it.
3. `fetch('https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json')` → JSON parsed by `parseManifest()` (`manifestSchema.ts`).
4. `verifyManifestSignature()` (`manifestSigning.ts`) re-canonicalises alphabetical struct + verifies Ed25519 with embedded `EXPO_PUBLIC_MANIFEST_PUBLIC_KEY`.
5. Replay protection: reject if `released_at < installedReleasedAt` (persisted baseline in `useUpdateCheckStore`).
6. Dispatch on version comparison (`semverLite.gt`):
   - `min_supported_version > installed` → `useForceUpdateStore.set({ required: true, ... })` → REL-02 `ForceUpdateScreen` Modal renders (REUSE 1:1 from Phase 1).
   - `version > installed` → `useUpdateBannerStore.setState({ available: true, manifest, ... })` → `UpdateBanner.tsx` shows non-blocking banner.
   - Otherwise → silent no-op.
7. On failure: silent (console.warn in `__DEV__` only); `useUpdateCheckStore.lastError` updated.

### Vendor / autostart path (Plan 07-03)

1. TrackerStartScreen renders `<AutostartDialog />` (`src/vendor/AutostartDialog.tsx`).
2. Dialog one-shot guarded by MMKV flag in `useSettingsStore` — only shown until user dismisses/acts.
3. On accept → `openOEMAutoStartSettings()` (`src/vendor/openOEMSettings.ts`): detect vendor via `detectVendor()` (`src/vendor/oem.ts` → `Device.manufacturer`); fire vendor-specific intent (`miui.intent.action.APP_PERM_EDITOR`, `com.samsung.android.sm.ACTION_BATTERY`, etc.) via `expo-intent-launcher`; on failure fall back to `ActivityAction.APPLICATION_DETAILS_SETTINGS`.

### Force-update path (Phase 1 REL-02; unchanged)

1. Backend response has HTTP `426 Upgrade Required` → `apiClient.ts` (`src/auth/apiClient.ts`) intercepts → `useForceUpdateStore.getState().set({ required: true, minVersion, forceUpdateUrl })`.
2. `<ForceUpdateScreen />` mounted in `App.tsx` outside `RootNavigator` returns blocking full-screen Modal when `required === true`.
3. Same store can also be set by `manifestCheck.ts` (manifest-driven path; gated) — both code paths converge on identical UI.

### Auth + realtime bootstrap path

1. `RootNavigator` mounts → `useAuthStore.hydrate()` rehydrates tokens from secure storage.
2. On `authState === 'authenticated'`: parallel kick-off — `useSyncStore.pullDown()` (sessions), `useModerationStore.fetchMyRole()`, `useWalletStore.hydrate(userId)`, `useRealtimeStore.connect(userId, accessToken, deviceID)` (WebSocket via `WebSocketRealtimeAdapter`), `useNotificationsStore.requestAndRegister()`.
3. Push deep-link: `getNotificationsAdapter().onResponse((data) => navRef.navigate(...))`; routes `message.new` → Chats tab.

### Tab-badge / unread aggregation path

1. `AppTabs.tsx` selects `chats: Chat[]` from `useChatsStore`.
2. Aggregates `totalUnread = chats.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0)`.
3. Passes `badges={{ chats: totalUnread }}` to `<TabBar>` (`src/design/components/TabBar.tsx`).
4. TabBar renders a red circular badge in the top-right of the icon when `count > 0`; caps at `"99+"`.

**State Management:**
- Zustand stores in `src/state/` (and per-module `src/modules/<m>/state/` + `src/update/{updateBannerStore,updateCheckStore}.ts`).
- Persistence: `react-native-mmkv` with `createJSONStorage` adapter; one MMKV id per persistent store.
- In-memory only: `forceUpdate` (server re-issues 426 each request), `activity` (recovered via `SessionManager.recoverLast()`), `sync`.

## Key Abstractions

**`MapAdapter` / `setMapboxAccessToken`:**
- Purpose: Single Mapbox SDK boundary. Domain/pipeline code MUST NOT import `@rnmapbox/maps`.
- Files: `apps/mobile-rn/src/map/index.ts`, `MapboxView.tsx`, `components/*Layer.tsx`, `offline.ts`.
- Pattern: Boundary export — `setMapboxAccessToken(token: string): string | null`.

**`LocationAdapter`:**
- Purpose: Sensor-agnostic location source.
- Files: `apps/mobile-rn/src/location/LocationAdapter.ts` (interface), `adapters/ExpoLocationAdapter.ts` (impl), `index.ts` (singleton accessor).
- Pattern: Interface + concrete adapter + module-level `locationAdapter` singleton.

**`SessionManager`:**
- Purpose: Pure state machine for a recording session (idle → recording → stopped) with pause/resume + pause-window accumulator.
- Files: `apps/mobile-rn/src/domain/session/SessionManager.ts`.
- Pattern: Owns mutable state; emits snapshots via `onChange` callback; `useActivityStore` wraps it and forwards snapshots into Zustand.
- Pause accounting (2026-05-25): `pausedAt: number | null` + `pausedDurationMs: number` private fields; `setPaused(b)` stamps/folds boundaries; `effectiveElapsedMs(nowMs?)` returns wall-elapsed minus paused windows minus open-pause delta. Snapshot type extends with both fields so the wrapper propagates them to `useActivityStore`. `stop()` folds any open pause into `pausedDurationMs` before transitioning to `stopped`.

**`PauseDetector`:**
- Purpose: Auto-pause/resume hysteresis on raw point stream; emits `auto-paused` / `auto-resumed` events.
- Files: `apps/mobile-rn/src/pipeline/filters/PauseDetector.ts`.
- Pattern: Single 5s sliding window for pause + 2s window for resume; optional `WarmupConfig` gate suppresses `auto-paused` while in GPS-lock warmup (see "Pause-detector warmup gate" above).

**`Pipeline` + `Filter`:**
- Purpose: Composable GPS filter chain.
- Files: `apps/mobile-rn/src/pipeline/Pipeline.ts`, `Filter.ts`, `filters/*.ts`.
- Pattern: Each filter implements `Filter` interface; `Pipeline` runs them sequentially; factory `createDefaultPipeline()`.

**`SessionRepo` (storage):**
- Purpose: Aggregated per-session persistence interface composed from per-aggregate repositories.
- Files: built ad-hoc in `apps/mobile-rn/src/state/activity.ts` from `pointRepository` + `lapRepository` + `sessionRepository`.

**`useForceUpdateStore`:**
- Purpose: Shared sink for both REL-02 (server 426) and Plan 08-01 (manifest-driven) force-update paths.
- Files: `apps/mobile-rn/src/state/forceUpdate.ts` (39 lines; in-memory only).

**`Manifest` (typed):**
- Purpose: Validated, signed update manifest.
- Files: `apps/mobile-rn/src/update/manifestSchema.ts` (parser + type), `manifestSigning.ts` (Ed25519 verify against canonical alphabetical JSON).

**`Skeleton` family:**
- Purpose: First-load shimmer placeholders.
- Files: `apps/mobile-rn/src/design/components/Skeleton.tsx`.
- Exports: `<Skeleton style shape={'rect'|'circle'} durationMs />`, `<ChatRowSkeleton />`, `<MessageBubbleSkeleton side={'left'|'right'} />`.
- Pattern: RN `Animated.Value` opacity loop (0.4↔0.9) with `useNativeDriver: true`; reads `theme.surface2` for shimmer base.

**`avatarInitials` helper:**
- Purpose: Deterministic gradient + initials for `<Avatar src={null} />` fallback.
- Files: `apps/mobile-rn/src/design/avatarInitials.ts`.
- Exports: `hashName(s)`, `colorForName(name) → {start, end}` (12-color palette), `initialsForName(name) → string` (up to 2 uppercase letters, strips leading `@`, supports Cyrillic).

**`formatChatTime` helper:**
- Purpose: Telegram-style chat-list relative timestamp.
- Files: `apps/mobile-rn/src/util/timeFormat.ts`.
- Output: `"HH:mm"` (today), `"Вчера"`, `"Пн".."Сб".."Вс"` (within 6 days), `"dd.mm"` (older same year), `"dd.mm.yy"` (older prior year).

## Entry Points

**Mobile root — `apps/mobile-rn/App.tsx`:**
- Triggered by: `registerRootComponent(App)` in `apps/mobile-rn/index.ts`.
- Side-effects at module load:
  - `import 'react-native-get-random-values'` polyfill (must precede `uuid`).
  - `setMapboxAccessToken(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN)`.
  - `setSpeechAdapter(expoSpeechAdapter)`.
  - `useFeatureFlagsStore.getState().refresh()` (fire-and-forget feature-flag pull).
- Inside `App()`:
  - `useEffect(() => subscribeToRecordingTick(), [])` — Plan 07-03 Task 2 foreground notification.
  - `useUpdateCheckOnForeground()` — Plan 08-01 Task 5 manifest-driven update check (gated).
  - Renders `<ErrorBoundary><SafeAreaProvider><ThemeProvider><ToastProvider><StatusBar/><RootNavigator/><ForceUpdateScreen/></...></...></...></...></ErrorBoundary>`.
- `<ForceUpdateScreen />` is mounted OUTSIDE `<RootNavigator />` so the blocking Modal renders over every navigation state.

**Mobile navigation root — `apps/mobile-rn/src/navigation/RootNavigator.tsx`:**
- Triggered by: `App.tsx`.
- Auth gate state machine: `idle | hydrating | authenticated | unauthenticated`.
- On `authState === 'authenticated'`: hydrates wallet/role/sync, connects realtime, registers push.

**Backend services — `services/backend/<svc>/cmd/server/main.go`:**
- One `main.go` per service (8 total). Each boots HTTP server, wires handler→service→repository, registers Prometheus metrics from `services/backend/pkg/observability`.

**Release pipeline — `.github/workflows/android-release.yml`:**
- Triggered by: git tag push matching `v1.0.0-beta.*` or `v1.0.0-rc.*`.
- 2-phase pipeline: (1) Plan 07-01 + ADR-0012 EAS build with SOPS-decrypted keystore; (2) Plan 08-01 distribution — bundletool extract universal APK → SOPS-decrypt `manifest-signing.yaml` → invoke `scripts/release-distribute.sh`.
- Distribution phase is gated by env: when `DISTRIBUTE_ENABLED` is unset, the EAS build still runs but the MinIO upload + manifest signing steps are skipped (Plan 08-01 deliverable is in-place but not exercised pre-Phase 9).

**Dev debug-APK pipeline — `.github/workflows/android-debug-apk.yml`:**
- Triggered by: `workflow_dispatch` (manual button) + `push` to `feat/cursona-redesign` or `main` when `apps/mobile-rn/**` (or this workflow file) changes.
- Builds a universal debug APK (`arm64-v8a + x86_64`) with JS bundle embedded via `./gradlew :app:assembleDebug -PrunningEcoAbiFilters="arm64-v8a,x86_64" -PrunningEcoEmbedJSInDebug=true --no-daemon`.
- Injects `EXPO_PUBLIC_IDENTITY_URL`, `EXPO_PUBLIC_SYNC_URL`, `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` into `.env` at build time (Mapbox token from GH Secret, masked via `::add-mask::`).
- Uploads `app-debug.apk` (`~80-120MB`) as `app-debug-${{ github.sha }}` artifact; 14-day retention.
- NOT a substitute for production-signed `.aab` validation (Plan 07-03 pocket-walk still uses `android-release.yml` output).

**Backend CI — `.github/workflows/backend-ci.yml` + `backend-cd.yml`:**
- Go service CI/CD; per-service test + lint. Unchanged structure.

**Release distribute script — `scripts/release-distribute.sh`:**
- Triggered by: workflow step in `android-release.yml`.
- Orchestrates: `mc cp` APK to private `android-releases` bucket → presign 24h URL → `go run scripts/sign-manifest.go` (Ed25519 over alphabetical canonical JSON) → self-verify → `mc cp` manifest LAST to public-read `android-manifest` bucket → re-fetch + re-verify.

## Architectural Constraints

- **Threading (mobile):** Single JS thread (React Native bridge). Background work pushed to native modules: BLE sensors via `BleSensorAdapter`, location via Expo's native task, notifications via expo-notifications. Foreground service notification on Android keeps the JS thread alive during recording (`src/foreground/notification.ts`).
- **Global state (mobile):** Module-level singletons — `locationAdapter` (`src/location/index.ts`), `mediaAdapter`, `realtimeAdapter`, `notificationsAdapter`, `manager` (the `SessionManager` instance in `src/state/activity.ts`), `tickIntervalHandle` (`src/foreground/notification.ts`). The activity SessionManager is the central single-source-of-truth for a recording.
- **Mapbox boundary:** `@rnmapbox/maps` may ONLY be imported under `src/map/`. Enforced by convention (see `CLAUDE.md` "Что НЕ делать никогда").
- **Domain purity:** `src/domain/` files may NOT import from `src/storage/`, `src/state/`, `src/ui/`, `src/map/`, `src/location/`, or any Expo/React-Native module. (Exception: `SessionManager` injects `LocationAdapter` via constructor — interface only, no impl import.)
- **Multi-tenant from day 1:** Every persisted row in SQLite + every backend table has `user_id`. Solo-user dev does not skip this.
- **Update manifest atomicity:** Manifest is uploaded LAST in `release-distribute.sh` (after APK + signing succeed). Mobile clients never see a manifest pointing to a missing APK (CONTEXT D-21).
- **Update module gating:** `manifestCheck.ts` early-returns when `EXPO_PUBLIC_UPDATE_MANIFEST_URL` is unset. Production builds keep it unset until Phase 9; the module is built and tested but inert.
- **Force-update store is in-memory:** `useForceUpdateStore` is NOT MMKV-persisted — server re-issues 426 on every request after install, so an at-rest `required: true` would always be stale.
- **Threading (backend):** Each Go service is a standard `net/http` server, GOMAXPROCS auto. NATS JetStream is the async messaging spine.
- **Gradle parameterization:** `apps/mobile-rn/android/app/build.gradle` reads `runningEcoAbiFilters` (default `arm64-v8a`) and `runningEcoEmbedJSInDebug` (default unset → RN default `debuggableVariants`). CI debug workflow sets both; production release uses defaults.

## Anti-Patterns

### Direct Mapbox SDK import outside `src/map/`

**What happens:** Importing `@rnmapbox/maps` from `src/ui/`, `src/domain/`, `src/state/`, or `src/navigation/screens/` directly.
**Why it's wrong:** Breaks the `MapAdapter` abstraction — future map swap (or platform-specific map for offline regions) becomes impossible; couples business code to native module init order.
**Do this instead:** Add a component to `src/map/components/` that wraps the Mapbox primitive and re-exports through `src/map/index.ts`. See `TrackLayer.tsx`, `CorridorLayer.tsx` for the pattern.

### Direct `useForceUpdateStore.setState` from manifest path

**What happens:** Building a parallel force-update UI in `src/update/`.
**Why it's wrong:** REL-02 already owns the blocking Modal (`src/ui/screens/ForceUpdateScreen.tsx`). Duplicating UI means two divergent force-update experiences.
**Do this instead:** Call `useForceUpdateStore.getState().set({ required: true, minVersion, forceUpdateUrl })` from `src/update/manifestCheck.ts`; Phase 1 Modal renders unchanged (current pattern, CONTEXT D-19).

### Putting recording-tick logic inside the activity store

**What happens:** Re-implementing 5s setInterval + notification rendering inside `useActivityStore.startSession()`.
**Why it's wrong:** Couples a pure recording state machine to platform notification side-effects; makes unit tests need to mock expo-notifications.
**Do this instead:** Keep `useActivityStore` pure; subscribe externally from `App.tsx` via `subscribeToRecordingTick()` in `src/foreground/notification.ts`. See `src/foreground/notification.ts:124` for the subscribe pattern.

### Calling `PolylineAnnotation` / `AnnotationManager` for tracks

**What happens:** Rendering the live track with annotation primitives.
**Why it's wrong:** Annotation managers cap out at a few hundred features and re-render on every map move. Tracks reach 10k+ points.
**Do this instead:** Always render the track as `LineLayer + GeoJsonSource` — see `src/map/components/TrackLayer.tsx`.

### Computing area in lat/lon directly

**What happens:** Using lat/lon coordinates as a planar plane for area / closure calculations.
**Why it's wrong:** Lat/lon is not equal-area; results are wrong away from the equator.
**Do this instead:** Project to a local plane (UTM-like) first — see `src/domain/AreaCalculator.ts` and ТЗ §6.6.

### Computing elapsed time as `Date.now() - startedAt` directly in UI

**What happens:** TrackerLiveScreen (or any consumer) subtracts `startedAt` from `Date.now()` directly to display the live timer.
**Why it's wrong:** Timer keeps ticking during pause windows — runner pauses for 90s, returns to find timer still climbing.
**Do this instead:** Call `manager.effectiveElapsedMs(nowMs)` (or compute from `snapshot.pausedAt + pausedDurationMs` in the wrapper) so the displayed timer freezes during pauses and is consistent with the recorded distance.

### Triggering auto-pause during GPS lock at session start

**What happens:** PauseDetector fires `auto-paused` 5s after `start()` because the user hasn't physically moved yet — leads to immediate "ПРОДОЛЖИТЬ" CTA on the live tracker.
**Why it's wrong:** UX flaw — the runner has not paused, GPS is still locking.
**Do this instead:** Construct `PauseDetector` with `WarmupConfig = { warmupMs: 10_000, warmupMeters: 2 }` so `auto-paused` is suppressed until EITHER 10s elapsed OR 2m traveled.

### Reading `chat.unreadCount` ad-hoc in every consumer

**What happens:** Multiple screens recompute the unread badge sum independently.
**Why it's wrong:** Drift between TabBar badge, ChatsListScreen, and notification badge counts.
**Do this instead:** Aggregate once in `AppTabs.tsx` and pass via `<TabBar badges={{ chats: totalUnread }} />`. Other consumers can subscribe to the same selector.

## Error Handling

**Strategy:** Surface errors only when actionable; silently degrade for background flows that re-try.

**Patterns:**
- React tree-level: `class ErrorBoundary` in `apps/mobile-rn/App.tsx` (top-level); per-screen `ScreenErrorBoundary` in `src/design/components/ScreenErrorBoundary.tsx`.
- API errors: thrown from `src/auth/apiClient.ts`; consumers `try/catch`. HTTP 426 specifically intercepted before propagating — triggers `useForceUpdateStore`.
- Background tasks fail silently with `console.warn` only in `__DEV__`: feature-flag refresh (`App.tsx:46`), update check (`src/update/manifestCheck.ts:141`), recording-tick notification (`src/foreground/notification.ts:93`), realtime connect (`RootNavigator.tsx:91`).
- OEM intent fallbacks: nested `try/catch` chain — vendor-specific intent → generic `APPLICATION_DETAILS_SETTINGS` → return `{launched: false, vendor: 'launch-failed'}` (`src/vendor/openOEMSettings.ts:52-62`).
- Manifest verification: throws `Error` from `manifestCheck.ts`; caught in same function; `lastError` recorded in `useUpdateCheckStore`; no user-facing toast (CONTEXT D-13).
- LocationAdapter sampling-mode toggle on pause/resume is non-fatal: caught + `console.error`'d in `SessionManager.setPaused` (`src/domain/session/SessionManager.ts:449`).

## Cross-Cutting Concerns

**Logging:**
- Dev: `console.warn` / `console.error` gated on `__DEV__` checks.
- Prod: errors surfaced via Sentry SaaS (configured in mobile; see `.secrets/prod/sentry.yaml`).
- Backend: structured logs via shared `services/backend/pkg/observability/`.

**Validation:**
- Schemas: hand-rolled type guards (`parseManifest` in `src/update/manifestSchema.ts` returns `{ ok: true, value } | { ok: false, error }`).
- OpenAPI: backend services declare schemas in `services/backend/api/*.yaml`; drift check via `services/backend/scripts/openapi-routes-check/`.

**Authentication:**
- Mobile: tokens in secure storage (`src/auth/tokenStorage.ts`); access token attached by `apiClient`.
- Backend: shared JWT helpers in `services/backend/pkg/auth/`.

**Feature flags:**
- Mobile: `useFeatureFlagsStore` (`src/state/featureflags.ts`), MMKV-persisted, refreshed from backend on app launch via `featureflagsApi.ts`.
- Backend: `services/backend/pkg/featureflags/`.

**Observability:**
- Stack: Prometheus + Grafana + Loki + Alloy (shipper) — configured under `infra/observability-stack/` and `services/backend/observability/`.
- See `docs/DECISIONS/0009-observability-architecture.md`, `docs/DECISIONS/0010-sentry-saas-and-colocation.md`.

**Testing:**
- Test suite total: 686 tests passing across `apps/mobile-rn/src/**/__tests__/` (64 test files).
- Per-module test directories: `src/pipeline/filters/__tests__/`, `src/domain/__tests__/`, `src/domain/session/__tests__/`, `src/update/__tests__/`, `src/vendor/__tests__/`, `src/design/__tests__/`, `src/util/__tests__/`, etc.
- Coverage targets per `CLAUDE.md`: 80%+ overall, 90%+ for pipeline + area calc.

## Update distribution architecture

This section consolidates the Plan 08-01 + REL-02 update story across CI and mobile. **All Phase 8 components are merged but GATED off until Phase 9 per ADR-0011 Amendment 5.**

### CI side — `.github/workflows/android-release.yml`

The workflow is a single GitHub Actions job, but split into two logical phases:

**Phase A — Build (Plan 07-01 + ADR-0012):**
1. Checkout, Node 20, JDK 17 install.
2. Install SOPS 3.13.1 + `yq` pinned.
3. Restore CI age key from `${{ secrets.SOPS_AGE_KEY_CI }}` → `~/.config/sops/age/keys.txt`.
4. `sops -d .secrets/prod/mobile-signing.yaml`; extract base64 keystore + two passwords. `echo "::add-mask::$PWD"` BEFORE writing to `$GITHUB_ENV` (guards against ADR-0012 P0 incident — bare `echo X=$value >> $GITHUB_ENV` does NOT auto-mask).
5. Write keystore to `apps/mobile-rn/android/app/release.keystore`, chmod 600.
6. `npm ci` + `npm install -g eas-cli` (explicit pinned install).
7. `eas build` blocking — emits JSON with `artifactUrl` + `versionCode`.

**Phase B — Distribute (Plan 08-01; gated by `DISTRIBUTE_ENABLED`):**
1. Install bundletool 1.18.1 + `mc` (MinIO client).
2. Download `.aab` from EAS; bundletool extracts universal APK.
3. `sops -d .secrets/prod/manifest-signing.yaml`; `::add-mask::` Ed25519 private key BEFORE export to env.
4. `scripts/release-distribute.sh <apk-path> <tag> <versionCode>`:
   - `mc alias set sport-prod`.
   - `mc cp APK → android-releases/<tag>.apk` (private bucket).
   - `mc share download --expire 24h` for presigned URL (RESEARCH Pitfall 10 — regex parse, `mc share` output format drifts across versions).
   - `go run scripts/sign-manifest.go` — inline Go signer; produces alphabetical-struct canonical JSON, Ed25519 signature appended.
   - `go run scripts/verify-manifest.go` — local self-verify (catches signing bugs).
   - `mc cp manifest.json → android-manifest/manifest.json` (public-read; LAST upload — atomicity per CONTEXT D-21).
   - Re-fetch from MinIO + re-verify (catches MinIO-side corruption).

### Mobile side — `apps/mobile-rn/src/update/`

Three coexisting stores cover the full update surface:

| Store | Persist? | Purpose | Set by |
|-------|----------|---------|--------|
| `useForceUpdateStore` (`src/state/forceUpdate.ts`, 39 lines, REL-02) | No (in-memory) | Triggers blocking `<ForceUpdateScreen />` Modal | (a) `apiClient.ts` on HTTP 426; (b) `manifestCheck.ts` on `min_supported_version > installed` |
| `useUpdateBannerStore` (`src/update/updateBannerStore.ts`, Plan 08-01) | MMKV (`id: 'update-banner'`) | Drives non-blocking `<UpdateBanner />` component | `manifestCheck.ts` on `version > installed` |
| `useUpdateCheckStore` (`src/update/updateCheckStore.ts`, Plan 08-01) | MMKV | Fetch timestamp, last error, replay-protection baseline (`installedReleasedAt`) | `manifestCheck.ts` on each fetch attempt |

**Mobile dispatch order (manifestCheck.ts):**
0. **Gate:** if `EXPO_PUBLIC_UPDATE_MANIFEST_URL` is unset → silent early return (current default).
1. Throttle: skip if `Date.now() - lastCheckedAt < 6h` and not `force`.
2. Fetch manifest from `https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json`.
3. Parse schema (`parseManifest`).
4. Verify Ed25519 (`verifyManifestSignature` against embedded `EXPO_PUBLIC_MANIFEST_PUBLIC_KEY`).
5. Replay-protection: reject if `released_at < installedReleasedAt`.
6. If `min_supported_version > installed` → force path (set `useForceUpdateStore`; clear banner).
7. Else if `version > installed` → banner path (set `useUpdateBannerStore`); preserve `suppressedUntil` unless `manifest.version` changed since dismissal (RESEARCH §9 Q6).
8. Else → silent no-op.

### REL-02 reuse contract

Plan 08-01 deliberately introduces NO new force-update UI code:
- `manifestCheck.ts` writes to `useForceUpdateStore` (`forceUpdate.ts:35`).
- `<ForceUpdateScreen />` in `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` reads `useForceUpdateStore.required` and renders the Phase 1 blocking Modal exactly as written then.
- Two entry paths (server 426 via `apiClient.ts`; manifest via `manifestCheck.ts`) converge on identical store shape.
- Future regression risk: change `ForceUpdateState` shape → both producers must update; encode via the `set: (patch) => ...` accessor only.

### Background tasks via `src/foreground/notification.ts`

- One module-level `setInterval` handle (`tickIntervalHandle`), singleton.
- Subscribes to `useActivityStore` via `useActivityStore.subscribe((next, prev) => ...)`.
- On `state` transition into `'recording'` → `startTicking()` (5s interval posting sticky notification).
- On any other transition → `stopTicking()` + `dismissRecordingNotification()`.
- iOS = no-op (foreground-service-notification pattern is Android-only; iOS SLC + `UIBackgroundModes` path deferred per ADR-0011 Amendment 3).

### Vendor (autostart) flow — `src/vendor/`

- `detectVendor()` → `'xiaomi' | 'samsung' | 'huawei' | 'generic'` from `Device.manufacturer`.
- `openOEMAutoStartSettings()` → vendor-specific `startActivityAsync(...)` via `expo-intent-launcher`.
  - Xiaomi: `miui.intent.action.APP_PERM_EDITOR` + `extra_pkgname`.
  - Samsung: `com.samsung.android.sm.ACTION_BATTERY`.
  - Other: `ActivityAction.APPLICATION_DETAILS_SETTINGS` with `data: package:com.runningecosystem.mobile`.
- On failure → fall back to generic APPLICATION_DETAILS_SETTINGS → on second failure return `vendor: 'launch-failed'`.
- `<AutostartDialog />` one-shot Modal gated by MMKV flag in `useSettingsStore`; wired into `TrackerStartScreen`.

---

*Architecture analysis: 2026-05-25*
