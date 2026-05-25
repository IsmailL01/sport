# Technology Stack

**Analysis Date:** 2026-05-25

Monorepo layout — mobile (Expo React Native) + backend (Go workspace, 8 microservices + shared `pkg/`) + infra (Ansible + observability stack) + scripts (mixed Go + Bash + Python).

## Languages

**Primary:**
- TypeScript ~5.9.2 — `apps/mobile-rn/` (Expo RN app, `strict: true` per `apps/mobile-rn/tsconfig.json`)
- Go 1.25.10 — `services/backend/` (9 modules in `services/backend/go.work`; bumped from 1.25.0 in commit `69cc8eb` 2026-05-25)
- Kotlin — bare Android shell: `apps/mobile-rn/android/app/src/main/java/com/runningecosystem/mobile/MainActivity.kt` + `MainApplication.kt`

**Secondary:**
- Bash — CI scripts (`scripts/release-distribute.sh`, `scripts/debug-tail.sh`, `scripts/deploy_observability_stack.sh`, `scripts/pii_audit.sh`)
- Python (stdlib only, no pip) — observability probes (`scripts/cardinality_probe.py`, `scripts/smoke_grafana_alerts.py`, `scripts/smoke_metrics.py`, `scripts/smoke_observability_stack.py`, `scripts/pii_live_probe.py`)
- Go (script form) — manifest signing/verification: `scripts/sign-manifest.go`, `scripts/verify-manifest.go` (invoked via `go run` from `scripts/release-distribute.sh`; Phase 8 code parked behind `DISTRIBUTE_ENABLED` gate per ADR-0011 Amendment 5)
- SQL — `services/backend/migrations/` (40 files; was 38 — added `0022_friend_requests.up.sql` + `.down.sql` for Phase 10 / ADR-0011 Amendment 6 on 2026-05-25)
- Groovy/Gradle DSL — `apps/mobile-rn/android/build.gradle` + `apps/mobile-rn/android/app/build.gradle`

## Runtime

**Mobile:**
- Node.js 20 (release CI: `.github/workflows/android-release.yml` step "Setup Node"); Node 22 in `.github/workflows/android-debug-apk.yml` (dev-build APK pipeline, NEW 2026-05-24)
- Hermes JS engine (Android — `apps/mobile-rn/android/gradle.properties:42` `hermesEnabled=true`); JSC fallback (`io.github.react-native-community:jsc-android:2026004.+`)
- **Hermes ≥ RN 0.72 prerequisite confirmed** — `apps/mobile-rn/src/util/linkify.ts` (NEW 2026-05-25, session 3 of social-yolo-pass) uses Unicode lookbehind (`(?<![\p{L}\d])`) + `\p{L}` Unicode property escape with `u` flag. Both Hermes features since RN 0.72; we run 0.81.5.
- New Architecture enabled (`newArchEnabled: true` in `apps/mobile-rn/app.json:10` + `gradle.properties:38`)
- React Native 0.81.5 + React 19.1.0

**Backend:**
- Go 1.25.10 across all 9 modules (declared in each `go.mod` `go 1.25.10` line + `services/backend/go.work`). Bumped from 1.25.0 in commit `69cc8eb` ("Go toolchain patch update").
- Container base — `services/backend/<svc>/Dockerfile` per service (multi-stage; final image distroless or alpine — pinned via SHA in CD)

**Android (bare):**
- Gradle 8.14.3 (`apps/mobile-rn/android/gradle/wrapper/gradle-wrapper.properties:3`)
- JDK 17 in CI (`.github/workflows/android-release.yml` step "Setup Java" uses `temurin` java-version 17; same in `android-debug-apk.yml`)
- Single ABI for release: `arm64-v8a` only (`apps/mobile-rn/android/app/build.gradle:111-113` + `gradle.properties:31`) — Plan 07-01 Task 4 lean per ADR-0011, cuts .aab from ~140MB → ~50-60MB
- Dev-build ABIs: `arm64-v8a` + `x86_64` (BlueStacks/emulator support) — pass `-PrunningEcoAbiFilters="arm64-v8a,x86_64"` (see `.github/workflows/android-debug-apk.yml:120-124`)
- `apps/mobile-rn/android/app/debug.keystore` — NOW COMMITTED (commit `0f6f840`, 2026-05-24). Previously gitignored; committing it stabilizes the debug-build signing cert SHA-256 so Mapbox token allowlist + Google API allowlist don't break per-developer.

**Package Manager:**
- npm (mobile) — `apps/mobile-rn/package-lock.json` (committed; CI `npm ci` not `npm install`)
- Go modules + workspace — `services/backend/go.work` + per-module `go.mod` (9 modules; `pkg` is the shared library, others depend via `replace ... => ../pkg`)

## Frameworks

**Mobile core:**
- Expo SDK ~54.0.33 — `apps/mobile-rn/package.json:27`. Bare workflow (full `apps/mobile-rn/android/` tree committed since Plan 07-03 fix `f09e729` — 42 files tracked vs. previously 3)
- React Native 0.81.5, React 19.1.0
- React Navigation 7.x (native-stack + bottom-tabs). **Route surface extended 2026-05-25** (session 2+3 of social-yolo-pass):
  - `MeStackParamList` gained `FriendRequests: undefined` (defined `apps/mobile-rn/src/navigation/types.ts:99`; registered `apps/mobile-rn/src/navigation/AppTabs.tsx:110`)
  - `RootStackParamList` gained `StoryViewer: { authorId; startIndex? }` (`types.ts:24`) + `StoryCreator: undefined` (`types.ts:26`); both registered as modal presentations alongside `ForeignProfile` in `apps/mobile-rn/src/navigation/RootNavigator.tsx:161-171`
  - `TabBar.badges` prop now drives **both** `chats` (unread count) AND `me` (incoming friend-request count) tab badges — see `apps/mobile-rn/src/navigation/AppTabs.tsx:146` `badges={{ chats: totalUnread, me: incomingFriendCount }}`. Me-tab badge is new in this batch; chats badge predates it.
- Zustand ^5.0.13 for state stores
- `react-native-mmkv` ^4.3.1 for persistent KV (banner-suppress flags, autostart-shown flag, throttle timestamps)
- `react-native-nitro-modules` ^0.35.6 (MMKV peer dep)
- `expo-linear-gradient` ~15.0.8 — actively used by `apps/mobile-rn/src/design/components/Avatar.tsx` (chat-polish-pass 2026-05-25, gradient fallback when no `avatarUrl` provided). No additional usage added in sessions 2-3.

**Mobile module organization (`apps/mobile-rn/src/modules/`):** 5 modules as of 2026-05-25 session 3 (was 3 in prior refresh `5127c7f`):
- `gamification/` — pre-existing
- `moderation/` — pre-existing
- `permissions/` — pre-existing (mobile-side permission orchestration; distinct from backend `permissions` package)
- `friends/` — **NEW 2026-05-25 (Phase 10 / ADR-0011 Amendment 6)**. Layout: `domain/types.ts`, `sync/friendsApi.ts` (uses `apiClient` wrapper, no new external deps), `state/useFriendsStore.ts` (Zustand), `ui/FriendActionButton.tsx`, `ui/FriendRequestsInboxScreen.tsx`. Public surface re-exported from `apps/mobile-rn/src/modules/friends/index.ts`.
- `stories/` — **REVIVED 2026-05-25 (Phase 11 / STORIES-REVIVAL, Amendment 6)** from Phase 8/C deprecation. Layout: `domain/types.ts` (with `groupStoriesByAuthor`, `isStoryExpired`, `STORY_OVERLAY_MAX_LENGTH`, `STORY_DURATION_MS`), `sync/storiesApi.ts` (uses `apiClient` + existing `sync/mediaUpload.fetchMediaURL/uploadImage` + `media/MediaAdapter`), `state/useStoriesStore.ts`, `ui/StoryRingAvatar.tsx`, `ui/StoryTrayHeader.tsx`, `ui/StoryViewerScreen.tsx`, `ui/StoryCreatorScreen.tsx`. Public surface in `apps/mobile-rn/src/modules/stories/index.ts`.
- Unsorted-but-still-modular code at root `src/state/social/` etc. remains pending migration per CHAT-MODULE-MIGRATION v1.0.1 backlog.

**Backend core:**
- Standard library `net/http` (no Gin/Echo/Chi) — handlers in `services/backend/<svc>/internal/handler/http.go`
- `github.com/jackc/pgx/v5` v5.9.2 — PostgreSQL driver across all services. **Cross-service DB-level permission queries pattern (Phase 10 / ADR-0011 Amendment 6, 2026-05-25):** see `permissions` package below.
- `github.com/nats-io/nats.go` v1.39.1 — JetStream client (messaging, feed, social-graph, notifications, activity-sync, realtime-gw)
- `github.com/coder/websocket` v1.8.13 — WebSocket terminus in `services/backend/realtime-gw/`
- `github.com/golang-jwt/jwt/v5` v5.3.1 — JWT verification across services (`IDENTITY_JWT_SECRET` shared env)
- `github.com/redis/go-redis/v9` v9.19.0 — rate limiting, presence, hot cache
- `github.com/minio/minio-go/v7` v7.0.78 — S3 client in `services/backend/media/`

**Backend internal packages (per-service `internal/` libraries):**
- `services/backend/messaging/internal/permissions/` — Phase 10 (2026-05-25). Hosts `FriendshipGate` struct (`friendship_gate.go`) that wraps the `are_friends(u1, u2)` Postgres SQL function added by migration `0022_friend_requests.up.sql`. Pattern: cross-service permission check done by direct SQL call against shared Postgres pool (no inter-service HTTP). Wired in `services/backend/messaging/cmd/server/main.go` via `permissions.NewFriendshipGate(pool)`. Consumed by `Handler.createOrFindConv` to enforce DM friendship precondition.
- No new external libraries needed — uses existing `github.com/jackc/pgx/v5` + `github.com/jackc/pgx/v5/pgxpool`.

**Mapping:**
- `@rnmapbox/maps` ^10.3.0 (mobile) — quarantined to `apps/mobile-rn/src/map/`; ESLint `no-restricted-imports` enforced via `apps/mobile-rn/eslint.config.js:34-46`
- Mapbox Maven repo wired in `apps/mobile-rn/android/build.gradle:27-43` (download-token optional after Mapbox dropped requirement)
- `@turf/buffer` ^7.3.5, `@turf/helpers` ^7.3.5, `@turf/simplify` ^7.3.5, `@turf/turf` ^7.3.5 — geometry ops

**Testing:**
- jest ^29.7.0 + jest-expo ~54.0.0 (mobile) — preset `jest-expo` in `apps/mobile-rn/jest.config.js:3`
- `@testing-library/react-native` ^13.3.3 (mobile)
- `better-sqlite3` 12.10.0 (mobile dev — `apps/mobile-rn/src/storage/` test fakes)
- Go stdlib `testing` + `-race -coverprofile=coverage.out` (CI `.github/workflows/backend-ci.yml:54`)
- **699 mobile jest tests passing** (2026-05-25 session 3 of social-yolo-pass; was 686 in prior refresh). +13 new tests in `apps/mobile-rn/src/util/__tests__/linkify.test.ts` (114 lines) covering URL extraction (http/https/www), `@mention` extraction, the email-guard lookbehind, and Unicode-aware boundary behavior.

**Build/Dev:**
- EAS CLI installed at run-time via `npm install -g eas-cli` (`.github/workflows/android-release.yml:134-135` — explicit install added after Plan 07-01 P0 incident, docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md)
- bundletool 1.18.1 pinned jar (`.github/workflows/android-release.yml:179-187`) — extracts universal APK from EAS-produced .aab (only invoked when `DISTRIBUTE_ENABLED=true` per ADR-0011 Amendment 5)
- mc (MinIO client) — latest from `https://dl.min.io/client/mc/release/linux-amd64/mc` in CI
- ESLint v9 flat-config (`apps/mobile-rn/eslint.config.js`) + Prettier ^3.8.3
- golangci-lint v2.5.0 (pinned in `.github/workflows/backend-ci.yml:72-74`)
- gosec, govulncheck, semgrep (`returntocorp/semgrep` container) — `.github/workflows/backend-ci.yml`
- gitleaks v2 + trufflehog — both PR-diff (`backend-ci.yml`) and full-history Sun 03:00 UTC cron (`.github/workflows/secret-scan-full.yml`)
- actionlint — workflow YAML linter (CI)
- detect-secrets — additional pre-commit secret scanner
- pre-commit hooks — `.pre-commit-config.yaml`
- docker-compose v2 (project name pinned `name: running-ecosystem` in `services/backend/docker-compose.prod.yml:21`)
- Ansible — `infra/ansible/site.yml` + `infra/ansible/inventory/prod` + `infra/ansible/roles/`

## Key Dependencies

**Critical mobile:**
- `@noble/ed25519` ^3.1.0 — Ed25519 manifest signature verification (Plan 08-01 Task 5; parked behind `EXPO_PUBLIC_UPDATE_MANIFEST_URL` env gate per ADR-0011 Amendment 5). Wired with explicit SHA-512 injection in `apps/mobile-rn/src/update/manifestSigning.ts:22` (`ed25519.hashes.sha512 = sha512`)
- `@noble/hashes` ^2.2.0 — SHA-512 backend for `@noble/ed25519`. Import path is `@noble/hashes/sha2.js` (`.js` suffix mandatory per v2.x exports map)
- `expo-device` ~8.0.10 — OEM detection via `Device.manufacturer` in `apps/mobile-rn/src/vendor/oem.ts` (Plan 07-03 Task 3)
- `expo-intent-launcher` ~13.0.8 — MIUI/One UI deep-link intents in `apps/mobile-rn/src/vendor/openOEMSettings.ts` (Plan 07-03 Task 3)
- `expo-notifications` ~0.32.17 — sticky Android foreground-service notification in `apps/mobile-rn/src/foreground/notification.ts` (Plan 07-03 Task 2; channel `recording`, importance LOW, 5s tick)
- `expo-application` ~7.0.8 — `nativeApplicationVersion` + `nativeBuildVersion` source for `apps/mobile-rn/src/util/version.ts` (`getClientVersionHeader`, `getInstalledVersion`, `getInstalledBuildNumber`)
- `expo-linear-gradient` ~15.0.8 — gradient fallback for `Avatar` component (`apps/mobile-rn/src/design/components/Avatar.tsx`, chat-polish-pass; unchanged in sessions 2-3 of social-yolo-pass)
- `expo-location` ~19.0.8, `expo-task-manager` ~14.0.9 — background tracking
- `expo-secure-store` ~15.0.8 — JWT storage (`apps/mobile-rn/src/auth/tokenStorage.ts`)
- `expo-sqlite` ~16.0.10 — local activity storage
- `expo-haptics` ~14.1.4, `expo-speech` ~14.0.8 (TTS via `apps/mobile-rn/src/util/expoSpeechAdapter.ts`)
- `expo-file-system` ~19.0.22, `expo-image-manipulator` ~14.0.8, `expo-image-picker` ~17.0.11 — media flows. **`expo-image-picker` usage extended 2026-05-25** via the existing `MediaAdapter` (`apps/mobile-rn/src/media/`) — now also consumed by `StoryCreatorScreen` (`apps/mobile-rn/src/modules/stories/ui/StoryCreatorScreen.tsx:30-51`) for picking story media. No new package added.
- `react-native-get-random-values` ^2.0.0 — uuid polyfill (imported first in `apps/mobile-rn/App.tsx:15`)
- `uuid` ^14.0.0
- **React Native `Linking` (built-in module)** — now consumed by `apps/mobile-rn/src/ui/social/MessageText.tsx` (NEW 2026-05-25 session 3) to open URLs extracted by `linkifyText()`. No new package — RN core API.

**Critical backend:**
- `github.com/jackc/pgx/v5` v5.9.2 — Postgres driver. **As of 2026-05-25:** also drives cross-service permission checks (`messaging` queries `social-graph`-owned `are_friends()` SQL function via shared Postgres pool — see `services/backend/messaging/internal/permissions/friendship_gate.go`)
- `github.com/jackc/pgx/v5/pgconn` — used for `isUniqueViolation` helper in `services/backend/social-graph/internal/repository/postgres/friend_requests.go` (PgErr SQLSTATE 23505 → `domain.ErrFriendRequestExists`)
- `github.com/nats-io/nats.go` v1.39.1 — NATS JetStream
- `github.com/getsentry/sentry-go` v0.46.2 — Sentry SDK (dormant per ADR-0010 / D-38 — empty DSN no-op path enforced in `services/backend/pkg/observability/sentry_init.go:6-17`)
- `github.com/prometheus/client_golang` v1.20.5 — `/metrics` handler in each service
- `go.opentelemetry.io/otel` v1.43.0 + `go.opentelemetry.io/otel/sdk` v1.43.0 + `otelhttp` v0.68.0 + `otlptracehttp` v1.43.0 — tracing. Bumped from v1.32.0 → v1.43.0 in `services/backend/pkg/go.mod` (instrumentation `v0.57.0 → v0.68.0`). Indirect bumps: `proto/otlp v1.5.0 → v1.10.0`, `google.golang.org/grpc v1.71.x → v1.80.0`.
- `golang.org/x/crypto` v0.50.0 — Ed25519 in `scripts/sign-manifest.go` + `scripts/verify-manifest.go`

**No new external dependencies added in social-yolo-pass sessions 2-3 (2026-05-25):** `apps/mobile-rn/package.json` is byte-identical at the dependencies level between commit `5127c7f` and HEAD. Friends + Stories modules + linkify + MessageText are built entirely on existing deps (apiClient/Zustand/MMKV/expo-image-picker/MediaAdapter/Linking/`\p{L}` Unicode-aware regex).

**Infrastructure:**
- timescale/timescaledb:2.17.2-pg16 — PostgreSQL + TimescaleDB (`services/backend/docker-compose.prod.yml:25`)
- nats:2.11-alpine with JetStream + 7d retention
- minio/minio:RELEASE.2025-01-20T14-49-07Z (write side gated by `DISTRIBUTE_ENABLED` per ADR-0011 Amendment 5; runtime container always present)
- redis:7-alpine with `--maxmemory 256mb --maxmemory-policy allkeys-lru`
- migrate/migrate:v4.18.1 — run-once init job. **Migration count: 22 numbered + 2 drill** (Phase 10 `0022_friend_requests` added 2026-05-25 commit `46b0d65`). **Migration `0022` is NOT yet applied on the production VPS** as of HEAD; the new friend-request endpoints + DM friendship gate will return DB errors until applied.
- caddy:2.8-alpine — gateway, Let's Encrypt via sslip.io
- grafana/loki:3.2.0, grafana/grafana:11.3.0, prom/prometheus:v2.55.0 — observability stack (`infra/observability-stack/docker-compose.yml`, runs on srv1561293 colocated with niko-prod, Caddy :8443 self-signed sole ingress)

## Configuration

**Environment:**
- Mobile: `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_IDENTITY_URL`, `EXPO_PUBLIC_SYNC_URL`, `EXPO_PUBLIC_API_URL` (read in `apps/mobile-rn/src/auth/apiClient.ts:22-30`). Defaults to `http://10.0.2.2:8081` (Android emulator). ESLint blocks `EXPO_PUBLIC_*_SECRET` syntax + literal `sk.<40+>` Mapbox secret-token shape (`apps/mobile-rn/eslint.config.js:47-60`). **No new `EXPO_PUBLIC_*` env vars introduced in sessions 2-3** — Friends + Stories modules reach backend via the existing `apiClient` against `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_SYNC_URL`.
- **`EXPO_PUBLIC_UPDATE_MANIFEST_URL`** (Plan 08-01; GATED per ADR-0011 Amendment 5) — when unset/empty, `manifestCheck.ts` returns `state: 'disabled'` early without making any network call. No production manifest URL is currently set.
- Backend (per-service env): `<SVC>_HTTP_ADDR`, `<SVC>_DB_URL`, `IDENTITY_JWT_SECRET` (shared, ≥32 chars), `NATS_URL`, `REDIS_URL`, `S3_*` (media), `EXPO_ACCESS_TOKEN` (notifications), `CADDY_ACME_EMAIL` (gateway). Compose enforces required vars via `${VAR:?need VAR}` syntax in `services/backend/docker-compose.prod.yml`.
- **Messaging service (2026-05-25):** `MESSAGING_DB_URL` now consumed for *two* purposes — its own conversation/message tables AND the friendship-gate query (`SELECT are_friends($1, $2)`). Same connection pool serves both (`services/backend/messaging/cmd/server/main.go` wires the pool into `permissions.NewFriendshipGate(pool)` before passing it to `handler.New`).
- Prod env file on VPS: `/run/sport.env` (rendered by Ansible; consumed by `services/backend/docker-compose.prod.yml`)

**Secrets (SOPS + age):**
- `.sops.yaml` recipients: DEV_A (`age1ph7d4a62n9...`) + CI (`age19ysu774h4...`, lifted in Plan 07-01 commit `dd0dce5`). DEV_B placeholder TODO per `.sops.yaml:18-22`.
- Encrypted bundles in `.secrets/prod/`:
  - `shared.yaml` — POSTGRES/JWT/MinIO/Expo/Caddy
  - `mapbox.yaml` — pk./sk. tokens
  - `oauth.yaml` — STRAVA/GOOGLE/APPLE (placeholders v1.0)
  - `sentry.yaml` — dormant DSN (D-38)
  - `mobile-signing.yaml` — release.keystore (base64) + keystore_password + key_password (Plan 06-01)
  - `manifest-signing.yaml` — Ed25519 keypair (Plan 08-01 Task 1, fingerprint b57acd1efa3f, pubkey hardcoded in `apps/mobile-rn/src/update/manifestSigning.ts:30`). Consumed only when `DISTRIBUTE_ENABLED=true`.
- Dev + staging mirror in `.secrets/dev/` + `.secrets/staging/`

**EAS Build:**
- `apps/mobile-rn/eas.json` — `cli.appVersionSource: "remote"`, `cli.version: ">= 12.0.0"`
- `build.production.android.buildType: "app-bundle"` (.aab output)
- `build.production.android.credentialsSource: "local"` — REQUIRED to consume the SOPS-decrypted keystore (without this, EAS Cloud auto-generates a remote keystore — observed regression in CI run 26362716928 / build 9b8ec55c on tag v1.0.0-beta.2)
- `apps/mobile-rn/credentials.json` (gitignored; generated in `.github/workflows/android-release.yml:114-127` via `jq -n`) — points at `android/app/release.keystore` + alias `runningecosystem-release`
- `build.production.android.env`: `RUNNING_ECO_RELEASE_STORE_FILE=release.keystore`, `RUNNING_ECO_RELEASE_KEY_ALIAS=runningecosystem-release`. Passwords injected via `$GITHUB_ENV` after `::add-mask::` (ADR-0012)

**Android signing (Gradle):**
- `apps/mobile-rn/android/app/build.gradle:126-140` — `release` signingConfig reads `RUNNING_ECO_RELEASE_STORE_FILE/STORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD` from project properties; falls back to `debug.keystore` if `STORE_FILE` unset
- `debug.keystore` now committed (2026-05-24); debug-build cert SHA-256 is now stable across all developer machines + CI
- R8 minify + resource shrinking enabled (`apps/mobile-rn/android/gradle.properties:73-74`)

**TypeScript:**
- `apps/mobile-rn/tsconfig.json` — extends `expo/tsconfig.base`, `strict: true`

**Jest:**
- `transformIgnorePatterns` whitelists `@noble/.*` for ESM-only transform (`apps/mobile-rn/jest.config.js:5-9`) — required by Plan 08-01 Task 5
- `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`
- **699 tests passing as of 2026-05-25** (was 686 in prior refresh `5127c7f`). +13 new tests in session 3: `apps/mobile-rn/src/util/__tests__/linkify.test.ts` covering URL/mention tokenization.

**Build (mobile):**
- `apps/mobile-rn/jest.config.js`, `apps/mobile-rn/eslint.config.js`, `apps/mobile-rn/eas.json`, `apps/mobile-rn/app.json`, `apps/mobile-rn/tsconfig.json`

**Build (backend):**
- `.golangci.yml`, `.trivyignore.yaml`, `services/backend/go.work`, per-service `services/backend/<svc>/Dockerfile`

**CI tool versions pinned in workflows:**
- `SOPS_VERSION=3.13.1` (matches dev workstation; min ≥3.11) — `.github/workflows/android-release.yml:74`
- `BUNDLETOOL_VERSION=1.18.1` — extracts universal APK from .aab
- yq — latest from mikefarah/yq releases
- golangci-lint v2.5.0
- actions/checkout@v4, actions/setup-node@v4, actions/setup-java@v4, actions/setup-go@v5

**CI workflows (5 files):**
- `.github/workflows/backend-ci.yml` — Go test/lint/SAST/Vuln/Secrets/Docker/Cardinality/PII pipeline
- `.github/workflows/backend-cd.yml` — multi-service GHCR publish + cosign + SLSA L2
- `.github/workflows/android-release.yml` — tag-triggered .aab build + (gated) MinIO distribution
- `.github/workflows/android-debug-apk.yml` — dev-build pipeline; workflow_dispatch + push trigger; Node 22 + JDK 17 Temurin; produces universal debug APK (`arm64-v8a` + `x86_64`) as a GH Actions artifact (14-day retention); injects `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` from secrets, leaves `EXPO_PUBLIC_UPDATE_MANIFEST_URL` unset (gate closed); used for BlueStacks dev-loop + ad-hoc tester APK sharing
- `.github/workflows/secret-scan-full.yml` — Sun 03:00 UTC cron, full-history gitleaks + trufflehog

## Platform Requirements

**Development:**
- Node 20 (release pipeline) or Node 22 (debug-APK pipeline) + npm
- Go 1.25 (toolchain auto-resolves to 1.25.10)
- Docker (for backend compose stacks)
- SOPS 3.13.1+ + age CLI (for secrets edit)
- Ansible (for VPS deploys)
- macOS or Linux dev workstation (Android Studio + JDK 17 for native debugging)

**Production:**
- Single VPS (148.253.214.156) running `services/backend/docker-compose.prod.yml` via systemd sport-stack umbrella (`/opt/sport/services/backend/`, env file `/run/sport.env`). Image tags pinned via `SPORT_STACK_TAG` env. `make rollback v=<tag>` (root `Makefile`) wraps `migrate down 1` + ansible re-deploy + smoke probe. 8 services healthy on 2026-05-25 probe. **Pending action:** Migration `0022_friend_requests.up.sql` must be applied on the prod VPS before the social-graph friend-request endpoints + messaging DM-gate + (downstream) mobile Friends module behave correctly.
- Observability VPS (srv1561293, 82.25.71.215) — separate host running `infra/observability-stack/docker-compose.yml`. All 3 containers bound to 127.0.0.1; Caddy :8443 (self-signed) sole public ingress. Memory caps: loki 512m, prom 512m, grafana 768m.
- Android device: arm64-v8a only for release builds (`abiFilters` set in `apps/mobile-rn/android/app/build.gradle:111-113`). minSdk / targetSdk inherit from Expo SDK 54.
- Distribution: tag push `v1.0.0-beta.*` | `v1.0.0-rc.*` → `.github/workflows/android-release.yml` → if `MINIO_RELEASES_ACCESS_KEY` is set (i.e., `DISTRIBUTE_ENABLED=true`), APK lands in MinIO `android-releases` (24h presigned) + signed manifest in `android-manifest` (public-read). When the secret is unset (current closed-beta posture per ADR-0011 Amendment 5), the .aab build still runs but distribution steps skip via `if: env.DISTRIBUTE_ENABLED == 'true'`.

## Committed bare Android tree (Plan 07-03 fix — 42 files + debug.keystore)

Previously hybrid expo-prebuild (3 tracked files). Now fully committed under `apps/mobile-rn/android/`:
- `gradlew` + `gradlew.bat` + `gradle/wrapper/gradle-wrapper.jar` + `gradle-wrapper.properties`
- `build.gradle`, `settings.gradle`, `gradle.properties`
- `app/build.gradle`, `app/proguard-rules.pro`
- `app/src/main/AndroidManifest.xml`, `app/src/debug/AndroidManifest.xml`, `app/src/debugOptimized/AndroidManifest.xml`
- `app/src/main/java/com/runningecosystem/mobile/MainActivity.kt`
- `app/src/main/java/com/runningecosystem/mobile/MainApplication.kt`
- `app/src/main/res/` — drawables (splash, ic_launcher), mipmaps (ic_launcher per density), values (colors, strings, styles)
- `app/debug.keystore` — committed 2026-05-24 (commit `0f6f840`)

`local.properties` and `build/` are NOT tracked (in `.gitignore`).

---

*Stack analysis: 2026-05-25*
