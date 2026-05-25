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
│                                                                          │
│  Cross-service permission gate (Phase 10): messaging queries             │
│  are_friends() from social-graph's friend_requests table via SHARED      │
│  Postgres pool — no inter-service HTTP.                                  │
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
| Friend-request domain (Phase 10) | Symmetric request lifecycle (pending/accepted/rejected/cancelled); 8 HTTP routes; derives `Relation.FriendStatus` + `CanDM` via `are_friends()` SQL | `services/backend/social-graph/internal/{handler,service,repository/postgres}/friend_requests.go`, `internal/domain/types.go` |
| Friendship gate (Phase 10) | Cross-service permission check via shared Postgres pool; gates `createOrFindConv` for `type=dm` | `services/backend/messaging/internal/permissions/friendship_gate.go` |
| Shared Go packages | Cross-service helpers (auth, ratelimit, observability, audit, …) | `services/backend/pkg/*` |
| OpenAPI contracts | Per-service YAML + `_shared/{parameters,schemas,responses}.yaml` | `services/backend/api/*.yaml` |
| DB migrations | Numbered `000N_*.up/down.sql` for Postgres + TimescaleDB | `services/backend/migrations/` |
| Release pipeline | Tag-triggered EAS build + MinIO distribute + Ed25519 manifest sign | `.github/workflows/android-release.yml`, `scripts/release-distribute.sh` |
| Dev debug APK pipeline | Branch-push universal debug APK artifact (BlueStacks/internal testers) | `.github/workflows/android-debug-apk.yml` |

## Phase Scope (ADR-0011 Amendment 6)

v1.0 closed-beta scope expanded from **4 phases → 6 phases** on 2026-05-25 (Amendment 6 to ADR-0011). Active v1.0 phases:

| Phase | Topic | Status |
|-------|-------|--------|
| 6 | Release signing | Shipped |
| 7 | Release builds + mobile stability (Plans 07-01, 07-03) | Shipped |
| 8 | Closed-beta distribution (Plan 08-01) | Shipped (gated off until Phase 9) |
| 9 | (reserved — update flow gate flip) | Pending |
| **10** | **Friend-request flow** (symmetric DM gate) | **Backend code-complete (Session 1 of `social-yolo-pass`); mobile pending** |
| **11** | **Stories revival** | **Not started** |

Phases 10 + 11 were promoted from v1.0.1 backlog → active v1.0 scope by Amendment 6, formalising the YOLO scope expansion captured in `.planning/quick/20260525-social-yolo-pass/`.

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
- **Cross-service permissions via shared DB** (Phase 10): when a permission check requires data owned by another service AND the data is read-mostly + low-latency-critical, the consuming service queries the producing service's Postgres tables/functions directly through the shared pool. No inter-service HTTP. Contrast: the moderation module owns its own permission data and does NOT cross service boundaries this way. See `services/backend/messaging/internal/permissions/friendship_gate.go` for the canonical example.

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
- Phase 10/11 convention (per `social-yolo-pass` D-06): new feature modules (`friends/`, `stories/`) MUST use the full mini-DDD subdir layout (`domain/`, `storage/`, `state/`, `sync/`, `ui/`, `index.ts`) — mirror `modules/moderation/`. Existing chat code at root paths stays where it is; `CHAT-MODULE-MIGRATION` is v1.0.1 backlog.

**Mobile — Utility Layer (`apps/mobile-rn/src/util/`):**
- Purpose: Cross-cutting helpers without platform SDK dependencies.
- Notable: `geo.ts` (haversine, distance, isClosed), `douglasPeucker.ts`, `corridor.ts`, `selfIntersection.ts`, `speech.ts` + `expoSpeechAdapter.ts`, `version.ts`, `timeFormat.ts` (Telegram-style chat timestamp formatter — today→`HH:mm`, yesterday→`Вчера`, within-6-days→short weekday, older→`dd.mm[.yy]`).

**Backend — Service Layer (`services/backend/<svc>/`):**
- Purpose: Each of the 8 services is an independent binary. Layout per service: `cmd/server/main.go` (boot), `internal/handler/` (HTTP), `internal/service/` (business), `internal/repository/` (Postgres + in-memory test impls), `internal/domain/` (entities).
- Services: `identity`, `activity-sync`, `feed`, `social-graph`, `messaging`, `realtime-gw`, `notifications`, `media`.

**Backend — social-graph service (Phase 10 expansion):**
- Purpose: Profiles, follows, blocks, search, moderation reports, AND friend-request flow.
- Friend-request layer files:
  - `internal/handler/friend_requests.go` — 8 HTTP routes (see "Friend-request endpoints" section below).
  - `internal/service/friend_requests.go` — business logic with idempotent send, status-transition guards.
  - `internal/repository/postgres/friend_requests.go` — Postgres impl over `friend_requests` table + `are_friends()` function.
- Domain entity (`internal/domain/types.go`):
  - `FriendRequest{ID, SenderID, ReceiverID, Status, CreatedAt, RespondedAt}` with `FriendRequestStatus = "pending"|"accepted"|"rejected"|"cancelled"`.
  - `Relation` extended with `FriendStatus string` (`none|pending_outgoing|pending_incoming|accepted|rejected|cancelled|self`) + `FriendRequestID string` (present iff `FriendStatus` is `pending_*`).
  - **Canonical `CanDM` derivation (changed in Phase 10):** `CanDM = areFriends AND !blocked AND !blockedBy`. Previously `CanDM = !blocked AND !blockedBy`. `areFriends` is computed via `are_friends($sender, $receiver)` SQL call.
  - 4 new domain errors: `ErrFriendRequestExists`, `ErrAlreadyFriends`, `ErrFriendRequestNotPending`, `ErrFriendRequestNotOwned`.
- `GetRelation` (`internal/service/svc.go`): derives `FriendStatus` by combining (a) `are_friends()` check, (b) pair-direction lookups against `friend_requests` for both `(actor, target)` and `(target, actor)` orderings.

**Backend — messaging service (Phase 10 gate):**
- Purpose: Conversations, members, messages, read-state.
- New package `internal/permissions/` with `FriendshipGate` struct wrapping a `pgxpool.Pool` and exposing `RequireFriends(ctx, u1, u2) error` (returns `ErrNotFriends` mapped to HTTP 403 by handler).
- Gate wired in `cmd/server/main.go`: `friendGate := permissions.NewFriendshipGate(pool)` → `handler.New(svc, signer, limiter, friendGate, logger)`. Handler stores `friendGate *permissions.FriendshipGate` (nil-safe for tests).
- **Gate placement: `createOrFindConv` only**, NOT `sendMessage`. Rationale (matches Telegram/WhatsApp UX): once a DM conversation exists, friendship was verified at creation. Subsequent sends are not re-checked — un-friending does not retroactively block existing chats. Self-DM ("saved messages" scratchpad) bypasses the gate (`u1 == u2 → return nil`).

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

## Friend-request endpoints (Phase 10)

`social-graph` mounts 8 new routes under the existing service mux (`services/backend/social-graph/internal/handler/http.go:84-91`):

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| POST | `/friend-requests/{user_id}` | `sendFriendRequest` | Send request to `user_id`. Idempotent on existing pending; flips rejected/cancelled back to pending. Rate-limited via `followsPerMinute` budget. |
| GET | `/friend-requests/incoming` | `listIncomingFriendRequests` | List pending requests where caller is receiver. |
| GET | `/friend-requests/outgoing` | `listOutgoingFriendRequests` | List pending requests where caller is sender. |
| POST | `/friend-requests/{id}/accept` | `acceptFriendRequest` | Receiver accepts; status → `accepted`; `are_friends()` flips true. |
| POST | `/friend-requests/{id}/reject` | `rejectFriendRequest` | Receiver rejects; status → `rejected`. |
| DELETE | `/friend-requests/{id}` | `cancelFriendRequest` | Sender cancels own pending; status → `cancelled`. |
| GET | `/friends` | `listFriends` | Caller's accepted friend user IDs. |
| GET | `/friends/check/{user_id}` | `checkAreFriends` | Boolean friendship check (server-side, canonical). |

Error mapping (`writeFriendRequestError`):
- `ErrAlreadyFriends` → 409 `already_friends`
- `ErrFriendRequestExists` → 409 `friend_request_exists`
- `ErrFriendRequestNotPending` → 409 `friend_request_not_pending`
- `ErrFriendRequestNotOwned` → 403 `friend_request_not_owned`

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

### Friend-request lifecycle (Phase 10)

**Send → accept → DM-open path:**

1. User A taps "Add friend" on User B's profile (mobile — pending in v1.0 mobile scope).
2. Mobile `POST /api/v1/social/friend-requests/{B.id}` → `sendFriendRequest` handler (`social-graph/internal/handler/friend_requests.go:42`).
3. Service (`internal/service/friend_requests.go:18`) runs idempotent state machine:
   - `senderID == receiverID` → `ErrSelfTarget` (400).
   - `are_friends(A, B)` returns true → `ErrAlreadyFriends` (409).
   - Existing `(A→B)` row pending → return same row (idempotent).
   - Existing `(A→B)` row rejected/cancelled → flip back to pending (`ResetToPending`).
   - Existing `(B→A)` row pending → `ErrFriendRequestExists` (409) — caller should accept instead.
   - Otherwise → INSERT new pending row.
4. User B `GET /api/v1/social/friend-requests/incoming` → sees request.
5. User B `POST /api/v1/social/friend-requests/{id}/accept` → `AcceptFriendRequest` validates `actorID == receiverID` (else `ErrFriendRequestNotOwned`) and `status == pending` (else `ErrFriendRequestNotPending`) → `UpdateStatus(id, accepted)`.
6. Subsequent `GET /api/v1/social/relations/{B.id}` returns `Relation{FriendStatus: "accepted", CanDM: true}` (assuming no blocks).
7. User A `POST /api/v1/messaging/conversations` with `peerID=B, type=dm`:
   - Handler (`messaging/internal/handler/conversations.go::createOrFindConv:194-195`) calls `h.friendGate.RequireFriends(ctx, actorID, peerID)`.
   - Gate executes `SELECT are_friends($1, $2)` on shared pool → returns true → handler proceeds to find-or-create DM channel.
8. Subsequent `POST /conversations/{id}/messages` is NOT re-gated (Telegram-parity: existing DM survives un-friending).

**Cancel / reject paths:** symmetric — sender DELETEs own pending; receiver POSTs `/reject`. Both transition row to terminal state (`cancelled` / `rejected`); future `sendFriendRequest` from either side flips back to pending.

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

**`FriendRequest` + `Relation.FriendStatus` (Phase 10):**
- Purpose: Symmetric friendship lifecycle + UI button-state.
- Files: `services/backend/social-graph/internal/domain/types.go:79-86` (entity), `types.go:49-65` (extended `Relation`).
- Pattern: Pending/accepted/rejected/cancelled status machine; canonical friendship check is the `are_friends(u1, u2)` SQL function (STABLE, partial indexes on `status='accepted'` both directions). Inverse-direction `friend_requests` row (B→A) when A requests counts as `pending_incoming` for A's `Relation.FriendStatus`.

**`FriendshipGate` (Phase 10):**
- Purpose: Cross-service permission check for messaging.
- Files: `services/backend/messaging/internal/permissions/friendship_gate.go`.
- Pattern: Wraps a `*pgxpool.Pool` (shared with social-graph); exposes `RequireFriends(ctx, u1, u2) error`. Returns `ErrNotFriends` mapped to HTTP 403 by the handler. Self-DM (`u1 == u2`) bypasses. Nil-safe at handler boundary so tests can wire a no-op handler without DB.

**`are_friends(uuid, uuid)` SQL function (Phase 10):**
- Purpose: Canonical friendship check; sole source of truth.
- Files: `services/backend/migrations/0022_friend_requests.up.sql:47-57`.
- Pattern: `STABLE LANGUAGE SQL` — PG caches result within a single query. Backed by two partial indexes (`idx_friend_requests_accepted`, `idx_friend_requests_accepted_reverse`) so the lookup is a single-row index hit. Called from: messaging `FriendshipGate.RequireFriends`, social-graph `Service.SendFriendRequest` pre-check, social-graph `GetRelation` derivation.

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
- Messaging service additionally wires `permissions.NewFriendshipGate(pool)` and passes the gate into `handler.New(...)` (Phase 10; `services/backend/messaging/cmd/server/main.go:138-142`).

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
- **Cross-service permission queries (Phase 10):** Messaging is permitted to read `friend_requests` / `are_friends()` directly from the shared Postgres pool because (a) the data is read-mostly and latency-critical, (b) the only call is via the `are_friends()` STABLE function so social-graph owns the predicate logic. Do NOT extend this pattern to mutations — friend-request writes go through social-graph HTTP. Do NOT extend to other cross-service reads without explicit ADR sign-off.
- **Friendship gate placement:** Gate runs on `createOrFindConv` for `type=dm` ONLY, not on `sendMessage`. Existing DMs survive un-friending (Telegram parity). Self-DM (`u1==u2`) bypasses the gate.
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

### Checking friendship by re-implementing the predicate in each service

**What happens:** Messaging (or feed, or notifications) writes its own SQL `SELECT 1 FROM friend_requests WHERE ...` query.
**Why it's wrong:** Five copies of "either-direction accepted row" logic drift the moment the predicate changes (e.g., adding a "soft-friend" status). Index hints diverge.
**Do this instead:** Always call `are_friends($1, $2)` from migration `0022_friend_requests.up.sql`. Wrap in a service-local gate struct (see `messaging/internal/permissions/friendship_gate.go`).

### Gating `sendMessage` on friendship

**What happens:** Adding `friendGate.RequireFriends(...)` to `sendMessage` handler so every message re-checks friendship.
**Why it's wrong:** (a) Performance — N+1 friendship checks per chat session. (b) UX — if A and B un-friend, their existing conversation must remain readable (Telegram/WhatsApp parity, D-04). (c) Inconsistency — group chats can't be checked the same way.
**Do this instead:** Gate only at `createOrFindConv` for `type=dm`. Once a DM exists, message-send is authorised by membership in `conversation_members`.

### Inter-service HTTP for read-mostly friendship lookups

**What happens:** Messaging makes an `HTTP GET /api/v1/social/friends/check/{user_id}` call to social-graph on every DM creation.
**Why it's wrong:** Adds 5-30ms latency, a circular service dependency (social-graph → identity → social-graph), and a new failure mode (social-graph 503 → DMs all fail to create). Social-graph and messaging share a Postgres pool already.
**Do this instead:** Query `are_friends()` directly via the shared Postgres pool (`FriendshipGate.RequireFriends`). The predicate is owned by the social-graph SQL migration; the function is the contract. Reserve HTTP calls for mutations and cross-region cases.

## Error Handling

**Strategy:** Surface errors only when actionable; silently degrade for background flows that re-try.

**Patterns:**
- React tree-level: `class ErrorBoundary` in `apps/mobile-rn/App.tsx` (top-level); per-screen `ScreenErrorBoundary` in `src/design/components/ScreenErrorBoundary.tsx`.
- API errors: thrown from `src/auth/apiClient.ts`; consumers `try/catch`. HTTP 426 specifically intercepted before propagating — triggers `useForceUpdateStore`.
- Background tasks fail silently with `console.warn` only in `__DEV__`: feature-flag refresh (`App.tsx:46`), update check (`src/update/manifestCheck.ts:141`), recording-tick notification (`src/foreground/notification.ts:93`), realtime connect (`RootNavigator.tsx:91`).
- OEM intent fallbacks: nested `try/catch` chain — vendor-specific intent → generic `APPLICATION_DETAILS_SETTINGS` → return `{launched: false, vendor: 'launch-failed'}` (`src/vendor/openOEMSettings.ts:52-62`).
- Manifest verification: throws `Error` from `manifestCheck.ts`; caught in same function; `lastError` recorded in `useUpdateCheckStore`; no user-facing toast (CONTEXT D-13).
- LocationAdapter sampling-mode toggle on pause/resume is non-fatal: caught + `console.error`'d in `SessionManager.setPaused` (`src/domain/session/SessionManager.ts:449`).
- Friend-request errors (Phase 10): typed domain errors (`ErrAlreadyFriends`, `ErrFriendRequestExists`, `ErrFriendRequestNotPending`, `ErrFriendRequestNotOwned`) mapped to HTTP 4xx via `writeFriendRequestError` in `services/backend/social-graph/internal/handler/friend_requests.go:210`.
- Friendship gate failures (Phase 10): `permissions.ErrNotFriends` mapped to HTTP 403 in `messaging/internal/handler/conversations.go::createOrFindConv` (so mobile can show "Send friend request first" CTA); DB errors propagate as 500.

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

## Multi-session quick-task pattern (`yolo: true`)

A new GSD convention emerged on 2026-05-25 with `.planning/quick/20260525-social-yolo-pass/`. Quick tasks are normally single-session, single-scope ad-hoc edits with one terminal `SUMMARY.md`. When user explicitly opts into a YOLO multi-day expansion:

**Frontmatter flag:**
```yaml
---
slug: <name>
created: <date>
type: quick-XL
flags: --discuss --research
status: in-progress
yolo: true
scope-warning: This task INTENTIONALLY breaks /gsd-quick convention
---
```

**File layout:** `PLAN.md` + `CONTEXT.md` (no terminal `SUMMARY.md` until ALL sessions complete).

**Progress tracking:** Multi-session checklist lives in `CONTEXT.md`'s "Progress log (multi-session)" section. Each session has its own `### Session N (<date>) — COMPLETE|IN_PROGRESS` heading with `[x]` / `[ ]` checkboxes referencing concrete commit hashes. Example from `social-yolo-pass`:

```markdown
### Session 1 (2026-05-25 PM) — COMPLETE
- [x] Scaffolding (PLAN + CONTEXT + Amendment 6) — `a827bc5`
- [x] Backend friend-requests migration `0022_friend_requests` (up + down) — `46b0d65`
- [x] Backend social-graph endpoints (8 routes + handlers + service + repo) — `609b0e2`
```

**Scope expansion requires ADR amendment.** If a YOLO quick-task expands an active phase's scope (here: v1.0 closed-beta phase count 4 → 6), it MUST be accompanied by an ADR amendment in the scaffolding commit. See ADR-0011 Amendment 6.

**When to use:** Only when user explicitly invokes "Yolo" path after a discussion phase has surfaced cleaner alternatives (split into multiple `/gsd-mvp-phase` tasks). Not a default — it intentionally breaks the small/atomic invariant of `/gsd-quick`.

---

## Phase 10 + Phase 11 mobile modules (2026-05-25 sessions 2-3 social-yolo-pass)

Two new modules under `src/modules/` brought Mobile to **5 modules total** (gamification, moderation, permissions, friends, stories) — all following the same `{domain,sync,state,ui}/index.ts` pattern proven by Phase 8/E moderation.

### `src/modules/friends/` — Phase 10 FRIEND-REQUEST-FLOW

6 files. Mobile counterpart to backend session 1 (commits `46b0d65` + `609b0e2` + `7e70a4f`).

- **domain/types.ts** — `FriendRequest`, `FriendRequestStatus`, `FriendActionState` (`self|none|pending_outgoing|pending_incoming|accepted`), `REQUIRES_FRIENDSHIP_ERROR_CODE` constant.
- **sync/friendsApi.ts** — 8 endpoint wrappers (send/list-incoming/list-outgoing/accept/reject/cancel/list-friends/check-are-friends) + typed `FriendRequestError` class with `code: ApiErrorCode` + `status: number` fields. RFC3339 → ms-epoch parser.
- **state/useFriendsStore.ts** — Zustand store with `friendIds`, `incoming`, `outgoing`, `mutating`, `lastError`. Optimistic UI: outgoing pre-pended on `send`; incoming filtered on `accept`/`reject`. Single `refresh()` pulls all three lists in parallel.
- **ui/FriendActionButton.tsx** — state-machine button driven by `FriendActionState` enum. Local `localOverride` flag flips immediately on user action, then parent re-fetches Relation. Five render branches, no `else` fallthrough.
- **ui/FriendRequestsInboxScreen.tsx** — `FlatList` over Row union type (`section | incoming | outgoing | empty`), pull-to-refresh, inline `Принять`/`Отклонить`/`Отменить` buttons + peer-profile pre-fetch via `useUsersStore.getOrFetch`.

### `src/modules/stories/` — Phase 11 STORIES-REVIVAL

8 files. Backend `feed` service on port 8085 reused from Phase 8/C original.

- **domain/types.ts** — `Story`, `StoryWithStats`, `StoryGroup`, `LocalStoryDraft`, helpers `groupStoriesByAuthor` (unviewed-first sort), `isStoryExpired` (24h retention check). `STORY_OVERLAY_MAX_LENGTH = 200`, `STORY_DURATION_MS = 24h`.
- **sync/storiesApi.ts** — 6 endpoint wrappers (`fetchStoriesFeed`, `fetchMyStories`, `fetchStoryViewers`, `markStoryViewed`, `publishStory`, `deleteStory`) + `StoryApiError` class. Defensive RFC3339-or-ms-epoch parsing (`parseEpochOrIso`).
- **state/useStoriesStore.ts** — `groups` + `stories` + `markViewed` (optimistic flip of `iViewed` + `viewCount`). In-memory only; SQLite cache for `LocalStoryDraft` deferred to v1.0.1 backlog `STORIES-OFFLINE-DRAFTS`.
- **ui/StoryRingAvatar.tsx** — Avatar wrapper subscribing to `useStoriesStore.groupForAuthor`. Ring color: `theme.lime` for unviewed group, `theme.divider` for fully viewed, `null` for no active stories.
- **ui/StoryTrayHeader.tsx** — horizontal scroll, rendered as `ListHeaderComponent` of ChatsListScreen. Pre-fetches peer profiles via `useUsersStore`. Returns `null` (zero-height) when no active stories.
- **ui/StoryViewerScreen.tsx** — full-screen modal. Progress bars (one per story in group, animated 0→1 over `STORY_DISPLAY_MS = 5s`, past bars filled 100%). `Pressable.onPress` with `locationX < 100` → previous; otherwise next. `onLongPress` pauses animation, `onPressOut` resumes. `PanResponder` detects vertical drag >80px → `nav.goBack()`. `markViewed` fired once per story per session via `lastMarkedRef` deduplication.
- **ui/StoryCreatorScreen.tsx** — image picker (`MediaAdapter.pickFromGallery` + `takePhoto`) → preview with overlay text (`STORY_OVERLAY_MAX_LENGTH` cap) → `uploadImage` → `publishStory` → background `refresh` + `goBack`.
- **index.ts** — public barrel exporting types + API + store + 5 UI components.

### Composite navigation prop pattern (now solidly canonical)

Three screens use `CompositeNavigationProp<own_stack, RootStackParamList>` to navigate to RootStack-level modals (`ForeignProfile`, `StoryViewer`, `StoryCreator`):

- `PeopleSearchScreen` (existing) — tab→ForeignProfile
- `ChatsListScreen` (this batch) — tab→StoryViewer
- `MeScreen` (this batch) — tab→StoryCreator

Pattern documented in `src/navigation/screens/me/MeScreen.tsx` and `src/navigation/screens/chats/ChatsListScreen.tsx`. Required whenever a tab screen needs cross-stack navigation.

### State-machine button pattern (generalizable)

`FriendActionButton.tsx` demonstrates a useful pattern: parent-passed server-derived state enum + local override for immediate feedback before server confirms.

```typescript
const [localOverride, setLocalOverride] = useState<FriendActionState | null>(null);
const effective = localOverride ?? state;
// On action: setLocalOverride('pending_outgoing'); call API; onMutated?.()
// Parent re-fetches Relation; state prop updates; localOverride still wins until parent re-renders past mutation.
```

Useful for any optimistic-UI action button where server round-trip is >100ms and user expects immediate visual feedback.

### Pure-function util + RN renderer split

`src/util/linkify.ts` + `src/ui/social/MessageText.tsx` demonstrate the clean separation:

- **Util layer** — pure JS, returns `LinkifyToken[]` (`text | url | mention` discriminated union). No React, no RN. 13 jest tests cover all paths.
- **Render layer** — consumes token array, renders nested `<Text>` with onPress handlers (`Linking.openURL` for URLs, `onMentionPress?` callback for mentions). Untested at unit level (UI render); validated via manual smoke.

Pattern enables full util-level testing without RN test renderer setup. Suitable for any text/markdown/syntax-processing logic.

### Cross-stack RootStack modal registration

Three modal routes now registered at RootStack level alongside `ForeignProfile`:

```typescript
// src/navigation/RootNavigator.tsx
<Stack.Screen name="ForeignProfile" component={ForeignProfileScreen} options={{ presentation: 'modal' }} />
<Stack.Screen name="StoryViewer"    component={StoryViewerScreen}    options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
<Stack.Screen name="StoryCreator"   component={StoryCreatorScreen}   options={{ presentation: 'modal' }} />
```

`gestureEnabled: false` on StoryViewer because PanResponder handles dismiss; default swipe-back would conflict.

### Linkified message text in chat bubbles

`MessageText` component now used in `src/ui/social/ChatScreen.tsx` Bubble:

```typescript
{msg.text && (
  <MessageText
    body={msg.text}
    color={mine ? '#FFFFFF' : '#111827'}
    linkColor={mine ? '#C6F560' : '#2563EB'}
    fontSize={15}
  />
)}
```

URLs auto-link (open in browser via `Linking.openURL`); `@mention` renders bold but `onPress` is no-op until v1.0.1 `MENTION-NAVIGATION` ships username→userId lookup.

### Updated navigation type unions

```typescript
// src/navigation/types.ts
export type MeStackParamList = {
  // ... existing
  FriendRequests: undefined;  // NEW
};

export type RootStackParamList = {
  // ... existing
  ForeignProfile: { userId: string };
  StoryViewer: { authorId: string; startIndex?: number };  // NEW
  StoryCreator: undefined;                                   // NEW
};
```

---

*Architecture analysis: 2026-05-25 (refreshed after Phase 10+11 mobile shipped)*
