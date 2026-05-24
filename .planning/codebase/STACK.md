# Technology Stack

**Analysis Date:** 2026-05-23

## Languages

**Primary:**
- TypeScript ~5.9.2 — mobile app (`apps/mobile-rn/`), strict mode (`apps/mobile-rn/tsconfig.json`)
- Go 1.25.0 — backend monorepo (`services/backend/`), 9 modules tied via `go.work`

**Secondary:**
- Kotlin (Android native shell, `apps/mobile-rn/android/`) — JVM 17 per CI matrix
- Python — operational smoke/probe scripts only (`scripts/cardinality_probe.py`, `scripts/pii_audit.sh`, `services/backend/scripts/smoke_*.py`); no Python application code
- Shell (bash) — release pipeline glue (`.github/workflows/android-release.yml`, `scripts/`)
- HCL/YAML — Ansible playbooks (`infra/ansible/`), GitHub Actions workflows (`.github/workflows/`)

## Runtime

**Mobile:**
- Node.js 20.x — pinned in CI (`.github/workflows/android-release.yml:49`); local Node via system install (no `.nvmrc` present)
- Hermes JS engine enabled (`apps/mobile-rn/android/gradle.properties:42` → `hermesEnabled=true`); JSC fallback wired via `io.github.react-native-community:jsc-android:2026004.+` (`apps/mobile-rn/android/app/build.gradle:82`)
- React Native New Architecture (Fabric + TurboModules) enabled — `newArchEnabled: true` in `apps/mobile-rn/app.json:10` + `newArchEnabled=true` in `apps/mobile-rn/android/gradle.properties:38`

**Backend:**
- Go 1.25 distroless runtime — services compiled `CGO_ENABLED=0 GOOS=linux GOARCH=amd64`, packaged via `gcr.io/distroless/static-debian12:nonroot` (`services/backend/identity/Dockerfile:37`)
- Containerized — no host-Go runtime; production deploy is `docker compose -f services/backend/docker-compose.prod.yml`

**Android toolchain:**
- JDK 17 (Temurin) — CI pinned (`.github/workflows/android-release.yml:55-57`)
- Gradle (wrapper, version per `apps/mobile-rn/android/gradle/wrapper/gradle-wrapper.properties`)
- AGP via `com.android.tools.build:gradle` (`apps/mobile-rn/android/build.gradle:9`)
- NDK — version inherited from `rootProject.ext.ndkVersion` (Expo-managed)
- `arm64-v8a` only ABI filter (`apps/mobile-rn/android/app/build.gradle:111-113`, `apps/mobile-rn/android/gradle.properties:31`) — Phase 7 Plan 07-01 Task 4 (cuts `.aab` size ~140MB → ~50-60MB)

**Package Manager (mobile):**
- npm — lockfile present (`apps/mobile-rn/package-lock.json`, 834KB)
- Engine constraints not pinned; CI installs via `npm ci` (`.github/workflows/android-release.yml:98`)

**Package Manager (backend):**
- Go modules — 9 individual `go.mod` files under `services/backend/<service>/`, unified by `services/backend/go.work:3-13`
- All non-`pkg` services use `replace github.com/runningecosystem/backend/pkg => ../pkg` for shared library

## Frameworks

**Core (mobile):**
- React Native 0.81.5 (`apps/mobile-rn/package.json:41`)
- React 19.1.0 (`apps/mobile-rn/package.json:40`)
- Expo SDK 54 — `expo: ~54.0.33` (`apps/mobile-rn/package.json:25`)
- React Navigation v7 — `@react-navigation/native@^7.2.4` + `bottom-tabs@^7.15.13` + `native-stack@^7.14.14` (`apps/mobile-rn/package.json:17-19`)
- Zustand 5.0.13 — state stores (`apps/mobile-rn/package.json:49`)

**Core (backend):**
- net/http + std `log/slog` — no web framework; routes hand-wired per service
- `github.com/jackc/pgx/v5@v5.9.2` — Postgres driver (all DB-touching services)
- `github.com/nats-io/nats.go@v1.39.1` — event bus client (feed, messaging, notifications, realtime-gw, activity-sync)
- `github.com/redis/go-redis/v9@v9.19.0` — used in `services/backend/pkg/ratelimit/ratelimit.go:45` + feed/messaging/social-graph
- `github.com/golang-jwt/jwt/v5@v5.3.1` — JWT auth
- `github.com/coder/websocket@v1.8.13` — WebSocket terminus (realtime-gw)
- `github.com/minio/minio-go/v7@v7.0.78` — S3 client (media service only)
- `github.com/google/uuid@v1.6.0` — UUID generation

**Observability (backend):**
- OpenTelemetry v1.32.0 — `go.opentelemetry.io/otel` + SDK + OTLP HTTP exporter (`services/backend/pkg/go.mod:12-14`)
- `github.com/getsentry/sentry-go@v0.46.2` — SDK wired but **dormant by design** per ADR-0010/D-38 (empty DSN → no-op); see `services/backend/pkg/observability/sentry_init.go:78-84`
- `github.com/prometheus/client_golang@v1.20.5` — metrics
- `go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp@v0.57.0` — HTTP middleware

**Testing (mobile):**
- Jest ^29.7.0 + `jest-expo ~54.0.0` + `@testing-library/react-native@^13.3.3` (`apps/mobile-rn/package.json:52-61`)
- Config: `apps/mobile-rn/jest.config.js` — `preset: 'jest-expo'`, `testMatch: ['**/__tests__/**/*.test.{ts,tsx}']`
- `better-sqlite3@12.10.0` + `@types/better-sqlite3` — dev-only, used in unit tests that exercise SQLite adapters

**Testing (backend):**
- Standard `go test -race -coverprofile=…` per service (`.github/workflows/backend-ci.yml:54`)
- Python smoke harness — `services/backend/scripts/smoke_*.py` (stdlib only, no `pip` deps; per `.github/workflows/backend-ci.yml:291`)

**Build/Dev:**
- Expo CLI (via `@expo/cli`, transitively from `expo` package)
- EAS CLI — installed explicitly in CI via `npm install -g eas-cli` (`.github/workflows/android-release.yml:101`); local dev version: **19.0.6** per project context. Build profiles in `apps/mobile-rn/eas.json` (`development` | `preview` | `production`)
- Metro bundler — Expo default; entry `apps/mobile-rn/index.ts` → `registerRootComponent(App)`
- ESLint v9 flat-config — `apps/mobile-rn/eslint.config.js` (`eslint-config-expo/flat` base + custom `no-restricted-imports` for `@rnmapbox/maps` + `no-restricted-syntax` for `process.env.EXPO_PUBLIC_*_SECRET` and inline `sk.…` literals)
- Prettier 3.8.3 — `apps/mobile-rn/.prettierrc.json` (`singleQuote`, `trailingComma: all`, `printWidth: 90`)
- TypeScript ~5.9.2 — `tsc --noEmit` typecheck script
- `golangci-lint v2.5.0` — pinned in `.github/workflows/backend-ci.yml:72`, config at `.golangci.yml`
- `gosec` (latest) — `.github/workflows/backend-ci.yml:106`
- `govulncheck` (latest) — `.github/workflows/backend-ci.yml:131`
- `semgrep` (container `returntocorp/semgrep`) with `p/golang` + `p/owasp-top-ten` (`.github/workflows/backend-ci.yml:149-163`)
- Trivy (`aquasecurity/trivy-action@master`) — image scanning, fail on HIGH/CRITICAL

## Key Dependencies

**Critical (mobile — pinned/load-bearing):**
- `@rnmapbox/maps@^10.3.0` — Mapbox SDK wrapper (`apps/mobile-rn/package.json:20`). Pinned at `^10.3` per ADR-0011 (Phase 13 SDK 11 migration explicitly dropped from v1.0 scope). Native impl flagged `RNMapboxMapsImpl: mapbox` (`apps/mobile-rn/app.json:67`, `apps/mobile-rn/android/gradle.properties:67`). Native package: `com.rnmapbox.rnmbx` (verified in `apps/mobile-rn/android/app/proguard-rules.pro:20-31`). Direct imports outside `src/map/adapters/` blocked by ESLint rule per CLAUDE.md MapAdapter principle
- `react-native-mmkv@^4.3.1` — Nitro-Modules-based KV store (`apps/mobile-rn/package.json:43`). v4 API uses `createMMKV()`, NOT `new MMKV()`. Native namespace: `com.margelo.nitro.mmkv` (NOT `com.mrousavy.mmkv`) — verified by grep documented in `apps/mobile-rn/android/app/proguard-rules.pro:20`
- `react-native-nitro-modules@^0.35.6` — MMKV v4 runtime dependency (`apps/mobile-rn/package.json:44`)
- `expo-location ~19.0.8` — GPS source via `LocationAdapter`; native package `expo.modules.location` (`apps/mobile-rn/package.json:33`, `apps/mobile-rn/android/app/proguard-rules.pro:48-49`)
- `expo-task-manager ~14.0.9` — background location task host; native package `expo.modules.taskManager` (camelCase `M`) (`apps/mobile-rn/package.json:39`, `apps/mobile-rn/android/app/proguard-rules.pro:42-46`)
- `expo-sqlite ~16.0.10` — local data store (`apps/mobile-rn/package.json:37`)
- `expo-secure-store ~15.0.8` — token storage (`apps/mobile-rn/package.json:35`)
- `expo-notifications ~0.32.17` — Expo Push receiver SDK (`apps/mobile-rn/package.json:34`)
- `@turf/turf@^7.3.5` + `@turf/buffer` + `@turf/helpers` + `@turf/simplify` — geometry/area calc (`apps/mobile-rn/package.json:21-24`)
- `react-native-get-random-values@^2.0.0` — required polyfill for `uuid@^14.0.0` (imported first in `apps/mobile-rn/App.tsx:15`)

**Critical (backend):**
- `github.com/jackc/pgx/v5` — Postgres + TimescaleDB driver
- `github.com/nats-io/nats.go` — NATS JetStream client
- `github.com/redis/go-redis/v9` — rate-limit/cache/presence
- `github.com/minio/minio-go/v7` — S3-compatible media uploads
- `github.com/getsentry/sentry-go` — wired, dormant (ADR-0010 D-38)

**Infrastructure (runtime images, `services/backend/docker-compose.prod.yml`):**
- `timescale/timescaledb:2.17.2-pg16` — Postgres 16 + TimescaleDB extension
- `nats:2.11-alpine` — JetStream broker with persistent file storage
- `redis:7-alpine` — `maxmemory 256mb`, `allkeys-lru`, AOF on
- `minio/minio:RELEASE.2025-01-20T14-49-07Z` — S3-compatible object storage
- `caddy:2.8-alpine` — gateway/reverse proxy + Let's Encrypt TLS
- `migrate/migrate:v4.18.1` — schema migration runner
- `prom/prometheus:v2.55.0`, `grafana/loki:3.2.0`, `grafana/grafana:11.3.0` — observability stack (`infra/observability-stack/docker-compose.yml`, `services/backend/docker-compose.observability.yml`)

## Configuration

**Mobile environment:**
- `.env` (gitignored, `apps/mobile-rn/.env`) — local-only overrides; template in `apps/mobile-rn/.env.example`
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (pk.… public token, bundle-safe with Mapbox URL restrictions per ADR-0006)
- `EXPO_PUBLIC_IDENTITY_URL`, `EXPO_PUBLIC_SYNC_URL`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_API_BASE` — backend endpoints (`apps/mobile-rn/src/auth/apiClient.ts:21-27`)
- `EXPO_PUBLIC_EXPO_PROJECT_ID` — optional override for Expo Push registration (`apps/mobile-rn/src/notifications/adapters/ExpoNotificationsAdapter.ts:42`)
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (stub, ADR-0003) — OAuth, not active in v1.0
- `EXPO_PUBLIC_STRAVA_CLIENT_ID` (stub) — `apps/mobile-rn/src/health/StravaAdapter.ts:41`
- `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` (sk.…) — build-time only, lives in `~/.netrc` (iOS Pods) and `~/.gradle/gradle.properties` (Android Gradle). NEVER bundled. ESLint guard catches any `EXPO_PUBLIC_*_SECRET` access pattern (`apps/mobile-rn/eslint.config.js:47-60`)
- `RUNNING_ECO_RELEASE_STORE_FILE`, `RUNNING_ECO_RELEASE_STORE_PASSWORD`, `RUNNING_ECO_RELEASE_KEY_ALIAS`, `RUNNING_ECO_RELEASE_KEY_PASSWORD` — Android signing creds; live in `~/.gradle/gradle.properties` locally, injected via `$GITHUB_ENV` + `::add-mask::` in CI (`.github/workflows/android-release.yml:88-93`, see ADR-0012)

**Backend environment (via `services/backend/docker-compose.prod.yml`):**
- `POSTGRES_PASSWORD`, `JWT_SECRET` (`≥32 chars`) — mandatory, no defaults
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` — S3 credentials
- `CADDY_ACME_EMAIL` — Let's Encrypt registration
- `EXPO_ACCESS_TOKEN` — optional; empty → push fanout no-ops (notifications service, `services/backend/notifications/cmd/server/main.go:71-73`)
- `SPORT_STACK_TAG` — image tag selector for GHCR pulls (Ansible-injected)
- Per-service: `IDENTITY_HTTP_ADDR`, `IDENTITY_DB_URL`, `<SVC>_DB_URL`, `NATS_URL`, `REDIS_URL`, `S3_*`

**Build configuration:**
- `apps/mobile-rn/app.json` — Expo app config (slug `running-ecosystem-mobile`, bundleId `com.runningecosystem.mobile`, permissions, plugins list)
- `apps/mobile-rn/eas.json` — EAS build profiles (`development`/`preview` = APK, `production` = `app-bundle`)
- `apps/mobile-rn/android/app/build.gradle` — release signing config (lines 115-141) reads `RUNNING_ECO_RELEASE_*` gradle properties with debug-keystore fallback
- `apps/mobile-rn/android/app/proguard-rules.pro` — R8 keep rules for Mapbox / MMKV / expo-task-manager / Hermes (see "Build Toggles" below)
- `apps/mobile-rn/android/gradle.properties` — Hermes on, New Arch on, R8 minify + shrinkResources on (lines 73-74: `android.enableMinifyInReleaseBuilds=true`, `android.enableShrinkResourcesInReleaseBuilds=true`)
- `apps/mobile-rn/android/build.gradle` — Mapbox Maven repo auth (lines 27-44) reading `MAPBOX_DOWNLOADS_TOKEN`/`RNMAPBOX_MAPS_DOWNLOAD_TOKEN`
- `.sops.yaml` — SOPS encryption rules; recipients `DEV_A` + `CI` age public keys
- `services/backend/observability/prometheus.yml`, `loki.yml`, `grafana-datasources.yml` — observability config
- `infra/ansible/site.yml` + roles (`alloy-shipper`, `ufw`, `caddy`, …) — Ansible deploy

**Build Toggles (release):**
- R8 minify: **ON** (`android.enableMinifyInReleaseBuilds=true` in `apps/mobile-rn/android/gradle.properties:73`)
- Resource shrinker: **ON** (`android.enableShrinkResourcesInReleaseBuilds=true` in `apps/mobile-rn/android/gradle.properties:74`)
- ProGuard keep rules: defined in `apps/mobile-rn/android/app/proguard-rules.pro` — covers `com.mapbox.**`, `com.rnmapbox.rnmbx.**`, `com.margelo.nitro.mmkv.**` (+ defensive `com.mrousavy.mmkv.**` + `com.tencent.mmkv.**`), `expo.modules.taskManager.**`, broad `expo.modules.**`, `expo.modules.location.**`, `com.facebook.hermes.**`, `com.facebook.jni.**`, `com.facebook.react.bridge.**`, `com.facebook.react.turbomodule.core.**`
- PNG crunch: ON (`android.enablePngCrunchInReleaseBuilds=true`)
- ABI: `arm64-v8a` only

## Platform Requirements

**Development:**
- macOS / Linux dev workstation
- Node.js 20.x
- JDK 17 (Temurin recommended — matches CI)
- Android Studio + SDK (`apps/mobile-rn/android/local.properties:1` → `sdk.dir=/Users/ismail/Library/Android/sdk` on this workstation)
- SOPS ≥3.11 (3.13.1 used in CI per `.github/workflows/android-release.yml:61`)
- age (X25519 key pair, public half in `.sops.yaml`)
- `yq` (mikefarah, latest) — for SOPS YAML extraction in CI
- Docker + Docker Compose v2 — for backend stack + observability

**Production:**
- Single VPS: `148.253.214.156` (`148-253-214-156.sslip.io`) — application stack via `services/backend/docker-compose.prod.yml`, deployed by Ansible (`infra/ansible/site.yml`)
- Second VPS: `82.25.71.215` (`82-25-71-215.sslip.io`) — observability stack (Loki + Grafana + Prometheus) colocated with unrelated `niko-prod` project, per ADR-0010
- Container registry: `ghcr.io/ismaill01/<service>` — pushed by `backend-cd.yml`, signed via cosign keyless (Sigstore/Fulcio) + SLSA L2 provenance attestation (`actions/attest-build-provenance@v2`)
- TLS: Let's Encrypt via Caddy on prod VPS (`gateway` service in compose); self-signed (`tls internal`) on observability VPS for `:8443`
- Mobile distribution: EAS Cloud Build — Expo project ID currently `TODO-eas-project-id-after-eas-init` per `apps/mobile-rn/app.json:73-75` (Phase 8 follow-up)

---

*Stack analysis: 2026-05-23*
