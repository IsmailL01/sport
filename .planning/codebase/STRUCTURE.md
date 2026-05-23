# Codebase Structure

**Analysis Date:** 2026-05-23

## Directory Layout

```
sport/
├── apps/
│   ├── mobile-rn/                 # Expo React Native app (the only active client)
│   │   ├── App.tsx                # Slim root: token init + ThemeProvider + RootNavigator
│   │   ├── index.ts               # registerRootComponent(App)
│   │   ├── app.json               # Expo manifest (permissions, bundle ids, scheme)
│   │   ├── eas.json               # EAS build profiles (development / preview / production)
│   │   ├── eslint.config.js       # Flat config; enforces @rnmapbox/maps import wall
│   │   ├── jest.config.js         # jest-expo preset
│   │   ├── tsconfig.json          # Strict TS, extends expo/tsconfig.base
│   │   ├── package.json
│   │   ├── android/               # Native Android project (custom dev client, R8/ProGuard)
│   │   │   └── app/
│   │   │       ├── build.gradle
│   │   │       ├── proguard-rules.pro
│   │   │       ├── release.keystore       # PKCS12 keystore (never committed plaintext)
│   │   │       └── src/main/AndroidManifest.xml
│   │   ├── assets/                # icons, splash, fonts
│   │   ├── __mocks__/             # jest manual mocks (expo-sqlite stub)
│   │   └── src/
│   │       ├── auth/              # apiClient, tokenStorage, OAuth providers
│   │       ├── design/            # ThemeProvider, tokens, design-system components
│   │       ├── domain/            # PURE business logic (no platform deps)
│   │       │   ├── session/       # SessionManager (imperative lifecycle owner)
│   │       │   ├── training/      # plan generator
│   │       │   ├── AreaCalculator.ts ClosureDetector.ts calories.ts records.ts
│   │       │   ├── currency.ts streak.ts splits.ts metrics.ts gpx.ts stats.ts
│   │       │   └── types.ts athlete.ts social.ts walletDomain.ts
│   │       ├── health/            # HealthKit / Health Connect / Strava import adapters
│   │       ├── location/          # LocationAdapter interface + adapters/ExpoLocationAdapter
│   │       ├── map/               # ONLY place that imports @rnmapbox/maps
│   │       │   ├── MapboxView.tsx components/ util/ offline.ts index.ts
│   │       ├── media/             # MediaAdapter + ExpoMediaAdapter
│   │       ├── modules/           # Cross-cutting feature modules (gamification, permissions, moderation)
│   │       ├── navigation/        # RootNavigator, AppTabs, AuthStack, OnboardingStack, screens/
│   │       ├── notifications/     # NotificationsAdapter + ExpoNotificationsAdapter
│   │       ├── pipeline/          # GPS pipeline + filters
│   │       ├── realtime/          # RealtimeAdapter + WebSocket / Mock adapters
│   │       ├── sensors/           # BLE SensorAdapter + adapters
│   │       ├── state/             # Zustand stores (activity, auth, sync, settings, …, social/)
│   │       ├── storage/           # SQLite repositories (one per aggregate) + database.ts singleton
│   │       ├── sync/              # Outbox sync engine (push + pull)
│   │       ├── ui/                # Modals, screens, charts, social UI, Toast
│   │       ├── util/              # geo, geojson, douglasPeucker, corridor, selfIntersection, speech, version
│   │       ├── __fixtures__/      # Intentional lint-failure fixtures for ESLint guard tests
│   │       └── __tests__/         # Unit + snapshot tests
│   └── mobile_flutter.archived/   # Archived Flutter prototype (do NOT modify)
├── services/
│   └── backend/                   # Go monorepo (multi-module: each service has its own go.mod)
│       ├── api/                   # OpenAPI YAML specs (per service) + _shared/
│       ├── identity/              # Auth + OTP + feature flags (:8081)
│       ├── activity-sync/         # Session ingest from mobile
│       ├── feed/                  # Activity feed
│       ├── social-graph/          # Follow/relations
│       ├── messaging/             # Chat (outbox pattern)
│       ├── notifications/         # Expo push fanout + in-app (:8087)
│       ├── realtime-gw/           # WebSocket gateway (subscribes to NATS)
│       ├── media/                 # S3-backed media upload
│       ├── gateway/admin/         # Static admin UI shell (index.html only)
│       ├── pkg/                   # Shared Go packages (auth, observability, audit, ratelimit, …)
│       ├── migrations/            # golang-migrate up/down SQL files (0000-0014…)
│       ├── deploy/helm/           # Helm chart (currently identity only)
│       ├── observability/         # prometheus.yml, loki.yml, grafana-datasources.yml, dashboards/
│       └── scripts/openapi-routes-check/  # Go tool: verifies routes match OpenAPI
├── infra/
│   ├── ansible/                   # Provisioning + deploy automation
│   │   ├── site.yml               # Plays: bootstrap → sport-stack → alloy-shipper
│   │   ├── ansible.cfg
│   │   ├── inventory/{dev,prod}/
│   │   ├── group_vars/
│   │   └── roles/{common,docker,ufw,sport-stack,alloy-shipper}/
│   └── observability-stack/       # Colocated obs VPS (Loki + Prometheus + Grafana + Caddy)
│       ├── docker-compose.yml     # All containers bound to 127.0.0.1; Caddy is the ingress
│       ├── caddy/ loki/ prometheus/ grafana/ systemd/
│       └── grafana/{provisioning,dashboards-src,secrets}/
├── docs/
│   ├── DECISIONS/                 # ADRs (0001-0012)
│   ├── RUNBOOKS/                  # Operational runbooks (deploy, rollback, …)
│   ├── RUNNING_ECOSYSTEM_TZ.md    # Technical requirements (the spec)
│   ├── DEVELOPMENT_PLAN.md        # Phase/task plan with IDs
│   ├── API-CONTRACT-v1.0.md       # v1.0 release contract
│   ├── SECRETS.md                 # Secret management runbook
│   ├── INTEGRATIONS.md            # External integrations log
│   ├── CURRENCY.md TELEMETRY.md AUDIT.md v1.0-SCOPE.md REVIEW_ROUNDS_1-3.md
│   ├── gitleaks-history-scan.json trufflehog-history-scan.json
├── .planning/
│   ├── STATE.md MILESTONES.md PROJECT.md REQUIREMENTS.md ROADMAP.md config.json
│   ├── codebase/                  # Generated codebase maps (THIS DIRECTORY)
│   └── phases/                    # Per-phase planning artifacts (01-07 + _archive/)
├── .secrets/                      # SOPS-encrypted YAML, organized by env
│   ├── dev/{mapbox,oauth,shared}.yaml
│   ├── staging/
│   ├── prod/{mapbox,oauth,sentry,shared,mobile-signing}.yaml
│   └── README.md
├── .github/
│   └── workflows/                 # backend-ci, backend-cd (cosign + SLSA L2), android-release, secret-scan-full
├── .sops.yaml                     # age recipients (DEV_A, CI key, future DEV_B)
├── .gitleaks.toml                 # Secret-scan baseline
├── .trufflehog/                   # trufflehog config
├── .golangci.yml                  # Go linter config (15 enabled linters)
├── .pre-commit-config.yaml        # gitleaks + trufflehog hooks
├── .gitignore .gitattributes .editorconfig .trivyignore.yaml
├── .vscode/                       # Workspace settings
├── .claude/                       # Claude Code worktrees + skills
├── CLAUDE.md                      # AI agent project rules (READ FIRST)
├── STATUS.md                      # Current phase + task statuses (in repo root)
├── DECISION.md README.md CHANGELOG.md CODEOWNERS
├── Makefile                       # Top-level: rollback target + drill harness
├── tests/                         # Field-test protocols + run outputs (not unit tests)
└── scripts/                       # Ops scripts (deploy_observability_stack, smoke_*, pii_audit, …)
```

## Directory Purposes

**`apps/mobile-rn/`:**
- Purpose: The active mobile client (Expo RN, ADR-0001 chose RN over Flutter)
- Contains: Root TS app + native `android/` project + EAS build config
- Key files: `App.tsx`, `index.ts`, `eas.json`, `app.json`, `eslint.config.js`

**`apps/mobile-rn/src/domain/`:**
- Purpose: Pure business logic — value objects, calculations, entities (no React / no SDKs)
- Contains: `SessionManager` (subdir), area / closure / records / calories / streak / currency / splits / training / GPX
- Key files: `domain/session/SessionManager.ts`, `domain/types.ts`, `domain/AreaCalculator.ts`

**`apps/mobile-rn/src/map/`:**
- Purpose: Mapbox abstraction wall — sole permitted location for `@rnmapbox/maps` imports
- Contains: `MapboxView.tsx`, layer components (`TrackLayer`, `LocationPuckLayer`, `CorridorLayer`, `HistoryTerritoryLayer`, `ZoneLayer`, `RegionPickerOverlay`), `offline.ts` (offline pack management), `util/`
- Key files: `map/index.ts` (public API), `map/MapboxView.tsx`

**`apps/mobile-rn/src/location/`:**
- Purpose: GPS abstraction (sensor-agnostic principle)
- Contains: `LocationAdapter.ts` interface, `adapters/ExpoLocationAdapter.ts` (registers TaskManager task at module load)
- Key files: `location/LocationAdapter.ts`, `location/adapters/ExpoLocationAdapter.ts`

**`apps/mobile-rn/src/pipeline/`:**
- Purpose: GPS data refinement (filters composed in order)
- Contains: `Pipeline.ts`, `Filter.ts`, `filters/{AccuracyFilter, KalmanFilter, JumpFilter, MinSegmentFilter, PauseDetector}.ts`
- Key files: `pipeline/Pipeline.ts`, `pipeline/filters/KalmanFilter.ts`

**`apps/mobile-rn/src/state/`:**
- Purpose: Zustand stores, persist via MMKV where needed
- Contains: `activity`, `auth`, `sync`, `settings`, `featureflags(.defaults)`, `forceUpdate`, `history`, `map`, `sensors`, `training`, `wallet`, `workoutPlayer`, `social/` (chat/users/notifications/realtime sub-stores)
- Key files: `state/activity.ts` (the central session store), `state/auth.ts`, `state/settings.ts` (MMKV-persisted)

**`apps/mobile-rn/src/storage/`:**
- Purpose: SQLite persistence — repository per aggregate
- Contains: `database.ts` (singleton + migrations v1-v19), `sessionRepository`, `pointRepository`, `lapRepository`, `sensorRepository`, `recordsRepository`, `relationsRepository`, `walletRepository`, `socialRepository`
- Key files: `storage/database.ts`, `storage/sessionRepository.ts`

**`apps/mobile-rn/src/ui/` + `src/navigation/` + `src/design/`:**
- Purpose: Presentation layer
- Contains: `ui/` — modals + Toast + ad-hoc screens; `navigation/` — RootNavigator + tab stacks + per-tab screen folders (`auth/`, `chats/`, `journal/`, `me/`, `record/`); `design/` — ThemeProvider, tokens, reusable components, DevPreviewScreen
- Key files: `navigation/RootNavigator.tsx`, `design/ThemeProvider.tsx`, `design/tokens.ts`

**`apps/mobile-rn/android/`:**
- Purpose: Native Android project (prebuild output, customized: R8/ProGuard rules, release.keystore)
- Generated: Mostly yes (`expo prebuild`), but `proguard-rules.pro` and signing config are hand-edited and tracked
- Key files: `android/app/build.gradle`, `android/app/proguard-rules.pro`, `android/app/src/main/AndroidManifest.xml`

**`services/backend/`:**
- Purpose: Go microservice monorepo (multi-module — each service its own `go.mod`)
- Contains: One directory per service (identity/activity-sync/feed/social-graph/messaging/notifications/realtime-gw/media), `pkg/` shared, `migrations/`, `deploy/helm/`, `observability/`, `api/` OpenAPI specs
- Key files: `services/backend/<svc>/cmd/server/main.go` (entry), `services/backend/pkg/go.mod`

**`services/backend/<svc>/`:**
- Purpose: One microservice
- Contains: `cmd/server/main.go` (entry + env config + middleware chain), `internal/{handler,service,repository,domain}/`, `go.mod`
- Key files: `<svc>/cmd/server/main.go`, `<svc>/internal/handler/router.go`, `<svc>/internal/repository/repository.go`

**`services/backend/pkg/`:**
- Purpose: Shared Go packages across all services
- Contains: `auth/` (JWT), `observability/` (slog, otel, sentry, prom, debug-session middleware, PII deny list), `audit/`, `clientversion/` (force-update middleware), `featureflags/`, `gamification/`, `permissions/`, `ratelimit/`
- Key files: `pkg/observability/slog_handler.go`, `pkg/observability/debug_session_middleware.go`, `pkg/auth/jwt.go`, `pkg/clientversion/`

**`services/backend/migrations/`:**
- Purpose: golang-migrate SQL files (paired up/down)
- Generated: No, hand-written
- Key files: `0000_extensions`, `0001_users`, `0002_activities`, `0010_social_graph`, `0011_messaging`, `0012_notifications`, `0013_reactions`, `0014_media`

**`infra/ansible/`:**
- Purpose: VPS provisioning + app deploy automation (D-24: replaces Hetzner Cloud Firewall with ufw)
- Contains: `site.yml` (3 plays: bootstrap, sport-stack, alloy-shipper), `roles/{common,docker,ufw,sport-stack,alloy-shipper}/`, `inventory/{dev,prod}/`
- Key files: `infra/ansible/site.yml`, `infra/ansible/ansible.cfg`

**`infra/observability-stack/`:**
- Purpose: Observability VPS (`srv1561293`) — colocated with niko-prod per D-34
- Contains: `docker-compose.yml` (Loki + Prometheus + Grafana, all 127.0.0.1-bound), Caddy as sole `:8443` ingress, `systemd/` units, Grafana provisioning + dashboards
- Key files: `infra/observability-stack/docker-compose.yml`, `infra/observability-stack/caddy/`

**`.secrets/`:**
- Purpose: SOPS+age-encrypted secrets organized by environment
- Contains: `dev/`, `staging/`, `prod/` each holding `{mapbox,oauth,shared}.yaml`; prod additionally has `sentry.yaml` + `mobile-signing.yaml` (PKCS12 keystore base64 + passwords)
- Key files: `.secrets/prod/mobile-signing.yaml`, `.secrets/prod/shared.yaml`, `.sops.yaml` (recipient config)

**`.planning/`:**
- Purpose: GSD planning artifacts (orchestrator workspace)
- Contains: `STATE.md`, `MILESTONES.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `PROJECT.md`, `config.json`, `phases/` (one folder per phase), `codebase/` (generated maps)
- Key files: `.planning/STATE.md`, `.planning/phases/<NN>-<slug>/<NN>-RESEARCH.md` and `<NN>-PLAN.md`

**`docs/`:**
- Purpose: Authoritative project docs + ADRs + runbooks
- Contains: `RUNNING_ECOSYSTEM_TZ.md`, `DEVELOPMENT_PLAN.md`, `API-CONTRACT-v1.0.md`, `SECRETS.md`, `INTEGRATIONS.md`, `DECISIONS/` (ADRs 0001-0012), `RUNBOOKS/`
- Key files: `docs/RUNNING_ECOSYSTEM_TZ.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/DECISIONS/0011-scope-reset-to-closed-beta-lean.md`

**`.github/workflows/`:**
- Purpose: CI/CD definitions
- Contains: `backend-ci.yml`, `backend-cd.yml` (cosign keyless + SLSA L2 @v2 attestation, no `:latest`), `android-release.yml` (tag-triggered, SOPS-restored keystore, EAS production), `secret-scan-full.yml`
- Key files: `.github/workflows/backend-cd.yml`, `.github/workflows/android-release.yml`

**`scripts/`:**
- Purpose: Ad-hoc ops + observability smoke scripts (Python + shell)
- Contains: `deploy_observability_stack.sh`, `smoke_observability_stack.py`, `smoke_metrics.py`, `smoke_grafana_alerts.py`, `cardinality_probe.py`, `pii_audit.sh`, `pii_live_probe.py`, `setup-branch-protection.sh`, `debug-tail.sh`
- Generated: No

**`tests/`:**
- Purpose: Field-test protocols and run outputs (NOT unit tests — those live next to code in `src/__tests__/`)
- Contains: `FIELD_PROTOCOL.md`, `runs/`
- Key files: `tests/FIELD_PROTOCOL.md`

**`apps/mobile_flutter.archived/`:**
- Purpose: Archived Flutter prototype (ADR-0001 closed)
- Generated: No, archived as-is
- Committed: Yes
- Do not modify

## Key File Locations

**Mobile entry points:**
- `apps/mobile-rn/index.ts` — `registerRootComponent`
- `apps/mobile-rn/App.tsx` — slim root component
- `apps/mobile-rn/src/navigation/RootNavigator.tsx` — auth gate + lifecycle wiring

**Backend entry points:**
- `services/backend/identity/cmd/server/main.go` (:8081)
- `services/backend/activity-sync/cmd/server/main.go`
- `services/backend/feed/cmd/server/main.go`
- `services/backend/social-graph/cmd/server/main.go`
- `services/backend/messaging/cmd/server/main.go`
- `services/backend/notifications/cmd/server/main.go` (:8087)
- `services/backend/realtime-gw/cmd/server/main.go`
- `services/backend/media/cmd/server/main.go`

**Configuration:**
- `apps/mobile-rn/app.json` — Expo permissions, bundleId, scheme
- `apps/mobile-rn/eas.json` — EAS build profiles (development/preview/production with R8 minify on prod)
- `apps/mobile-rn/eslint.config.js` — flat config + Mapbox import wall + token-secret literal guard
- `apps/mobile-rn/tsconfig.json` — strict TS
- `apps/mobile-rn/jest.config.js` — jest-expo preset
- `.golangci.yml` — Go linter (15 linters enabled)
- `.sops.yaml` — age recipient list (DEV_A, CI)
- `.gitleaks.toml`, `.trufflehog/`, `.pre-commit-config.yaml` — secret-scan stack
- `.editorconfig`, `.gitattributes`, `.trivyignore.yaml`
- `infra/ansible/ansible.cfg`
- `Makefile` — `make rollback v=<tag>` target

**Mapbox abstraction (where Mapbox lives):**
- `apps/mobile-rn/src/map/MapboxView.tsx` — the only `@rnmapbox/maps` importer
- `apps/mobile-rn/src/map/components/{TrackLayer,LocationPuckLayer,CorridorLayer,HistoryTerritoryLayer,ZoneLayer,RegionPickerOverlay}.tsx`
- `apps/mobile-rn/src/map/offline.ts` — Mapbox offline pack management
- `apps/mobile-rn/src/map/index.ts` — public API (other modules import only from here)
- ESLint guard: `apps/mobile-rn/eslint.config.js` (`no-restricted-imports` for `@rnmapbox/maps`)

**Signing config (where Android signing lives):**
- `apps/mobile-rn/android/app/release.keystore` — PKCS12 keystore (generated; password is in SOPS)
- `apps/mobile-rn/android/app/build.gradle` — signingConfigs reads from gradle properties
- `apps/mobile-rn/eas.json` `production.android.env` — passes `RUNNING_ECO_RELEASE_STORE_FILE` + `RUNNING_ECO_RELEASE_KEY_ALIAS`
- `.secrets/prod/mobile-signing.yaml` — SOPS-encrypted base64 keystore + passwords
- `.github/workflows/android-release.yml` — restores keystore in CI (with `::add-mask::` for password leak mitigation per ADR-0012)
- `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md` — incident response context

**Observability stack config:**
- `infra/observability-stack/docker-compose.yml` — Loki+Prom+Grafana containers
- `infra/observability-stack/loki/loki-config.yaml`
- `infra/observability-stack/prometheus/prometheus.yml.template`
- `infra/observability-stack/grafana/provisioning/{alerting,dashboards,datasources,plugins}/`
- `infra/observability-stack/grafana/dashboards-src/`
- `infra/observability-stack/grafana/secrets/`
- `infra/observability-stack/caddy/` — TLS-terminating reverse proxy on :8443
- `infra/observability-stack/systemd/` — host systemd units (alloy etc.)
- `infra/ansible/roles/alloy-shipper/` — installs Grafana Alloy via apt on app VPS
- `services/backend/observability/` — backend-side dashboards + scrape configs

**Backend shared observability code (mobile-relevant Go pkg):**
- `services/backend/pkg/observability/slog_handler.go` — slog JSON
- `services/backend/pkg/observability/promhttp_middleware.go` — Prom metrics middleware
- `services/backend/pkg/observability/debug_session_middleware.go` — per-user DEBUG slog gate
- `services/backend/pkg/observability/sentry_init.go` — Sentry init
- `services/backend/pkg/observability/otel_init.go` — OTel init
- `services/backend/pkg/observability/pii_deny_list.go` — log scrubbing

**Domain core (mobile):**
- `apps/mobile-rn/src/domain/session/SessionManager.ts` — session lifecycle
- `apps/mobile-rn/src/domain/types.ts` — Point, RawPoint, Session, ActivityType, etc.
- `apps/mobile-rn/src/domain/AreaCalculator.ts` — projected-plane area
- `apps/mobile-rn/src/domain/calories.ts` — MET-based estimate
- `apps/mobile-rn/src/domain/records.ts` — personal records
- `apps/mobile-rn/src/domain/currency.ts` — internal coin economy (see `docs/CURRENCY.md`)

**Testing:**
- `apps/mobile-rn/src/__tests__/*.test.ts(x)` — top-level unit tests
- `apps/mobile-rn/src/<area>/__tests__/` — co-located unit tests (`src/util/__tests__`, `src/auth/__tests__`, `src/state/__tests__`, `src/domain/session/__tests__`, `src/ui/screens/__tests__`)
- `apps/mobile-rn/__mocks__/expo-sqlite.ts` — jest manual mock
- Go: `*_test.go` next to source (e.g., `services/backend/identity/internal/service/auth_test.go`)
- `tests/FIELD_PROTOCOL.md` — manual field-test protocol (not Jest/Go)

## Naming Conventions

**Files (TypeScript):**
- React components: PascalCase — `MapboxView.tsx`, `RootNavigator.tsx`, `TrackLayer.tsx`, `ForceUpdateScreen.tsx`
- Adapter interfaces: PascalCase + `Adapter` suffix — `LocationAdapter.ts`, `SensorAdapter.ts`, `RealtimeAdapter.ts`, `MediaAdapter.ts`, `HealthAdapter.ts`
- Concrete adapter impls: PascalCase, name encodes platform — `ExpoLocationAdapter.ts`, `BleSensorAdapter.ts`, `WebSocketRealtimeAdapter.ts`, `HealthKitAdapter.ts`
- Zustand stores: camelCase, no prefix — `activity.ts`, `auth.ts`, `settings.ts`, `featureflags.ts`. Inside the file, export const is `useXStore` (e.g., `useActivityStore`)
- Repositories: camelCase + `Repository` suffix — `sessionRepository.ts`, `pointRepository.ts`, `walletRepository.ts`
- Pure domain modules: camelCase — `calories.ts`, `currency.ts`, `records.ts`, `streak.ts`, `splits.ts`
- Utilities: camelCase — `geo.ts`, `geojson.ts`, `douglasPeucker.ts`, `selfIntersection.ts`
- Tests: same basename + `.test.ts(x)` — `pipeline.test.ts`, `AreaCalculator.test.ts`, `Toast.test.tsx`

**Files (Go):**
- snake_case for multi-word — `slog_handler.go`, `debug_session_middleware.go`, `pii_deny_list.go`, `featureflag_adapter.go`
- Single-word lowercase — `jwt.go`, `metrics.go`, `auth.go`, `repository.go`, `user.go`, `http.go`, `otp.go`
- Tests: same basename + `_test.go` — `jwt_test.go`, `auth_test.go`
- Migrations: zero-padded sequence + name + direction — `0001_users.up.sql` / `0001_users.down.sql`

**Files (other):**
- Workflows: kebab-case — `backend-cd.yml`, `android-release.yml`, `secret-scan-full.yml`
- Markdown docs (root + docs/): SHOUTY-KEBAB or UPPERCASE — `STATUS.md`, `README.md`, `CLAUDE.md`, `RUNNING_ECOSYSTEM_TZ.md`, `API-CONTRACT-v1.0.md`
- ADRs: `NNNN-kebab-case.md` — `0011-scope-reset-to-closed-beta-lean.md`
- Phase folders: `NN-kebab-name/` — `04-ci-cd-pipeline/`, `06-release-signing/`
- SOPS YAML: kebab-case in `.secrets/<env>/` — `mobile-signing.yaml`, `shared.yaml`
- Shell / Python scripts in `scripts/`: snake_case — `deploy_observability_stack.sh`, `smoke_metrics.py`

**Directories:**
- Mobile `src/`: lowercase one-word — `auth/`, `state/`, `storage/`, `domain/`, `pipeline/`, `map/`, etc.
- Backend services: kebab-case — `activity-sync/`, `realtime-gw/`, `social-graph/`
- Ansible roles: kebab-case — `alloy-shipper/`, `sport-stack/`
- Adapter subdir is always literal `adapters/`
- Test colocation: `__tests__/`, `__mocks__/`, `__fixtures__/`

**Functions / Symbols (TypeScript):**
- Functions / variables: camelCase
- Types / interfaces / React components: PascalCase
- Constants: SCREAMING_SNAKE_CASE — `TASK_NAME`, `FLUSH_THRESHOLD`, `AREA_RECOMPUTE_INTERVAL_MS`, `STYLE_URLS`, `FOREGROUND_SERVICE`, `MODE_OPTIONS`

**Functions / Symbols (Go):**
- Exported identifiers: PascalCase — `NewSigner`, `UserRepo`, `Middleware`
- Unexported: camelCase — `serviceName`, `envOr`, `envRequire`
- Packages: lowercase one-word — `auth`, `observability`, `clientversion`, `featureflags`

## Where to Add New Code

**New screen / modal:**
- Primary: `apps/mobile-rn/src/ui/<Name>Modal.tsx` (modals) OR `apps/mobile-rn/src/navigation/screens/<tab>/<Name>Screen.tsx` (full screens)
- Wire into navigation in `apps/mobile-rn/src/navigation/AppTabs.tsx` or `RootNavigator.tsx`
- Tests: `apps/mobile-rn/src/__tests__/<Name>.test.tsx` or co-located `__tests__/`

**New design-system component:**
- Primary: `apps/mobile-rn/src/design/components/<Name>.tsx`
- Export from `apps/mobile-rn/src/design/index.ts`
- Theme tokens: extend `apps/mobile-rn/src/design/tokens.ts`

**New Zustand store:**
- Primary: `apps/mobile-rn/src/state/<area>.ts`
- Export `useXStore` from `create<...>()(...)`
- If persisted, use the MMKV pattern from `state/settings.ts` (createMMKV + createJSONStorage)
- Tests: `apps/mobile-rn/src/state/__tests__/`

**New adapter (port + impl):**
- Interface: `apps/mobile-rn/src/<area>/<Area>Adapter.ts`
- Concrete impl: `apps/mobile-rn/src/<area>/adapters/<Provider><Area>Adapter.ts`
- Public re-export: `apps/mobile-rn/src/<area>/index.ts`
- Never import the SDK outside `adapters/`

**New Mapbox feature:**
- Add a Layer component in `apps/mobile-rn/src/map/components/<Name>Layer.tsx`
- Re-export from `apps/mobile-rn/src/map/index.ts`
- Consumers import only from `src/map`, never from `@rnmapbox/maps`

**New SQLite table / migration:**
- Bump `TARGET_VERSION` in `apps/mobile-rn/src/storage/database.ts`
- Append a case in `runMigrationsOn(db)`
- Document the new version with a one-liner in the JSDoc comment block above `getDatabase`
- Create the matching repository file `apps/mobile-rn/src/storage/<aggregate>Repository.ts`
- Integration test: `apps/mobile-rn/src/__tests__/<aggregate>Repository.integration.test.ts` (use `_setDatabase` test hook)

**New pure domain logic:**
- Primary: `apps/mobile-rn/src/domain/<name>.ts` (or sub-folder if it has sub-modules)
- Zero platform imports allowed; use stdlib + other domain modules only
- Tests: `apps/mobile-rn/src/__tests__/<name>.test.ts`

**New pipeline filter:**
- Primary: `apps/mobile-rn/src/pipeline/filters/<Name>Filter.ts`
- Implement the `Filter` interface from `pipeline/Filter.ts`
- Wire into `createDefaultPipeline()` in `apps/mobile-rn/src/pipeline/index.ts`
- Tests cover ≥90% per CLAUDE.md target

**New backend microservice:**
- Primary: `services/backend/<name>/` mirroring existing layout (`cmd/server/main.go`, `internal/{handler,service,repository,domain}/`, own `go.mod`)
- OpenAPI spec: `services/backend/api/<name>.yaml`
- Migrations: append to `services/backend/migrations/`
- Add to docker-compose + Ansible role `sport-stack` deployment

**New shared Go package:**
- Primary: `services/backend/pkg/<name>/`
- Package belongs to module `github.com/runningecosystem/backend/pkg`
- Add to `services/backend/pkg/go.mod` if new external deps
- Imported by services through their own `go.mod` (each service module references `pkg` by path)

**New ADR (architectural decision):**
- Primary: `docs/DECISIONS/NNNN-kebab-title.md` (use next sequence number after 0012)
- Reference from `CLAUDE.md` or `STATUS.md` when the decision is consumed

**New phase planning artifact:**
- Primary: `.planning/phases/NN-kebab-name/<NN>-RESEARCH.md`, `<NN>-PLAN.md`, `<NN>-CONTEXT.md`
- Update `.planning/STATE.md` to point at the active phase

**New secret:**
- Primary: `.secrets/<env>/<area>.yaml` (encrypted with `sops -e --in-place`)
- Recipient list lives in `.sops.yaml`
- Update `docs/SECRETS.md` with recovery procedure (per D-15 / SIGN-01 pattern)
- For mobile signing specifically: `.secrets/prod/mobile-signing.yaml`

**New CI workflow:**
- Primary: `.github/workflows/<name>.yml`
- Pin actions by SHA or `@vN` (no floating `@main`)
- Never tag `:latest` in image flows

**New ops script:**
- Primary: `scripts/<verb_object>.{sh,py}` — snake_case
- Smoke scripts follow `smoke_*` prefix

## Special Directories

**`apps/mobile_flutter.archived/`:**
- Purpose: Archived Flutter prototype (decision per ADR-0001)
- Generated: No
- Committed: Yes
- Do NOT modify or take patterns from it; the active client is `apps/mobile-rn/`

**`.claude/worktrees/`:**
- Purpose: Claude Code's working copies for parallel agent runs
- Generated: Yes (by Claude Code)
- Committed: No (gitignored)

**`apps/mobile-rn/src/__fixtures__/`:**
- Purpose: Intentional lint-failure fixtures to validate the ESLint token-secret guard
- Generated: No, hand-written
- Lint-ignored by `eslint.config.js`; verified explicitly via `npx eslint --no-ignore`

**`apps/mobile-rn/node_modules/`, `apps/mobile-rn/.expo/`, `apps/mobile-rn/coverage/`, `apps/mobile-rn/android/build/`:**
- Purpose: Tool outputs
- Generated: Yes
- Committed: No

**`.planning/phases/_archive/`:**
- Purpose: Completed / superseded phase planning
- Generated: No
- Committed: Yes

**`.secrets/`:**
- Purpose: SOPS-encrypted secrets
- Generated: No
- Committed: Yes (ciphertext only — never decrypt and commit plaintext)

**`tests/runs/`:**
- Purpose: Field-test session outputs (GPX, logs)
- Generated: Yes (manual field tests)
- Committed: Selectively

**`services/backend/scripts/__pycache__/` + `scripts/__pycache__/`:**
- Purpose: Python bytecode caches
- Generated: Yes
- Committed: No (gitignored)

---

*Structure analysis: 2026-05-23*
