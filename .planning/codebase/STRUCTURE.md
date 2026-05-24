# Codebase Structure

**Analysis Date:** 2026-05-24

## Directory Layout

```
sport/
├── apps/
│   └── mobile-rn/                   # Expo RN client (single mobile app — Flutter archived)
│       ├── App.tsx                  # Root component: providers + Plan 07-03/08-01 hook wiring
│       ├── App.legacy.tsx           # Pre-Cursona-redesign root, retained for stabilisation
│       ├── index.ts                 # registerRootComponent(App) — Expo entry
│       ├── app.json                 # Expo config
│       ├── eas.json                 # EAS build profiles
│       ├── jest.config.js
│       ├── tsconfig.json
│       ├── eslint.config.js
│       ├── .prettierrc.json
│       ├── package.json
│       ├── package-lock.json
│       ├── .env                     # local-only (gitignored); EXPO_PUBLIC_* values
│       ├── .env.example             # checked-in template
│       ├── __mocks__/               # Jest manual mocks
│       ├── assets/                  # icons, splash, fonts
│       ├── android/                 # NEW: full bare android tree (was hybrid pre-`f09e729`)
│       │   ├── settings.gradle
│       │   ├── build.gradle
│       │   ├── gradle.properties
│       │   ├── local.properties
│       │   ├── .gitignore
│       │   ├── gradle/wrapper/
│       │   └── app/
│       │       ├── build.gradle
│       │       ├── proguard-rules.pro
│       │       ├── release.keystore       # written by CI from SOPS; gitignored
│       │       ├── debug.keystore         # checked in
│       │       └── src/main/
│       │           ├── AndroidManifest.xml
│       │           ├── java/com/runningecosystem/mobile/
│       │           │   ├── MainActivity.kt
│       │           │   └── MainApplication.kt
│       │           └── res/                # mipmap-*, drawable-*, values{,-night}/
│       └── src/
│           ├── auth/                # apiClient (426 intercept), authProviders, tokenStorage
│           ├── design/              # Cursona tokens + ThemeProvider + atomic components
│           │   ├── components/      # Button, Card, FAB, TopBar, Avatar, Chip, …
│           │   └── icons/
│           ├── domain/              # Pure TS — no platform deps
│           │   ├── session/SessionManager.ts
│           │   └── training/        # workout, planGenerator, tss, vo2max, banister, …
│           ├── foreground/          # NEW (Plan 07-03 Task 2)
│           │   └── notification.ts  # Android sticky notification subscribed to activity store
│           ├── health/              # HealthAdapter + HealthKit/HealthConnect/Strava/Mock adapters
│           ├── location/            # LocationAdapter + ExpoLocationAdapter
│           │   └── adapters/
│           ├── map/                 # Single Mapbox boundary
│           │   ├── MapboxView.tsx
│           │   ├── components/      # TrackLayer, CorridorLayer, ZoneLayer, …
│           │   ├── util/simplify.ts
│           │   └── offline.ts
│           ├── media/               # MediaAdapter + ExpoMediaAdapter
│           ├── modules/             # Cross-cutting feature bundles (mini-DDD)
│           │   ├── gamification/{domain,state,sync,index.ts}
│           │   ├── moderation/{domain,state,sync,ui,index.ts}
│           │   └── permissions/
│           ├── navigation/          # React Navigation root + tab/auth stacks + screens
│           │   ├── RootNavigator.tsx
│           │   ├── AppTabs.tsx
│           │   ├── AuthStack.tsx
│           │   ├── OnboardingStack.tsx
│           │   └── screens/
│           │       ├── auth/        # Splash, Email, Code, Name, Birthday, Permissions, OnboardIntro
│           │       ├── chats/       # ChatsListScreen, ChatScreen, …
│           │       ├── journal/     # JournalScreen, SessionDetailScreen
│           │       ├── me/          # MeScreen, SettingsScreen, RecordsScreen, WalletScreen, …
│           │       └── record/      # TrackerStartScreen, TrackerLiveScreen, RunDetailsScreen + hooks/
│           ├── notifications/       # NotificationsAdapter + ExpoNotificationsAdapter
│           ├── pipeline/            # GPS filter chain
│           │   └── filters/         # AccuracyFilter, JumpFilter, KalmanFilter, MinSegmentFilter, PauseDetector
│           ├── realtime/            # RealtimeAdapter + WebSocket/Mock impls
│           ├── sensors/             # SensorAdapter + BleSensorAdapter + MockSensorAdapter
│           ├── state/               # Zustand stores
│           │   ├── activity.ts      # wraps SessionManager
│           │   ├── auth.ts          # 292 lines
│           │   ├── featureflags.ts
│           │   ├── featureflagsApi.ts
│           │   ├── featureflags.defaults.ts
│           │   ├── forceUpdate.ts   # REL-02 in-memory blocking-Modal trigger
│           │   ├── settings.ts
│           │   ├── sensors.ts
│           │   ├── sync.ts
│           │   ├── training.ts
│           │   ├── wallet.ts
│           │   ├── workoutPlayer.ts
│           │   ├── history.ts
│           │   ├── map.ts
│           │   └── social/{useChatStore,useChatsStore,useNotificationsStore,useRealtimeStore,useUsersStore}.ts
│           ├── storage/             # expo-sqlite per-aggregate repositories
│           │   ├── database.ts
│           │   └── {session,point,lap,sensor,records,relations,wallet,social}Repository.ts
│           ├── sync/                # syncEngine, mediaUpload, messageSync
│           ├── ui/                  # legacy + REL-02 screens + format helpers
│           │   ├── screens/ForceUpdateScreen.tsx
│           │   ├── charts/BarChart.tsx
│           │   ├── social/{UserSearchScreen,ChatScreen}.tsx
│           │   ├── Toast.tsx, format.ts, MetricsBar.tsx, *Modal.tsx
│           ├── update/              # NEW (Plan 08-01 Tasks 5+6)
│           │   ├── manifestCheck.ts          # fetch + verify + dispatch entry
│           │   ├── manifestSchema.ts         # parser + type
│           │   ├── manifestSigning.ts        # Ed25519 verify against canonical JSON
│           │   ├── semverLite.ts             # gt/eq comparator
│           │   ├── updateBannerStore.ts      # MMKV-persisted banner state
│           │   ├── updateCheckStore.ts       # MMKV-persisted check-history + replay baseline
│           │   ├── useUpdateCheckOnForeground.ts  # AppState 'active' hook
│           │   ├── UpdateBanner.tsx          # non-blocking banner component
│           │   └── __tests__/
│           ├── util/                # geo, speech, version, douglasPeucker, corridor, selfIntersection
│           ├── vendor/              # NEW (Plan 07-03 Tasks 3+4)
│           │   ├── oem.ts                   # detectVendor()
│           │   ├── openOEMSettings.ts       # vendor-specific intents + fallback
│           │   ├── AutostartDialog.tsx      # one-shot Modal gated by MMKV flag
│           │   └── __tests__/
│           ├── __fixtures__/        # secret.lint-fixture.ts (gitleaks negative)
│           └── __tests__/           # cross-cutting Jest tests
│
├── services/
│   └── backend/                     # Go monorepo, 8 services
│       ├── identity/                # cmd/server/main.go + internal/{handler,service,repository,domain}
│       ├── activity-sync/
│       ├── feed/
│       ├── social-graph/
│       ├── messaging/
│       ├── realtime-gw/
│       ├── notifications/
│       ├── media/
│       ├── api/                     # OpenAPI: one yaml per service + _shared/ + redocly.yaml
│       ├── gateway/                 # Caddyfile (dev + prod) + admin/index.html static UI
│       ├── migrations/              # 000N_*.up/down.sql (Postgres + TimescaleDB)
│       ├── pkg/                     # Shared Go: auth, ratelimit, observability, audit, …
│       ├── deploy/helm/             # Helm charts (identity materialised; others pending)
│       ├── observability/           # Prometheus/Loki/Grafana scrape configs + dashboards JSON
│       └── scripts/                 # openapi-routes-check, secrets/
│
├── scripts/                         # Repo-root tooling (NOT mobile/backend specific)
│   ├── release-distribute.sh        # Plan 08-01: orchestrates MinIO upload + sign + verify
│   ├── sign-manifest.go             # Plan 08-01: alphabetical-struct canonical JSON Ed25519 signer (Go inline)
│   ├── verify-manifest.go           # Plan 08-01: Ed25519 verify, used in CI + locally
│   ├── debug-tail.sh
│   ├── deploy_observability_stack.sh
│   ├── setup-branch-protection.sh
│   ├── cardinality_probe.py
│   ├── pii_audit.sh
│   ├── pii_live_probe.py
│   ├── smoke_grafana_alerts.py
│   ├── smoke_metrics.py
│   └── smoke_observability_stack.py
│
├── infra/
│   ├── ansible/                     # site.yml + roles/{alloy-shipper,docker,sport-stack,...}
│   │   └── inventory/{dev,prod}/hosts.yml
│   └── observability-stack/         # docker-compose + caddy/grafana/loki/prometheus configs
│       ├── docker-compose.yml
│       └── systemd/                 # observability-{stack,caddy}.service
│
├── tests/                           # Field-test protocols + run captures
│   ├── FIELD_PROTOCOL.md
│   └── runs/
│
├── docs/                            # Project documentation
│   ├── RUNNING_ECOSYSTEM_TZ.md      # Tech spec (TZ)
│   ├── DEVELOPMENT_PLAN.md          # Phase + task IDs
│   ├── API-CONTRACT-v1.0.md
│   ├── INTEGRATIONS.md
│   ├── SECRETS.md
│   ├── TELEMETRY.md
│   ├── CURRENCY.md
│   ├── AUDIT.md
│   ├── REVIEW_ROUNDS_1-3.md
│   ├── v1.0-SCOPE.md
│   ├── DECISIONS/                   # ADRs 0001-0012
│   └── RUNBOOKS/                    # deploy.md, sops-edit.md, observability.md, sentry-ops.md
│
├── .planning/
│   ├── STATE.md                     # active phase pointer
│   ├── ROADMAP.md
│   ├── MILESTONES.md
│   ├── PROJECT.md
│   ├── REQUIREMENTS.md
│   ├── config.json
│   ├── codebase/                    # this directory — auto-refreshed snapshots
│   │   ├── ARCHITECTURE.md
│   │   └── STRUCTURE.md
│   └── phases/                      # per-phase planning artifacts
│       ├── 01-release-contract-and-version-baseline/
│       ├── 02-secrets-and-config-hardening/
│       ├── 03-infrastructure-as-code/
│       ├── 04-ci-cd-pipeline/
│       ├── 05-observability-backend/
│       ├── 06-release-signing/
│       ├── 07-release-builds-mobile-stability/
│       ├── 08-closed-beta-distribution/    # 5 artifacts (see below) + evidence/
│       └── _archive/
│
├── .secrets/                        # SOPS-encrypted YAML bundles
│   ├── README.md
│   ├── dev/         (mapbox, shared, oauth — 3 bundles)
│   ├── staging/     (mapbox, shared, oauth, sentry — 4 bundles)
│   └── prod/                                 # 6 bundles total
│       ├── mapbox.yaml
│       ├── shared.yaml
│       ├── oauth.yaml
│       ├── sentry.yaml
│       ├── mobile-signing.yaml               # Phase 6 — Android release keystore + passwords
│       └── manifest-signing.yaml             # NEW (Plan 08-01 Task 1) — Ed25519 manifest keypair
│
├── .github/
│   └── workflows/
│       ├── android-release.yml      # Tag-triggered: EAS build + Plan 08-01 distribute
│       ├── backend-ci.yml
│       ├── backend-cd.yml
│       └── secret-scan-full.yml
│
├── .claude/                         # Claude Code config
├── .vscode/                         # Editor config
├── .trufflehog/                     # custom detector configs
├── .sops.yaml                       # age recipient routing rules
├── .gitleaks.toml
├── .trivyignore.yaml
├── .golangci.yml
├── .pre-commit-config.yaml
├── .editorconfig
├── .gitattributes
├── .gitignore
├── CODEOWNERS
├── CLAUDE.md                        # Project rules for Claude Code
├── README.md
├── CHANGELOG.md
├── DECISION.md
├── STATUS.md                        # Current phase / task status
└── Makefile
```

## Directory Purposes

**`apps/mobile-rn/`:**
- Purpose: The Expo React Native client. Only mobile app in the monorepo (Flutter was archived after Phase 0 — see memory note).
- Contains: TypeScript source under `src/`, bare Android tree under `android/`, Expo config (`app.json`, `eas.json`), Jest mocks.
- Key files: `App.tsx`, `index.ts`, `src/state/activity.ts`, `src/domain/session/SessionManager.ts`.

**`apps/mobile-rn/android/`:**
- Purpose: Bare Android project (no longer "managed" Expo build) — needed for keystore signing + custom native modules.
- Contains: Gradle wrapper, `settings.gradle`, `build.gradle`, app module under `app/`, manifest + Kotlin entry under `app/src/main/`.
- Key files: `app/src/main/AndroidManifest.xml`, `app/src/main/java/com/runningecosystem/mobile/{MainActivity,MainApplication}.kt`, `app/src/main/res/values/{strings,styles,colors}.xml`.
- Generated: `build/`, `.gradle/`, `.kotlin/`, `app/.cxx/`, `app/build/` (all gitignored).
- Committed: source + gradle wrapper + `debug.keystore`. `release.keystore` is written by CI from SOPS and never committed.

**`apps/mobile-rn/src/domain/`:**
- Purpose: Pure TypeScript domain — entities, value objects, calculators. No React, no Expo, no storage.
- Contains: ~20 top-level files + `session/` (state machine) + `training/` (workout/planner/analytics).

**`apps/mobile-rn/src/pipeline/`:**
- Purpose: GPS filter chain.
- Contains: `Pipeline.ts`, `Filter.ts`, `filters/` (Accuracy, Jump, Kalman, MinSegment, PauseDetector).

**`apps/mobile-rn/src/map/`, `src/location/`, `src/sensors/`, `src/notifications/`, `src/media/`, `src/realtime/`, `src/health/`:**
- Purpose: Adapter boundaries — each module exposes an interface + one or more `adapters/` concrete impls + `index.ts` factory/setter.
- Pattern enforced by `CLAUDE.md`: never import platform SDK outside these directories.

**`apps/mobile-rn/src/foreground/` (NEW, Plan 07-03 Task 2):**
- Purpose: Android sticky foreground-notification lifecycle.
- Single file: `notification.ts` (147 lines) exporting `subscribeToRecordingTick()`, `setupForegroundChannel()`, `presentRecordingNotification()`, `dismissRecordingNotification()`.

**`apps/mobile-rn/src/vendor/` (NEW, Plan 07-03 Tasks 3+4):**
- Purpose: OEM (Xiaomi/Samsung/Huawei) detection + deep-link to autostart/battery-saver settings + first-launch nudge dialog.
- Files: `oem.ts` (34 lines, `detectVendor`), `openOEMSettings.ts` (63 lines, vendor-specific intents + fallback), `AutostartDialog.tsx` (150 lines, one-shot Modal).
- Tests: `__tests__/{oem.test.ts,AutostartDialog.test.tsx}`.

**`apps/mobile-rn/src/update/` (NEW, Plan 08-01 Tasks 5+6):**
- Purpose: Manifest-driven update flow (fetch + Ed25519 verify + 3-state dispatch).
- Files: `manifestCheck.ts` (147 lines — entry), `manifestSchema.ts`, `manifestSigning.ts`, `semverLite.ts`, `updateBannerStore.ts`, `updateCheckStore.ts`, `useUpdateCheckOnForeground.ts`, `UpdateBanner.tsx`.
- Tests: `__tests__/{manifestCheck,manifestSchema,manifestSigning,semverLite}.test.ts`.

**`apps/mobile-rn/src/state/`:**
- Purpose: Zustand stores. MMKV-persisted (`featureflags`, `settings`, `updateBannerStore`, `updateCheckStore`) and in-memory (`forceUpdate`, `activity`, `sync`).
- Convention: one MMKV instance per persistent store (`createMMKV({ id: '...' })`).
- Notable: three update-related stores coexist: `useForceUpdateStore` (REL-02), `useUpdateBannerStore` (Plan 08-01), `useUpdateCheckStore` (Plan 08-01).

**`apps/mobile-rn/src/storage/`:**
- Purpose: Per-aggregate SQLite repositories over expo-sqlite. Multi-tenant — every row has `user_id`.
- Init: `database.ts`.

**`apps/mobile-rn/src/ui/` + `src/design/` + `src/navigation/`:**
- Purpose: Presentation layer.
- `src/design/` — Cursona design tokens + atomic components + ThemeProvider.
- `src/navigation/` — React Navigation root + Auth/Onboarding/AppTabs stacks + per-tab screens under `screens/{auth,chats,journal,me,record}/`.
- `src/ui/` — legacy modals (`*Modal.tsx`), shared formatters (`format.ts`), Toast provider, REL-02 `ForceUpdateScreen`.

**`apps/mobile-rn/src/modules/`:**
- Purpose: Cross-cutting feature bundles that own their own state + domain + sync + ui (mini-DDD).
- Sub-modules: `gamification/`, `moderation/`, `permissions/`.

**`services/backend/`:**
- Purpose: Go monorepo. 8 services + shared `pkg/` + Helm `deploy/` + OpenAPI `api/` + Caddy `gateway/` + `migrations/` + `observability/`.
- Per-service layout: `cmd/server/main.go` + `internal/{handler,service,repository,domain}/`. `repository/` typically has `memory/` (tests) + `postgres/` (prod) submodules.

**`scripts/` (repo root):**
- Purpose: Repo-wide tooling shared between CI + dev workstations. NOT mobile-internal or backend-internal.
- NEW Plan 08-01 additions: `release-distribute.sh`, `sign-manifest.go`, `verify-manifest.go`.
- Pre-existing: observability smoke probes (`smoke_*.py`), PII audit (`pii_*.{sh,py}`), `setup-branch-protection.sh`, `deploy_observability_stack.sh`, `debug-tail.sh`, `cardinality_probe.py`.

**`infra/`:**
- Purpose: Infrastructure-as-code. `ansible/` (host provisioning + sport-stack deploy + alloy-shipper) and `observability-stack/` (docker-compose + Caddy + Grafana/Loki/Prometheus configs + systemd units).

**`tests/`:**
- Purpose: Field-test protocols + raw GPS captures.
- Contains: `FIELD_PROTOCOL.md`, `runs/` (test artifacts; `.gitkeep` + README).

**`docs/`:**
- Purpose: Authoritative project documentation. Always read `RUNNING_ECOSYSTEM_TZ.md` (spec) + `DEVELOPMENT_PLAN.md` + relevant ADR before tackling a task (per `CLAUDE.md`).
- Contains: `DECISIONS/` (ADRs), `RUNBOOKS/` (operational procedures), API contracts, audit notes, scope documents.

**`.planning/`:**
- Purpose: GSD workflow scratchpad — current state, roadmap, milestones, per-phase research/planning artifacts.
- Sub-dirs: `codebase/` (this dir), `phases/<NN-name>/`, `_archive/`.

**`.planning/phases/08-closed-beta-distribution/`:**
- Purpose: Plan 08-01 planning artifacts.
- 5 planning files: `08-CONTEXT.md`, `08-RESEARCH.md`, `08-DISCUSSION-LOG.md`, `08-01-PLAN.md`, `08-PLAN-CHECK.md`.
- Plus `evidence/` directory for Task-by-Task evidence captures.

**`.secrets/`:**
- Purpose: SOPS-encrypted YAML bundles.
- Layout: `dev/`, `staging/`, `prod/` (env-specific). Encryption rules in `.sops.yaml`.
- `.secrets/prod/` has 6 bundles. NEW Plan 08-01 addition: `manifest-signing.yaml` (Ed25519 keypair) — encrypted to same 2 age recipients (DEV_A + CI) as `mobile-signing.yaml` (Phase 6 / Plan 07-01 commit `dd0dce5`).

**`.github/workflows/`:**
- Purpose: GitHub Actions pipelines.
- `android-release.yml` — 2-phase tag-triggered Android pipeline (Plan 07-01 build + Plan 08-01 distribute).
- `backend-ci.yml`, `backend-cd.yml` — Go service CI/CD.
- `secret-scan-full.yml` — gitleaks + trufflehog history scan.

## Key File Locations

**Entry Points:**
- `apps/mobile-rn/index.ts`: Expo `registerRootComponent(App)`.
- `apps/mobile-rn/App.tsx`: Mobile root. Mounts `subscribeToRecordingTick()` (Plan 07-03 Task 2) + `useUpdateCheckOnForeground()` (Plan 08-01 Task 5).
- `apps/mobile-rn/src/navigation/RootNavigator.tsx`: Auth gate + push deep-link + realtime/push/wallet bootstrap.
- `services/backend/<svc>/cmd/server/main.go`: One per service (8 total) — identity, activity-sync, feed, social-graph, messaging, realtime-gw, notifications, media.

**Configuration:**
- `apps/mobile-rn/app.json`, `eas.json`, `tsconfig.json`, `jest.config.js`, `eslint.config.js`, `.prettierrc.json`.
- `apps/mobile-rn/android/{settings,build}.gradle`, `app/build.gradle`, `gradle.properties`.
- `.sops.yaml`, `.gitleaks.toml`, `.trivyignore.yaml`, `.golangci.yml`, `.pre-commit-config.yaml`.
- `services/backend/gateway/Caddyfile`, `Caddyfile.prod`.

**Core Logic (mobile):**
- `apps/mobile-rn/src/domain/session/SessionManager.ts`: Recording state machine.
- `apps/mobile-rn/src/state/activity.ts`: Zustand wrapper over SessionManager + orchestration.
- `apps/mobile-rn/src/pipeline/Pipeline.ts` + `filters/*`: GPS filter chain.
- `apps/mobile-rn/src/domain/AreaCalculator.ts`: Territory area (projected plane).
- `apps/mobile-rn/src/domain/ClosureDetector.ts`: Loop-closure detection.
- `apps/mobile-rn/src/update/manifestCheck.ts`: Update fetch + verify + dispatch entry.
- `apps/mobile-rn/src/foreground/notification.ts`: Recording-tick foreground notification.
- `apps/mobile-rn/src/auth/apiClient.ts`: HTTP wrapper with HTTP 426 → force-update intercept.

**Testing:**
- `apps/mobile-rn/src/__tests__/`: cross-cutting Jest tests.
- `apps/mobile-rn/src/<module>/__tests__/`: per-module Jest tests.
- `apps/mobile-rn/__mocks__/`: manual Jest mocks.
- `services/backend/<svc>/cmd/server/main_test.go`: per-service Go tests.

## Naming Conventions

**Files:**
- TypeScript modules: `camelCase.ts` (`manifestCheck.ts`, `apiClient.ts`).
- React components: `PascalCase.tsx` (`UpdateBanner.tsx`, `AutostartDialog.tsx`, `MapboxView.tsx`).
- Zustand stores: `camelCase.ts` (in-app convention; some legacy use `use<Name>Store.ts` in `src/state/social/`).
- Tests: `<Subject>.test.ts(x)`; integration/perf tests use suffixes like `.smoke.test.ts`, `.snapshot.test.tsx`, `.navAfterSave.test.tsx`.
- Repositories: `<aggregate>Repository.ts` (`sessionRepository.ts`, `pointRepository.ts`).
- Adapters: `<Domain>Adapter.ts` interface; impls in `adapters/<Concrete>Adapter.ts` (`ExpoLocationAdapter.ts`, `BleSensorAdapter.ts`).
- Go services: standard `cmd/server/main.go` + `internal/<layer>/<name>.go`.
- SQL migrations: `<NNNN>_<snake_name>.{up,down}.sql` (`0011_messaging.up.sql`).
- Workflows: `<area>-<verb>.yml` (`android-release.yml`, `backend-ci.yml`).
- Secrets bundles: `<name>.yaml` per env (`mapbox.yaml`, `manifest-signing.yaml`).
- Planning artifacts: `<NN>-<KIND>.md` (`08-CONTEXT.md`, `08-RESEARCH.md`) and `<NN>-<PP>-PLAN.md` (`08-01-PLAN.md`).

**Directories:**
- Lowercase kebab-case for top-level (`apps/mobile-rn/`, `services/backend/`, `release-builds-mobile-stability`).
- Lowercase single-word for mobile `src/` subdirs (`domain`, `state`, `storage`, `pipeline`, `update`, `vendor`, `foreground`).
- Phase directories: `NN-<topic>/` (`07-release-builds-mobile-stability/`, `08-closed-beta-distribution/`).

**Symbols:**
- React hooks: `use<Name>` (`useUpdateCheckOnForeground`).
- Zustand stores: `use<Name>Store` (`useActivityStore`, `useForceUpdateStore`, `useUpdateBannerStore`, `useUpdateCheckStore`).
- Interfaces: `<Domain>Adapter` (`LocationAdapter`, `SensorAdapter`).
- Domain types: `PascalCase` (`Point`, `Lap`, `PersonalRecord`, `Manifest`).

## Where to Add New Code

**New mobile feature (cross-cutting):**
- Primary code: `apps/mobile-rn/src/modules/<feature>/{domain,state,sync,ui,index.ts}` — mirror `modules/gamification` or `modules/moderation`.
- Tests: alongside, in `<feature>/__tests__/`.

**New mobile domain entity / pure calculator:**
- Primary code: `apps/mobile-rn/src/domain/<name>.ts` (or `domain/<group>/<name>.ts` for the `training/` or `session/` groups).
- Constraints: NO imports from `src/state/`, `src/storage/`, `src/ui/`, Expo, React Native.

**New mobile screen:**
- File: `apps/mobile-rn/src/navigation/screens/<tab>/<ScreenName>.tsx` (or `src/ui/screens/<ScreenName>.tsx` for system-level full-screen Modals like `ForceUpdateScreen`).
- Register in: appropriate stack (`AuthStack.tsx`, `AppTabs.tsx`, `OnboardingStack.tsx`, or `RootNavigator.tsx` for modal presentation).
- Types: add to `apps/mobile-rn/src/navigation/types.ts`.

**New mobile reusable design component:**
- File: `apps/mobile-rn/src/design/components/<Name>.tsx`.
- Export via: `apps/mobile-rn/src/design/index.ts`.

**New Zustand store:**
- File: `apps/mobile-rn/src/state/<name>.ts` (or `src/state/social/use<Name>Store.ts` for the social cluster, or `src/<module>/<name>.ts` for module-internal stores like `update/updateBannerStore.ts`).
- Persistence: if persistent, `createMMKV({ id: '<unique-id>' })` + `persist` middleware + `createJSONStorage`. See `src/update/updateBannerStore.ts` for the canonical pattern.

**New adapter (map/location/sensor/notification/media/realtime/health):**
- Interface: extend `<Domain>Adapter.ts` in the module root.
- Impl: `src/<module>/adapters/<Concrete>Adapter.ts`.
- Factory: register in `src/<module>/index.ts`.

**New pipeline filter:**
- File: `apps/mobile-rn/src/pipeline/filters/<Name>Filter.ts`.
- Wire: into `createDefaultPipeline()` in `src/pipeline/index.ts`.

**New storage table:**
- Mobile: add repository `apps/mobile-rn/src/storage/<aggregate>Repository.ts`; extend schema in `database.ts`. Include `user_id`.
- Backend: add migration `services/backend/migrations/<next-NNNN>_<name>.{up,down}.sql`.

**New backend service:**
- Directory: `services/backend/<service-name>/` with `cmd/server/main.go` + `internal/{handler,service,repository,domain}/`.
- OpenAPI: `services/backend/api/<service-name>.yaml`.
- Helm: `services/backend/deploy/helm/<service-name>/`.

**New backend HTTP handler:**
- File: `services/backend/<svc>/internal/handler/<name>.go`.
- Register in: `cmd/server/main.go`.

**New repo-wide release/CI script:**
- File: `scripts/<name>.{sh,go,py}` (repo root, NOT per-service).
- Pattern: shell orchestrator may shell out to `go run scripts/<thing>.go` for typed/crypto-sensitive work (see `release-distribute.sh` calling `sign-manifest.go` + `verify-manifest.go`).

**New ADR:**
- File: `docs/DECISIONS/<NNNN>-<slug>.md` (next sequence after `0012`).

**New runbook:**
- File: `docs/RUNBOOKS/<topic>.md`.

**New phase planning artifacts:**
- Directory: `.planning/phases/<NN>-<topic>/` with `<NN>-CONTEXT.md`, `<NN>-RESEARCH.md`, `<NN>-DISCUSSION-LOG.md`, `<NN>-PLAN-CHECK.md`, and per-plan `<NN>-<PP>-PLAN.md` / `<NN>-<PP>-SUMMARY.md`.

**New secret:**
- File: `.secrets/<env>/<name>.yaml` (encrypted via `sops -e -i`).
- Routing: ensure recipients in `.sops.yaml` cover the path.

## Special Directories

**`apps/mobile-rn/android/build/`, `app/build/`, `.gradle/`, `app/.cxx/`, `.kotlin/`:**
- Purpose: Gradle/CMake/Kotlin build outputs.
- Generated: Yes.
- Committed: No (in `apps/mobile-rn/android/.gitignore`).

**`apps/mobile-rn/node_modules/`:**
- Purpose: npm dependencies.
- Generated: Yes (`npm ci`).
- Committed: No.

**`apps/mobile-rn/.expo/`:**
- Purpose: Expo CLI cache.
- Generated: Yes.
- Committed: No.

**`apps/mobile-rn/coverage/`:**
- Purpose: Jest coverage output.
- Generated: Yes.
- Committed: No.

**`apps/mobile-rn/src/__fixtures__/`:**
- Purpose: Test fixtures including gitleaks negative cases (`secret.lint-fixture.ts`).
- Committed: Yes.

**`.planning/phases/_archive/`:**
- Purpose: Superseded planning artifacts retained for audit.
- Committed: Yes.

**`.planning/phases/<NN-...>/evidence/`:**
- Purpose: Per-task evidence captures (logs, screenshots, output files) referenced by SUMMARY.md.
- Committed: Yes (small text/log files); large binaries gitignored selectively.

**`.secrets/`:**
- Purpose: SOPS-encrypted YAML.
- Committed: Yes (encrypted form). Decryption requires age key.
- Never read plaintext into this map — bundles are listed by EXISTENCE only.

**`tests/runs/`:**
- Purpose: Field-test raw GPS captures.
- Committed: structure (`.gitkeep`, `README.md`); large captures gitignored.

**`services/backend/observability/dashboards/`:**
- Purpose: Grafana dashboard JSON exports (committed for reproducibility).
- Files: `backend-overview.json`, `db-performance.json`, `nats-jetstream.json`.

---

*Structure analysis: 2026-05-24*
