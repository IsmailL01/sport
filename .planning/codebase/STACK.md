# Technology Stack

**Analysis Date:** 2026-05-18

## Languages

**Primary:**
- **Go 1.25.0** — All 8 backend microservices + shared `pkg/` module. Declared in every `services/backend/*/go.mod` and pinned in `services/backend/go.work:1`.
- **TypeScript 5.9** (strict) — Mobile client (`apps/mobile-rn/`). Pinned via `apps/mobile-rn/package.json:63` (`typescript: ~5.9.2`) and `apps/mobile-rn/tsconfig.json` extends `expo/tsconfig.base` with `"strict": true`.

**Secondary:**
- **YAML** — Ansible roles (`infra/ansible/roles/`), OpenAPI specs (`services/backend/api/*.yaml`), GitHub Actions workflows, SOPS-encrypted secrets (`.secrets/<env>/*.yaml`).
- **SQL** — Postgres migrations (`services/backend/migrations/00*.up.sql` / `*.down.sql`, 22 numbered pairs + 2 drill).
- **Bash** — Smoke probes (`services/backend/scripts/smoke_*.py`-adjacent shells, `services/backend/scripts/drill_assert_schema.sh`), SOPS verify (`services/backend/scripts/secrets/verify_sops_roundtrip.sh`), top-level rollback (`Makefile:46-63`).
- **Python 3** — Smoke test scripts (`services/backend/scripts/smoke_otp.py`, `smoke_ratelimit.py`, `smoke_realtime_*.py`, `smoke_stories.py`, `smoke_posts.py`, `smoke_xp.py`, `smoke_moderation.py`, `smoke_abac_muted.py`, `smoke_permissions.py`). Ansible host interpreter pinned to `/usr/bin/python3` in `infra/ansible/inventory/prod/hosts.yml:21`.
- **Caddyfile** (DSL) — Edge reverse proxy (`services/backend/gateway/Caddyfile.prod`, `services/backend/gateway/Caddyfile`).
- **Jinja2** — Ansible templates (`infra/ansible/roles/sport-stack/templates/sport-stack.service.j2`).
- **Dart** — Archived only (`apps/mobile_flutter.archived/`, not developed; framework choice landed RN per `framework_choice.md` Phase 0).

## Runtime

**Environment:**

| Component | Runtime | Where pinned |
|-----------|---------|--------------|
| Mobile JS | Hermes (RN 0.81.5) on iOS 13+/Android 7+ | `apps/mobile-rn/package.json:41` |
| Mobile native | Expo SDK 54 (newArchEnabled) | `apps/mobile-rn/package.json:25`, `apps/mobile-rn/app.json:10` |
| Backend services | Distroless `gcr.io/distroless/static-debian12:nonroot` (statically linked CGO_ENABLED=0) | `services/backend/identity/Dockerfile:37` and identical pattern in each other `<svc>/Dockerfile` |
| Build images | `golang:1.25-alpine` | `services/backend/identity/Dockerfile:7` |
| VPS host | Debian 12 / Ubuntu (provider-agnostic) — currently `148.253.214.156` | `infra/ansible/inventory/prod/hosts.yml:17` |
| Container orchestrator | Docker Compose v2 under `sport-stack.service` (systemd umbrella) | `services/backend/docker-compose.prod.yml`, `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` |

**Package Managers:**
- **npm** for mobile — lockfile at `apps/mobile-rn/package-lock.json`. No `private` workspaces config.
- **Go modules** (workspace) — `services/backend/go.work` lists 9 modules (`pkg`, `identity`, `activity-sync`, `feed`, `media`, `messaging`, `notifications`, `realtime-gw`, `social-graph`). Each module has its own `go.mod` + `go.sum`. Inter-module dependency to `pkg/` uses `replace github.com/runningecosystem/backend/pkg => ../pkg` in each service's `go.mod`.
- **Ansible Galaxy** — collections under `~/.ansible/collections` per `infra/ansible/ansible.cfg:4`.

## Frameworks

**Mobile core:**
- **Expo SDK 54** (`expo: ~54.0.33`) — dev-client distribution via EAS Build (`apps/mobile-rn/eas.json`).
- **React Native 0.81.5 + React 19.1.0** (`apps/mobile-rn/package.json:40-41`).
- **@react-navigation/{native,native-stack,bottom-tabs} v7** — 4-tab shell (Запись / Журнал / Чаты / Я).
- **zustand 5** — state stores (`apps/mobile-rn/src/state/*.ts`).
- **expo-sqlite 16** — local DB at `running_ecosystem.db`, 19 schema versions (`apps/mobile-rn/src/storage/database.ts:1-43`).
- **react-native-mmkv 4.3** — fast key-value store (settings, phone E.164).
- **@rnmapbox/maps 10.3** — Mapbox SDK, quarantined to `apps/mobile-rn/src/map/` only (ESLint guard in `apps/mobile-rn/eslint.config.js:36-46`).
- **@turf/{turf,simplify,buffer,helpers} 7.3** — geometry calc + track simplification.

**Backend core (each Go service):**
- **net/http** stdlib for HTTP servers (no web framework) — see `services/backend/identity/internal/handler/http.go` etc.
- **pgx/v5 5.9.2** (`github.com/jackc/pgx/v5` + `pgxpool`) — Postgres driver.
- **NATS client `nats.go` v1.39.1** (`v1.52.0` in activity-sync) — JetStream events bus.
- **`coder/websocket` v1.8.13** — WebSocket (only in `realtime-gw`).
- **`golang-jwt/jwt/v5` v5.3.1** — JWT signing/verification (HS256, shared in `services/backend/pkg/auth/`).
- **`redis/go-redis/v9` v9.19.0** — used by `services/backend/pkg/ratelimit/` for sliding-window limiter (consumed by `messaging`, `feed`, `social-graph`).
- **`minio-go/v7` v7.0.78** — S3 client (media service only) at `services/backend/media/internal/s3/client.go`.
- **`golang.org/x/crypto`** — bcrypt for password hashing (`services/backend/identity/internal/service/auth.go:15`).
- **`log/slog`** (stdlib) — structured JSON logging in every service `cmd/server/main.go`.

**Edge:**
- **Caddy 2.8-alpine** — HTTPS reverse proxy with Let's Encrypt ACME automation (`services/backend/docker-compose.prod.yml:291`).

**Testing:**
- **Jest 29.7 + jest-expo 54** — mobile unit/integration tests (`apps/mobile-rn/jest.config.js`). 536+ tests reported per `STATUS.md:43`.
- **@testing-library/react-native 13** (`apps/mobile-rn/package.json:52`).
- **better-sqlite3 12.10** — Node shim used as test substitute for `expo-sqlite` in `apps/mobile-rn/__tests__/` integration tests.
- **`go test` + race detector** — backend CI uses `go test -race -coverprofile=coverage.out ./...` per `.github/workflows/backend-ci.yml:54`.

**Build/Dev tooling:**
- **EAS CLI ≥12.0** (Expo Application Services) — `apps/mobile-rn/eas.json:2`. Build profiles: `development`, `preview`, `production`.
- **golang-migrate v4.18.1** (`migrate/migrate:v4.18.1` container) — DB migration runner, invoked one-shot via `services/backend/docker-compose.prod.yml:102`.
- **docker/buildx** — multi-stage Docker builds, GHA cache via `cache-from/to: type=gha` (`.github/workflows/backend-ci.yml:205-207`).

## Key Dependencies

**Critical (production blast radius):**
- `@rnmapbox/maps@^10.3.0` (mobile) — Map rendering. Token quarantined to native keystore via `~/.netrc` + `~/.gradle/gradle.properties` (NOT `EXPO_PUBLIC_*` per `apps/mobile-rn/eslint.config.js:47-60`).
- `expo-location@~19.0.8` (mobile) — GPS source + background tracking (`app.json:51-60`).
- `expo-secure-store@~15.0.8` (mobile) — Token storage (`apps/mobile-rn/src/auth/tokenStorage.ts`).
- `expo-notifications@~0.32.17` (mobile) — push token retrieval for Expo Push.
- `expo-task-manager@~14.0.9` (mobile) — background tasks for sync engine.
- `expo-haptics@~14.1.4` (mobile) — closure haptic feedback (`STATUS.md:14`).
- `expo-image-picker@~17.0.11` + `expo-image-manipulator@~14.0.8` (mobile) — media upload pipeline.
- `pgx/v5@5.9.2` (backend) — all services.
- `nats.go@1.39.1` (backend) — bus client; mixed `1.52.0` in `activity-sync/go.mod` (skew tolerated).
- `golang-jwt/jwt/v5@5.3.1` (backend) — JWT for all services.
- `redis/go-redis/v9@9.19.0` (backend) — only consumed via `services/backend/pkg/ratelimit/ratelimit.go`.
- `minio-go/v7@7.0.78` (backend) — only `services/backend/media/internal/s3/client.go`.

**Infrastructure containers (pinned tags, ROADMAP forbids `:latest`):**
- `timescale/timescaledb:2.17.2-pg16` — Postgres 16 + TimescaleDB (`services/backend/docker-compose.prod.yml:25`).
- `nats:2.11-alpine` with JetStream (`-js`), persistent file storage, 7d retention.
- `minio/minio:RELEASE.2025-01-20T14-49-07Z` — S3-compatible object storage.
- `redis:7-alpine` — `--maxmemory 256mb`, `allkeys-lru`, `--appendonly yes`.
- `caddy:2.8-alpine` — edge HTTPS.
- `migrate/migrate:v4.18.1` — migration runner.
- `prom/prometheus:v2.55.0`, `grafana/loki:3.2.0`, `grafana/grafana:11.3.0` — observability stack (`services/backend/docker-compose.observability.yml`).

## Configuration

**Mobile environment:**
- `EXPO_PUBLIC_IDENTITY_URL` — backend identity base URL (default `http://10.0.2.2:8081` for Android emulator) (`apps/mobile-rn/src/auth/apiClient.ts:21`).
- `EXPO_PUBLIC_SYNC_URL` — activity-sync base URL (default `http://10.0.2.2:8082`).
- `EXPO_PUBLIC_API_URL` — generic API base override.
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — Mapbox **public** token only (build-time, via `eas.json:18`).
- `EXPO_PUBLIC_STRAVA_CLIENT_ID` — Strava public OAuth client ID (per `CHANGELOG.md:10`).
- `EXPO_PUBLIC_API_BASE` — backend base for Strava token exchange.
- **Forbidden:** `EXPO_PUBLIC_*_SECRET` — ESLint blocks via `no-restricted-syntax` in `apps/mobile-rn/eslint.config.js:50-60`.
- Native Mapbox `sk.*` token — `~/.netrc` (iOS) + `~/.gradle/gradle.properties` (Android), never in repo.

**Backend environment (per service, summary):**

| Variable | Used by | Notes |
|----------|---------|-------|
| `<SVC>_HTTP_ADDR` | each service | default `:8081-:8090`; service-specific (e.g. `IDENTITY_HTTP_ADDR`) |
| `<SVC>_DB_URL` | identity, activity-sync, social-graph, messaging, feed, media, notifications | REQUIRED; pgx DSN (contains password) |
| `IDENTITY_JWT_SECRET` | all services | REQUIRED, ≥32 bytes (enforced `services/backend/pkg/auth/jwt.go:43-46`) |
| `IDENTITY_DEV_MODE` | identity | default false; refuses non-local DB if true (SEC-05 in `identity/cmd/server/main.go:67-75`) |
| `NATS_URL` | activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph | default `nats://nats:4222` |
| `REDIS_URL` | messaging, feed, social-graph | default `redis://redis:6379/0` |
| `EXPO_ACCESS_TOKEN` | notifications | optional; empty disables push fanout (`notifications/cmd/server/main.go:57-59`) |
| `S3_ENDPOINT`, `S3_ENDPOINT_INTERNAL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_REGION` | media | dual-endpoint pattern for presigned URLs vs internal puts |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | postgres container | `re`, `${POSTGRES_PASSWORD:?…}`, `running_ecosystem` |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | minio | required |
| `CADDY_ACME_EMAIL` | gateway | required for Let's Encrypt registration |
| `CLIENT_MIN_VERSION`, `FORCE_UPDATE_URL_*` | identity | optional; HTTP 426 response payload |
| `SPORT_STACK_TAG` | docker-compose.prod.yml | REQUIRED; passed via `ansible-playbook -e sport_stack_tag=<tag>` |

**Secret storage (Phase 2 / SEC-02):**
- **SOPS + age (X25519 + ChaCha20-Poly1305)** — `.sops.yaml` defines a single rule encrypting `.secrets/**/*.yaml`.
- Encrypted slot files per environment: `.secrets/{dev,staging,prod}/{shared,mapbox,oauth}.yaml`.
- Single recipient currently: `age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my` (DEV_A); bus factor 1 acknowledged in `.sops.yaml:18-22`.
- Production deploy decrypts on Ansible controller, templates to `/run/sport.env` on remote (tmpfs, mode `0600`, owner `deploy:deploy`) per `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml` and `defaults/main.yml:6-9`.
- `.env*` files git-ignored at `.gitignore:6-13`; plaintext secrets never enter version control.

**Build/CI configuration files:**
- `.golangci.yml` — golangci-lint v2 config (15 enabled linters, explicit-enable mode).
- `apps/mobile-rn/eslint.config.js` — ESLint v9 flat-config with Mapbox SDK quarantine + secret token regex guards.
- `.trivyignore.yaml` — Trivy CVE allowlist.
- `.gitleaks.toml` — gitleaks tuning (custom allow rules).
- `.trufflehog/config.yaml` — TruffleHog config.
- `.pre-commit-config.yaml` — pinned `gitleaks v8.30.1` (staged-files-only).
- `.editorconfig` — repo-wide formatting.

## Platform Requirements

**Development:**
- Node 18+ for Expo (implied by Expo SDK 54). No `.nvmrc` present.
- Go 1.25.0 (workspace pin).
- Docker + docker-compose v2 (top-level `name:` requires Compose spec ≥v2).
- macOS or Linux dev machine (Xcode for iOS builds, Android Studio for Android).
- `sops`, `age`, `ansible`, `gh`, `gitleaks`, `golang-migrate`, `golangci-lint`, `cosign` — required tools per `Makefile` + `services/backend/Makefile` guards.

**Production:**
- Single VPS `148.253.214.156` (provider-agnostic, Phase 3 D-25 pivoted away from Hetzner-specific tooling).
- Debian/Ubuntu with systemd (`sport-stack.service` umbrella).
- UFW firewall (managed by `infra/ansible/roles/ufw/`).
- Ports 80/443 public; SSH 22 allow-listed to `91.92.33.145/32` (single dev admin IP, `infra/ansible/group_vars/all.yml:22-23`).
- Mobile target: iOS 13+ (newArch + `supportsTablet: false`), Android API 24+ (`com.runningecosystem.mobile`, edge-to-edge, foreground service for background location).

---

*Stack analysis: 2026-05-18*
