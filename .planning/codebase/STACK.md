# Technology Stack

**Analysis Date:** 2026-05-14

## Languages

**Primary:**
- TypeScript ~5.9.2 (strict mode) — mobile app at `apps/mobile-rn/` (configured in `apps/mobile-rn/tsconfig.json`, extends `expo/tsconfig.base`)
- Go 1.25.0 — backend microservices at `services/backend/` (workspace declared in `services/backend/go.work`)

**Secondary:**
- SQL (Postgres dialect + TimescaleDB extension) — schema migrations at `services/backend/migrations/` (golang-migrate format, `*.up.sql` / `*.down.sql`)
- Caddyfile DSL — API gateway config at `services/backend/gateway/Caddyfile` and `gateway/Caddyfile.prod`
- YAML — observability (`services/backend/observability/*.yml`), OpenAPI specs (`services/backend/api/*.yaml`), Docker Compose, EAS build config
- Shell — `services/backend/Makefile`, `services/backend/scripts/`

## Runtime

**Mobile environment:**
- React Native 0.81.5
- React 19.1.0
- Expo SDK ~54.0.33 (new architecture enabled — `app.json` → `newArchEnabled: true`)
- Target platforms: iOS (`bundleIdentifier: com.runningecosystem.mobile`) and Android (`package: com.runningecosystem.mobile`) — see `apps/mobile-rn/app.json`
- Hermes / new-arch Fabric — implied by `react-native-nitro-modules` ^0.35.6 and `newArchEnabled: true`

**Backend environment:**
- Go 1.25.0 (declared in every `go.mod`; build image `golang:1.25-alpine` per `services/backend/identity/Dockerfile`)
- Runtime image: `gcr.io/distroless/static-debian12:nonroot` (statically linked binary, CGO disabled)
- Postgres 16 + TimescaleDB 2.17.2 (`timescale/timescaledb:2.17.2-pg16` in `services/backend/docker-compose.yml`)
- NATS 2.11-alpine with JetStream enabled (`-js -sd /data`, per `services/backend/docker-compose.prod.yml`)
- Redis 7-alpine with LRU eviction (`--maxmemory 256mb --maxmemory-policy allkeys-lru`)
- MinIO `RELEASE.2025-01-20T14-49-07Z` (S3-compatible object storage)
- Caddy 2.8-alpine (API gateway + ACME / Let's Encrypt)

**Package Managers:**
- npm — mobile (`apps/mobile-rn/package-lock.json` present, ~822 KB)
- Go modules — backend (one module per service: `pkg/`, `identity/`, `activity-sync/`, `feed/`, `media/`, `messaging/`, `notifications/`, `realtime-gw/`, `social-graph/`; aggregated via `services/backend/go.work`)
- `go mod tidy` orchestrated by `services/backend/Makefile` target `tidy`

## Frameworks

**Mobile core:**
- Expo ~54.0.33 — managed-with-prebuild workflow (`expo prebuild` script, `android/` directory committed)
- React Navigation 7 — `@react-navigation/native` ^7.2.4, `@react-navigation/native-stack` ^7.14.14, `@react-navigation/bottom-tabs` ^7.15.13
- Zustand ^5.0.13 — state stores at `apps/mobile-rn/src/state/`
- Mapbox via `@rnmapbox/maps` ^10.3.0 (config plugin `RNMapboxMapsImpl: mapbox` in `app.json`)

**Backend core:**
- Standard library `net/http` with Go 1.22+ method-pattern muxer (see `services/backend/identity/internal/handler/http.go` — `mux.HandleFunc("POST /auth/login", ...)`) — no chi/gin/echo
- `slog` JSON handler for structured logging (default in `services/backend/identity/cmd/server/main.go`)
- Repository pattern + DI in `cmd/server/main.go` (per `services/backend/README.md`)

**Testing:**
- Jest ^29.7.0 with `jest-expo` ~54.0.0 preset (mobile)
- `@testing-library/react-native` ^13.3.3 (mobile)
- Test files under `apps/mobile-rn/src/__tests__/**/*.test.{ts,tsx}` (see `apps/mobile-rn/jest.config.js`)
- Go `testing` standard package — orchestrated via `services/backend/Makefile` targets `test` and `test-coverage`

**Build/Dev:**
- TypeScript ~5.9.2 (strict)
- ESLint ^9.39.4 with `eslint-config-expo` ^55.0.0 — flat config in `apps/mobile-rn/.eslintrc.json`
- Prettier ^3.8.3 — `apps/mobile-rn/.prettierrc.json` (semi, single-quote, trailingComma all, printWidth 90)
- EAS Build CLI >= 12.0.0 — `apps/mobile-rn/eas.json` (dev / preview / production profiles)
- golang-migrate v4.18.1 (Docker image `migrate/migrate:v4.18.1`) — migrations runner
- Docker Compose (dev: `docker-compose.yml`, observability: `docker-compose.observability.yml`, prod: `docker-compose.prod.yml`)
- Makefile in `services/backend/Makefile` — primary backend dev driver

## Key Dependencies

### Mobile (`apps/mobile-rn/package.json`)

**Mapping & geo (Mapbox-only stack):**
- `@rnmapbox/maps` ^10.3.0 — native Mapbox SDK binding (imported ONLY inside `apps/mobile-rn/src/map/`; `no-restricted-imports` ESLint rule enforces this)
- `@turf/turf` ^7.3.5, `@turf/buffer` ^7.3.5, `@turf/helpers` ^7.3.5, `@turf/simplify` ^7.3.5 — geometry processing

**Sensors & background:**
- `expo-location` ~19.0.8 — GPS via `LocationAdapter`
- `expo-task-manager` ~14.0.9 — background tasks (iOS `UIBackgroundModes: location, fetch, processing`; Android `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE_LOCATION`)
- `expo-secure-store` ~15.0.8 — auth token storage (Keychain / EncryptedSharedPreferences)
- `expo-notifications` ~0.32.17 — push & local notifications (used by `apps/mobile-rn/src/notifications/adapters/ExpoNotificationsAdapter.ts`)
- `expo-speech` ~14.0.8 — voice coaching cues

**Storage:**
- `react-native-mmkv` ^4.3.1 — fast K/V (settings, ephemeral state)
- `expo-sqlite` ~16.0.10 — relational store (see `apps/mobile-rn/src/storage/database.ts` + repositories like `sessionRepository.ts`, `pointRepository.ts`, `lapRepository.ts`)
- `react-native-nitro-modules` ^0.35.6 — JSI bridge dep of MMKV v4

**State & utilities:**
- `zustand` ^5.0.13 — store
- `uuid` ^14.0.0 + `react-native-get-random-values` ^2.0.0 — UUID generation polyfill

**Media & UI:**
- `expo-image-picker` ~17.0.11, `expo-image-manipulator` ~14.0.8 — media capture / resize
- `expo-file-system` ~19.0.22 — file IO
- `expo-blur` ~15.0.8, `expo-linear-gradient` ~15.0.8 — visual effects
- `expo-status-bar` ~3.0.9
- `react-native-svg` 15.12.1 — vector graphics
- `react-native-safe-area-context` ~5.6.0, `react-native-screens` ~4.16.0 — required by react-navigation

**Optional / lazily required (NOT pinned in package.json — `require()` inside try/catch):**
- `react-native-health` — iOS HealthKit binding, loaded by `apps/mobile-rn/src/health/HealthKitAdapter.ts`
- `react-native-health-connect` — Android Health Connect binding, loaded by `apps/mobile-rn/src/health/HealthConnectAdapter.ts`
- `expo-auth-session` — Google OAuth, loaded by `apps/mobile-rn/src/auth/authProviders.ts` (`GoogleAuthProvider`)
- `expo-apple-authentication` — Apple Sign-In, loaded by `apps/mobile-rn/src/auth/authProviders.ts` (`AppleAuthProvider`)
- `react-native-ble-plx` — BLE HR sensor (planned for Phase 5; stub at `apps/mobile-rn/src/sensors/adapters/BleSensorAdapter.ts`)

### Backend

**Database driver:**
- `github.com/jackc/pgx/v5` v5.9.2 — Postgres driver (used by every service)
- `github.com/jackc/puddle/v2` v2.2.2 — connection pooling (indirect via pgx)
- `pgxpool.New` is the canonical entry — see `services/backend/identity/cmd/server/main.go:57`

**Auth & JWT:**
- `github.com/golang-jwt/jwt/v5` v5.3.1 — direct dep of `pkg/` (shared signer in `services/backend/pkg/auth/`)
- `golang.org/x/crypto` v0.49.0–v0.50.0 — password hashing

**Messaging / events:**
- `github.com/nats-io/nats.go` v1.39.1 (in `feed`, `messaging`, `notifications`, `realtime-gw`); v1.52.0 (in `activity-sync` indirect)
- `github.com/nats-io/nkeys`, `github.com/nats-io/nuid` (indirect)

**WebSocket:**
- `github.com/coder/websocket` v1.8.13 — used by `realtime-gw` (`services/backend/realtime-gw/go.mod`)

**Cache:**
- `github.com/redis/go-redis/v9` v9.19.0 — direct dep of `pkg/`

**Object storage:**
- `github.com/minio/minio-go/v7` v7.0.78 — S3 client used by `media` service (wrapper at `services/backend/media/internal/s3/client.go`)

**Misc:**
- `github.com/google/uuid` v1.6.0 — used by `media` service
- `github.com/klauspost/compress` (indirect)

## Configuration

### Mobile

**Env vars (declared in `apps/mobile-rn/.env.example`):**
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — public Mapbox token (pk.xxx), read via `process.env`
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` — secret Mapbox token with `DOWNLOADS:READ` scope (consumed by CocoaPods via `~/.netrc` and by `@rnmapbox/maps` config plugin)

**Env vars referenced but not in .env.example (discovered via grep):**
- `EXPO_PUBLIC_IDENTITY_URL` (default `http://10.0.2.2:8081`) — identity service base
- `EXPO_PUBLIC_SYNC_URL` (default `http://10.0.2.2:8082`) — activity-sync service base
- `EXPO_PUBLIC_API_URL` — generic backend host (Caddy path-routed)
- `EXPO_PUBLIC_STRAVA_CLIENT_ID` — Strava OAuth client ID
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth client ID
- `EXPO_PUBLIC_EXPO_PROJECT_ID` — fallback for EAS project ID
- All consumed via `process.env.*` and exposed at build-time by Expo's `EXPO_PUBLIC_` convention

**Secrets handling:**
- `apps/mobile-rn/.env` is git-ignored (per `.gitignore`)
- `apps/mobile-rn/.env.example` is the canonical template
- Runtime secrets stored via `expo-secure-store` (`apps/mobile-rn/src/auth/tokenStorage.ts`)
- See `docs/SECRETS.md` for full policy

**App manifest (`apps/mobile-rn/app.json`):**
- iOS bundle: `com.runningecosystem.mobile`; background modes: location, fetch, processing
- Android package: `com.runningecosystem.mobile`; permissions include `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `WAKE_LOCK`
- Plugins: `expo-location`, `expo-task-manager`, `expo-sqlite`, `@rnmapbox/maps` (impl: mapbox), `expo-secure-store`
- New architecture enabled (`newArchEnabled: true`)
- URL scheme: `runningecosystem://`

**Build profiles (`apps/mobile-rn/eas.json`):**
- `development` — internal distribution, dev-client, iOS simulator, Android APK
- `preview` — internal distribution
- `production` — App Store / Play Store (Android `app-bundle`)

### Backend

**Env vars (per `services/backend/docker-compose.prod.yml`):**
- `POSTGRES_PASSWORD` — required
- `JWT_SECRET` — required, ≥ 32 chars (consumed by every service as `IDENTITY_JWT_SECRET`)
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — required
- `CADDY_ACME_EMAIL` — required (Let's Encrypt)
- `EXPO_ACCESS_TOKEN` — optional (Expo Push API auth)

**Per-service env:**
- `<SERVICE>_HTTP_ADDR`, `<SERVICE>_DB_URL` per service (e.g. `IDENTITY_HTTP_ADDR`, `MESSAGING_DB_URL`)
- `NATS_URL`, `REDIS_URL` for services that use them
- `S3_ENDPOINT`, `S3_ENDPOINT_INTERNAL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` — media service

**Build config:**
- Per-service `Dockerfile` (e.g. `services/backend/identity/Dockerfile`) — multi-stage, distroless runtime
- Build context is `services/backend/` (NOT per-service) because of `replace` directives pointing to `../pkg`
- Migrations applied via `migrate/migrate:v4.18.1` run-once container in prod compose

**API gateway routing:**
- Dev: `services/backend/gateway/Caddyfile` (HTTP :8080)
- Prod: `services/backend/gateway/Caddyfile.prod` (HTTPS via Let's Encrypt on `148-253-214-156.sslip.io`, plus `s3.148-253-214-156.sslip.io` for MinIO)

## Platform Requirements

**Development:**
- macOS / Linux dev workstation
- Node.js (version unpinned — no `.nvmrc`; npm-managed)
- Go 1.25.0+
- Docker + Docker Compose v2
- Xcode (for iOS native builds), Android SDK (for Android)
- `brew install golang-migrate` recommended (see `services/backend/Makefile` `migrate` target)
- EAS CLI for cloud builds

**Production target:**
- Mobile: iOS App Store + Google Play (EAS production profile, Android app-bundle)
- Backend: single Hetzner-like VPS at `148.253.214.156` (HTTPS via sslip.io + Let's Encrypt) — see `STATUS.md` "Phase 3.1 production deploy"
- Future: Kubernetes + Helm + ArgoCD per `CLAUDE.md` (not yet deployed)

---

*Stack analysis: 2026-05-14*
