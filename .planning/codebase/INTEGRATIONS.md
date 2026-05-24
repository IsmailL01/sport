# External Integrations

**Analysis Date:** 2026-05-23

## APIs & External Services

**Mapping:**
- **Mapbox** — primary tile/style/SDK provider. Mobile uses `@rnmapbox/maps@^10.3` (`apps/mobile-rn/package.json:20`); native `RNMapboxMapsImpl: mapbox` (`apps/mobile-rn/app.json:67`). Adapter quarantine: `apps/mobile-rn/src/map/` (direct imports outside this directory rejected by ESLint, `apps/mobile-rn/eslint.config.js:35-46`).
  - **Public token** (`pk.…`, `dev-public-v2`) — bundled with app via `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`; safe-by-restriction (Mapbox dashboard URL/bundle-ID restrictions per ADR-0006). Initialized at module level in `apps/mobile-rn/App.tsx:33-36` via `setMapboxAccessToken(...)` adapter call.
  - **Secret download token** (`sk.…`, scope `DOWNLOADS:READ`) — `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` / `MAPBOX_DOWNLOADS_TOKEN`; consumed only at Gradle build time (`apps/mobile-rn/android/build.gradle:27-44`) for `https://api.mapbox.com/downloads/v2/releases/maven`. Lives in `~/.gradle/gradle.properties` (mode 600) on dev machines + iOS `~/.netrc`. ESLint guards prevent any `EXPO_PUBLIC_*_SECRET` bundling or inline `sk.…` literals.
  - **Encrypted at-rest:** `.secrets/prod/mapbox.yaml` (SOPS).
  - History: see ADR-0006 (chat-with-AI leak incident → token rotated, SOPS discipline tightened).

**Push notifications:**
- **Expo Push Service** — `https://exp.host/--/api/v2/push/send` consumed by `services/backend/notifications/internal/expopush/client.go`. Token format: `ExponentPushToken[…]` / `ExpoPushToken[…]` (`services/backend/notifications/internal/service/svc.go:35`). Backend auth header from `EXPO_ACCESS_TOKEN` env (optional; if empty → fanout no-ops, `services/backend/notifications/cmd/server/main.go:69-73`). Mobile side: `expo-notifications` registers via `Notifications.getExpoPushTokenAsync({ projectId })`, project ID via `EXPO_PUBLIC_EXPO_PROJECT_ID` env or `app.json.extra.eas.projectId` (`apps/mobile-rn/src/notifications/adapters/ExpoNotificationsAdapter.ts:42-46`).
- **APNs / FCM** — not directly called; both abstracted by Expo Push. FCM credentials would be required for EAS production builds (notes in `ExpoNotificationsAdapter.ts:7-9`); not configured in `app.json` for v1.0.

**OAuth providers (scaffolded, not active in v1.0):**
- **Google** — stub, requires `EXPO_PUBLIC_GOOGLE_CLIENT_ID` + `expo-auth-session` package (not currently installed). See `apps/mobile-rn/src/auth/authProviders.ts:58-78` + ADR-0003.
- **Apple Sign In** — stub (iOS only), requires `expo-apple-authentication` (not installed). Same file.
- **Strava** — stub, `apps/mobile-rn/src/health/StravaAdapter.ts:41` reads `EXPO_PUBLIC_STRAVA_CLIENT_ID`.
- Encrypted secrets bucket exists for future activation: `.secrets/prod/oauth.yaml` (SOPS).

**Build / Release Services:**
- **Expo EAS Cloud Build** — triggered by `.github/workflows/android-release.yml` on tag push (`v1.0.0-beta.*` / `v1.0.0-rc.*`). Command: `eas build --platform android --profile production --non-interactive --no-wait`. Auth: `EXPO_TOKEN` GitHub secret → step env. eas-cli installed explicitly via `npm install -g eas-cli` (`.github/workflows/android-release.yml:101`) — replaced fragile `expo/expo-github-action@v8` per ADR-0012 root cause. Local dev eas-cli version: **19.0.6**. Build profiles in `apps/mobile-rn/eas.json` — `production` profile sets `android.buildType: app-bundle` + `RUNNING_ECO_RELEASE_STORE_FILE: release.keystore` + `RUNNING_ECO_RELEASE_KEY_ALIAS: runningecosystem-release`.
- **EAS project ID** — placeholder `TODO-eas-project-id-after-eas-init` in `apps/mobile-rn/app.json:74`. Real ID assigned by `eas init` (Phase 8 follow-up).

## Data Storage

**Databases (production, `services/backend/docker-compose.prod.yml`):**
- **PostgreSQL 16 + TimescaleDB 2.17.2** — single DB `running_ecosystem`, user `re`. Image: `timescale/timescaledb:2.17.2-pg16`. Internal hostname `postgres:5432`. NOT exposed externally.
  - Connection string template: `postgres://re:${POSTGRES_PASSWORD}@postgres:5432/running_ecosystem?sslmode=disable`
  - Driver (all Go services): `github.com/jackc/pgx/v5 v5.9.2`
  - Schema migrations: `services/backend/migrations/00xx_*.up.sql` / `*.down.sql` (22+ migrations covering users, activities, session_hr, social-graph, messaging, notifications, reactions, media, stories, feed_posts, moderation, xp_grades, auth_otp, featureflags, plus drill migrations `9990`/`9991`)
  - Runner: `migrate/migrate:v4.18.1` as one-shot init container (`services/backend/docker-compose.prod.yml:101-113`)
- **TimescaleDB extension** — enabled in `0000_extensions.up.sql`; used by `session_hr` + activity time-series. ClickHouse + dedicated Postgres-per-service from the original v1.0 plan were **dropped** per ADR-0011 lean-scope reset.
- **Redis 7-alpine** — rate-limit + presence + timeline cache + hot conversation cache. `--maxmemory 256mb --maxmemory-policy allkeys-lru --appendonly yes`. Consumed by `messaging`, `feed`, `social-graph` (`REDIS_URL=redis://redis:6379/0`) + `services/backend/pkg/ratelimit/ratelimit.go:45`.

**Embedded (mobile):**
- **SQLite** via `expo-sqlite ~16.0.10` — offline-first local data store (`apps/mobile-rn/package.json:37`). Tests use `better-sqlite3@12.10.0` (devDependency).
- **MMKV** via `react-native-mmkv@^4.3.1` + `react-native-nitro-modules@^0.35.6` — fast KV for settings, theme, feature flags. v4 API: `createMMKV()` (`apps/mobile-rn/src/state/settings.ts:3`, `apps/mobile-rn/src/state/featureflags.ts:19`, `apps/mobile-rn/src/design/ThemeProvider.tsx:20`). Native namespace `com.margelo.nitro.mmkv` (NOT `mrousavy`) per `apps/mobile-rn/android/app/proguard-rules.pro:33-40`.
- **SecureStore** via `expo-secure-store ~15.0.8` — auth tokens (`apps/mobile-rn/src/auth/tokenStorage.ts`).

**File Storage:**
- **MinIO** (S3-compatible) — image: `minio/minio:RELEASE.2025-01-20T14-49-07Z`. Bucket `media`, region `us-east-1` (synthetic). Internal: `minio:9000`. Public client access via Caddy reverse proxy at `https://s3.148-253-214-156.sslip.io` (preserves Host header so SigV4 presigned URLs validate). Consumed by `services/backend/media/` only — `media` service issues presigned URLs that the mobile client uses directly. Client lib: `github.com/minio/minio-go/v7@v7.0.78`.

**Caching:**
- **Redis** (see above) — only caching tier. No Memcached, no Varnish.

**Event Bus:**
- **NATS JetStream** — image `nats:2.11-alpine`, persistent file storage at `/data`, monitor port `8222`. Consumed by `activity-sync`, `feed`, `media`, `messaging`, `notifications`, `realtime-gw`, `social-graph` (`NATS_URL=nats://nats:4222`). Each service connects in its `cmd/server/main.go` via `nats.Connect(natsURL, ...)`. Used as cross-service async event bus + messaging outbox publisher.

## Authentication & Identity

**Auth Provider:** Custom — `services/backend/identity/` (Go service, port 8081).
- **Algorithm:** JWT HS256 via `github.com/golang-jwt/jwt/v5@v5.3.1`
- **Shared secret:** `IDENTITY_JWT_SECRET` env (required ≥32 chars in compose) — propagated to every backend service that validates tokens
- **Mobile flow:** email-OTP (already working, `apps/mobile-rn/src/auth/`); OAuth providers stubbed (ADR-0003)
- **Token storage (mobile):** `expo-secure-store` keychain/Keystore
- **API client:** `apps/mobile-rn/src/auth/apiClient.ts` → `${EXPO_PUBLIC_IDENTITY_URL}` / `${EXPO_PUBLIC_API_URL}` (defaults to Android emulator `http://10.0.2.2:8081`)
- **Routes (via gateway Caddy):** `/auth/*`, `/me` → `identity:8081`

## Monitoring & Observability

**Error Tracking:**
- **Sentry SaaS** (sentry.io) — **wired but dormant in v1.0** per ADR-0010 D-38. Backend SDK: `github.com/getsentry/sentry-go@v0.46.2` (`services/backend/pkg/observability/sentry_init.go`). Empty `SENTRY_DSN` → no-op + `slog.Info "observability.sentry: disabled — empty DSN"`. Activation post-v1.0 = SOPS edit `.secrets/prod/sentry.yaml` + redeploy. No mobile crash reporting (Phase 17 dropped per ADR-0011).
- **Per-service tagging convention:** single shared `prod-backend` project; `service` + `env` tags discriminate.

**Logs:**
- Stack: **Grafana Loki 3.2.0** on `srv1561293` (`82.25.71.215`), colocated with unrelated `niko-prod` per ADR-0010
- Shipper: **Grafana Alloy** deployed via Ansible role `infra/ansible/roles/alloy-shipper/` — `discovery.docker` + `loki.source.docker` pair scrapes container stdout on prod VPS
- Push endpoint: `https://82-25-71-215.sslip.io:8443/loki/api/v1/push` (self-signed TLS, `insecure_skip_verify: true` in Alloy config) — `infra/ansible/roles/alloy-shipper/defaults/main.yml:16`
- Caddy on `:8443` gates `/loki/api/v1/push` to prod-VPS source IP only via `@allowed_loki { remote_ip 148.253.214.156/32 }` matcher
- Format: structured slog with PII deny-list scrubbing in `services/backend/pkg/observability/slog_handler.go` + `pii_deny_list.go`
- CI guard: `scripts/pii_audit.sh` (`.github/workflows/backend-ci.yml:243`) — blocks PRs introducing `slog.*Context` calls with PII attribute keys (D-12 deny-list)

**Metrics:**
- **Prometheus v2.55.0** scraping all 8 backend services on `:8081-8090` `/metrics` endpoints — config at `services/backend/observability/prometheus.yml` (dev, `host.docker.internal`) and `services/backend/observability/prometheus.yml.j2` (Ansible-rendered for prod)
- Client lib: `github.com/prometheus/client_golang@v1.20.5` (`services/backend/pkg/observability/metrics.go`)
- 14-day retention on prod (`infra/observability-stack/docker-compose.yml:37` → `--storage.tsdb.retention.time=14d`)
- CI guard: `cardinality-probe` job (`.github/workflows/backend-ci.yml:251-296`) runs `scripts/cardinality_probe.py` to block PRs introducing forbidden labels (`user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`) or families exceeding 1000 series

**Tracing:**
- **OpenTelemetry v1.32.0** — OTLP HTTP exporter (`go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp`), `otelhttp` middleware wraps every service mux. PII-attribute scrub via `piiScrubProcessor` (referenced in `pkg/observability/sentry_init.go:25`). Trace export target wired to Sentry's OTLP ingest (correlation across logs/metrics/traces); dormant until SENTRY_DSN populated.

**Dashboards:**
- **Grafana 11.3.0** at `https://82.25.71.215:8443/grafana/` (basicauth, self-signed cert). Dashboards committed under `services/backend/observability/dashboards/` + provisioning at `infra/observability-stack/grafana/provisioning/`. Admin password via `GF_SECURITY_ADMIN_PASSWORD__FILE` reading `/run/secrets/admin_password` (mounted from `infra/observability-stack/grafana/secrets/`).

## CI/CD & Deployment

**Hosting:**
- Application stack: VPS `148.253.214.156` (`148-253-214-156.sslip.io`)
- Observability stack: VPS `srv1561293` / `82.25.71.215` (`82-25-71-215.sslip.io`)
- Container registry: **GHCR** (`ghcr.io/ismaill01/<service>:<sha|semver>`) — never `:latest` (D-15 / ROADMAP hard rule, enforced by `no-latest-tag-guard` job in both `backend-ci.yml:218-232` and `backend-cd.yml:134-148`)
- Mobile distribution: EAS Cloud Build artifacts (`.aab` for Android, Phase 8 plans iOS TestFlight)

**CI Pipeline (`.github/workflows/`):**

- **`backend-ci.yml`** — PR + push-to-main gate (paths: `services/backend/**`, `Makefile`, `.golangci.yml`, `.trivyignore.yaml`). Jobs (verbatim names — branch-protection contract per Plan 04-05):
  - `Test (Go 1.25)` — matrix over 9 modules, `go test -race -coverprofile`
  - `Lint (golangci-lint v2)` — `v2.5.0` pinned, per-module loop
  - `SAST (gosec)` — fail on HIGH
  - `Vuln (govulncheck)` — fail on any
  - `SAST (semgrep)` — `p/golang` + `p/owasp-top-ten`, ERROR severity
  - `Secrets (gitleaks + trufflehog — PR diff)` — diff-only, gitleaks-action@v2 + trufflehog@main
  - `Docker build (no push, verify)` — matrix over 8 services, BuildKit cache, then Trivy image scan (HIGH/CRITICAL → fail)
  - `Guard (no :latest)` — negative grep
  - `PII Audit (slog grep)` — `scripts/pii_audit.sh`
  - `Cardinality Probe (Prom labels)` — boots prod compose + runs `scripts/cardinality_probe.py`

- **`backend-cd.yml`** — push to `main` or any `v*` tag (paths-filtered for main, full for tags). Matrix over 8 services:
  - Builds + pushes to GHCR with tags `sha-<short>`, `<sha>`, `v<X.Y.Z>`, `v<X.Y>` (NEVER `:latest`)
  - **Cosign keyless signing** via Sigstore/Fulcio (`id-token: write` permission, OIDC → Fulcio cert → Rekor transparency log). `sigstore/cosign-installer@v3`
  - **SLSA L2 build provenance** via `actions/attest-build-provenance@v2` (LTS, NOT @v1)
  - `cosign-verify-smoke` job round-trips verify (`--certificate-identity-regexp 'https://github.com/IsmailL01/.*'` + `--certificate-oidc-issuer https://token.actions.githubusercontent.com`)
  - Per ADR-0011: cosign + SLSA kept as best-effort, not deploy-gating

- **`android-release.yml`** — tag-triggered (`v1.0.0-beta.*` / `v1.0.0-rc.*`):
  1. `actions/checkout@v4`, `actions/setup-node@v4` (Node 20, npm cache), `actions/setup-java@v4` (Temurin 17)
  2. Install SOPS 3.13.1 + yq (mikefarah)
  3. Restore CI age key from `secrets.SOPS_AGE_KEY_CI` → `~/.config/sops/age/keys.txt` (chmod 600)
  4. `sops -d .secrets/prod/mobile-signing.yaml` → extract base64 keystore + both passwords; emit `::add-mask::` directives **BEFORE** any `>> $GITHUB_ENV` write (per ADR-0012 P0 incident — bare `echo "X=$value" >> $GITHUB_ENV` does NOT engage log masker; only `${{ secrets.X }}` references auto-mask)
  5. `npm ci` (`apps/mobile-rn/`)
  6. `npm install -g eas-cli` (explicit, replaces `expo/expo-github-action@v8`)
  7. `eas build --platform android --profile production --non-interactive --no-wait` with `EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}`
  - Timeout: 30 min

- **`secret-scan-full.yml`** — cron `0 3 * * 0` (Sundays 03:00 UTC) + `workflow_dispatch`. `fetch-depth: 0` for full-history gitleaks + trufflehog. Diff-on-PR jobs live in `backend-ci.yml` (per RESEARCH Pitfall 10).

**Pre-commit:**
- `.pre-commit-config.yaml` (3.9KB) — local hook config
- `.gitleaks.toml` — additional gitleaks rules
- `.trufflehog/` — trufflehog config dir
- `.golangci.yml` — Go lint rules
- `.trivyignore.yaml` — Trivy CVE exceptions

**Deploy (production):**
- Ansible — `infra/ansible/site.yml` orchestrates roles `ufw`, `alloy-shipper`, plus deploy roles for the sport-stack umbrella systemd unit
- Image tag: `SPORT_STACK_TAG` env injected via `ansible-playbook -e sport_stack_tag=<tag>` (referenced in every `image:` line of `services/backend/docker-compose.prod.yml`)
- Branch protection: 10 required CI check contexts (Plan 04-05) — verbatim names from `backend-ci.yml` job `name:` fields

## Environment Configuration

**Secrets management:**
- **SOPS + age** — backend choice per Plan 02-01 / SEC-02 / `.sops.yaml`
- Recipients (`.sops.yaml:29-32`):
  - `DEV_A`: `age1ph7d4a62n9ngghvt5lzgh4eywfayzgrzx9mq6rfzpgp9sme0eg0snl33my`
  - `CI`: `age19ysu774h4crzynkpf9pjpe829cxt0e3ckgfmnkweag0h7dxmp4kqn9vswx` — private half lives in GitHub Actions secret `SOPS_AGE_KEY_CI`
- Encrypted files (committed):
  - `.secrets/prod/shared.yaml` — POSTGRES/JWT/MinIO/Expo/Caddy
  - `.secrets/prod/mapbox.yaml` — Mapbox pk + sk tokens
  - `.secrets/prod/oauth.yaml` — Google/Apple/Strava placeholders
  - `.secrets/prod/sentry.yaml` — Sentry DSN (currently empty per D-38)
  - `.secrets/prod/mobile-signing.yaml` — Android PKCS12 keystore (base64) + `keystore_password` + `key_password` (identical on PKCS12 by invariant; rotated 2026-05-22 per ADR-0012)
  - `.secrets/staging/*.yaml`, `.secrets/dev/*.yaml` — parallel sets
- **Rotation command** (non-destructive): `sops updatekeys .secrets/<env>/*.yaml`
- **gitattributes guard:** `.gitattributes` sets `-text` on `.secrets/**/*.yaml` to disable git 3-way merge driver on ciphertext (Pitfall 5)
- **Plaintext .env files** — gitignored; `apps/mobile-rn/.env.example` is the only committed template

**Required GitHub Actions secrets:**
- `SOPS_AGE_KEY_CI` — CI's age private key (restores to `~/.config/sops/age/keys.txt`)
- `EXPO_TOKEN` — EAS Cloud Build authentication
- `GITHUB_TOKEN` — auto-provisioned; used by GHCR login + gitleaks-action

**Critical env vars (production):**
- `POSTGRES_PASSWORD`, `JWT_SECRET` (≥32 chars), `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `CADDY_ACME_EMAIL`, `SPORT_STACK_TAG`
- Optional: `EXPO_ACCESS_TOKEN` (push fanout activation), `SENTRY_DSN` (Sentry activation)

## Webhooks & Callbacks

**Incoming:**
- None implemented in v1.0. OAuth callbacks (Strava/Google/Apple) would land at backend endpoints per ADR-0003 — deferred.

**Outgoing:**
- **Expo Push send** — POST `https://exp.host/--/api/v2/push/send` (`services/backend/notifications/internal/expopush/client.go`). Empty `EXPO_ACCESS_TOKEN` → no-op.
- **Mapbox tile fetch** — outbound HTTPS from mobile clients to Mapbox CDN; no server-side hop.
- **Let's Encrypt ACME HTTP-01** — Caddy on prod VPS port 80/443 (`services/backend/gateway/Caddyfile.prod:7-10` + `services/backend/docker-compose.prod.yml:298-302`)
- **GHCR push** — from GitHub Actions runner during `backend-cd.yml`
- **Sigstore Fulcio + Rekor** — cosign keyless signing path (dormant until next `backend-cd.yml` run)
- **Loki push** — Alloy on prod VPS → `https://82-25-71-215.sslip.io:8443/loki/api/v1/push` (cross-VPS, gated by Caddy `@allowed_loki` source-IP matcher)
- **Prometheus scrape** — Prometheus on obs VPS → prod-VPS service `/metrics` endpoints (reverse direction: scrape pull)

## Public Endpoints (prod VPS Caddy gateway)

- `https://148-253-214-156.sslip.io/auth/*`, `/me` → `identity:8081`
- `https://148-253-214-156.sslip.io/sessions[/*]` → `activity-sync:8082`
- `https://148-253-214-156.sslip.io/conversations[/*]`, `/messages/*` → `messaging:8083`
- `https://148-253-214-156.sslip.io/profiles[/*]`, `/search/users`, `/relations/*`, `/follows/*`, `/blocks/*`, `/reports[/*]`, `/admin/*` → `social-graph:8084`
- `https://148-253-214-156.sslip.io/stories[/*]`, `/posts[/*]`, `/feed/*` → `feed:8085`
- `https://148-253-214-156.sslip.io/uploads[/*]`, `/media/*` → `media:8086`
- `https://148-253-214-156.sslip.io/devices[/*]`, `/notifications[/*]`, `/preferences` → `notifications:8087`
- `wss://148-253-214-156.sslip.io/ws` → `realtime-gw:8090`
- `https://148-253-214-156.sslip.io/admin` → static admin dashboard (`services/backend/gateway/admin/`)
- `https://s3.148-253-214-156.sslip.io` → `minio:9000` (presigned-URL host, preserves Host header for SigV4)

---

*Integration audit: 2026-05-23*
