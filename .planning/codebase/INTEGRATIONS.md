# External Integrations

**Analysis Date:** 2026-05-25

Single-VPS production (148.253.214.156, sslip.io) + colocated observability host (srv1561293, 82.25.71.215). All inbound TLS via Caddy + Let's Encrypt. Closed-beta scope per ADR-0011 — OAuth providers + Sentry remain dormant. Phase 8 distribution code shipped but parked behind two env gates: `EXPO_PUBLIC_UPDATE_MANIFEST_URL` (mobile) and `DISTRIBUTE_ENABLED` derived from `MINIO_RELEASES_ACCESS_KEY` (CI) — see ADR-0011 Amendment 5.

## APIs & External Services

**Mapping:**
- **Mapbox** — vector tiles + offline regions + map style
  - Mobile SDK: `@rnmapbox/maps` ^10.3.0 (quarantined inside `apps/mobile-rn/src/map/`; ESLint `no-restricted-imports` blocks direct imports elsewhere per `apps/mobile-rn/eslint.config.js:34-46`)
  - Maven repo: `https://api.mapbox.com/downloads/v2/releases/maven` wired in `apps/mobile-rn/android/build.gradle:27-43` (auth no longer required — Mapbox dropped download-token requirement; optional via `MAPBOX_DOWNLOADS_TOKEN`)
  - Public token (pk.): `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — read in `apps/mobile-rn/App.tsx:35`, applied via `setMapboxAccessToken()` (re-exported from `apps/mobile-rn/src/map/index.ts`). NOW INJECTED INTO BOTH release AND debug-APK CI pipelines via the GH Secret of the same name (added 2026-05-24, auto-masked by GH Actions).
  - Secret token (sk.): server-side use only — never bundled (ESLint `no-restricted-syntax` blocks `Literal /^sk\.[A-Za-z0-9._-]{40,}/` per `eslint.config.js:55-59`)
  - Storage: `.secrets/prod/mapbox.yaml` (SOPS) — unchanged since Plan 06-01

**Build/Distribution:**
- **Expo EAS Cloud Build** — Android .aab build farm
  - Project: `running-ecosystem-mobile`, projectId `a9f8e26f-bd3f-4296-b67e-21909721132c`, owner `qqweasdf` (`apps/mobile-rn/app.json:87-92`)
  - Auth: `EXPO_TOKEN` GitHub Actions secret
  - Workflow: `.github/workflows/android-release.yml` (tag-triggered `v1.0.0-beta.*` | `v1.0.0-rc.*`)
  - **Phase 8 change** — `--no-wait` flag DROPPED (Pitfall 16 / Plan 08-01 Task 4 line `.github/workflows/android-release.yml:147-156`). Workflow now BLOCKS until EAS finishes (~15 min wall-clock). `--json` mode emits `artifactUrl` + `versionCode` parsed via `jq`.
  - Credentials: `production.android.credentialsSource: "local"` (`apps/mobile-rn/eas.json:36`). `apps/mobile-rn/credentials.json` generated in CI from SOPS-decrypted passwords + `release.keystore` path (gitignored; lifetime = job duration)
  - Resource class: `m-medium` (`apps/mobile-rn/eas.json:32`)
  - .aab → universal APK extraction: bundletool 1.18.1 jar in `.github/workflows/android-release.yml:177-203` (`bundletool build-apks --mode=universal` then `unzip -p universal.apk`) — GATED behind `DISTRIBUTE_ENABLED`.

- **GitHub Actions debug-APK build** — NEW dev-loop pipeline (`.github/workflows/android-debug-apk.yml`, added 2026-05-24)
  - Trigger: `workflow_dispatch` (manual button) + `push` to `main` or `feat/cursona-redesign` when `apps/mobile-rn/**` or the workflow file changes
  - No EAS dependency — pure local Gradle (`./gradlew :app:assembleDebug`) on GH-hosted ubuntu-latest
  - ABIs: `arm64-v8a` + `x86_64` (BlueStacks/emulator-friendly via `-PrunningEcoAbiFilters`)
  - Signing: `debug.keystore` (committed, stable SHA-256 cert)
  - Output: `app-debug-<sha>` artifact (`app-debug.apk`, ~80-120MB universal, 14-day retention)
  - Use cases: BlueStacks loop without Metro, ad-hoc internal tester APK sharing, smoke checks
  - Env injection: `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (required; job exits 1 if unset) + hardcoded `EXPO_PUBLIC_IDENTITY_URL` + `EXPO_PUBLIC_SYNC_URL` pointing at sslip.io. `EXPO_PUBLIC_UPDATE_MANIFEST_URL` LEFT UNSET on purpose so the auto-update path returns `state: 'disabled'` (ADR-0011 Amendment 5).
  - NOT a substitute for production-signed pocket-walk validation (Plan 07-03) — production keystore not used.

**Push:**
- **Expo Push Notifications** — backend → device
  - Service: `services/backend/notifications/` Go module
  - Client: `services/backend/notifications/internal/expopush/client.go`
  - Auth: `EXPO_ACCESS_TOKEN` env var passed through `services/backend/docker-compose.prod.yml:191` (optional — empty default per `${EXPO_ACCESS_TOKEN:-}`)

**OAuth providers (DORMANT):**
- STRAVA / GOOGLE / APPLE Sign-In — placeholders only in v1.0
- `.secrets/prod/oauth.yaml` contains placeholder values with literal `<…>` (e.g., `APPLE_SIGN_IN_CLIENT_SECRET=<deferred-v1.1>`)
- Root `Makefile:73-76` explicitly handles the `<…>` placeholder breaking `set -a; . file` sourcing during rollback — uses `grep` to extract only `POSTGRES_PASSWORD`

## Data Storage

**Databases:**
- **PostgreSQL 16 + TimescaleDB 2.17.2** — primary OLTP
  - Image: `timescale/timescaledb:2.17.2-pg16` (`services/backend/docker-compose.prod.yml:25`)
  - Connection (per-service env): `<SVC>_DB_URL` → `postgres://re:${POSTGRES_PASSWORD}@postgres:5432/running_ecosystem?sslmode=disable`
  - Driver: `github.com/jackc/pgx/v5` v5.9.2 in all services
  - Migrations: `services/backend/migrations/` — 38 files (`0000`–`0020` numbered + `9990`/`9991` drill migrations for CICD-04). Run via `migrate/migrate:v4.18.1` init container (`docker-compose.prod.yml:101-113`)
  - Mobile: NOT used directly (`apps/mobile-rn/src/auth/apiClient.ts` always goes through HTTP to backend)
- **SQLite** — mobile local persistence
  - Mobile: `expo-sqlite` ~16.0.10 (storage live in `apps/mobile-rn/src/storage/`)
  - Dev/test: `better-sqlite3` 12.10.0 (`apps/mobile-rn/package.json:61`)
- **Redis 7** — rate limiting, presence, hot conversation/feed cache
  - Image: `redis:7-alpine`, 256MB memory cap, `allkeys-lru` eviction, AOF on
  - Consumers: `messaging`, `feed`, `social-graph` (via `REDIS_URL: redis://redis:6379/0`)

**File Storage:**
- **MinIO** — S3-compatible object storage
  - Image: `minio/minio:RELEASE.2025-01-20T14-49-07Z`
  - Internal endpoint: `minio:9000` (compose network)
  - **Public endpoint via Caddy reverse-proxy:** `s3.148-253-214-156.sslip.io` — wired in `services/backend/gateway/Caddyfile.prod:15-23` (`reverse_proxy minio:9000`). Caddy v2 preserves Host header so MinIO signature validation works.
  - Buckets:
    - `media` — Phase B3 media (presigned URLs from `services/backend/media/`)
    - `android-releases` — **PRIVATE**, holds APKs as `<tag>.apk` (e.g., `v1.0.0-beta.5.apk`). Distribution via 24h presigned URLs generated by `mc share download --expire 24h` (Plan 08-01 Task 2 / `scripts/release-distribute.sh:60-63`). **WRITE PATH GATED** by `DISTRIBUTE_ENABLED` per ADR-0011 Amendment 5 — bucket exists, but CI does not upload while `MINIO_RELEASES_ACCESS_KEY` is unset.
    - `android-manifest` — **PUBLIC-READ**, holds signed `manifest.json` (Ed25519-signed; mobile fetches via `GET https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json` in `apps/mobile-rn/src/update/manifestCheck.ts:25-26`). Also gated on the write side; mobile read path additionally gated by `EXPO_PUBLIC_UPDATE_MANIFEST_URL` being non-empty.
  - Service-account auth (CI uploads): `MINIO_RELEASES_ACCESS_KEY` + `MINIO_RELEASES_SECRET_KEY` — GitHub Actions secrets, scoped to both `android-releases` + `android-manifest`. **CURRENTLY UNSET** (intentional, per ADR-0011 Amendment 5) → `DISTRIBUTE_ENABLED=false` → distribution steps skip via `if: env.DISTRIBUTE_ENABLED == 'true'`.
  - Atomicity contract (CONTEXT D-21): in `scripts/release-distribute.sh`, manifest is uploaded LAST. If APK upload / signing / round-trip verify fails, no manifest update propagates → clients never see broken pointer.
  - Media service env: `S3_ENDPOINT: s3.148-253-214-156.sslip.io`, `S3_ENDPOINT_INTERNAL: minio:9000`, `S3_BUCKET: media`, `S3_REGION: us-east-1` (`docker-compose.prod.yml:163-170`); SDK `github.com/minio/minio-go/v7` v7.0.78

**Messaging/Events:**
- **NATS JetStream** — async events bus
  - Image: `nats:2.11-alpine`, persistent file storage, 7d retention, monitoring on :8222
  - Connection: `NATS_URL: nats://nats:4222`
  - SDK: `github.com/nats-io/nats.go` v1.39.1
  - Consumers: `activity-sync`, `feed`, `messaging`, `notifications`, `realtime-gw`, `social-graph`

## Authentication & Identity

**Internal:**
- Custom JWT-based identity service — `services/backend/identity/`
  - HTTP server with OTP-driven flows in `services/backend/identity/internal/handler/otp.go` + `service/auth.go`
  - JWT signing/verification: `github.com/golang-jwt/jwt/v5` v5.3.1
  - Shared secret: `IDENTITY_JWT_SECRET` (≥32 chars enforced via `${JWT_SECRET:?need JWT_SECRET >=32 chars}` in compose). All 7 downstream services consume the same secret for JWT verification.
- Mobile client: `apps/mobile-rn/src/auth/apiClient.ts` — fetch-based HTTP client, auto-refresh on 401, intercepts 426 (Upgrade Required) → `useForceUpdateStore` (REL-02 blocking Modal)
- Token storage (mobile): `expo-secure-store` via `apps/mobile-rn/src/auth/tokenStorage.ts` (Keychain/Keystore-backed)

**OAuth (DORMANT):** Strava / Google / Apple — schema present (`.secrets/prod/oauth.yaml`), no live wiring per ADR-0011.

## Monitoring & Observability

**Error tracking:**
- **Sentry** — sentry-go SDK present but DORMANT
  - SDK: `github.com/getsentry/sentry-go` v0.46.2
  - Bootstrap: `services/backend/pkg/observability/sentry_init.go:1-35`
  - **D-38 dormant-by-design path:** empty DSN → `slog.Info "observability.sentry: disabled — empty DSN"` + return no-op shutdown closure. Activation = SOPS edit `.secrets/prod/sentry.yaml` to populate DSN + redeploy (no code change). Per ADR-0010 + D-38.
  - Single shared `prod-backend` project (RESEARCH §1.9) — discriminated via `SetTag("service", ...)` + `SetTag("env", ...)`
  - Closed-beta sample rate: `TracesSampleRate = 1.0`

**Metrics:**
- **Prometheus** v2.55.0 — image `prom/prometheus:v2.55.0` in `infra/observability-stack/docker-compose.yml:22-40`
  - Lives on observability host (srv1561293, 82.25.71.215) — separate from prod VPS, colocated with niko-prod
  - Bound to 127.0.0.1:9090; public access via Caddy :8443 self-signed (`--web.external-url=https://82.25.71.215:8443/prometheus/`)
  - Retention: 14d (`--storage.tsdb.retention.time=14d`)
  - Each backend service exposes `/metrics` via `github.com/prometheus/client_golang` v1.20.5
  - CI cardinality probe: `scripts/cardinality_probe.py` (stdlib only) — blocks PR merge if a metric exposes a forbidden label (user_id / session_id / device_id / external_uuid / email / phone) OR if any family exceeds 1000 series (Phase 5 / OBS-07 / D-18)

**Logs:**
- **Loki** v3.2.0 — image `grafana/loki:3.2.0`, 512m mem cap, bound to 127.0.0.1:3100
- Ingestion via structured `slog` from `services/backend/pkg/observability/`. PII deny-list (D-12) enforced both at emit time (slog handler drops PII attrs) AND at PR-merge time via `scripts/pii_audit.sh` (Phase 5 / OBS-06 / D-14)

**Dashboards:**
- **Grafana** v11.3.0 — image `grafana/grafana:11.3.0`, 768m mem cap, host:3030 → container:3000 (3000 owned by niko-prod-frontend on same host)
- Auth: `admin` user + password from `/run/secrets/admin_password` file mount, `GF_AUTH_ANONYMOUS_ENABLED: "false"`
- Sub-path served: `GF_SERVER_ROOT_URL: https://82.25.71.215:8443/grafana/` + `GF_SERVER_SERVE_FROM_SUB_PATH: "true"`
- Provisioning: `infra/observability-stack/grafana/provisioning/`

**Tracing:**
- OpenTelemetry — `go.opentelemetry.io/otel` v1.43.0 + `otel/sdk` v1.43.0 + OTLP HTTP exporter v1.43.0 + `otelhttp` instrumentation v0.68.0. **Bumped from v1.32.0 → v1.43.0** in `services/backend/pkg/go.mod` (commit between `ac76df0` and HEAD). Indirect bumps follow: `proto/otlp v1.5.0 → v1.10.0`, `google.golang.org/grpc v1.71.x → v1.80.0`.
- HTTP middleware: `OtelHTTPMiddleware` in `services/backend/pkg/observability/sentry_init.go` (paired with sentry recovery + promhttp in chain documented at lines 27-32)
- PII-attribute scrub in TracerProvider's `piiScrubProcessor` (see `services/backend/pkg/observability/otel_init.go`)

## CI/CD & Deployment

**Hosting:**
- Production VPS (148.253.214.156) — `services/backend/docker-compose.prod.yml` under systemd sport-stack umbrella at `/opt/sport/services/backend/`. Env file `/run/sport.env`. Image tags pinned via `${SPORT_STACK_TAG:?...}` per service in compose. 8 services healthy on 2026-05-25 probe.
- Observability VPS (srv1561293, 82.25.71.215) — `infra/observability-stack/docker-compose.yml` colocated with niko-prod, Caddy :8443 self-signed.
- Container registry: `ghcr.io/ismaill01/<service>` (lowercase intentional — GHCR namespace = lowercase user). Tag conventions enforced via `.github/workflows/backend-cd.yml`:
  - `:<sha>` (always)
  - `:sha-<short-sha>` (Docker convention)
  - `:vX.Y.Z` (tag pushes only)
  - `:vX.Y` (semver major.minor on tag pushes)
  - **NEVER `:latest`** — hard rule (`no-latest-tag-guard` job in both CI and CD; D-15)
- Cosign keyless signing via Sigstore/Fulcio + Rekor (OIDC token from GH Actions `id-token: write`). Verified in `cosign-verify-smoke` job.
- SLSA L2 build provenance via `actions/attest-build-provenance@v2` (LTS).

**CI Pipelines:**

`.github/workflows/backend-ci.yml` (PR + push-to-main on `services/backend/**`):
- `Test (Go 1.25)` — `go test -race -coverprofile=coverage.out` matrix across 9 modules (toolchain auto-resolves to 1.25.10)
- `Lint (golangci-lint v2)` — pinned v2.5.0, per-module loop (services/backend is workspace-root with `go.work` but no `go.mod`)
- `SAST (gosec)` — `gosec -severity high`, blocks HIGH per D-10
- `Vuln (govulncheck)` — per-module loop, blocks on findings
- `SAST (semgrep)` — `returntocorp/semgrep` container, configs `p/golang` + `p/owasp-top-ten`, `--severity ERROR --error`
- `Secrets (gitleaks + trufflehog — PR diff)` — PR-only; full-history runs in cron
- `Docker build (no push, verify)` — buildx + Trivy image scan, HIGH+CRITICAL block, `.trivyignore.yaml` exceptions
- `Guard (no :latest)` — negative grep
- `PII Audit (slog grep)` — `scripts/pii_audit.sh`, Phase 5 / OBS-06 / D-14
- `Cardinality Probe (Prom labels)` — boots compose stack, polls /metrics, runs `scripts/cardinality_probe.py`

`.github/workflows/backend-cd.yml` (push to main on `services/backend/**` OR `v*` tag):
- `Publish ${service}` matrix × 8 services — buildx push to ghcr.io
- Cosign keyless sign each image
- SLSA L2 attestation pushed to registry
- `Cosign verify smoke` (CICD-02 self-check)
- `Guard (no :latest in CD outputs)`

`.github/workflows/android-release.yml` (tag-triggered `v1.0.0-beta.*` | `v1.0.0-rc.*`):
- Setup: Node 20 + JDK 17 (temurin) + SOPS 3.13.1 + yq
- Restore CI age key from `SOPS_AGE_KEY_CI` secret → `~/.config/sops/age/keys.txt`
- **Decrypt mobile-signing bundle** (`.secrets/prod/mobile-signing.yaml`): base64 keystore → `apps/mobile-rn/android/app/release.keystore`; passwords via `::add-mask::` BEFORE `$GITHUB_ENV` write (per ADR-0012 P0 incident response 2026-05-22)
- Generate `apps/mobile-rn/credentials.json` (gitignored) inline via `jq -n`
- `npm ci` (mobile) + explicit `npm install -g eas-cli`
- EAS build (blocks until done; `--json` mode → `artifactUrl` + `versionCode`)
- **Gate computation:** `DISTRIBUTE_ENABLED: ${{ secrets.MINIO_RELEASES_ACCESS_KEY != '' && 'true' || 'false' }}` — when the secret is unset (current state per ADR-0011 Amendment 5), all distribution steps below skip via `if: env.DISTRIBUTE_ENABLED == 'true'`
- **Plan 08-01 Task 4 distribution steps (GATED):**
  - Install `bundletool` 1.18.1 jar + `mc` (MinIO client) latest
  - Download .aab + extract universal APK via `bundletool build-apks --mode=universal` → unzip
  - Decrypt manifest-signing key (`.secrets/prod/manifest-signing.yaml`); private value masked
  - Run `bash scripts/release-distribute.sh /tmp/build.apk "${GITHUB_REF_NAME}" "${version_code}"`:
    1. `mc alias set sport-prod` against `https://s3.148-253-214-156.sslip.io`
    2. Compute APK sha256 + size; upload to `android-releases` bucket
    3. `mc share download --expire 24h` → presigned URL
    4. `go run scripts/sign-manifest.go` — Ed25519-sign canonical manifest (alphabetical struct field declaration matches mobile `Object.keys().sort()` for byte-identity)
    5. `go run scripts/verify-manifest.go` — self-verify
    6. Upload manifest LAST to `android-manifest` (atomicity per D-21)
    7. Re-fetch + re-verify (catches MinIO-side corruption)

`.github/workflows/android-debug-apk.yml` (NEW 2026-05-24; workflow_dispatch + push to `main` | `feat/cursona-redesign` when `apps/mobile-rn/**` changes):
- Setup: Node 22 + JDK 17 temurin + Gradle cache
- Writes `apps/mobile-rn/.env` with `EXPO_PUBLIC_IDENTITY_URL` + `EXPO_PUBLIC_SYNC_URL` (sslip.io) + `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (from masked secret). `EXPO_PUBLIC_UPDATE_MANIFEST_URL` deliberately omitted (gate closed).
- Build: `./gradlew :app:assembleDebug -PrunningEcoAbiFilters="arm64-v8a,x86_64" -PreactNativeArchitectures="arm64-v8a,x86_64" -PrunningEcoEmbedJSInDebug=true --no-daemon`
- Output: `app-debug.apk` uploaded as `app-debug-${{ github.sha }}` artifact (14-day retention, `if-no-files-found: error`)
- Signing: `debug.keystore` (committed) → stable cert SHA-256

`.github/workflows/secret-scan-full.yml` (cron Sun 03:00 UTC = 06:00 MSK):
- gitleaks-action@v2 + trufflehog full-history scan (fetch-depth: 0 — Pitfall 10: never on every PR)
- Manual trigger via `gh workflow run secret-scan-full.yml`

**Required GitHub Actions secrets:**
- `EXPO_TOKEN` — Expo authentication for `eas build`
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` — NEW 2026-05-24; auto-masked when read; consumed by `android-debug-apk.yml` (required, fails fast if unset) + optionally injectable into `android-release.yml`. Same pk.* token also lives in `.secrets/prod/mapbox.yaml` for SOPS-edit workflows.
- `SOPS_AGE_KEY_CI` — CI age private key (lifted Plan 07-01 commit `dd0dce5`); public half is recipient in `.sops.yaml:23` (`age19ysu774h4...`)
- `MINIO_RELEASES_ACCESS_KEY` + `MINIO_RELEASES_SECRET_KEY` — Plan 08-01 Task 2; MinIO service-account scoped to `android-releases` (private) + `android-manifest` (public-read) buckets. **CURRENTLY UNSET** (per ADR-0011 Amendment 5) → `DISTRIBUTE_ENABLED=false` → distribution steps skip.
- `GITHUB_TOKEN` — standard, for gitleaks-action PR comments + GHCR push
- `runningecosystem-release` keystore-related secrets — release.keystore password material is stored inside `.secrets/prod/mobile-signing.yaml` (SOPS), decrypted in-CI; not stored as raw GH Secrets.
- (NOT set, intentional) `GITLEAKS_LICENSE` — repo is personal account (IsmailL01/sport), license NOT required; license needed only if namespace = organization

## Environment Configuration

**Required env vars (production):**
- `POSTGRES_PASSWORD`, `JWT_SECRET` (≥32 chars), `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `CADDY_ACME_EMAIL` (compose-enforced via `${VAR:?need VAR}`)
- `SPORT_STACK_TAG` — image tag pin (set via `ansible-playbook -e sport_stack_tag=<v>`)
- `EXPO_ACCESS_TOKEN` (optional; notifications service)

**Required env vars (mobile build, via EAS or local Gradle):**
- `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (required for both release + debug-APK paths; debug-APK CI fails fast if unset)
- `EXPO_PUBLIC_IDENTITY_URL`, `EXPO_PUBLIC_SYNC_URL`, `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_UPDATE_MANIFEST_URL` — Plan 08-01; **GATED OFF** in production (ADR-0011 Amendment 5). When unset/empty, `apps/mobile-rn/src/update/manifestCheck.ts` returns `{ state: 'disabled' }` without any network call.
- `RUNNING_ECO_RELEASE_STORE_FILE`, `RUNNING_ECO_RELEASE_STORE_PASSWORD`, `RUNNING_ECO_RELEASE_KEY_ALIAS`, `RUNNING_ECO_RELEASE_KEY_PASSWORD` (signing — Gradle reads via `findProperty`; release pipeline only)
- `MANIFEST_SIGNING_PRIVATE`, `MANIFEST_SIGNING_PUBLIC` (Plan 08-01 Task 5; private masked via `::add-mask::`; consumed only when `DISTRIBUTE_ENABLED=true`)

**Secrets location:**
- SOPS-encrypted YAML bundles in `.secrets/{dev,staging,prod}/*.yaml` (committed to git; ciphertext only)
- Age recipients DEV_A + CI configured in `.sops.yaml`; DEV_B TODO
- Plaintext NEVER committed — `.gitleaks.toml` + `.trufflehog/` + `.gitattributes` (with `-text` on ciphertext to disable git 3-way merge)
- Pre-commit hooks via `.pre-commit-config.yaml` (includes detect-secrets in addition to gitleaks)

**Webhooks & Callbacks:**

**Incoming:**
- `/healthz` on gateway (`services/backend/gateway/Caddyfile.prod:39-41`)
- Per-service HTTP endpoints — addresses listed in compose env:
  - `identity`: `:8081`
  - `activity-sync`: `:8082`
  - `messaging`: `:8083`
  - `social-graph`: `:8084`
  - `feed`: `:8085`
  - `media`: `:8086`
  - `notifications`: `:8087`
  - `realtime-gw`: `:8090` (WebSocket)
- All 8 backend services + Postgres + Redis + NATS + MinIO + gateway healthy on 2026-05-25 probe via `https://148-253-214-156.sslip.io/healthz`.
- Caddy gateway routes `148-253-214-156.sslip.io/*` + `s3.148-253-214-156.sslip.io/*` (MinIO proxy)
- Mobile deep-link scheme: `runningecosystem://` (`apps/mobile-rn/android/app/src/main/AndroidManifest.xml:29-34`)

**Outgoing:**
- Mobile → Mapbox CDN (tiles, styles)
- Mobile → backend Caddy (`https://148-253-214-156.sslip.io/`) — all API traffic
- Mobile → MinIO via Caddy (`https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json`) — Plan 08-01 update check (no auth; public-read bucket). **GATED OFF** at runtime when `EXPO_PUBLIC_UPDATE_MANIFEST_URL` is unset (current closed-beta state).
- Mobile → MinIO presigned URL (`https://s3.148-253-214-156.sslip.io/android-releases/<tag>.apk?...`) — 24h expiry, used by `Linking.openURL(manifest.apk_url)` in `apps/mobile-rn/src/update/UpdateBanner.tsx`. Reached only after update check returns `state: 'update-available'` → also gated.
- Backend notifications → Expo Push API (with optional `EXPO_ACCESS_TOKEN`)
- CI → GHCR (`ghcr.io/ismaill01/*`)
- CI → Sigstore/Fulcio (OIDC) + Rekor transparency log
- CI → MinIO (`s3.148-253-214-156.sslip.io`) via `mc` for APK + manifest upload (gated)
- CI → EAS Cloud (`expo.dev`) for .aab build trigger (release pipeline only; debug-APK pipeline is local Gradle, no EAS)

## OEM/Vendor Integrations (Plan 07-03 Task 3+4)

Vendor-killer mitigation (foreground-service stoppage on Xiaomi MIUI / Samsung One UI):
- Detection: `apps/mobile-rn/src/vendor/oem.ts` reads `expo-device` `Device.manufacturer` → returns `'xiaomi' | 'samsung' | 'huawei' | 'generic'` (HyperOS bucketed under Xiaomi; EMUI/HarmonyOS detected but deferred per CONTEXT D-17)
- Deep-link intents fired via `expo-intent-launcher` in `apps/mobile-rn/src/vendor/openOEMSettings.ts`:
  - Xiaomi: `miui.intent.action.APP_PERM_EDITOR` with `extra_pkgname` extra
  - Samsung: `com.samsung.android.sm.ACTION_BATTERY`
  - Default: `ActivityAction.APPLICATION_DETAILS_SETTINGS` with `data: package:com.runningecosystem.mobile`
- First-launch dialog: `apps/mobile-rn/src/vendor/AutostartDialog.tsx` (Modal with MMKV one-shot flag)

## Android Foreground Notifications (Plan 07-03 Task 2)

- File: `apps/mobile-rn/src/foreground/notification.ts`
- Channel: `recording`, importance `AndroidImportance.LOW`, `lockscreenVisibility: PUBLIC`, no sound/vibration
- Sticky notification id `recording-status`; 5000ms tick from `setInterval` while `useActivityStore.state === 'recording'`
- Body: RU-formatted "Запись пробежки активна — %duration% • %distance%" — duration derived from `now - startedAt`, distance from `totalDistance(points)` (util/geo)
- iOS no-op (Platform.OS guard) — iOS uses SLC + UIBackgroundModes; deferred per ADR-0011 Amendment 3

## Manifest-Driven Auto-Update (Plan 08-01 Task 5 — code shipped, runtime GATED)

**Gate posture:** Code is fully shipped but runtime-disabled by both mobile (`EXPO_PUBLIC_UPDATE_MANIFEST_URL` unset → `state: 'disabled'` early return) and CI (`DISTRIBUTE_ENABLED=false` → publish steps skip). Per ADR-0011 Amendment 5 — NOT a tech-stack removal, just a closed-beta gate.

- Trigger: `apps/mobile-rn/src/update/useUpdateCheckOnForeground.ts` wires `AppState 'active'` listener + initial fire; calls `checkForUpdate()` in `apps/mobile-rn/src/update/manifestCheck.ts` (6h throttle; force-bypass for manual "Проверить обновления" tap)
- Fetch: `GET https://s3.148-253-214-156.sslip.io/android-manifest/manifest.json` (only when `EXPO_PUBLIC_UPDATE_MANIFEST_URL` resolves non-empty)
- Validation: `apps/mobile-rn/src/update/manifestSchema.ts` — hand-rolled (no zod; ~30 KB saved). Regexes for sha256/semver/RFC3339/url/Ed25519 base64 sig
- Signature: `apps/mobile-rn/src/update/manifestSigning.ts` — `@noble/ed25519` with `@noble/hashes/sha2.js` SHA-512 wired explicitly. Public key HARDCODED (`MANIFEST_PUBKEY_BASE64 = 'rDfoNbDp88ls1yoiuuKONsJ/PdstLOrioQqvXYIA40I='`); rotation = ship new app version
- Canonical JSON: keys sorted via `Object.keys().sort()`, signature field excluded — must match `scripts/sign-manifest.go` `Manifest` struct alphabetical field declaration byte-for-byte
- Replay protection: persists `installedReleasedAt` in MMKV; rejects manifest with older `released_at`
- Dispatch (CONTEXT D-11):
  - `min_supported_version > installed` → `useForceUpdateStore` blocking Modal (REL-02)
  - `version > installed` → `useUpdateBannerStore` (non-blocking banner in `TrackerStartScreen`, `JournalScreen`, `SettingsScreen` per Plan 08-01 Task 6)
  - else → silent
- Failure mode: silent (no toast); `console.warn` only in `__DEV__` (CONTEXT D-13)

---

*Integration audit: 2026-05-25*
