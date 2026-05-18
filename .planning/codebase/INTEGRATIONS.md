# External Integrations

**Analysis Date:** 2026-05-18

## APIs & External Services

**Maps / Tiles:**
- **Mapbox** — Map rendering, vector tiles, offline regions.
  - SDK/Client: `@rnmapbox/maps@^10.3.0` (mobile only, quarantined to `apps/mobile-rn/src/map/`).
  - Auth: public access token via build-time `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (`apps/mobile-rn/eas.json:18`); native download token `sk.*` via `~/.netrc` (iOS pod install) + `~/.gradle/gradle.properties` (Android gradle).
  - SOPS slot: `.secrets/<env>/mapbox.yaml` — referenced in `infra/ansible/roles/sport-stack/defaults/main.yml:13-16` (`sport_sops_groups: [shared, mapbox, oauth]`).
  - Guard: ESLint blocks `sk\.[A-Za-z0-9._-]{40,}` literals and `EXPO_PUBLIC_*_SECRET` member access (`apps/mobile-rn/eslint.config.js:47-60`).

**Push Notifications:**
- **Expo Push API** (`https://exp.host/--/api/v2/push/send`) — fanout from `notifications` service.
  - SDK/Client: in-house thin HTTP client at `services/backend/notifications/internal/expopush/client.go` (no upstream Go SDK).
  - Auth: optional `EXPO_ACCESS_TOKEN` env var (Bearer header). Empty → push fanout no-ops (`notifications/cmd/server/main.go:54-59`).
  - Token format validated: must start with `ExponentPushToken[` or `ExpoPushToken[` (`expopush/client.go:79`).
  - Batch size: 100 messages/POST, 15s timeout.

**OAuth / Identity (mobile-side, scaffolded — Round 4 backend wiring deferred):**
- **Google Sign-in** — stub-safe (`apps/mobile-rn/src/auth/authProviders.ts:58`), uses `expo-auth-session` lazy require. Not wired in v1.0.
- **Apple Sign-in** — iOS-only, `expo-apple-authentication` lazy require. Required before App Store release per `docs/DECISIONS/0003-oauth-providers.md`.
- Backend exchange endpoint (`POST /auth/oauth/exchange`) NOT implemented; mobile shows Alert "backend ещё не подключён" (`CHANGELOG.md:58-60`).
- SOPS slot: `.secrets/<env>/oauth.yaml` — placeholders for STRAVA/GOOGLE/APPLE per `.secrets/README.md:14`.

**Fitness Activity Import (mobile-side, Strava only partially wired):**
- **Strava** — Pull-only, PKCE-ready. Adapter at `apps/mobile-rn/src/health/StravaAdapter.ts`.
  - Mobile uses `EXPO_PUBLIC_STRAVA_CLIENT_ID` (public) only; refresh tokens proxied through backend (`POST {API_BASE}/integrations/strava/{exchange,refresh}` — endpoint NOT yet implemented, Round 4).
  - Critical rule: no `client_secret` on device (`CHANGELOG.md:9-13`).
- **Apple HealthKit** (`HealthKitAdapter.ts`) and **Android Health Connect** (`HealthConnectAdapter.ts`) — iOS/Android-native; lazy-load `react-native-health`. Picker auto-selects platform: HK on iOS, HC on Android.
- **Garmin / Polar** — types referenced in `apps/mobile-rn/src/health/HealthAdapter.ts` (`'garmin'`, `'strava'`); no live integration. Polar H10 / Garmin HRM-Dual surface only via `MockSensorAdapter.ts` (BLE HR mock).

**Email / OTP delivery:**
- **No SMTP integration shipped.** OTP flow (`services/backend/identity/internal/service/otp.go`, `internal/handler/otp.go`) generates code, persists to `auth_otp` table (migration `0020_auth_otp.up.sql`). In dev mode, code is returned in HTTP response body (`devCode` field). Production email send is a TODO — `IDENTITY_DEV_MODE=true` refuses to start against non-localhost DB (`identity/cmd/server/main.go:67-75`).

## Data Storage

**Primary Database:**
- **Postgres 16 + TimescaleDB 2.17.2** — `timescale/timescaledb:2.17.2-pg16` (`services/backend/docker-compose.prod.yml:25`).
  - Connection: `postgres://re:${POSTGRES_PASSWORD}@postgres:5432/running_ecosystem?sslmode=disable` (internal Docker network; port not exposed in prod).
  - Client: `github.com/jackc/pgx/v5` + `pgxpool` everywhere.
  - Extensions enabled: `pgcrypto` (UUID gen), `citext` (case-insensitive email), `timescaledb` (`migrations/0000_extensions.up.sql`).
  - Hypertable: `points` partitioned by `ts` at 7-day chunks (`migrations/0002_activities.up.sql:47`).
  - Migration runner: `migrate/migrate:v4.18.1` container as one-shot init job; 22 numbered migration pairs (`migrations/0000`-`0021`) + 2 drill (`9990`, `9991`).
  - Schema scope: users, refresh_tokens, sessions, points (hypertable), session_hr, session_calories, social_graph, messaging (conversations + messages + outbox), notifications, reactions, media, message_media, stories, feed_posts, moderation, xp_grades, auth_otp, featureflags.

**Mobile local DB:**
- **SQLite via `expo-sqlite@~16.0.10`** — `running_ecosystem.db` at `apps/mobile-rn/src/storage/database.ts`.
  - 19 schema versions tracked via `PRAGMA user_version`. WAL mode enabled.
  - Repositories: `lapRepository`, `pointRepository`, `recordsRepository`, `relationsRepository`, `sensorRepository`, `sessionRepository`, `socialRepository`, `walletRepository`.
  - Test substitute: `better-sqlite3@12.10` for Jest integration tests (`apps/mobile-rn/__mocks__/`).

**Key-Value / Cache:**
- **Redis 7-alpine** — `redis:7-alpine` with `--maxmemory 256mb`, `allkeys-lru`, `--appendonly yes` (`docker-compose.prod.yml:81-99`).
  - Used by: `messaging`, `feed`, `social-graph` via `services/backend/pkg/ratelimit/ratelimit.go` (sliding-window rate limiter).
  - Roles per docker-compose comments: rate limiting, presence, timeline cache, hot conversation cache.
  - Connection: `redis://redis:6379/0`.
- **MMKV 4.3** on mobile (`react-native-mmkv`) — settings store, phone E.164, force-update state.

**Object Storage:**
- **MinIO** (S3-compatible) — `minio/minio:RELEASE.2025-01-20T14-49-07Z` (`docker-compose.prod.yml:64-78`).
  - Bucket: `media` (auto-created via `MakeBucket` in `services/backend/media/internal/s3/client.go`).
  - Client: `github.com/minio/minio-go/v7@v7.0.78` (media service only).
  - Dual-endpoint pattern: public (`s3.148-253-214-156.sslip.io`, Caddy-proxied) for presigned PUTs from clients; internal (`minio:9000`) for service-side stat/delete.
  - Region: `us-east-1` (S3-compatibility placeholder).

**Message Broker / Event Bus:**
- **NATS 2.11 + JetStream** — `nats:2.11-alpine` started with `-js -sd /data` (persistent file storage, 7d retention per docker-compose comment).
  - Client: `github.com/nats-io/nats.go` (v1.39.1 in most services, v1.52.0 in activity-sync — skew tolerated).
  - URL: `nats://nats:4222`; healthcheck on port `8222`.
  - **Subjects observed in code:**
    - `rt.user.<userID>` — direct user-fanout, subscribed by `realtime-gw` and re-published by `feed`/`activity-sync` for WS push (`feed/internal/service/posts.go`, `activity-sync/internal/service/sync.go`).
    - `feed.post.created.v1` / `feed.post.liked.v1` / `feed.post.commented.v1` (`feed/internal/service/posts.go`).
    - `feed.story.published.v1` / `feed.story.expired.v1` (`feed/internal/service/svc.go`).
    - `user.xp.changed.v1` (`activity-sync/internal/service/sync.go`).
    - `rt.user.*` — `notifications` service subscription pattern (`notifications/cmd/server/main.go`).
  - **Outbox pattern:** `messaging` uses transactional outbox (`messaging/internal/outbox/publisher.go` reads `EventSubject` + `Payload` from `outbox` table and publishes to NATS).

## Authentication & Identity

**Auth Provider:** custom in-house (no Auth0/Firebase Auth).

**JWT signing:**
- HS256 symmetric, secret in `IDENTITY_JWT_SECRET` env var (≥32 bytes enforced at `services/backend/pkg/auth/jwt.go:43-46`).
- Library: `github.com/golang-jwt/jwt/v5@v5.3.1`.
- Issuer: `running-ecosystem.identity`.
- TTLs: access 15 min, refresh 30 days (`pkg/auth/jwt.go:18-21`).
- Claims: standard `RegisteredClaims` + `uid` (user ID) + `typ` (`"access"` vs `"refresh"`).
- Verification: `pkg/auth` shared package consumed by every service that needs to authenticate inbound requests.

**Password hashing:**
- `golang.org/x/crypto/bcrypt` with `bcrypt.DefaultCost` (`services/backend/identity/internal/service/auth.go:15,35`).

**OTP flow (Phase 8 / M4):**
- `POST /auth/request-code` and `POST /auth/login-with-code` (`identity/internal/handler/otp.go`).
- 6-digit code persisted to `auth_otp` table (migration `0020_auth_otp.up.sql`).
- Dev-mode short-circuit returns code in JSON (`devCode` field) — refused if DB is non-local.

**Mobile token storage:**
- `expo-secure-store@~15.0.8` — `apps/mobile-rn/src/auth/tokenStorage.ts`.
- Auto-refresh on HTTP 401 via `apps/mobile-rn/src/auth/apiClient.ts`.

**Client-version enforcement (REL-02):**
- `X-Client-Version` header stamped on every outbound request (mobile reads from `expo-application` via `src/util/version.ts`).
- Backend returns HTTP 426 Upgrade Required (`services/backend/pkg/clientversion/`) with body `{ error, min_version, force_update_url_android, force_update_url_ios }`.
- Mobile intercepts 426 in `apiClient.ts:57-80` → `useForceUpdateStore.set(...)` → `ForceUpdateScreen` blocks UX.
- Configured via `CLIENT_MIN_VERSION` / `FORCE_UPDATE_URL_ANDROID` / `FORCE_UPDATE_URL_IOS` env vars on `identity` service.

## Monitoring & Observability

**Metrics:**
- **Prometheus v2.55.0** — `services/backend/observability/prometheus.yml`. Scrapes `identity:8081`, `activity-sync:8082`, `gateway:8080` on `/metrics`.
- `/metrics` endpoints not yet wired in services (per comment in `prometheus.yml`, "P3-B-01 future").
- Local dev only currently: `docker-compose.observability.yml` exposes Prometheus :9090.

**Logs:**
- Structured JSON via `log/slog` (stdlib) — every service `cmd/server/main.go` initializes `slog.NewJSONHandler(os.Stdout, ...)` at LevelInfo.
- **Loki 3.2.0** for aggregation (`docker-compose.observability.yml:18`) — local dev only.
- Caddy emits JSON access logs to stdout (`gateway/Caddyfile.prod:21-25`).

**Dashboards:**
- **Grafana 11.3.0** at `:3000` (local dev), `admin/admin` default creds, anonymous access enabled.
- Pre-provisioned datasources at `services/backend/observability/grafana-datasources.yml`: Prometheus (default) + Loki.

**Error Tracking:**
- None integrated (no Sentry, no Bugsnag). Errors surface only via `slog.Error` to stdout, captured downstream by Loki when configured.

## CI/CD & Deployment

**Container Registry:**
- **GHCR** (GitHub Container Registry) — `ghcr.io/ismaill01/<service>` for all 8 backend services.
- Image tags emitted by `.github/workflows/backend-cd.yml`:
  - `sha-<short>` — Docker convention, every push.
  - `<sha>` (full) — on default branch.
  - `v<X.Y.Z>` + `v<X.Y>` — on `v*` tag push.
  - **No `:latest`** — ROADMAP hard rule + `flavor: latest=false` + `no-latest-tag-guard` job.

**Supply Chain Security:**
- **Sigstore cosign** keyless signing via Fulcio OIDC (`sigstore/cosign-installer@v3` + `cosign sign --yes`) — `.github/workflows/backend-cd.yml:88-95`.
- **SLSA L2 build provenance** via `actions/attest-build-provenance@v2` (LTS, not the `@v1` deprecation shim) — `backend-cd.yml:97-102`.
- **Smoke verify** job re-runs `cosign verify` + `cosign verify-attestation --type slsaprovenance` against `--certificate-identity-regexp 'https://github.com/IsmailL01/.*'` + `--certificate-oidc-issuer https://token.actions.githubusercontent.com` (`backend-cd.yml:108-132`).

**CI Pipeline (`.github/workflows/backend-ci.yml`):**
- Triggers: PR + push to `main` filtered by `services/backend/**` and workflow paths.
- **8 jobs (verbatim job names — branch-protection contract per `backend-ci.yml:1-5`):**
  1. `Test (Go 1.25)` — matrix over 9 modules; `go test -race -coverprofile=coverage.out`.
  2. `Lint (golangci-lint v2)` — golangci-lint 2.5.0 per-module loop using `.golangci.yml`.
  3. `SAST (gosec)` — block-on-HIGH per `D-10`.
  4. `Vuln (govulncheck)` — block-on-finding.
  5. `SAST (semgrep)` — `returntocorp/semgrep` container, `p/golang` + `p/owasp-top-ten`, `--severity ERROR --error`.
  6. `Secrets (gitleaks + trufflehog — PR diff)` — diff-only on PRs.
  7. `Docker build (no push, verify)` — matrix over 8 services; loads image then runs `aquasecurity/trivy-action` (HIGH,CRITICAL → exit 1) with `.trivyignore.yaml`.
  8. `Guard (no :latest)` — negative grep excluding comment lines.

**CD Pipeline (`.github/workflows/backend-cd.yml`):**
- Builds + pushes images, signs (cosign keyless), attests (SLSA L2), self-verifies.
- Permissions: `contents: read`, `packages: write`, `id-token: write` (OIDC for Fulcio), `attestations: write`.

**Nightly secret scan (`.github/workflows/secret-scan-full.yml`):**
- Cron `0 3 * * 0` (Sundays 03:00 UTC = 06:00 MSK) — full-history `gitleaks` + `trufflehog`.
- Manual trigger via `workflow_dispatch`.

**Infrastructure as Code (Phase 3):**
- **Ansible** at `infra/ansible/` — playbook `site.yml` runs roles `common`, `docker`, `ufw`, `sport-stack` against `app_servers` group.
- **Inventory:** `infra/ansible/inventory/prod/hosts.yml` pins `prod-app-01` → `148.253.214.156`, `ansible_user: deploy` (steady-state; bootstrap was `root`, root SSH now disabled per `D-20`).
- **Roles:**
  - `common` — base packages + SSH hardening (root SSH disabled via `sshd_config.d/99-hardening.conf`).
  - `docker` — Docker engine + compose v2.
  - `ufw` — OS-level firewall (replaces Hetzner Cloud Firewall per `D-24`); allows 22/TCP only from `dev_admin_ips: ["91.92.33.145/32"]`, plus 80/443 public.
  - `sport-stack` — orchestrates deploy: rsync `services/backend/` → `/opt/sport/services/backend/`, SOPS-decrypt to `/run/sport.env` (tmpfs, mode 0600), run migrations one-shot, install + start `sport-stack.service` (systemd umbrella), smoke probe loop (5×30s).
- Top-level rollback automation: `make rollback v=<tag>` (`Makefile:46-63`) — `git checkout` + `migrate down 1` over SSH + `ansible-playbook ... --tags sport-stack site.yml` + `curl` smoke.

**Helm (Kubernetes — deferred, scaffold only):**
- `services/backend/deploy/helm/identity/` — single-chart skeleton (`Chart.yaml` v0.1.0, `appVersion: "0.1.0"`). Not used in production; production runs Docker Compose under systemd per `D-25`. ROADMAP positions K8s as future state, not current.

**Hosting:**
- **Single VPS** at `148.253.214.156` (provider-agnostic per Phase 3 D-25 pivot away from Hetzner-specific tooling).
- Public hostnames via **sslip.io** wildcard DNS:
  - `148-253-214-156.sslip.io` — main API + admin dashboard (Caddy path-routes all backend services).
  - `s3.148-253-214-156.sslip.io` — MinIO presigned URL terminus (Caddy preserves Host header for S3 signature validation).
- TLS via Let's Encrypt ACME HTTP-01 challenge, email `hummetzadeismail8@gmail.com` (`infra/ansible/group_vars/all.yml:26`).

## Environment Configuration

**Required env vars (production, must be present in `/run/sport.env`):**
- `POSTGRES_PASSWORD` — Postgres `re` user.
- `JWT_SECRET` — ≥32 chars; consumed as `IDENTITY_JWT_SECRET` by every service.
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`.
- `CADDY_ACME_EMAIL`.
- `SPORT_STACK_TAG` — image tag for all 8 services (no `:latest` allowed).

**Optional env vars:**
- `EXPO_ACCESS_TOKEN` (notifications) — empty → push fanout disabled (`notifications/cmd/server/main.go:54-59`).
- `REALTIME_GW_DB_URL` — opt-in feature flag DB connection for realtime-gw.

**Secrets layout (SOPS-encrypted):**
- `.secrets/<env>/shared.yaml` — POSTGRES_PASSWORD, JWT_SECRET, MINIO_*, EXPO_ACCESS_TOKEN, CADDY_ACME_EMAIL.
- `.secrets/<env>/mapbox.yaml` — MAPBOX_PUBLIC_TOKEN, MAPBOX_SECRET_TOKEN.
- `.secrets/<env>/oauth.yaml` — STRAVA/GOOGLE/APPLE placeholders (v1.0).
- All decrypted to a single `/run/sport.env` file on tmpfs on the VPS by `infra/ansible/roles/sport-stack/tasks/decrypt_sops.yml`.

**Runtime location:**
- Secrets file: `/run/sport.env` (RAM-only tmpfs, `0600`, `deploy:deploy`) per `infra/ansible/roles/sport-stack/defaults/main.yml:7-9` (D-15).
- Deploy tree: `/opt/sport/services/backend/` (rsync-synced from controller worktree).
- Container project name pinned to `running-ecosystem` (`docker-compose.prod.yml:21`) so existing named volumes (`postgres_data`, `nats_data`, `minio_data`, `redis_data`, `caddy_data`, `caddy_config`) survive compose-file relocations.

## Webhooks & Callbacks

**Incoming:**
- None implemented in v1.0. Strava push-subscribe is planned (Phase 11/12 per `notifications/cmd/server/main.go:56` comment "HEALTH-04 Strava push") but no `/webhooks/strava` endpoint exists in the codebase or OpenAPI specs (`services/backend/api/*.yaml`).

**Outgoing:**
- **Expo Push** — `POST https://exp.host/--/api/v2/push/send` from `notifications` service (`expopush/client.go:24`).
- No other outbound webhook integrations.

**WebSocket terminus (not strictly a webhook):**
- `realtime-gw` at `:8090` accepts WebSocket upgrades via Caddy `/ws` route (`gateway/Caddyfile.prod:97-99`). Library: `github.com/coder/websocket@v1.8.13`. Subscribes per-connection to `rt.user.<userID>` NATS subject; writes JSON frames; 25s ping interval, 10s write timeout, 64 KB max client frame, 64-slot send buffer per `realtime-gw/internal/gw/connection.go:14-28`.

---

*Integration audit: 2026-05-18*
