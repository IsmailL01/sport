<!-- refreshed: 2026-05-18 -->
# Architecture

**Analysis Date:** 2026-05-18

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                          Mobile Client (Expo RN)                          │
│                            `apps/mobile-rn/`                              │
├──────────────────────────────────────────────────────────────────────────┤
│  UI / Navigation        State (zustand)         Sync Engine              │
│  `src/ui/`              `src/state/*.ts`        `src/sync/`              │
│  `src/navigation/`                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│  Domain (pure TS)       Pipeline (filters)     Adapters (sensor-agnostic)│
│  `src/domain/`          `src/pipeline/`        `src/{location,map,       │
│                                                  sensors,realtime,       │
│                                                  notifications,health}/` │
├──────────────────────────────────────────────────────────────────────────┤
│  Storage (SQLite, expo-sqlite)                  Auth (JWT + refresh)     │
│  `src/storage/`                                 `src/auth/`              │
└──────────────────────────────────────────────────────────────────────────┘
                                  │ HTTPS (Caddy ACME) + WS
                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│             Edge Gateway — Caddy 2.8 (HTTPS via Let's Encrypt)            │
│             `services/backend/gateway/Caddyfile.prod`                     │
│             148-253-214-156.sslip.io → path-based reverse_proxy           │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
        ┌─────────────┬───────────┼───────────┬──────────────┐
        ▼             ▼           ▼           ▼              ▼
┌──────────────┐ ┌──────────┐ ┌───────┐ ┌───────────┐ ┌─────────────┐
│  identity    │ │activity- │ │ feed  │ │ messaging │ │ social-graph│
│  :8081       │ │sync :8082│ │ :8085 │ │  :8083    │ │   :8084     │
│ `identity/`  │ │`activity-│ │`feed/`│ │`messaging/`│ │`social-graph/`│
│              │ │ sync/`   │ │       │ │           │ │             │
└──────┬───────┘ └────┬─────┘ └───┬───┘ └─────┬─────┘ └──────┬──────┘
       │              │           │           │              │
┌──────▼──────┐ ┌─────▼────┐ ┌────▼─────────┐ │ ┌────────────▼────┐
│notifications│ │  media   │ │ realtime-gw  │ │ │ Each Go service │
│   :8087     │ │  :8086   │ │   :8090  WS  │ │ │  has identical  │
│             │ │          │ │              │ │ │  internal/      │
└──────┬──────┘ └─────┬────┘ └──────┬───────┘ │ │  {domain,handler,│
       │              │              │         │ │  repository,    │
       │              │              │         │ │  service}/      │
       └──────────────┴──────────────┴─────────┘ │  layout         │
                                  │              └─────────────────┘
        ┌─────────────────────────┴─────────────────────────────┐
        ▼                  ▼                  ▼                  ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌────────────┐
│  PostgreSQL   │ │  NATS        │ │  Redis 7         │ │  MinIO     │
│  TimescaleDB  │ │  JetStream   │ │  (rate-limit,    │ │  (S3 API)  │
│  pg16         │ │  (events)    │ │   presence,      │ │            │
│ `migrations/` │ │              │ │   timeline)      │ │            │
└───────────────┘ └──────────────┘ └──────────────────┘ └────────────┘

Host VPS (Hetzner) — systemd umbrella `sport-stack.service` wraps `docker compose -f docker-compose.prod.yml up`
`/etc/systemd/system/sport-stack.service` (templated from `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2`)
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Mobile root | App bootstrap (Mapbox token, TTS adapter, ErrorBoundary, Theme, RootNavigator) | `apps/mobile-rn/App.tsx` |
| RootNavigator | Auth gate + push deep-link + app shell | `apps/mobile-rn/src/navigation/RootNavigator.tsx` |
| apiClient | HTTP client with 401-refresh retry + 426 force-update interception + X-Client-Version stamping | `apps/mobile-rn/src/auth/apiClient.ts` |
| Pipeline | GPS filter chain composer (AccuracyFilter → KalmanFilter → JumpFilter → MinSegmentFilter) | `apps/mobile-rn/src/pipeline/Pipeline.ts` |
| MapAdapter | Single import boundary for `@rnmapbox/maps` — domain never touches Mapbox directly | `apps/mobile-rn/src/map/MapboxView.tsx` |
| LocationAdapter | Sensor-agnostic GPS source with adaptive sampling modes (active/paused/background-slc) | `apps/mobile-rn/src/location/LocationAdapter.ts` |
| SessionManager | Run-session lifecycle (start/pause/resume/stop) | `apps/mobile-rn/src/domain/session/SessionManager.ts` |
| AreaCalculator | Polygon area calculation with local-plane projection | `apps/mobile-rn/src/domain/AreaCalculator.ts` |
| syncEngine | Offline-first activity sync (mobile → backend) | `apps/mobile-rn/src/sync/syncEngine.ts` |
| identity service | OTP login, JWT issuance/refresh, profile, feature flags, client-version gate | `services/backend/identity/cmd/server/main.go` |
| activity-sync | Session ingestion (mobile → Postgres + TimescaleDB hypertables) | `services/backend/activity-sync/cmd/server/main.go` |
| feed | Posts, stories, comments, likes (with cleanup goroutines) | `services/backend/feed/cmd/server/main.go` |
| media | Presigned S3 URLs + media metadata against MinIO | `services/backend/media/cmd/server/main.go` |
| messaging | Conversations + messages + transactional outbox publisher to NATS | `services/backend/messaging/cmd/server/main.go` |
| notifications | In-app notifications + Expo Push delivery | `services/backend/notifications/cmd/server/main.go` |
| realtime-gw | WebSocket terminus, JWT-authed, NATS-subscribed broadcast | `services/backend/realtime-gw/cmd/server/main.go` |
| social-graph | Profiles, follows, blocks, search-by-username | `services/backend/social-graph/cmd/server/main.go` |
| gateway (Caddy) | HTTPS terminator + path-based reverse proxy + CORS + ACME | `services/backend/gateway/Caddyfile.prod` |
| pkg (shared Go libs) | `auth` (JWT signer), `audit`, `clientversion`, `featureflags`, `permissions`, `ratelimit`, `gamification` | `services/backend/pkg/` |
| migrations | Sequential SQL migrations 0000–0021 + drill 9990/9991 (golang-migrate format) | `services/backend/migrations/` |
| Ansible deployer | OS bootstrap + UFW + docker install + sport-stack role | `infra/ansible/site.yml` |
| sport-stack role | rsync repo → SOPS decrypt → migrations → systemd enable → smoke probe | `infra/ansible/roles/sport-stack/tasks/main.yml` |
| backend-ci | Test + lint + gosec + govulncheck + semgrep + trivy + secrets diff + no-:latest guard | `.github/workflows/backend-ci.yml` |
| backend-cd | Build + cosign keyless sign + SLSA L2 attest + push to GHCR | `.github/workflows/backend-cd.yml` |
| Makefile (top) | `make rollback v=<tag>` + `make rollback-drill` (CICD-04 atomic rollback) | `Makefile` |

## Pattern Overview

**Overall:** Brownfield, two-tier architecture:
- **Mobile:** Domain-Driven Hexagonal with explicit adapter ports (LocationAdapter, MapAdapter, SensorAdapter, RealtimeAdapter, NotificationsAdapter, HealthAdapter).
- **Backend:** Go monorepo (via `go.work`) of 8 HTTP microservices, each following a classic 4-layer Clean Architecture (`cmd → handler → service → repository`, with a pure `domain` package). Cross-service async via NATS JetStream + transactional outbox; cross-cutting concerns live in `services/backend/pkg/`.

**Key Characteristics:**
- Offline-first mobile client (SQLite-backed local store, sync engine reconciles when online)
- Sensor-agnostic — every external sensor source has an Adapter port; domain depends on ports only
- Mapbox is firewalled — only `src/map/` imports `@rnmapbox/maps`
- Go services are stateless and share one Postgres + one NATS + one Redis + one MinIO via service-name DNS in the compose network
- 13-container production stack is wrapped under ONE systemd umbrella (`sport-stack.service`) — single unit start/stop/restart instead of per-service systemd
- Container images are immutable: never `:latest`, always `:sha-<short>` or `:v<X.Y.Z>` — enforced by `no-latest-tag-guard` in both CI and CD workflows
- Image supply-chain: cosign keyless via Sigstore/Fulcio + SLSA L2 build provenance via `actions/attest-build-provenance@v2`
- Secrets at rest: SOPS-encrypted YAML (`age` recipient) — decrypted on Ansible controller and templated to `/run/sport.env` (tmpfs mode 0600) on the VPS; never sit on disk

## Layers

**Mobile — Domain (`apps/mobile-rn/src/domain/`):**
- Purpose: Pure TypeScript value objects, entities, training-load math (Banister, TSS, VO2max, LTHR), area math, social/wallet types
- Location: `apps/mobile-rn/src/domain/`
- Contains: `AreaCalculator.ts`, `ClosureDetector.ts`, `athlete.ts`, `calories.ts`, `gpx.ts`, `metrics.ts`, `records.ts`, `splits.ts`, `streak.ts`, `session/SessionManager.ts`, `training/{banister,tss,vo2max,lthr,workoutSession,planGenerator,racePredictor}.ts`
- Depends on: Nothing platform-specific (no React, no Expo, no Mapbox)
- Used by: `pipeline`, `state`, `ui`, `storage`

**Mobile — Pipeline (`apps/mobile-rn/src/pipeline/`):**
- Purpose: Composable GPS filter chain
- Location: `apps/mobile-rn/src/pipeline/`
- Contains: `Pipeline.ts`, `Filter.ts`, `filters/` (Accuracy, Kalman, Jump, MinSegment)
- Depends on: `domain/types.ts` only
- Used by: `state/activity.ts`, `location/adapters/ExpoLocationAdapter.ts`

**Mobile — Adapters (`apps/mobile-rn/src/{location,map,sensors,realtime,notifications,health}/`):**
- Purpose: Hexagonal ports + concrete adapter implementations
- Pattern: Each has an interface file (e.g. `LocationAdapter.ts`) + `adapters/` subdir with concrete implementations (e.g. `ExpoLocationAdapter.ts`)
- Critical invariant: domain/state/ui code imports the interface; concrete adapters are injected at app start

**Mobile — State (`apps/mobile-rn/src/state/`):**
- Purpose: zustand stores — one per concern
- Location: `apps/mobile-rn/src/state/`
- Contains: `activity.ts`, `auth.ts`, `featureflags.ts`, `forceUpdate.ts`, `history.ts`, `map.ts`, `sensors.ts`, `settings.ts`, `sync.ts`, `training.ts`, `wallet.ts`, `workoutPlayer.ts`, `social/{useChatStore,useChatsStore,useNotificationsStore,useRealtimeStore,useUsersStore}.ts`
- Pattern: Each store is invoked at module level via `useXxxStore.getState()` for non-React contexts (e.g. headless TaskManager) and via `useXxxStore(selector)` in components

**Mobile — UI (`apps/mobile-rn/src/ui/`, `apps/mobile-rn/src/navigation/`, `apps/mobile-rn/src/design/`):**
- Purpose: Screens, modals, theme system, navigation stacks
- Location: `apps/mobile-rn/src/ui/`, `apps/mobile-rn/src/navigation/`, `apps/mobile-rn/src/design/`
- Navigation entry: `apps/mobile-rn/src/navigation/RootNavigator.tsx` — gates AuthStack vs AppTabs vs OnboardingStack

**Backend — Per-service 4-layer (`services/backend/<svc>/`):**
- `cmd/server/main.go` — entry point; ENV parsing, pgxpool, middleware composition, http.Server lifecycle, graceful shutdown
- `internal/domain/` — types and value objects (e.g. `identity/internal/domain/user.go`)
- `internal/handler/` — HTTP handlers (uses Go 1.22+ method-routed `http.ServeMux`)
- `internal/service/` — business logic (e.g. `identity/internal/service/auth.go`, `otp.go`)
- `internal/repository/` — `repository.go` interface + `postgres/` and `memory/` implementations
- Variant: `messaging/internal/outbox/publisher.go` and `permissions/` are service-local sidecars; `feed/internal/cleanup/` is a goroutine janitor; `realtime-gw/internal/gw/{connection,handler,registry}.go` is a connection-oriented variant (no Postgres, only NATS+JWT)

**Backend — Shared (`services/backend/pkg/`):**
- Purpose: Cross-service Go libraries
- Modules: `auth/` (JWT signer), `audit/` (audit-log writer to Postgres), `clientversion/` (X-Client-Version middleware + 426 force-update), `featureflags/` (Postgres-backed store with TTL cache), `permissions/`, `ratelimit/`, `gamification/`
- Each is its own Go module imported as `github.com/runningecosystem/backend/pkg/<name>`

**Infra — Ansible (`infra/ansible/`):**
- Two playbook plays (`site.yml`): (1) bootstrap (common + docker + ufw roles), (2) deploy (`sport-stack` role)
- Inventory: `inventory/{dev,prod}/hosts.yml`
- Group vars: `group_vars/all.yml` + `inventory/prod/group_vars/`

## Data Flow

### Primary Request Path — Mobile → Backend (e.g. record session)

1. GPS tick: `ExpoLocationAdapter` push (`apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`)
2. Adapter calls `useActivityStore.getState().addPoint(raw)` (`apps/mobile-rn/src/state/activity.ts`) — headless TaskManager-safe path
3. Store runs raw point through `Pipeline.process()` (`apps/mobile-rn/src/pipeline/Pipeline.ts`)
4. Filtered point persisted via `pointRepository.insert` (`apps/mobile-rn/src/storage/pointRepository.ts`)
5. On session stop, `SessionManager.stop()` triggers `syncEngine.upload()` (`apps/mobile-rn/src/sync/syncEngine.ts`)
6. `apiClient.fetch()` POST to `${EXPO_PUBLIC_SYNC_URL}/sessions` (`apps/mobile-rn/src/auth/apiClient.ts`) with X-Client-Version header
7. Caddy `handle /sessions/*` → `activity-sync:8082` (`services/backend/gateway/Caddyfile.prod`)
8. `clientversion.Middleware` checks X-Client-Version against `CLIENT_MIN_VERSION` (`services/backend/pkg/clientversion/`) — 426 if too old
9. `activity-sync` handler validates JWT via `pkg/auth.Verify`
10. `activity-sync` service writes to Postgres / TimescaleDB hypertable
11. activity-sync optionally publishes NATS event for downstream consumers (feed, social-graph, notifications)
12. 200 OK → mobile marks session as synced in local SQLite

### Async Event Path — Cross-service via NATS

1. Source service writes domain row + outbox row in one transaction (`messaging/internal/outbox/publisher.go` pattern)
2. Outbox publisher goroutine reads pending rows → publishes to NATS JetStream subject
3. Subscriber service (notifications, realtime-gw) receives event, processes, ACKs
4. `realtime-gw` fans event to active WebSocket connections by `user_id` lookup in `internal/gw/registry.go`
5. Mobile `RealtimeAdapter` receives WS frame, updates zustand store, UI re-renders

### Auth Flow (Phase M4 — passwordless OTP)

1. Mobile POST `/auth/request-code` → `identity` issues OTP (logged to stdout in prod; returned in body if `IDENTITY_DEV_MODE=true` and DB URL is local)
2. Mobile POST `/auth/login-with-code` with code → `identity` issues access JWT (short TTL) + refresh token (rotating, Postgres-backed)
3. `apiClient` stores tokens via `tokenStorage` (Expo SecureStore)
4. On 401, `apiClient` calls `POST /auth/refresh` → new pair → retries original request once
5. On 426, `apiClient` sets `useForceUpdateStore.set(...)` → `ForceUpdateScreen` modal blocks UX

### CI/CD + Deploy Flow

1. Developer pushes to `main` (or tags `v*`) — paths filter triggers `.github/workflows/backend-ci.yml` on PR
2. **backend-ci** (PR/main): matrix per service runs `go test -race`, `golangci-lint`, `gosec -severity high`, `govulncheck`, `semgrep --severity ERROR`, `trivy` HIGH/CRITICAL block, `gitleaks` + `trufflehog` on PR diff, `docker build` (no push), `no-latest-tag-guard`
3. On green merge to `main`: `.github/workflows/backend-cd.yml` runs matrix (8 services)
4. Per service: `docker buildx build` → push to `ghcr.io/ismaill01/<svc>:sha-<short>` (and `vX.Y.Z` on tags)
5. `cosign sign --yes` (keyless via Sigstore/Fulcio, OIDC token from `id-token: write`)
6. `actions/attest-build-provenance@v2` pushes SLSA L2 attestation to Rekor
7. `cosign-verify-smoke` job verifies signatures + attestations against `certificate-identity-regexp 'https://github.com/IsmailL01/.*'`
8. Operator runs `ansible-playbook -i inventory/prod --tags sport-stack site.yml -e sport_stack_tag=<tag>` from workstation
9. Ansible `sport-stack` role: rsync `services/backend/` → `/opt/sport/services/backend/`
10. `decrypt_sops.yml` decrypts `.secrets/prod/shared.yaml` on `localhost` (controller has age key; VPS does not) and templates `/run/sport.env` on remote (tmpfs mode 0600 owner deploy)
11. `run_migrations.yml` runs `migrate/migrate` one-shot container against Postgres
12. Template `sport-stack.service.j2` → `/etc/systemd/system/sport-stack.service` → `daemon-reload` + `systemctl enable --now`
13. systemd `ExecStart=/usr/bin/docker compose -f /opt/sport/services/backend/docker-compose.prod.yml up` pulls signed images from GHCR
14. `smoke_probe.yml` curls `https://148-253-214-156.sslip.io/healthz` until 200 — gates INFRA-07

### Rollback Flow (top-level `Makefile`)

1. `make rollback v=<tag-or-sha>` checks git tag exists locally
2. `git checkout <v>` (detached HEAD)
3. SSH to VPS → `docker compose run --rm migrations -database $DATABASE_URL down 1` (undoes one migration)
4. `ansible-playbook -i inventory/prod --tags sport-stack site.yml` (re-sync + re-templater + restart umbrella)
5. `curl -fsS https://148-253-214-156.sslip.io/healthz` smoke probe
6. Each step is `|| (echo ...; exit 1)` for fail-fast atomicity

**State Management:**
- Mobile: zustand stores live in `apps/mobile-rn/src/state/` — selected via hook or accessed via `.getState()` from non-React paths (TaskManager, module-level code).
- Backend: stateless services — all durable state in Postgres; ephemeral state (rate-limit counters, presence, timeline cache) in Redis.

## Key Abstractions

**MapAdapter (mobile):**
- Purpose: Sole entry point to `@rnmapbox/maps`
- Examples: `apps/mobile-rn/src/map/MapboxView.tsx`, `apps/mobile-rn/src/map/components/{TrackLayer,CorridorLayer,ZoneLayer,HistoryTerritoryLayer,LocationPuckLayer}.tsx`
- Pattern: Façade — exported types/components hide Mapbox SDK; migration to MapLibre would touch only `src/map/`

**LocationAdapter (mobile):**
- Purpose: Sensor-agnostic GPS abstraction with adaptive sampling
- Examples: `apps/mobile-rn/src/location/LocationAdapter.ts`, `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`
- Pattern: Port/Adapter — interface in root, implementations in `adapters/`

**HealthAdapter (mobile):**
- Purpose: Pluggable health-data source (HealthKit / Health Connect / Strava / Mock)
- Examples: `apps/mobile-rn/src/health/HealthAdapter.ts`, `HealthKitAdapter.ts`, `HealthConnectAdapter.ts`, `StravaAdapter.ts`, `MockHealthAdapter.ts`
- Pattern: Strategy — platform-selected at runtime

**RealtimeAdapter / NotificationsAdapter / SensorAdapter:**
- Same Port/Adapter pattern at `apps/mobile-rn/src/{realtime,notifications,sensors}/`

**Transactional Outbox (backend):**
- Purpose: Reliable cross-service event publishing without 2PC
- Examples: `services/backend/messaging/internal/outbox/publisher.go`
- Pattern: Outbox row written in same DB tx as domain row; goroutine drains to NATS

**Featureflags Store (backend, shared):**
- Purpose: Postgres-backed feature flag CRUD with 30s TTL cache + cross-service invalidation
- Example: `services/backend/pkg/featureflags/` (instantiated as `featureflags.NewPostgresStore(pool, 30*time.Second)` in each service)
- Pattern: Repository + in-memory TTL cache

**Client-Version Middleware (backend, shared):**
- Purpose: Reject too-old mobile builds at API edge with HTTP 426
- Example: `services/backend/pkg/clientversion/` used as `clientversion.Middleware(h.Routes(), policy, logger)` in `identity/cmd/server/main.go`
- Pattern: net/http Middleware

## Entry Points

**Mobile App:**
- Location: `apps/mobile-rn/index.ts` → `apps/mobile-rn/App.tsx`
- Triggers: Expo runtime
- Responsibilities: Install `react-native-get-random-values` polyfill, set Mapbox token from `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, register TTS adapter, kick feature-flag refresh, mount `ErrorBoundary > SafeAreaProvider > ThemeProvider > ToastProvider > RootNavigator + ForceUpdateScreen`

**Backend Services (one per service, identical shape):**
- Locations: `services/backend/{identity,activity-sync,feed,media,messaging,notifications,realtime-gw,social-graph}/cmd/server/main.go`
- Triggers: `docker compose up` via systemd umbrella
- Responsibilities: Parse ENV (`envRequire` fails fast on missing required vars), build `pgxpool`, ping DB, construct domain repos/services/handlers, wire shared pkg (auth signer, audit logger, featureflags store, clientversion policy), start `http.Server` in goroutine, wait on `signal.NotifyContext(SIGINT, SIGTERM)`, 10s graceful shutdown

**Ansible Playbook:**
- Location: `infra/ansible/site.yml`
- Triggers: Operator from workstation: `ansible-playbook -i inventory/prod site.yml`
- Responsibilities: Two-play orchestration — bootstrap (common, docker, ufw) then deploy (sport-stack)

**Top-Level Makefile (rollback):**
- Location: `Makefile`
- Triggers: Operator: `make rollback v=<tag>` or `make rollback-drill`
- Responsibilities: git checkout + remote `migrate down 1` + re-run Ansible deploy + smoke probe

**CI/CD Workflows:**
- Locations: `.github/workflows/{backend-ci,backend-cd,secret-scan-full}.yml`
- Triggers: `push` to `main`, `pull_request` to `main`, `v*` tag push, and cron (secret-scan-full)

## Architectural Constraints

- **Mapbox firewall:** Only files under `apps/mobile-rn/src/map/` may import `@rnmapbox/maps`. Enforced by convention + reviewer guard (TZ §3 / §10.6); no automated lint rule currently.
- **Local-plane projection mandatory:** Area calculations must project lat/lon into a local Cartesian plane before computing area — never raw degrees. See `apps/mobile-rn/src/domain/AreaCalculator.ts` and TZ §6.6.
- **No PolylineAnnotation for the live track:** Track rendering uses `LineLayer + GeoJsonSource` only — `PolylineAnnotation` and `AnnotationManager` are forbidden for the moving track (TZ §10.5). See `apps/mobile-rn/src/map/components/TrackLayer.tsx`.
- **Mobile single-threaded JS bridge:** Adapters running in headless contexts (TaskManager) must use `useXxxStore.getState()` — they have no React lifecycle.
- **Backend services share one DB + one NATS + one Redis + one MinIO:** No per-service DB instance. Tables namespaced by feature, not by service.
- **`docker compose` (space-form) only:** `sport-stack.service.j2` ExecStart uses `/usr/bin/docker compose` — never `docker-compose` (legacy v1 binary removed). Documented in template header.
- **Immutable image tags:** Never `:latest` anywhere — enforced by `no-latest-tag-guard` jobs in `backend-ci.yml` and `backend-cd.yml`. Compose file uses `${SPORT_STACK_TAG:?need SPORT_STACK_TAG}` — refuses to start without an explicit tag.
- **JWT secret minimum length:** `pkg/auth.NewSigner` rejects keys < 32 bytes. Enforced server-side at startup (fails the `run()` function).
- **`IDENTITY_DEV_MODE=true` prod-guard:** Refuses to start if DB URL is not local (substring match `localhost`, `127.0.0.1`, `host.docker.internal`, `@postgres:`). See `services/backend/identity/cmd/server/main.go:isLocalDBURL`.
- **Secrets at rest:** SOPS-encrypted (`.sops.yaml` → age recipient); decrypted on the Ansible controller via `delegate_to: localhost`; never present in the git tree unencrypted; never on VPS disk (only `/run/sport.env` on tmpfs mode 0600).
- **UFW + key-only SSH:** OS-level firewall replaces Hetzner Cloud Firewall (post Phase 3 pivot, D-24); admin SSH allow-listed by `dev_admin_ips` CIDRs in `infra/ansible/group_vars/all.yml`.
- **Go workspace:** `services/backend/go.work` lists all 9 modules (8 services + `pkg`). CI cannot use the root `./...` form — `golangci-lint`, `gosec`, `govulncheck` all loop per-module because there is no root `go.mod`.
- **Migration files are immutable once merged:** sequential numbering 0000–0021, plus drill migrations 9990/9991. Up/down pairs required. Run by one-shot `migrate/migrate:v4.18.1` container before service start (`docker-compose.prod.yml` `migrations` job + `depends_on.condition: service_completed_successfully`).

## Anti-Patterns

### Importing `@rnmapbox/maps` outside `src/map/`

**What happens:** A screen or domain module imports `Mapbox`, `Camera`, or `MapView` directly from `@rnmapbox/maps`.
**Why it's wrong:** It defeats the MapAdapter firewall — migration to MapLibre or a native module would then require touching every consumer instead of only `src/map/`. Also pulls native dependencies into pure-TS test contexts.
**Do this instead:** Import from `apps/mobile-rn/src/map/` (re-exports). Add new map layers as components under `apps/mobile-rn/src/map/components/`. Pattern in `apps/mobile-rn/src/map/MapboxView.tsx`.

### Computing polygon area in raw lat/lon

**What happens:** Code multiplies degree differences as if they were Euclidean meters.
**Why it's wrong:** Latitude and longitude are not isotropic — at 60° latitude a degree of longitude is half a degree of latitude. Areas are wildly wrong, especially for elongated polygons.
**Do this instead:** Use the projection helpers in `apps/mobile-rn/src/util/geo.ts` to convert to a local Cartesian plane centered on the polygon centroid, then apply the shoelace formula. Reference: `apps/mobile-rn/src/domain/AreaCalculator.ts`.

### Rendering the live track with `PolylineAnnotation` / `AnnotationManager`

**What happens:** Track rendering uses one annotation per segment.
**Why it's wrong:** Annotations are CPU-heavy and rebuild on every update — performance collapses past ~1000 points. TZ §10.5 forbids this.
**Do this instead:** Single `GeoJsonSource` + `LineLayer`, mutate the GeoJSON in place. Reference: `apps/mobile-rn/src/map/components/TrackLayer.tsx`.

### Reading state via `useXxxStore(selector)` in a headless TaskManager handler

**What happens:** Background-location callback uses the React hook form to read state.
**Why it's wrong:** The handler runs outside React's render tree — hooks throw. Worse, mutations made this way don't notify subscribers.
**Do this instead:** Use `useXxxStore.getState()` and `useXxxStore.setState(...)` directly. Reference: `apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts` calling into `useActivityStore.getState().addPoint(...)`.

### Pinning `docker-compose.prod.yml` to `:latest` or unversioned image refs

**What happens:** Image refs lack an explicit version constraint.
**Why it's wrong:** `:latest` is non-reproducible — rollback becomes impossible and supply-chain signatures can't be verified against a known digest.
**Do this instead:** Use `${SPORT_STACK_TAG:?need SPORT_STACK_TAG}` — the compose file already does. Enforced by `no-latest-tag-guard` jobs (both CI and CD).

### Writing secrets to disk on the VPS

**What happens:** Decrypted secrets land in `/opt/sport/.env` or similar persistent path.
**Why it's wrong:** Survives reboot, ends up in backups, accessible to any process running as `deploy`.
**Do this instead:** Always template to `/run/sport.env` (tmpfs, mode 0600 owner deploy). See `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml`. Age key lives on the dev workstation only — never copied to the VPS.

### Building per-service Go commands at the repo root with `./...`

**What happens:** A CI step runs `go test ./...` from `services/backend/`.
**Why it's wrong:** `services/backend/` has no `go.mod` (only `go.work`). Tools error with "directory prefix . does not contain modules listed in go.work".
**Do this instead:** Loop per module: `for SVC in pkg identity activity-sync feed media messaging notifications realtime-gw social-graph; do (cd services/backend/$SVC && go test ...); done`. Pattern in `.github/workflows/backend-ci.yml` (`lint`, `gosec`, `govulncheck` jobs).

## Error Handling

**Strategy:** Fail-fast on missing required configuration (server-side at startup) + structured logging via `slog` (Go) / `console.error` + ErrorBoundary (RN).

**Patterns:**
- Go services: `envRequire(key)` in each `cmd/server/main.go` calls `exitFunc(1)` if a required ENV var is missing
- Go services: `slog` with JSON handler; `Logger` is process-wide via `slog.SetDefault(...)`
- Go services: passwords redacted in logs via `redactPassword(url)` helper (identity)
- Go services: graceful shutdown — `signal.NotifyContext` + `srv.Shutdown(ctx)` with 10s timeout
- Mobile: top-level `ErrorBoundary` in `App.tsx` shows red error screen with stack
- Mobile: apiClient catches 401 (refresh-and-retry) and 426 (force-update modal) at low level — call sites don't see them
- Mobile: pipeline drop events route through `PipelineHooks.onDrop` for telemetry without affecting flow

## Cross-Cutting Concerns

**Logging:**
- Go: `log/slog` with JSON handler, `LevelInfo` default. Used everywhere via `slog.Default()` after `slog.SetDefault(logger)` in each main.
- Mobile: `console.log/warn/error`; production telemetry deferred (no Sentry yet — see TZ).

**Validation:**
- Go: hand-rolled in handlers (`r.ParseForm`, JSON decode, then field checks); no validator library.
- Mobile: zod is NOT used; types enforced at the API boundary by `apiClient` JSON parsing + zustand store guards.

**Authentication:**
- JWT via `pkg/auth.Signer` (HS256, ≥32 byte secret); refresh tokens rotating, Postgres-backed (`pkg/auth/jwt.go`, `identity/internal/repository/postgres/refresh_token.go`).
- Server-side: every service that needs auth has its handler call `pkg/auth.Verify` (or wraps mux with `requireAuth` middleware as in `identity/internal/handler/http.go`).
- Mobile: `apiClient` (`src/auth/apiClient.ts`) transparently refreshes on 401 + force-updates on 426.

**Rate limiting:** `pkg/ratelimit` (Redis-backed) — per-user/per-IP buckets.

**Audit:** `pkg/audit` writes admin actions to a shared `audit_log` Postgres table.

**Permissions:** `pkg/permissions` provides ABAC checks; `messaging/internal/permissions/permissions.go` is a service-local variant for conversation membership.

**Observability:** `services/backend/docker-compose.observability.yml` + `services/backend/observability/` (Prometheus / Grafana). Not enabled in the main prod compose by default — opt-in second compose file.

---

*Architecture analysis: 2026-05-18*
