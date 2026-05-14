# External Integrations

**Analysis Date:** 2026-05-14

## APIs & External Services

### Mapping

**Mapbox** — primary map provider (sole map stack per ТЗ §10).
- SDK: `@rnmapbox/maps` ^10.3.0 (mobile, native binding)
- Config plugin: `app.json` → `plugins.@rnmapbox/maps.RNMapboxMapsImpl: mapbox`
- Public access token env: `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (`apps/mobile-rn/.env.example`)
- Download token env (CocoaPods + plugin): `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (consumed via `~/.netrc`)
- Imports restricted to `apps/mobile-rn/src/map/` by ESLint `no-restricted-imports` rule in `apps/mobile-rn/.eslintrc.json` — domain/business code must use the `MapAdapter` interface
- Map view component: `apps/mobile-rn/src/map/MapboxView.tsx`
- Offline regions logic: `apps/mobile-rn/src/map/offline.ts`

### Fitness platforms

**Strava** — pull-only OAuth integration.
- Adapter: `apps/mobile-rn/src/health/StravaAdapter.ts`
- API base: `https://www.strava.com/api/v3` (constant `STRAVA_API_BASE`)
- Endpoint used: `GET /athlete/activities?after=<ts>&per_page=50`
- OAuth flow: PKCE on mobile, code exchange proxied through backend (no `client_secret` on device)
  - Mobile → `POST {backendBase}/integrations/strava/exchange { code, codeVerifier, deviceId }`
  - Mobile → `POST {backendBase}/integrations/strava/refresh { athleteId, deviceId }`
- Auth lib (planned): `expo-auth-session` (lazy-loaded)
- Env: `EXPO_PUBLIC_STRAVA_CLIENT_ID`
- Status: scaffolded, UI/backend exchange endpoints pending (see review fix R1 in `STATUS.md`)

**Apple HealthKit** — iOS workouts read/write.
- Adapter: `apps/mobile-rn/src/health/HealthKitAdapter.ts`
- Native lib (lazy-required): `react-native-health` (not pinned in `package.json` — `require()` inside try/catch; install conditional on iOS prebuild)
- Picked automatically on `Platform.OS === 'ios'` by `apps/mobile-rn/src/health/index.ts`

**Android Health Connect** — Android workouts read/write.
- Adapter: `apps/mobile-rn/src/health/HealthConnectAdapter.ts`
- Native lib (lazy-required): `react-native-health-connect`
- Picked automatically on `Platform.OS === 'android'` by `apps/mobile-rn/src/health/index.ts`

**Mock health adapter** (dev fallback): `apps/mobile-rn/src/health/MockHealthAdapter.ts`.

### Backend services (self-hosted)

All backend microservices live under `services/backend/` and are routed through Caddy at `148-253-214-156.sslip.io` (prod) — see `services/backend/gateway/Caddyfile.prod`. Mobile client base URL via `EXPO_PUBLIC_API_URL` (`apps/mobile-rn/src/auth/apiClient.ts`).

| Service | Path prefix | Internal port | Source dir |
|---------|-------------|---------------|------------|
| identity | `/auth/*`, `/me` | :8081 | `services/backend/identity/` |
| activity-sync | `/sessions*` | :8082 | `services/backend/activity-sync/` |
| social-graph | `/profiles*`, `/relations*`, `/follows*`, `/blocks*`, `/search/users`, `/reports*`, `/admin/*` | :8084 | `services/backend/social-graph/` |
| messaging | `/conversations*`, `/messages/*` | :8083 | `services/backend/messaging/` |
| feed | `/stories*`, `/posts*`, `/feed/*` | :8085 | `services/backend/feed/` |
| media | `/uploads*`, `/media/*` | :8086 | `services/backend/media/` |
| notifications | `/devices*`, `/notifications*`, `/preferences` | :8087 | `services/backend/notifications/` |
| realtime-gw | `/ws` (WebSocket) | :8090 | `services/backend/realtime-gw/` |

## Data Storage

### Backend

**Relational DB:**
- PostgreSQL 16 + TimescaleDB 2.17.2 — single `postgres` container (image `timescale/timescaledb:2.17.2-pg16`)
- Connection per service via `<SERVICE>_DB_URL` env (e.g. `postgres://re:${POSTGRES_PASSWORD}@postgres:5432/running_ecosystem?sslmode=disable`)
- Driver: `github.com/jackc/pgx/v5` v5.9.2 + `pgxpool` connection pool
- TimescaleDB extension enabled via migration `services/backend/migrations/0000_extensions.up.sql`
- Hypertable usage: `session_points` (7-day partitions) — `services/backend/migrations/0002_activities.up.sql`
- Migrations: golang-migrate format, 19+ versions in `services/backend/migrations/` (users, activities, session_hr, calories, social_graph, messaging, notifications, reactions, media, message_media, stories, feed_posts, moderation, xp_grades)

**Object storage (S3-compatible):**
- MinIO `RELEASE.2025-01-20T14-49-07Z` — bucket `media`, region `us-east-1`
- Client: `github.com/minio/minio-go/v7` v7.0.78
- Wrapper: `services/backend/media/internal/s3/client.go`
- Dual-endpoint config: `S3_ENDPOINT` (public, for presigned URLs) + `S3_ENDPOINT_INTERNAL` (for server-side stat/delete)
- Public host proxied through Caddy: `s3.148-253-214-156.sslip.io` → `minio:9000`

**Cache / rate limit / presence:**
- Redis 7-alpine — single instance, LRU eviction at 256 MB
- Client: `github.com/redis/go-redis/v9` v9.19.0 (direct dep of `services/backend/pkg/`)
- Used by `messaging`, `feed`, `social-graph` (see `REDIS_URL` env in `docker-compose.prod.yml`)
- Roles: rate limiting, presence, timeline cache, hot conversation cache (per `docker-compose.prod.yml` comment)

**Not yet deployed but referenced in ТЗ:**
- ClickHouse — analytical aggregations, leaderboards (planned `P3-A-04` / `P4-A-08` per `docs/DEVELOPMENT_PLAN.md`; not yet present in `docker-compose.*.yml`)
- OpenSearch — search (mentioned in `docs/RUNNING_ECOSYSTEM_TZ.md` §750; not yet deployed)

### Mobile (offline-first per ТЗ §3)

**Local relational DB:**
- SQLite via `expo-sqlite` ~16.0.10
- Schema/setup: `apps/mobile-rn/src/storage/database.ts`
- Repositories: `sessionRepository.ts`, `pointRepository.ts`, `lapRepository.ts`, `sensorRepository.ts`, `recordsRepository.ts`, `relationsRepository.ts`, `socialRepository.ts`, `walletRepository.ts` (all in `apps/mobile-rn/src/storage/`)
- Migration history: documented inline; latest referenced is v18 (`laps` table) and v19 (`wallet_balance.coins CHECK >= 0`) per `STATUS.md`

**Key-value store:**
- MMKV via `react-native-mmkv` ^4.3.1 (depends on `react-native-nitro-modules`)
- Used for ephemeral state, settings, phone field (`useSettingsStore.phoneE164` per `STATUS.md`)

**Secure storage:**
- `expo-secure-store` ~15.0.8 — Keychain (iOS) / EncryptedSharedPreferences (Android)
- Used for auth tokens: `apps/mobile-rn/src/auth/tokenStorage.ts` with keys `auth.accessToken`, `auth.refreshToken`

**File system:**
- `expo-file-system` ~19.0.22 — used for media upload pipeline (`apps/mobile-rn/src/sync/mediaUpload.ts`)

## Authentication & Identity

**Backend auth service:** `services/backend/identity/` — self-hosted JWT issuer.
- HTTP routes (per `services/backend/identity/internal/handler/http.go`):
  - `POST /auth/login`
  - `POST /auth/login-with-code` (OTP)
  - `POST /auth/request-code` (OTP request)
  - plus register / refresh / `/me`
- JWT signing: `services/backend/pkg/auth/` using `github.com/golang-jwt/jwt/v5` v5.3.1
- Secret: `IDENTITY_JWT_SECRET` env, ≥ 32 bytes enforced at startup
- Tokens validated by each downstream service via shared `pkg/auth` package (gateway does NOT validate JWT — services do)

**Mobile auth flows:**
- Email OTP (primary, working) — `apps/mobile-rn/src/state/authStore.ts` calls `useAuthStore.requestCode` / `loginWithCode`
- Token storage: `expo-secure-store` (`apps/mobile-rn/src/auth/tokenStorage.ts`)
- HTTP client with auto-refresh: `apps/mobile-rn/src/auth/apiClient.ts` (handles 401 + 429 with `Retry-After`)

**OAuth providers (stub-safe scaffolds, Round 4+):**
- `apps/mobile-rn/src/auth/authProviders.ts` defines `AuthProvider` interface + `GoogleAuthProvider` + `AppleAuthProvider`
- Google: `expo-auth-session` (lazy require), env `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
- Apple: `expo-apple-authentication` (lazy require, iOS-only)
- UI buttons render only when `isAvailable()` returns true (native module installed + env configured)
- See `docs/DECISIONS/0003-oauth-providers.md`

## Monitoring & Observability

**Stack (local dev):** `services/backend/docker-compose.observability.yml`
- Prometheus v2.55.0 — metrics scrape, port 9090
  - Config: `services/backend/observability/prometheus.yml`
- Loki 3.2.0 — log aggregation, port 3100
  - Config: `services/backend/observability/loki.yml`
- Grafana 11.3.0 — dashboards, port 3000 (admin/admin)
  - Datasources: `services/backend/observability/grafana-datasources.yml`

**Application logging:**
- Backend: `slog` JSON handler (Go stdlib) — `services/backend/identity/cmd/server/main.go:39`
- Caddy: JSON access logs to stdout (`services/backend/gateway/Caddyfile.prod`)

**Error tracking:**
- Not detected (no Sentry/Bugsnag SDK in mobile `package.json`; Sentry is referenced only as a Jest transform-ignore pattern in `apps/mobile-rn/jest.config.js` boilerplate, not as a dep)

## CI/CD & Deployment

**Mobile builds:**
- EAS Build (Expo) — `apps/mobile-rn/eas.json`
  - `development` profile: dev-client, internal distribution, iOS simulator + Android APK
  - `preview` profile: internal
  - `production` profile: iOS m-medium resourceClass, Android app-bundle
- EAS project ID placeholder `TODO-eas-project-id-after-eas-init` in `app.json` (not yet initialized)
- Submit config: `submit.production` block exists but empty

**Backend deploy:**
- Current production: single VPS (Hetzner-like) at `148.253.214.156`, HTTPS via Let's Encrypt + sslip.io
- Orchestration: `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
- Migrations: run-once `migrate/migrate:v4.18.1` init job (services wait via `service_completed_successfully`)
- Future per `CLAUDE.md`: K8s + Helm + ArgoCD (not yet implemented)

**CI pipeline:**
- Not detected (no `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`, or `Jenkinsfile` at repo root)
- Local quality gates: `make test`, `npm run lint`, `npm run typecheck`, `npm run test`

## Environment Configuration

### Required env vars (mobile)
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — public Mapbox token
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` — secret Mapbox download token (CocoaPods + plugin)
- `EXPO_PUBLIC_IDENTITY_URL` / `EXPO_PUBLIC_SYNC_URL` / `EXPO_PUBLIC_API_URL` — backend hosts
- `EXPO_PUBLIC_STRAVA_CLIENT_ID` — Strava OAuth (optional, gates Strava adapter)
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` — Google sign-in (optional, gates `GoogleAuthProvider.isAvailable()`)
- `EXPO_PUBLIC_EXPO_PROJECT_ID` — EAS project ID fallback for `expo-notifications` push token retrieval

### Required env vars (backend)
- `POSTGRES_PASSWORD` — DB password
- `JWT_SECRET` — ≥ 32 chars, shared across all services
- `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` — S3 credentials
- `CADDY_ACME_EMAIL` — Let's Encrypt account email
- `EXPO_ACCESS_TOKEN` — optional, used by `notifications` service for Expo Push API auth (`services/backend/notifications/internal/expopush/client.go`)
- Per-service: `<SERVICE>_HTTP_ADDR`, `<SERVICE>_DB_URL`, `NATS_URL`, `REDIS_URL` (see `docker-compose.prod.yml`)

### Secrets location
- Mobile: `apps/mobile-rn/.env` (git-ignored; copied from `apps/mobile-rn/.env.example`)
- Backend: `.env.prod` (git-ignored; loaded by `docker compose --env-file`)
- Runtime mobile secrets: `expo-secure-store` (Keychain / EncryptedSharedPreferences)
- Mapbox download token: also written to `~/.netrc` for CocoaPods
- Policy doc: `docs/SECRETS.md`

## Webhooks & Callbacks

### Incoming
- `/ws` (WebSocket terminus on `realtime-gw:8090`) — bidirectional realtime channel (used by mobile `apps/mobile-rn/src/realtime/adapters/WebSocketRealtimeAdapter.ts`)
- No public HTTP webhooks from third parties detected (Strava webhooks not yet wired — current integration is pull-only via `GET /athlete/activities`)

### Outgoing
- **Expo Push API** (`https://exp.host/--/api/v2/push/send`) — invoked by `services/backend/notifications/internal/expopush/client.go`
  - Auth: optional Bearer `EXPO_ACCESS_TOKEN`
  - Token format validation: must start with `ExponentPushToken[` or `ExpoPushToken[`
- **Strava API** (`https://www.strava.com/api/v3/athlete/activities`) — invoked by mobile `apps/mobile-rn/src/health/StravaAdapter.ts`
- **Backend → mobile** event bus (internal, not HTTP): NATS JetStream subjects consumed by `feed`, `messaging`, `notifications`, `realtime-gw` (NATS_URL `nats://nats:4222`)

---

*Integration audit: 2026-05-14*
