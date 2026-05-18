# Codebase Structure

**Analysis Date:** 2026-05-18

## Directory Layout

```
sport/                                  # Monorepo root
├── .github/workflows/                  # CI/CD pipelines (3 active workflows)
│   ├── backend-ci.yml                  # Test + lint + SAST + secret-scan-diff + trivy + no-latest guard
│   ├── backend-cd.yml                  # Build + cosign keyless + SLSA L2 + push GHCR
│   └── secret-scan-full.yml            # Full-history secret scan (cron)
├── .planning/                          # GSD planning artifacts (kept in repo)
│   ├── STATE.md                        # Current phase + decisions
│   ├── ROADMAP.md                      # Phase roadmap
│   ├── PROJECT.md                      # Project charter
│   ├── REQUIREMENTS.md                 # Distilled requirements
│   ├── MILESTONES.md                   # Milestone tracker
│   ├── codebase/                       # Codebase maps (this file, ARCHITECTURE.md, ...)
│   ├── phases/                         # Per-phase CONTEXT/RESEARCH/PLAN/SUMMARY docs
│   └── config.json                     # GSD config
├── .secrets/                           # SOPS-encrypted secrets at rest
│   └── prod/shared.yaml                # age-encrypted; decrypt via `delegate_to: localhost`
├── .sops.yaml                          # SOPS recipient config (age public key)
├── .gitleaks.toml                      # Gitleaks rules
├── .trivyignore.yaml                   # Trivy ignored CVEs
├── .golangci.yml                       # Linter config (used by CI per-module loop)
├── .pre-commit-config.yaml             # Pre-commit hooks
├── .editorconfig                       # Cross-editor formatting
├── .gitattributes                      # Line endings
├── .gitignore                          # Repo ignores
├── .trufflehog/                        # Trufflehog config
├── .vscode/                            # Workspace settings
├── apps/
│   └── mobile-rn/                      # Expo React Native client (sole mobile app)
├── services/
│   └── backend/                        # Go monorepo (go.work workspace)
├── infra/
│   └── ansible/                        # Provider-agnostic VPS deploy (Hetzner)
├── docs/
│   ├── RUNNING_ECOSYSTEM_TZ.md         # Technical specification (source of truth)
│   ├── DEVELOPMENT_PLAN.md             # Phased dev plan with task IDs
│   ├── API-CONTRACT-v1.0.md            # v1.0 API contract
│   ├── INTEGRATIONS.md                 # External integration catalog
│   ├── SECRETS.md                      # Secrets handling guide
│   ├── AUDIT.md                        # Audit-trail spec
│   ├── CURRENCY.md                     # In-app currency rules
│   ├── REVIEW_ROUNDS_1-3.md            # Past review notes
│   ├── v1.0-SCOPE.md                   # v1.0 scope freeze
│   ├── DECISIONS/                      # ADRs (0001–0007)
│   └── RUNBOOKS/                       # Operational runbooks (deploy.md, sops-edit.md)
├── tests/                              # Cross-cutting / field-test artifacts
│   ├── FIELD_PROTOCOL.md
│   └── runs/                           # Captured field-test traces
├── Makefile                            # Top-level: `make rollback v=<tag>`, `make rollback-drill`
├── CLAUDE.md                           # Project guidance for Claude Code (Russian)
├── STATUS.md                           # Live status board
├── README.md
├── CHANGELOG.md
├── CODEOWNERS
└── DECISION.md                         # High-level decision log
```

## Mobile App Tree — `apps/mobile-rn/`

```
apps/mobile-rn/
├── App.tsx                             # Root component (ErrorBoundary > Theme > Toast > RootNavigator)
├── App.legacy.tsx                      # Pre-Cursona-redesign root, kept until flow stabilizes
├── index.ts                            # Expo entry — registerRootComponent(App)
├── app.json                            # Expo app config
├── eas.json                            # EAS Build profiles
├── package.json
├── tsconfig.json
├── jest.config.js
├── eslint.config.js
├── .prettierrc.json
├── .env / .env.example                 # EXPO_PUBLIC_* — NOT secret-bearing
├── __mocks__/                          # Jest manual mocks
├── android/                            # Native Android project (Mapbox token plumbing)
├── assets/                             # Icons, splash, fonts
├── coverage/                           # Jest coverage output
├── README.md
└── src/
    ├── auth/                           # Token storage, OAuth providers, apiClient
    │   ├── apiClient.ts                # 401-refresh-retry, 426 force-update, X-Client-Version
    │   ├── tokenStorage.ts             # Expo SecureStore wrapper
    │   ├── authProviders.ts
    │   └── __tests__/
    ├── design/                         # Theme tokens + ThemeProvider (Cursona redesign)
    │   ├── ThemeProvider.tsx
    │   ├── tokens.ts
    │   ├── components/
    │   ├── icons/
    │   └── index.ts
    ├── domain/                         # PURE TS — no React/Expo/Mapbox imports
    │   ├── AreaCalculator.ts           # Local-plane projection + shoelace
    │   ├── ClosureDetector.ts
    │   ├── athlete.ts | calories.ts | currency.ts | gpx.ts | lap.ts
    │   ├── metrics.ts | records.ts | recordsFormat.ts | sensorAssociation.ts
    │   ├── social.ts | splits.ts | stats.ts | streak.ts | walletDomain.ts | types.ts
    │   ├── session/SessionManager.ts   # Run-session lifecycle
    │   └── training/                   # banister, tss, vo2max, lthr, planGenerator, racePredictor, workoutSession
    ├── pipeline/                       # GPS filter chain
    │   ├── Pipeline.ts | Filter.ts | index.ts
    │   └── filters/                    # Accuracy, Kalman, Jump, MinSegment
    ├── map/                            # SOLE Mapbox import boundary
    │   ├── MapboxView.tsx              # @rnmapbox/maps re-export façade
    │   ├── offline.ts                  # Offline tile pack management
    │   ├── util/
    │   ├── components/                 # TrackLayer, CorridorLayer, ZoneLayer, HistoryTerritoryLayer, LocationPuckLayer, RegionPickerOverlay
    │   └── index.ts                    # setMapboxAccessToken + re-exports
    ├── location/                       # GPS adapter port + impls
    │   ├── LocationAdapter.ts          # Interface
    │   ├── adapters/ExpoLocationAdapter.ts
    │   └── index.ts
    ├── sensors/                        # External sensor adapter port + impls (HRM, footpod)
    │   ├── SensorAdapter.ts
    │   ├── adapters/
    │   └── index.ts
    ├── health/                         # Health data import adapters
    │   ├── HealthAdapter.ts            # Interface
    │   ├── HealthKitAdapter.ts         # iOS
    │   ├── HealthConnectAdapter.ts     # Android
    │   ├── StravaAdapter.ts            # OAuth
    │   ├── MockHealthAdapter.ts
    │   ├── sync.ts | importPlan.ts | importRepo.ts | importSanity.ts
    │   └── index.ts
    ├── realtime/                       # WebSocket adapter port + impls
    │   ├── RealtimeAdapter.ts
    │   ├── adapters/
    │   └── index.ts
    ├── notifications/                  # Push/in-app adapter port + impls
    │   ├── NotificationsAdapter.ts
    │   ├── adapters/
    │   └── index.ts
    ├── modules/                        # Feature modules (vertical slices)
    │   ├── gamification/               # domain/, state/, sync/, index.ts
    │   ├── moderation/
    │   └── permissions/
    ├── storage/                        # SQLite repositories (expo-sqlite)
    │   ├── database.ts                 # Connection + schema management
    │   ├── pointRepository.ts | lapRepository.ts | sessionRepository.ts
    │   ├── recordsRepository.ts | relationsRepository.ts | sensorRepository.ts
    │   ├── socialRepository.ts | walletRepository.ts
    ├── state/                          # zustand stores (one per concern)
    │   ├── activity.ts | auth.ts | featureflags.ts | featureflags.defaults.ts
    │   ├── featureflagsApi.ts | forceUpdate.ts | history.ts | map.ts
    │   ├── sensors.ts | settings.ts | sync.ts | training.ts | wallet.ts
    │   ├── workoutPlayer.ts
    │   ├── social/                     # useChatStore, useChatsStore, useNotificationsStore, useRealtimeStore, useUsersStore
    │   └── __tests__/
    ├── sync/                           # Offline-first sync engine
    │   ├── syncEngine.ts               # Activity upload reconciliation
    │   ├── messageSync.ts              # Conversation sync
    │   └── mediaUpload.ts              # Presigned upload to S3/MinIO
    ├── navigation/                     # React Navigation stacks
    │   ├── RootNavigator.tsx           # Auth gate + push deep-link
    │   ├── AppTabs.tsx | AuthStack.tsx | OnboardingStack.tsx
    │   ├── types.ts
    │   └── screens/                    # Screen components grouped by tab: auth/, chats/, journal/, me/, record/ + ForeignProfileScreen.tsx
    ├── ui/                             # Modals, cards, widgets (pre-redesign mix)
    │   ├── AuthScreen.tsx | HistoryModal.tsx | ManualEntryModal.tsx
    │   ├── MetricsBar.tsx | ProfileModal.tsx | SensorsModal.tsx
    │   ├── SessionDetailModal.tsx | StatsModal.tsx | Toast.tsx
    │   ├── TodayCard.tsx | TrainingModal.tsx | WorkoutPlayer.tsx
    │   ├── format.ts                   # Display formatters
    │   ├── charts/
    │   ├── screens/                    # ForceUpdateScreen.tsx + __tests__
    │   └── social/                     # ChatScreen.tsx, UserSearchScreen.tsx
    ├── util/                           # Pure helpers (no platform deps where possible)
    │   ├── geo.ts                      # Projection helpers (lat/lon ↔ local plane)
    │   ├── corridor.ts | douglasPeucker.ts | selfIntersection.ts
    │   ├── geojson.ts | speech.ts | expoSpeechAdapter.ts | version.ts
    │   └── __tests__/
    ├── __fixtures__/                   # Test fixtures (GPS traces, etc.)
    └── __tests__/                      # Cross-module integration tests (48 files)
```

## Backend Tree — `services/backend/`

```
services/backend/
├── go.work                             # Workspace lists 9 modules
├── go.work.sum
├── Makefile                            # Dev-ops: build/run/test
├── README.md
├── docker-compose.yml                  # Dev (postgres + nats only)
├── docker-compose.prod.yml             # Prod 13-container stack (4 stateful + 8 Go + 1 gateway)
├── docker-compose.observability.yml    # Opt-in Prometheus + Grafana
├── .dockerignore
│
├── pkg/                                # SHARED Go libraries (own go.mod)
│   ├── go.mod | go.sum
│   ├── auth/                           # JWT signer + verifier
│   ├── audit/                          # Audit-log writer (Postgres)
│   ├── clientversion/                  # X-Client-Version middleware + 426 force-update
│   ├── featureflags/                   # Postgres-backed flag store with TTL cache
│   ├── permissions/                    # ABAC checks
│   ├── ratelimit/                      # Redis-backed buckets
│   └── gamification/                   # XP / grades shared rules
│
├── identity/                           # Per-service module (same shape for all 8)
│   ├── go.mod | go.sum
│   ├── Dockerfile
│   ├── cmd/server/main.go              # Entry: ENV, pool, middleware, http.Server
│   └── internal/
│       ├── domain/user.go              # Pure types
│       ├── service/                    # auth.go, otp.go (business logic)
│       ├── handler/                    # http.go, featureflags.go, otp.go
│       └── repository/                 # repository.go (interface), memory/, postgres/
│
├── activity-sync/                      # Same 4-layer shape
├── feed/                               # + internal/cleanup/ (janitor goroutines)
├── media/                              # Same shape; uses MinIO presigned URLs
├── messaging/                          # + internal/outbox/publisher.go + internal/permissions/
├── notifications/                      # Same shape; Expo Push integration
├── realtime-gw/                        # Variant: internal/gw/{connection,handler,registry}.go (no Postgres, only NATS+JWT)
├── social-graph/                       # Same shape
│
├── gateway/                            # Caddy 2 — HTTPS terminator + reverse proxy
│   ├── Caddyfile                       # Dev
│   ├── Caddyfile.prod                  # Prod (ACME via Let's Encrypt, sslip.io)
│   └── admin/                          # Static admin dashboard (HTML/JS)
│
├── api/                                # OpenAPI specs per service + redocly config
│   ├── _shared/
│   ├── identity.yaml | activity-sync.yaml | feed.yaml | media.yaml
│   ├── messaging.yaml | notifications.yaml | realtime-gw.yaml
│   ├── social-graph.yaml | gateway.yaml
│   └── redocly.yaml
│
├── migrations/                         # golang-migrate format (up/down pairs)
│   ├── 0000_extensions.{up,down}.sql
│   ├── 0001_users.* … 0021_featureflags.*
│   └── 9990_drill_metadata_col.* | 9991_drill_drop_metadata_col.*   # CICD-04 rollback drill
│
├── scripts/                            # Operator + smoke test scripts (Python + Bash)
│   ├── drill_assert_schema.sh          # Used by rollback-drill
│   ├── openapi-routes-check/
│   ├── secrets/
│   ├── smoke_abac_muted.py | smoke_moderation.py | smoke_otp.py
│   ├── smoke_permissions.py | smoke_posts.py | smoke_ratelimit.py
│   ├── smoke_realtime_feed.py | smoke_realtime_stories.py
│   ├── smoke_stories.py | smoke_xp.py | test_clientversion_caddy.sh
│
├── deploy/                             # Reserved (helm/ + README) — currently unused (deployment is Ansible)
└── observability/                      # Prometheus + Grafana provisioning files (opt-in)
```

## Infrastructure Tree — `infra/ansible/`

```
infra/ansible/
├── ansible.cfg                         # Ansible config (callback plugins, retries, etc.)
├── site.yml                            # Top-level playbook (2 plays: bootstrap + deploy)
├── group_vars/
│   └── all.yml                         # deploy_user, dev_admin_ips, caddy_acme_email, ssh keys
├── inventory/
│   ├── dev/hosts.yml
│   └── prod/
│       ├── hosts.yml
│       └── group_vars/                 # Prod-specific overrides
└── roles/
    ├── common/                         # OS bootstrap + SSH hardening
    │   ├── tasks/ | handlers/ | defaults/ | files/
    ├── docker/                         # Docker engine install + deploy in docker group
    ├── ufw/                            # OS firewall (replaces Hetzner Cloud Firewall post Phase 3 pivot)
    └── sport-stack/                    # Application deployer (the heavy lifter)
        ├── tasks/
        │   ├── main.yml                # Orchestrates the 7 steps
        │   ├── decrypt_sops.yml        # delegate_to: localhost SOPS decrypt → /run/sport.env tmpfs
        │   ├── run_migrations.yml      # One-shot migrate/migrate container
        │   └── smoke_probe.yml         # curl loop on /healthz — gates INFRA-07
        ├── templates/
        │   ├── sport-stack.service.j2  # systemd umbrella unit
        │   └── sport.env.j2            # Templated environment file
        ├── handlers/
        └── defaults/
```

## Directory Purposes

**`apps/mobile-rn/`:**
- Purpose: Expo RN client (the only mobile codebase)
- Contains: TypeScript source, Jest tests, Android native project, EAS config
- Key files: `App.tsx`, `package.json`, `app.json`, `src/`

**`apps/mobile-rn/src/domain/`:**
- Purpose: Pure-TS domain layer (no React, no Expo, no Mapbox)
- Contains: Entities, value objects, training/area math
- Key files: `AreaCalculator.ts`, `ClosureDetector.ts`, `session/SessionManager.ts`, `training/*.ts`

**`apps/mobile-rn/src/map/`:**
- Purpose: SOLE Mapbox SDK import site
- Contains: MapboxView facade + Layer components (TrackLayer, CorridorLayer, ZoneLayer, etc.)
- Key files: `MapboxView.tsx`, `components/TrackLayer.tsx`, `offline.ts`

**`apps/mobile-rn/src/{location,sensors,realtime,notifications,health}/`:**
- Purpose: Hexagonal adapter ports
- Pattern: Interface file at root + `adapters/` subdir with concrete implementations

**`apps/mobile-rn/src/modules/`:**
- Purpose: Vertical feature slices (gamification, moderation, permissions)
- Contains: Each module has `domain/`, `state/`, `sync/`, `index.ts`

**`services/backend/`:**
- Purpose: Go monorepo (workspace, no root `go.mod`)
- Contains: 9 modules (8 services + `pkg`), gateway config, migrations, api specs, scripts

**`services/backend/pkg/`:**
- Purpose: Cross-service Go libraries
- Contains: One subdir per concern (auth, audit, clientversion, featureflags, permissions, ratelimit, gamification)
- Import path: `github.com/runningecosystem/backend/pkg/<name>`

**`services/backend/<service>/`:**
- Purpose: One HTTP microservice per concern (8 total)
- Layout: `Dockerfile + go.mod + go.sum + cmd/server/main.go + internal/{domain,handler,service,repository}/`
- Variations: `messaging/internal/outbox/`, `messaging/internal/permissions/`, `feed/internal/cleanup/`, `realtime-gw/internal/gw/`

**`services/backend/migrations/`:**
- Purpose: golang-migrate sequential SQL migrations
- Naming: `NNNN_<name>.{up,down}.sql` (NNNN is 4-digit, monotonically increasing)
- Range: 0000–0021 production, 9990–9991 reserved for CICD-04 rollback drill

**`services/backend/scripts/`:**
- Purpose: Smoke tests + operator scripts
- Contains: Python smoke scripts (smoke_*.py) + bash drill assertions

**`services/backend/api/`:**
- Purpose: OpenAPI 3 specs (one YAML per service)
- Contains: `_shared/` schemas + service specs + `redocly.yaml`

**`services/backend/gateway/`:**
- Purpose: Caddy 2 configuration
- Contains: `Caddyfile` (dev), `Caddyfile.prod`, `admin/` static dashboard

**`infra/ansible/`:**
- Purpose: VPS provisioning + application deployment
- Contains: `site.yml`, `group_vars/`, `inventory/`, `roles/`

**`infra/ansible/roles/sport-stack/`:**
- Purpose: Application deployment role (the heart of CD)
- Contains: tasks (orchestrator + decrypt + migrations + smoke), templates (systemd + env)

**`.github/workflows/`:**
- Purpose: GitHub Actions definitions
- Contains: `backend-ci.yml`, `backend-cd.yml`, `secret-scan-full.yml`

**`.planning/`:**
- Purpose: GSD command artifacts (codebase maps, phase docs, state, roadmap)
- Generated: Partially (codebase/ is regenerated; phases/ accrue per phase)
- Committed: Yes

**`.secrets/`:**
- Purpose: SOPS-encrypted secrets
- Contains: `prod/shared.yaml` (age-encrypted)
- Generated: No (hand-edited via `docs/RUNBOOKS/sops-edit.md`)
- Committed: Yes (encrypted)

**`docs/`:**
- Purpose: Project documentation
- Contains: TZ (technical spec), DEVELOPMENT_PLAN, ADRs, runbooks, scope docs
- Key files: `RUNNING_ECOSYSTEM_TZ.md`, `DEVELOPMENT_PLAN.md`, `RUNBOOKS/deploy.md`

**`docs/DECISIONS/`:**
- Purpose: Architecture Decision Records (ADRs)
- Naming: `NNNN-<slug>.md`

**`tests/`:**
- Purpose: Cross-cutting / field-test artifacts (NOT unit tests — those live next to code)
- Contains: `FIELD_PROTOCOL.md`, `runs/` (captured GPS traces from field tests)

## Key File Locations

**Entry Points:**
- `apps/mobile-rn/index.ts` — Expo entry: registers `App`
- `apps/mobile-rn/App.tsx` — Mobile root component
- `services/backend/<svc>/cmd/server/main.go` — One Go server per service (8 total)
- `infra/ansible/site.yml` — Ansible orchestration entry
- `Makefile` — Top-level operator commands (rollback)

**Configuration:**
- `apps/mobile-rn/app.json` — Expo app config
- `apps/mobile-rn/.env.example` — Public env var template (`EXPO_PUBLIC_*`)
- `services/backend/docker-compose.prod.yml` — Prod stack (13 containers)
- `services/backend/go.work` — Go workspace manifest
- `services/backend/gateway/Caddyfile.prod` — HTTPS + reverse proxy routes
- `infra/ansible/group_vars/all.yml` — Cross-env vars
- `infra/ansible/inventory/prod/hosts.yml` — Prod hosts
- `.sops.yaml` — SOPS recipient (age public key)
- `.golangci.yml` — Go linter config
- `.gitleaks.toml` — Gitleaks rules
- `.trivyignore.yaml` — Trivy ignored CVEs

**Core Logic:**
- `apps/mobile-rn/src/pipeline/Pipeline.ts` — GPS filter chain composer
- `apps/mobile-rn/src/domain/session/SessionManager.ts` — Run-session FSM
- `apps/mobile-rn/src/domain/AreaCalculator.ts` — Local-plane area math
- `apps/mobile-rn/src/auth/apiClient.ts` — HTTP client with 401-refresh + 426 force-update
- `apps/mobile-rn/src/sync/syncEngine.ts` — Offline-first reconciliation
- `services/backend/identity/internal/service/auth.go` — Auth business logic
- `services/backend/pkg/auth/jwt.go` — JWT signer/verifier (≥32 byte secret)
- `services/backend/messaging/internal/outbox/publisher.go` — Transactional outbox pattern

**Testing:**
- `apps/mobile-rn/jest.config.js` — Jest config
- `apps/mobile-rn/src/__tests__/` — 48 cross-module test files
- `apps/mobile-rn/__mocks__/` — Jest manual mocks
- `services/backend/<svc>/internal/<layer>/*_test.go` — Per-service Go tests (co-located)
- `services/backend/scripts/smoke_*.py` — Smoke probes (operator-run)

**CI/CD:**
- `.github/workflows/backend-ci.yml` — Test + lint + SAST + scan
- `.github/workflows/backend-cd.yml` — Build + cosign + SLSA + push GHCR
- `.github/workflows/secret-scan-full.yml` — Cron full-history secret scan
- `Makefile` — `make rollback`, `make rollback-drill`

**Infrastructure:**
- `infra/ansible/site.yml` — Orchestration
- `infra/ansible/roles/sport-stack/tasks/main.yml` — Deploy logic
- `infra/ansible/roles/sport-stack/templates/sport-stack.service.j2` — systemd unit

## Naming Conventions

**Files (mobile, TypeScript):**
- Components: `PascalCase.tsx` (e.g. `MapboxView.tsx`, `TrackLayer.tsx`, `RootNavigator.tsx`)
- Hooks/stores: `camelCase.ts` for stores (e.g. `activity.ts`, `auth.ts`); `useXxxStore` for the exported hook
- Domain/utility modules: `camelCase.ts` (e.g. `calories.ts`, `geo.ts`)
- Interface ports: `PascalCaseAdapter.ts` (e.g. `LocationAdapter.ts`, `MapAdapter` lives implicit in `MapboxView.tsx`)
- Tests: co-located in `__tests__/` directories, `<name>.test.ts(x)` or `<name>.spec.ts(x)`

**Files (backend, Go):**
- Packages: `lowercase` (no underscores, no hyphens) — `domain`, `handler`, `repository`, `service`
- Source files: `lowercase_with_underscores.go` (Go standard); single-word preferred (`auth.go`, `otp.go`, `user.go`)
- Tests: `<name>_test.go` co-located
- Service directories: `kebab-case` (`activity-sync`, `realtime-gw`, `social-graph`) — these are NOT Go package names, they map to directory names + import path `github.com/runningecosystem/backend/<service>/internal/...`

**Directories:**
- Mobile feature dirs: `camelCase` or single word (`auth`, `sync`, `pipeline`, `location`)
- Backend service dirs: `kebab-case` (`activity-sync`, `realtime-gw`, `social-graph`)
- Backend internal layers: single lowercase word (`domain`, `service`, `handler`, `repository`, `outbox`, `cleanup`, `permissions`, `gw`)
- Ansible roles: `kebab-case` (`sport-stack`)

**Migrations:**
- `NNNN_<slug>.{up,down}.sql` — 4-digit zero-padded sequential, both up and down required

**Docker images:**
- `ghcr.io/ismaill01/<service>:<tag>` where `<tag>` is `sha-<short>` or `vX.Y.Z` or `vX.Y` — NEVER `:latest`

**Git branches:**
- `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>` (observed in commit log)

**Environment variables:**
- Mobile: `EXPO_PUBLIC_*` for client-visible vars (`EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `EXPO_PUBLIC_IDENTITY_URL`, `EXPO_PUBLIC_SYNC_URL`, `EXPO_PUBLIC_API_URL`)
- Backend per-service: `<SERVICE>_HTTP_ADDR`, `<SERVICE>_DB_URL` (e.g. `IDENTITY_HTTP_ADDR`, `ACTIVITY_SYNC_DB_URL`)
- Cross-service: `IDENTITY_JWT_SECRET`, `NATS_URL`, `REDIS_URL`, `POSTGRES_PASSWORD`, `CADDY_ACME_EMAIL`, `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `EXPO_ACCESS_TOKEN`, `SPORT_STACK_TAG`
- ENV vars marked `${VAR:?need VAR}` in compose are mandatory — startup fails without them

## Where to Add New Code

**New Mobile Feature:**
- If self-contained vertical slice: create `apps/mobile-rn/src/modules/<feature>/{domain,state,sync,index.ts}/`
- If new domain concept: add file to `apps/mobile-rn/src/domain/`
- If new screen: add component to `apps/mobile-rn/src/navigation/screens/<tab>/` and wire into the relevant stack
- If new modal/widget: add to `apps/mobile-rn/src/ui/`
- Tests: co-located `__tests__/` next to the code OR top-level `apps/mobile-rn/src/__tests__/` for cross-module integration

**New External Sensor / Source:**
- Define port in `apps/mobile-rn/src/<area>/<Name>Adapter.ts`
- Implement in `apps/mobile-rn/src/<area>/adapters/<Concrete>Adapter.ts`
- Register/inject at app boot (`App.tsx`) or in the consuming store
- Pattern reference: `src/location/LocationAdapter.ts` + `src/location/adapters/ExpoLocationAdapter.ts`

**New Map Layer:**
- Add component to `apps/mobile-rn/src/map/components/<Name>Layer.tsx`
- Use only `LineLayer + GeoJsonSource` for tracks (NEVER `PolylineAnnotation`)
- Re-export from `apps/mobile-rn/src/map/index.ts` if needed by other layers

**New Go Microservice:**
- Create `services/backend/<service-kebab>/` with `go.mod`, `Dockerfile`, `cmd/server/main.go`, `internal/{domain,handler,service,repository}/`
- Add `./<service-kebab>` line to `services/backend/go.work`
- Add `service: <name>` to the CI matrix in `.github/workflows/backend-ci.yml` (jobs: test, lint, gosec, govulncheck, docker-build) AND CD matrix in `.github/workflows/backend-cd.yml`
- Add service block to `services/backend/docker-compose.prod.yml` using `${SPORT_STACK_TAG:?need SPORT_STACK_TAG}` image tag
- Add `handle /path/*` block to `services/backend/gateway/Caddyfile.prod`
- Add OpenAPI spec to `services/backend/api/<service>.yaml`

**New HTTP Route in Existing Service:**
- Add `mux.HandleFunc("METHOD /path", h.handler)` in `internal/handler/http.go` (Go 1.22+ method-routed mux)
- Add handler method on the handler struct
- Push business logic into `internal/service/`
- Push DB ops into `internal/repository/postgres/`
- Update `services/backend/api/<service>.yaml` (OpenAPI spec)
- Add Caddy route to `services/backend/gateway/Caddyfile.prod` if exposed externally

**New Database Migration:**
- Create `services/backend/migrations/NNNN_<slug>.up.sql` AND `NNNN_<slug>.down.sql` (both required, NNNN = next sequential)
- Run locally: `cd services/backend && docker compose run --rm migrations -path migrations -database $DB_URL up`
- Down must be tested — it's invoked by `make rollback v=<tag>` (which runs `migrate down 1`)

**New Shared Go Library:**
- Add subdir to `services/backend/pkg/<name>/`
- Update `services/backend/pkg/go.mod` if new external deps
- Import as `github.com/runningecosystem/backend/pkg/<name>`
- Add `<name>` to the `services` matrix in `.github/workflows/backend-ci.yml` (pkg is already there)

**New Cross-Service Async Event:**
- Producer: write outbox row in same DB tx (pattern in `services/backend/messaging/internal/outbox/publisher.go`)
- Subscriber: add NATS subscription in target service `cmd/server/main.go`
- Subject naming: `<source>.<event>` (e.g. `messaging.message.created`)

**New Ansible Role:**
- Create `infra/ansible/roles/<name>/{tasks,handlers,defaults,templates}/`
- Add role to `infra/ansible/site.yml` under the appropriate play

**New ADR:**
- Create `docs/DECISIONS/NNNN-<slug>.md` (next sequential number after 0007)

**Utilities:**
- Mobile pure helpers: `apps/mobile-rn/src/util/` (geo, geojson, douglasPeucker, etc.)
- Go shared helpers: `services/backend/pkg/<topic>/`

## Special Directories

**`apps/mobile-rn/android/`:**
- Purpose: Native Android project (managed by Expo prebuild but committed)
- Generated: Partially (initially generated by `expo prebuild`; hand-edits committed)
- Committed: Yes

**`apps/mobile-rn/node_modules/`:**
- Purpose: npm dependencies
- Generated: Yes
- Committed: No (`.gitignore`)

**`apps/mobile-rn/coverage/`:**
- Purpose: Jest coverage output
- Generated: Yes
- Committed: No

**`apps/mobile-rn/.expo/`:**
- Purpose: Expo CLI cache
- Generated: Yes
- Committed: No

**`.secrets/prod/`:**
- Purpose: SOPS-encrypted production secrets
- Generated: No (edited via `sops` per `docs/RUNBOOKS/sops-edit.md`)
- Committed: Yes (encrypted)

**`.planning/phases/_archive/`:**
- Purpose: Closed-phase documents preserved for history
- Generated: No (moved by orchestrator on phase close)
- Committed: Yes

**`tests/runs/`:**
- Purpose: Captured GPS traces from field testing
- Generated: Yes (by mobile app's export feature)
- Committed: Yes (small CSV/JSON files)

**`services/backend/deploy/`:**
- Purpose: Reserved for future Helm charts; currently unused — production deployment is Ansible-based per Phase 3 pivot
- Generated: No
- Committed: Yes (stub)

**`services/backend/scripts/__pycache__/`:**
- Purpose: Python bytecode cache from smoke scripts
- Generated: Yes
- Committed: No (should be in `.gitignore` — verify)

---

*Structure analysis: 2026-05-18*
