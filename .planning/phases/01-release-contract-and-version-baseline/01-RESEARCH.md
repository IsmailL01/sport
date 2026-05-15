# Phase 1: Release Contract & Version Baseline — Research

**Researched:** 2026-05-15
**Domain:** API contract discipline (OpenAPI 3.1 hand-written), HTTP version negotiation, feature flags (Postgres + offline-first mobile mirror)
**Confidence:** HIGH overall — Standard Stack HIGH (direct codebase verification + official docs); Architecture HIGH; Pitfalls MEDIUM (some assumptions on rollout-hash bias flagged)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** OpenAPI 3.1.0 hand-written YAML; no code-gen.
- **D-02** Coverage = mobile-facing endpoints only (internal NATS/gRPC undocumented for v1.0).
- **D-03** One YAML per service. New: `feed.yaml`, `social-graph.yaml`, `messaging.yaml`, `realtime-gw.yaml`, `notifications.yaml`, `media.yaml`, `gateway.yaml`.
- **D-04** CI validation: `openapi-diff` + custom Go drift check scanning `mux.HandleFunc` registrations.
- **D-05** HTTP header transport: `X-Client-Version: <semver> (<build>)`.
- **D-06** Mobile reads via `expo-application.nativeApplicationVersion` + `nativeBuildVersion`.
- **D-07** Backward-compat-only; `HTTP 426` body `{ "error": "client_too_old", "min_version": "...", "force_update_url": "..." }`.
- **D-08** Enforcement = **gateway middleware** (single point); services trust gateway.
- **D-09** Mobile 426 handling triggers force-update screen (re-uses Phase 18 UX).
- **D-10** Strict semver; major bump = breaking.
- **D-11** Backend `pkg/featureflags` shared lib. Postgres single-table. 30s in-memory read-through cache. Admin UI extends `gateway/admin/index.html`.
- **D-12** Boolean + percentage rollout only. Hashed by `(user_id, flag_name)` via FNV-1a.
- **D-13** Mobile transport: `GET /featureflags`. 5-min TTL. Refresh on launch + foreground + auth change.
- **D-14** Mobile mirror: `apps/mobile-rn/src/state/featureflags.ts` (Zustand) + `featureflagsApi.ts`.
- **D-15** Offline-first defaults: bundled `featureflags.defaults.ts` → MMKV cache → server.
- **D-16** Initial 5 flags (all default OFF): `strava_oauth_enabled`, `mapbox_sdk_v11`, `release_channel_force_update`, `tester_debug_logging`, `crash_telemetry_opt_in`.
- **D-17** `docs/v1.0-SCOPE.md` markdown-table format, RU headers + EN technical body.
- **D-18 / D-19** IN/OUT freeze content per CONTEXT.
- **D-20** Single comprehensive ADR-0007 covering all three architectural decisions.
- **D-21** ADR-0007 also references SCP-throughout deploy.
- **D-22** Phase 18 wording correction (VPS-direct `/var/www/android-updates`, not Storage Box) flagged for `/gsd-discuss-phase 18`. **Out of scope for this phase** — do not edit ROADMAP here.

### Claude's Discretion
- OpenAPI lint tool choice (`redocly lint` vs `spectral lint`) — recommendation in §State of the Art.
- CI route-vs-spec drift implementation strategy — recommendation in §Architecture Patterns.
- Admin UI feature-flag layout in `gateway/admin/index.html` — pattern in §Code Examples.
- Migration numbering — see §Critical Correction (CONTEXT says `0020`; actual next slot is `0021`).

### Deferred Ideas (OUT OF SCOPE)
- OpenAPI code-gen (oapi-codegen / openapi-typescript).
- LaunchDarkly / Statsig / OpenFeature SaaS.
- A/B variant flags + per-user targeting rules.
- gRPC contracts for internal service-to-service.
- Full frame-by-frame WebSocket schema (envelope-only this phase).
- `X-Client-Version` strict-mode (malformed = reject). v1.0 = graceful-degrade.
- Phase 18 ROADMAP edit (separate discuss-phase).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | `docs/API-CONTRACT-v1.0.md` + 7 OpenAPI YAMLs covering all mobile-facing endpoints | §Standard Stack (`openapi 3.1.0`), §Architecture Patterns (multi-file with shared components), §Code Examples (template inheriting from `identity.yaml`) |
| REL-02 | `X-Client-Version` + server compatibility on representative endpoint | §Architecture Patterns (3-layer: client stamp / gateway parse / handler 426), §Pitfall 4 (CRLF safety), §Pitfall 6 (EAS OTA semantics) |
| REL-03 | `pkg/featureflags` backend + mobile mirror with v1.0 flag set | §Standard Stack (`hash/fnv`, MMKV v5, Zustand 5), §Architecture (read-through 30s cache with singleflight), §Code Examples (rollout fn + Zustand store) |
| REL-04 | `docs/v1.0-SCOPE.md` IN/OUT freeze | §Code Examples (RU-header EN-body template per existing project convention) |
| REL-05 | `docs/DECISIONS/0007-v1.0-release-contract.md` ADR | §Architecture Patterns (three sections matching D-20 breadth) |
</phase_requirements>

## Summary

This phase is **pure plumbing + freeze**: extend an already-established hand-written OpenAPI 3.1 pattern from 2 files to 8 (7 services + 1 root gateway document), wire one HTTP header through one Caddy-and-Go middleware boundary, and ship a small Postgres-backed feature-flag service that mirrors the existing `pkg/ratelimit` / `pkg/audit` shape. No new external dependencies of significance — everything reuses the established stack (Go 1.25 + pgx + slog; Zustand + MMKV v5 + `expo-application` 7.0.8).

**Three load-bearing corrections to CONTEXT before planning starts:**
1. **Migration number is `0021`, not `0020`** — CONTEXT D-11 was based on stale grep; current latest on disk is `0020_auth_otp.up.sql` (auth-OTP migration from a parallel pre-v1.0 commit). Planner MUST use `0021_featureflags.up.sql`. `[VERIFIED: ls services/backend/migrations/]`
2. **Gateway is Caddy-only, not Go** — there is no `gateway/main.go`; routing is pure `Caddyfile.prod` reverse_proxy directives. "Gateway middleware enforcement" (D-08) therefore lands as a **thin shared Go middleware in `pkg/clientversion/`** that every service mounts at the front of its `mux.Handle` chain (single source of truth, but executed in-process per service). The alternative — building a new Go reverse-proxy gateway — is a much larger scope and would conflict with Phase 6's Caddy WAF work. `[VERIFIED: services/backend/gateway/ contains only Caddyfile + admin/index.html]`
3. **`expo-application` is in node_modules (7.0.8) but NOT in `apps/mobile-rn/package.json`** — it arrives as a transitive dep. Phase 1 MUST explicitly add it as a direct dep so it survives a clean install and EAS Build resolves it deterministically. `[VERIFIED: grep package.json for expo-application]`

**Primary recommendation:** Wire the three concerns through three small, separable Plans: (1) OpenAPI extension + drift check + ADR, (2) `X-Client-Version` end-to-end (mobile stamp + `pkg/clientversion` middleware + 426 handler + force-update UX hookup), (3) `pkg/featureflags` backend + `featureflags` mobile store + admin UI rows + `docs/v1.0-SCOPE.md`. Concerns 2 and 3 are independent of concern 1 and could parallelize.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| OpenAPI spec authoring + lint | Build-time tooling | CI (Phase 4) | Static YAML; lint runs in pre-commit + GitHub Actions. No runtime tier. |
| Route-vs-spec drift check | CI / build-time tooling | — | Go program parses YAML + AST-walks each service's `internal/handler/*.go`. Runs in CI; never executed in prod. |
| `X-Client-Version` header stamping | Mobile (RN client) | — | `apiClient.ts` is the single seam; every outbound HTTP request goes through it. Caddy passes the header through unchanged. |
| `X-Client-Version` parsing + 426 enforcement | Backend service (per-process Go middleware) | — | Caddy is reverse-proxy only; per-service `pkg/clientversion.Middleware` wraps each `mux` at startup. Decision lives in Go to allow structured logging + audit. |
| Feature flag source of truth | Backend DB (Postgres `featureflags` table) | — | Single writer (admin UI), N readers (every service). Read-through 30s cache per service process. |
| Feature flag evaluation | Backend (`pkg/featureflags.IsEnabled(ctx, userID, name)`) | Mobile (`featureflags.useFlag(name)` reads MMKV) | Mobile-side decisions are advisory mirrors; backend gates real capability. |
| Feature flag mobile cache | Mobile (MMKV v5 + Zustand) | — | Offline-first per CLAUDE.md; survives app kill; 5-min TTL stale-while-revalidate. |
| Feature flag admin toggle UI | Backend (vanilla HTML + JS in `gateway/admin/index.html` served by Caddy `file_server`) | — | Phase 8/L precedent; no SPA framework. |

## Standard Stack

### Core (Backend)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `net/http` (Go 1.25 stdlib) | Go 1.25.0 | `ServeMux` with method patterns | Already canonical across all 7 services `[VERIFIED: grep services/backend/identity/internal/handler/http.go]` |
| `github.com/jackc/pgx/v5` | v5.9.2 | Postgres driver | Used by every service `[VERIFIED: services/backend/identity/cmd/server/main.go]` |
| `hash/fnv` (stdlib) | Go 1.25.0 | FNV-1a 32/64-bit hash for rollout determinism | Standard library; no new dependency. Sufficient distribution for ≤100 buckets in our user count. `[CITED: https://pkg.go.dev/hash/fnv]` |
| `log/slog` (stdlib) | Go 1.25.0 | Structured JSON logging | Already canonical `[VERIFIED: services/backend/identity/cmd/server/main.go]` |

### Core (Mobile)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `expo-application` | 7.0.8 | Read `nativeApplicationVersion` + `nativeBuildVersion` | Already in `node_modules` transitively; Phase 1 must add to direct deps. SDK 54 compatible. `[VERIFIED: cat node_modules/expo-application/package.json]` |
| `zustand` | ^5.0.13 | `useFeatureFlagsStore` | Pattern matches `auth.ts`, `settings.ts`, `wallet.ts` `[VERIFIED: ls apps/mobile-rn/src/state/]` |
| `react-native-mmkv` | ^4.3.1 | Persist server-fetched flags across app launches | Existing pattern in `auth.ts` token persistence `[VERIFIED: apps/mobile-rn/package.json]` |

### Supporting / Tooling

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@redocly/cli` | ^1.34.x (current at research date) | `redocly lint` + `redocly bundle` | OpenAPI lint in CI + bundle multi-file specs to single artifact for `docs/API-CONTRACT-v1.0.md` reference link |
| `go/ast` + `go/parser` (stdlib) | Go 1.25.0 | AST-walk handler files for `mux.HandleFunc("METHOD /path", ...)` literals | Drift check tool: parse Go source, extract route literals, diff against YAML |
| `gopkg.in/yaml.v3` | v3.0.1 | Parse OpenAPI YAML in drift check Go tool | Standard YAML parser for Go |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `hash/fnv` (FNV-1a) | `github.com/cespare/xxhash/v2` | xxhash is 2-3× faster on large inputs and has marginally better distribution. **For our `(user_id, flag_name)` input (~32 bytes), the speed difference is invisible and FNV-1a's distribution is well within ±2% of nominal at 100-bucket granularity.** Picking FNV-1a (stdlib, zero new dep, CONTEXT-locked at D-12). |
| `redocly lint` | `@stoplight/spectral-cli` | Spectral is a generic JSON/YAML linter (also handles AsyncAPI, k8s manifests); Redocly is OpenAPI-purpose-built. **Redocly is faster and ships purpose-built rules (`no-undefined-server-variable`, `operation-operationId`, `operation-tag-defined`). Pick Redocly.** Justification in §State of the Art. |
| Custom Go drift check | A wrapper that intercepts `HandleFunc` at runtime | Runtime wrapping requires every service to call into shared code in a specific order; AST parsing is simpler, runs in CI only, and breaks loudly if a developer registers a route imperatively. **Pick AST.** Detail in §Architecture Patterns. |
| Per-service Go gateway | New Go reverse-proxy gateway | Building a new gateway service to host the version-check middleware doubles operational complexity (one more systemd unit, one more health check) and conflicts with Phase 6 (Caddy WAF). **Pick shared `pkg/clientversion` middleware mounted by each service**, executed in-process. Single source of truth in Go code, but distributed enforcement at run time. |

**Installation (new packages — version pinned; verify with `npm view` / `go mod download` before commit):**

```bash
# Mobile (apps/mobile-rn/)
npx expo install expo-application
# adds: "expo-application": "~7.0.8" to package.json
# (Expo's install picker resolves SDK 54-compatible version)

# Backend tooling (dev-only, lives in services/backend/tools/go.mod or a script harness)
go install github.com/redocly/redocly-cli/cmd/redocly@v1  # ⚠ Redocly is npm-distributed; install via npm
npm install --save-dev @redocly/cli  # in repo root or services/backend/api/

# Drift check tool — pure stdlib + yaml.v3, no new module
# Lives at services/backend/scripts/openapi-routes-check/main.go
```

**Version verification commands** (planner runs these before locking versions in plans):

```bash
npm view expo-application version           # confirm SDK 54-compatible version
npm view @redocly/cli version               # confirm current redocly lint version
go list -m gopkg.in/yaml.v3                 # confirm Go yaml parser version
```

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────┐
                       │  Mobile App (Expo RN)    │
                       │                          │
                       │  expo-application        │
                       │  → nativeApplicationVer  │
                       │  → nativeBuildVersion    │
                       │           │              │
                       │           ▼              │
                       │  apiClient.ts            │
                       │  (sets X-Client-Version) │
                       │  ↓                       │
                       │  on 426 → forceUpdate$ ──┼──► UI: ForceUpdateScreen
                       │                          │       (App Store / VPS manifest URL)
                       │  featureflags.ts (Zustand│
                       │  + MMKV cache)           │
                       │   ↑ GET /featureflags    │
                       └──────────┬───────────────┘
                                  │ HTTPS + Authorization: Bearer + X-Client-Version
                                  ▼
                       ┌──────────────────────────┐
                       │ Caddy 2.8 (gateway)      │  ← passes X-Client-Version unchanged
                       │ Caddyfile.prod           │  ← serves /admin/* static HTML
                       │ reverse_proxy by path    │
                       └──────────┬───────────────┘
                                  │
                ┌─────────────────┼─────────────────────────────┐
                ▼                 ▼                             ▼
       ┌───────────────┐  ┌───────────────┐         ┌───────────────────┐
       │ identity:8081 │  │ feed:8085     │  ...    │ activity-sync:8082│
       │               │  │               │         │                   │
       │ mux ──► pkg/  │  │ mux ──► pkg/  │         │ mux ──► pkg/      │
       │  clientversion│  │  clientversion│         │  clientversion    │
       │  Middleware   │  │  Middleware   │         │  Middleware       │
       │  (parse + 426)│  │  (parse + 426)│         │  (parse + 426)    │
       │      ▼        │  │      ▼        │         │      ▼            │
       │  pkg/         │  │  pkg/         │         │  pkg/             │
       │  featureflags │  │  featureflags │         │  featureflags     │
       │  .IsEnabled() │  │  .IsEnabled() │         │  .IsEnabled()     │
       │      │        │  │      │        │         │      │            │
       └──────┼────────┘  └──────┼────────┘         └──────┼────────────┘
              │                  │                         │
              └──────────────────┴─────────────────────────┘
                                 │ SELECT * FROM featureflags
                                 ▼
                       ┌──────────────────────┐
                       │ Postgres+TimescaleDB │
                       │ featureflags table   │
                       │ (writes from         │
                       │  /admin/featureflags)│
                       └──────────────────────┘
                                 ▲
                                 │ PUT /admin/featureflags/{name}
                       ┌─────────┴───────────┐
                       │ gateway/admin/      │
                       │ index.html (vanilla │
                       │ HTML + fetch())     │
                       └─────────────────────┘
```

### Component Responsibilities

| File / Module | Responsibility |
|--------------|----------------|
| `apps/mobile-rn/src/auth/apiClient.ts` | Stamp `X-Client-Version` on every outbound HTTP request. Intercept 426 responses → dispatch to global `forceUpdate$` (Zustand). |
| `apps/mobile-rn/src/auth/version.ts` (new) | Build the version string once at module init from `expo-application` (no per-request cost). Export `getClientVersionHeader(): string`. |
| `apps/mobile-rn/src/state/featureflags.ts` (new) | Zustand store: `flags: Record<string,boolean>`, `lastFetchedAt: number`, `refresh()`, `useFlag(name)`. MMKV-persisted. |
| `apps/mobile-rn/src/state/featureflags.defaults.ts` (new) | Bundled defaults — all 5 flags `false`. |
| `apps/mobile-rn/src/state/featureflagsApi.ts` (new) | `GET /featureflags` HTTP call. Returns server response + handles errors gracefully (returns nothing → store keeps cache/defaults). |
| `apps/mobile-rn/src/state/forceUpdate.ts` (new) | Zustand: `{ required: bool, minVersion: string, forceUpdateUrl: string, set() }`. |
| `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` (new) | Full-screen modal blocking app; "Update Now" → `Linking.openURL(forceUpdateUrl)`. |
| `services/backend/pkg/clientversion/` (new package) | `Middleware(next http.Handler, policy Policy) http.Handler` — parses `X-Client-Version`, checks against `policy.MinSupported`, returns 426 with structured body if too old. Graceful-degrade on malformed header. |
| `services/backend/pkg/featureflags/` (new package) | `Store` interface; `PostgresStore` impl; `IsEnabled(ctx, userID, flagName) bool`; `Set(ctx, flagName, enabled, percent, actorID) error`. 30s in-memory cache with singleflight. |
| `services/backend/migrations/0021_featureflags.up.sql` (new) | Schema for `featureflags` table. |
| `services/backend/api/feed.yaml` + 6 more (new) | One YAML per service per D-03. |
| `services/backend/scripts/openapi-routes-check/main.go` (new) | CI tool: walk every service's `internal/handler/**/*.go`, extract `mux.HandleFunc` literals, diff against bundled YAML, exit 1 on mismatch. |
| `services/backend/gateway/admin/index.html` (extension) | New `<section>` for feature flag list + toggle/percent UI. |
| `services/backend/identity/internal/handler/admin.go` (or new `admin/` package) | `GET /admin/featureflags`, `PUT /admin/featureflags/{name}`. Gated by `pkg/permissions` `global_role=admin`. |
| `docs/v1.0-SCOPE.md` (new) | RU header + EN technical body; IN/OUT tables. |
| `docs/API-CONTRACT-v1.0.md` (new) | Index doc linking to bundled `api.yaml` + per-service notes. |
| `docs/DECISIONS/0007-v1.0-release-contract.md` (new) | Single ADR covering three sub-decisions per D-20. |

### Recommended Project Structure (additions only — everything else stays)

```
services/backend/
├── api/
│   ├── identity.yaml          # existing
│   ├── activity-sync.yaml     # existing
│   ├── feed.yaml              # NEW (Phase 1)
│   ├── social-graph.yaml      # NEW
│   ├── messaging.yaml         # NEW
│   ├── realtime-gw.yaml       # NEW
│   ├── notifications.yaml     # NEW
│   ├── media.yaml             # NEW
│   ├── gateway.yaml           # NEW (documents path-routing surface)
│   ├── _shared/               # NEW (multi-file: shared schemas + parameters)
│   │   ├── schemas.yaml       #   User, Pagination, Error, Cursor, ...
│   │   ├── parameters.yaml    #   sessionId, userId, ...
│   │   └── responses.yaml     #   401, 403, 404, 426, 429, 500
│   └── redocly.yaml           # NEW (lint config)
├── pkg/
│   ├── clientversion/         # NEW
│   │   ├── clientversion.go
│   │   ├── parse.go
│   │   ├── middleware.go
│   │   └── *_test.go
│   ├── featureflags/          # NEW
│   │   ├── featureflags.go    #   public API: IsEnabled, Set, Refresh
│   │   ├── postgres.go        #   PostgresStore impl
│   │   ├── cache.go           #   30s in-memory cache + singleflight
│   │   ├── rollout.go         #   FNV-1a hash + percentage decision
│   │   └── *_test.go
│   └── (existing pkg/permissions, pkg/ratelimit, pkg/audit, pkg/audit, pkg/auth)
├── migrations/
│   └── 0021_featureflags.{up,down}.sql   # NEW — note: 0021, NOT 0020
├── scripts/
│   └── openapi-routes-check/   # NEW CI tool
│       ├── main.go
│       ├── ast_walk.go
│       └── spec_load.go
└── gateway/
    └── admin/
        └── index.html          # extended with feature flag section

apps/mobile-rn/src/
├── auth/
│   ├── apiClient.ts            # MODIFIED: stamp X-Client-Version, handle 426
│   └── version.ts              # NEW
├── state/
│   ├── featureflags.ts         # NEW
│   ├── featureflagsApi.ts      # NEW
│   ├── featureflags.defaults.ts # NEW
│   └── forceUpdate.ts          # NEW
└── ui/screens/
    └── ForceUpdateScreen.tsx   # NEW

docs/
├── API-CONTRACT-v1.0.md        # NEW
├── v1.0-SCOPE.md               # NEW
└── DECISIONS/
    └── 0007-v1.0-release-contract.md   # NEW
```

### Pattern 1: OpenAPI 3.1 multi-file with shared `_shared/` components

**What:** Reusable components (User, Pagination, Error, Cursor, common Responses) live under `services/backend/api/_shared/`. Each service YAML references them via `$ref: ./_shared/schemas.yaml#/components/schemas/User`. Bundled to a single artifact by `redocly bundle api/gateway.yaml -o dist/openapi.yaml` for distribution.

**When to use:** When schemas like `User`, `Error`, `Pagination` recur across ≥2 service YAMLs (which they will in our 7-service scope).

**Caveat — Redocly issue #1862:** OpenAPI 3.1.0 has a known quirk where multi-file `$ref` to `components.schemas` may need explicit bundle step before some downstream tools (oapi-codegen, openapi-typescript) render correctly. Our v1.0 has no codegen (D-01), so this caveat is informational. `[CITED: https://github.com/Redocly/redoc/issues/1862]`

**Example reference syntax:**

```yaml
# services/backend/api/feed.yaml
openapi: 3.1.0
info:
  title: Running Ecosystem — Feed Service
  version: 0.1.0
paths:
  /posts:
    get:
      summary: Лента постов (cursor pagination)
      tags: [feed]
      parameters:
        - $ref: './_shared/parameters.yaml#/components/parameters/cursor'
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: { $ref: './_shared/schemas.yaml#/components/schemas/Post' }
                  nextCursor: { type: string, nullable: true }
        '401': { $ref: './_shared/responses.yaml#/components/responses/Unauthorized' }
        '426': { $ref: './_shared/responses.yaml#/components/responses/UpgradeRequired' }
```

### Pattern 2: `pkg/clientversion` middleware — single Go package, per-service mount

**What:** Each service's `cmd/server/main.go` wraps its `*http.ServeMux` with `clientversion.Middleware`. The middleware:
1. Reads `X-Client-Version` header.
2. Calls `parse()` — accepts `"1.0.0"`, `"1.0.0 (42)"`, `"1.0.0+build42"`.
3. On parse failure → `slog.Warn("clientversion: malformed header", ...)` and **passes the request through** (graceful-degrade per CONTEXT note in §specifics).
4. On valid version below `policy.MinSupported` → write 426 with structured body; do not call `next.ServeHTTP`.
5. On valid version ≥ min → annotate `r.Context()` with parsed version (for structured logs downstream) and call `next.ServeHTTP`.

**When to use:** Mount once per service at the outermost wrap (before auth middleware so unauthenticated `/healthz` calls also get version-checked but `/healthz` is exempted via path skip — see Pitfall 3).

**Why before auth:** A 426 response should not require valid auth. A user with a too-old client cannot refresh their JWT either — telling them "401 unauthorized" instead of "426 upgrade required" sends them in circles.

**Example wrap point (existing pattern, identity service):**

```go
// services/backend/identity/cmd/server/main.go (added lines marked +)
func main() {
    ...
    mux := http.NewServeMux()
    handler.Register(mux, ...)

+   policy := clientversion.Policy{
+       MinSupported: "1.0.0",          // bumps via env/config; ADR-0007 documents semver bump policy
+       ForceUpdateURLAndroid: "https://" + apiHost + "/android/manifest.json",
+       ForceUpdateURLiOS:     "https://apps.apple.com/app/id<APP_STORE_ID>",
+       SkipPaths:             []string{"/healthz", "/metrics"},
+   }
+   versionedMux := clientversion.Middleware(mux, policy, slog.Default())

-   server := &http.Server{Addr: addr, Handler: mux}
+   server := &http.Server{Addr: addr, Handler: versionedMux}
}
```

### Pattern 3: Postgres-backed feature flags with read-through cache + singleflight

**What:** `pkg/featureflags.NewPostgresStore(pool, ttl)` returns a `*Store` that:
- On `IsEnabled(ctx, userID, name)`:
  1. Look up `name` in `map[string]cachedFlag`.
  2. If present and `time.Since(fetchedAt) < ttl` → use cached values.
  3. If absent or stale → `singleflight.Do(name, fetch)` to avoid thundering herd, then update cache.
  4. Apply boolean + percentage decision (see Pattern 4).
- On `Set(ctx, name, enabled, percent, actorID)`:
  1. `UPDATE featureflags SET ... WHERE flag_name = $1`.
  2. Invalidate local cache entry for `name`.
  3. Best-effort `audit.Log(ctx, ...)` — write before returning.

**Cache invalidation across services:** Each service has its own 30s cache. A flag flip in admin UI propagates to all services within 30s. **No NATS broadcast in v1.0** — 30s is the budget for a kill-switch like `release_channel_force_update` (a 30s delay before a force-update banner reaches all clients is acceptable; this is not a sub-second-correctness flag system).

**When 30s is not enough:** For `release_channel_force_update` specifically, we accept the 30s lag. v1.1 may add NATS-broadcast invalidation if a flag's correctness needs <30s propagation.

### Pattern 4: Percentage rollout via FNV-1a — `Rollout(userID, flag, percent) bool`

**What:** Deterministic per-user assignment. Same `(userID, flag)` always returns the same bucket [0, 100); user is in rollout if bucket < percent.

**Why FNV-1a:** Stdlib, simple, sufficient distribution for our needs (≤100 buckets, user count in low millions tops). At our scale, the 1-2% bucket-bias possible with FNV-1a is dominated by other variance (selection of testers, real-world cohort drift). `[ASSUMED: distribution quality acceptable — flag for §Assumptions]`

**Test plan:** Generate 100,000 synthetic user IDs, compute rollout @ 50% for one flag, assert observed rate ∈ [49%, 51%]. Repeat for 10%, 25%, 75% as fixture tests.

### Pattern 5: Mobile feature flag store — three-tier resolution

```
useFlag('strava_oauth_enabled')
   │
   ├─► Server-fetched value (from MMKV cache, refreshed within last 5min)?
   │     YES → return value
   │     NO ↓
   │
   ├─► Bundled default from featureflags.defaults.ts?
   │     YES → return default
   │     NO ↓
   │
   └─► Hard-coded false (every boolean flag's ultimate fallback)
```

**Refresh triggers:**
1. App launch (after `tokenStorage.loadFromStorage()` completes).
2. `AppState` listener: foreground transition + `lastFetchedAt > 5min ago`.
3. Auth state change (login, logout) — wipes user-rolled values.

**Refresh does NOT block UI:** On launch, the screen mounts using cached/default values. Server response arrives async and updates the store; components re-render naturally.

### Anti-Patterns to Avoid

- **Adding `X-Client-Version` checks in every service handler individually.** Use the shared middleware; single point of truth.
- **Caching feature flag values per-user in Postgres.** The flag table has one row per flag, not per user. Per-user assignment is a pure function `Rollout(userID, name, percent)` — no per-user persistence needed.
- **Importing `@rnmapbox/maps` or other Mapbox SDK inside `src/state/featureflags.ts`.** Feature flag store is cross-cutting; must not import platform-coupled modules. CLAUDE.md MapAdapter rule applies broadly.
- **Hard-coding the App Store URL in the mobile app.** Use a config that ships in `forceUpdate.ts` — different bundle IDs for staging vs prod.
- **Treating a 426 response as a hard error to retry.** `apiClient.ts` must intercept and route to `forceUpdate$`; otherwise retry loops will hammer the gateway.
- **Adding new routes via `mux.Handle(`, an HTTP wrapper function, or a generated registry.** The drift check parses literal string arguments to `mux.HandleFunc("METHOD /path", h.X)` only. Any non-literal route registration silently bypasses the check. Linter rule: ESLint-equivalent for Go via `golangci-lint`'s `forbidigo` rule.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Semver comparison in middleware | Custom string-split-and-compare | `golang.org/x/mod/semver` (stdlib-adjacent, `Compare(a, b)` returns -1/0/1) | Handles pre-release tags, build metadata, edge cases that custom parsers miss. `[CITED: https://pkg.go.dev/golang.org/x/mod/semver]` |
| Singleflight (avoid thundering herd on cache miss) | `sync.Once` + map + manual locking | `golang.org/x/sync/singleflight` | Already battle-tested; correct under cancellation. |
| YAML parsing in drift check | Custom YAML tokenizer | `gopkg.in/yaml.v3` | Standard for Go ecosystem. |
| Hashing user_id for rollout | Custom CRC or modulo | `hash/fnv` (stdlib) | Per D-12. |
| Mobile version detection | Reading `Platform.constants` or native modules | `expo-application` | Officially supported, SDK 54 compatible, no extra plugin work. |
| Feature flag fetch retry/backoff | Custom timer loops | Mobile: `setTimeout` + manual 5min TTL is fine. Don't add a library. | This is genuinely simple; a library would add weight. |
| App Store deep link / URL construction | Custom string assembly | iOS: `https://apps.apple.com/app/id<APP_STORE_ID>`. Android: VPS-hosted manifest URL (Phase 18). Store in EAS-profile-specific env. | App Store URL format documented. `[CITED: Apple App Store deep link format]` |
| OpenAPI lint rules | Custom YAML grep | `@redocly/cli` built-in `recommended` ruleset + selective overrides | Covers `operation-operationId`, `no-undefined-server-variable`, `tag-description`, etc., off the shelf. |

**Key insight:** This phase is contract-and-plumbing-heavy with very few genuine algorithmic decisions. The discipline is to *not* invent solutions where the standard library or existing libraries already cover the case.

## Runtime State Inventory

> Phase 1 is greenfield (no rename or migration). This section is included for completeness per the phase checklist but documents that nothing pre-existing carries state that requires touching.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `featureflags` table is brand new; mobile MMKV namespace for flags is new (`featureflags-cache-v1`). | None (Phase 1 creates it). |
| Live service config | None — no n8n / Datadog / Tailscale references in this codebase. | None. |
| OS-registered state | None — no systemd unit names change; no Task Scheduler. | None. |
| Secrets / env vars | None added in Phase 1. `EXPO_PUBLIC_API_URL` already exists. App Store ID for force-update URL goes into `apps/mobile-rn/app.json.extra` or EAS profile, not a secret. | None for secrets. Add `APP_STORE_ID` to `app.json` per-environment via EAS profile env. |
| Build artifacts | None — no installed packages are renamed; `expo-application` is *added* as direct dep, not renamed. | After `npx expo install expo-application`, run `pod install` for iOS (autolinking is automatic but the lock file changes). |

**Canonical question answer:** After Phase 1 lands, no runtime system holds stale "old name" state because nothing was renamed.

## Common Pitfalls

### Pitfall 1: Migration number collision (0020 already used)
**What goes wrong:** CONTEXT D-11 specifies `0020_featureflags.up.sql`. The migrations directory already has `0020_auth_otp.up.sql` from a parallel pre-v1.0 commit.
**Why it happens:** CONTEXT was based on a stale grep result that missed the OTP migration.
**How to avoid:** Use `0021_featureflags.up.sql`. Planner MUST verify with `ls services/backend/migrations | sort | tail -3` before authoring the SQL.
**Warning signs:** `migrate up` reports "Dirty database" or "duplicate migration version".

### Pitfall 2: `expo-application` missing from package.json
**What goes wrong:** Module works in dev (transitive dep), then disappears or pins to wrong version in a clean install or EAS Build.
**Why it happens:** Direct usage of a transitive dep is fragile — any peer package bump can remove or downgrade it.
**How to avoid:** `npx expo install expo-application` adds it as a SDK-aligned direct dep. Confirm with `grep expo-application apps/mobile-rn/package.json`.
**Warning signs:** EAS Build error "Cannot find module 'expo-application'" or random version drift between local and CI.

### Pitfall 3: Middleware order on `/healthz` and `/metrics`
**What goes wrong:** External health-check tooling (Caddy, Kubernetes probes, Prometheus scraper) doesn't set `X-Client-Version`; a strict 426 here breaks readiness checks.
**Why it happens:** Naive middleware applies to every path.
**How to avoid:** `clientversion.Policy.SkipPaths` whitelist for `/healthz`, `/metrics`. Verified by unit test that `GET /healthz` without header → 200.
**Warning signs:** Caddy logs flood with 426 from `/healthz`; service degrades on prober churn.

### Pitfall 4: CRLF injection in `X-Client-Version`
**What goes wrong:** Untrusted header content reflected to logs or response bodies enables header-smuggling / log-injection.
**Why it happens:** Mobile constructs `"1.0.0 (42)"` from `nativeApplicationVersion` and `nativeBuildVersion`. These are Apple/Google-provided strings — extremely unlikely to contain CRLF — but a defense-in-depth check costs nothing.
**How to avoid:** `pkg/clientversion.parse()` rejects any header containing `\r`, `\n`, or non-printable chars. Treat as malformed → graceful-degrade (no 426; log warn).
**Warning signs:** None at runtime; this is a static-analysis / pre-commit verification concern.

### Pitfall 5: OpenAPI multi-file `$ref` and SchemaDefinition in 3.1
**What goes wrong:** Tooling that doesn't natively bundle multi-file specs may fail to resolve `$ref: './_shared/schemas.yaml#/components/schemas/User'`.
**Why it happens:** OpenAPI 3.1 multi-file is supported by Redocly/Stoplight but inconsistently by older tools. `[CITED: https://github.com/Redocly/redoc/issues/1862]`
**How to avoid:** Always commit the **un-bundled** YAMLs as the source of truth; **also commit `services/backend/api/dist/openapi.yaml`** as a redocly-bundled artifact (single file). CI step: `redocly bundle api/gateway.yaml --output api/dist/openapi.yaml`. Mobile dev (if they ever generate types) consumes `dist/openapi.yaml`.
**Warning signs:** External viewer (Swagger UI, Insomnia) shows blank schema for `User`; `redocly lint` shows broken-reference errors.

### Pitfall 6: EAS OTA does NOT update `nativeApplicationVersion`
**What goes wrong:** Developer publishes a JS-only OTA via `eas update`, expects `X-Client-Version` to reflect the new JS code revision, but it still reports the last native-build version.
**Why it happens:** `expo-application.nativeApplicationVersion` reads `CFBundleShortVersionString` (iOS) / `versionName` (Android). These are baked into the native binary at EAS Build time and do not change on OTA updates. `[CITED: https://docs.expo.dev/eas-update/runtime-versions/]`
**How to avoid:** Treat `X-Client-Version` as "what binary is installed", not "what JS bundle is running". If we need finer JS-bundle granularity later, include `Updates.updateId` (from `expo-updates`) as a second header — out of scope for v1.0.
**Warning signs:** OTA hotfix lands, server still seeing old version on traffic; deploys regress.

### Pitfall 7: Stale MMKV cache stuck on a kill-switched flag
**What goes wrong:** Server flips `strava_oauth_enabled` OFF (incident); some mobile clients are offline; they have `true` in MMKV from previous fetch. They continue to attempt OAuth flow until back online.
**Why it happens:** Offline-first persistence; MMKV survives app kill; 5-min TTL only fires when network is up.
**How to avoid:** (1) Short TTL — 5 min is acceptable kill-switch latency for v1.0. (2) Server-side check at the OAuth endpoint also returns 403/451 with flag-disabled error → mobile UX shows "feature unavailable" gracefully regardless of local flag state. (3) Document this in `docs/v1.0-SCOPE.md` as known constraint.
**Warning signs:** User reports "still seeing X feature after we turned it off"; logs show flag-gated endpoint hit on a disabled flag.

### Pitfall 8: Rollout flip causing per-session feature toggling
**What goes wrong:** User at session N sees feature (rolled-in @ 50%); admin reduces rollout to 25%; user at session N+1 is now hashed below the new threshold, loses access mid-flow.
**Why it happens:** Rollout is recomputed every check; not cached per session.
**How to avoid:** For v1.0, accept this — feature flags are not session-scoped. Document in ADR-0007. For v1.1, add session-cached rollout decisions or a "sticky" attribute on the flag.
**Warning signs:** User-visible feature flicker; UX bug reports about "the feature was there yesterday".

### Pitfall 9: Admin UI flag flip without audit log
**What goes wrong:** Two admins flip the same flag minutes apart; nobody knows who/when.
**Why it happens:** Forgot to wire `pkg/audit.Log` into the admin handler.
**How to avoid:** Mandatory audit write inside the same handler that does `Store.Set(...)`. Audit capability: define `permissions.CapFeatureFlagToggle = "featureflag.toggle"` and pass to `audit.Entry{Capability: ...}`.
**Warning signs:** Postgres `featureflags.updated_at` advances but `audit_log` has no row in same window.

### Pitfall 10: Drift check false-negative on imperatively-registered routes
**What goes wrong:** Developer writes `for _, route := range routes { mux.HandleFunc(route.pattern, route.h) }`. The AST drift check looks for literal string args; it doesn't see these routes.
**Why it happens:** AST parsing on literals only.
**How to avoid:** (a) `golangci-lint` rule: forbid non-literal first arg to `mux.HandleFunc`. (b) Document the convention in `docs/CONVENTIONS.md`. (c) Drift check tool prints discovered routes per file — code review catches files with zero discovered routes if the file should have some.
**Warning signs:** Service compiles fine; routes work in dev; OpenAPI lacks them; bug found weeks later.

## Code Examples

### Example 1: `pkg/clientversion/middleware.go`

```go
// Source: composed from Go stdlib net/http + slog patterns. No external library required.
package clientversion

import (
    "context"
    "encoding/json"
    "errors"
    "log/slog"
    "net/http"
    "strings"
    "unicode"

    "golang.org/x/mod/semver"
)

type ctxKey int
const versionKey ctxKey = 0

type ParsedVersion struct {
    Semver string // e.g. "v1.0.0"
    Build  string // e.g. "42"
    Raw    string // unparsed input
}

type Policy struct {
    MinSupported          string // e.g. "v1.0.0"
    ForceUpdateURLAndroid string
    ForceUpdateURLiOS     string
    SkipPaths             []string
}

func Middleware(next http.Handler, p Policy, log *slog.Logger) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        for _, sp := range p.SkipPaths {
            if r.URL.Path == sp {
                next.ServeHTTP(w, r)
                return
            }
        }
        raw := r.Header.Get("X-Client-Version")
        if raw == "" {
            // v1.0 is graceful-degrade: header missing is treated like legacy client.
            // v1.1 may flip to strict (reject with 426).
            log.Warn("clientversion: missing header", "path", r.URL.Path)
            next.ServeHTTP(w, r)
            return
        }
        pv, err := parse(raw)
        if err != nil {
            log.Warn("clientversion: malformed header",
                "raw", sanitize(raw), "err", err.Error())
            next.ServeHTTP(w, r)
            return
        }
        if semver.Compare(pv.Semver, p.MinSupported) < 0 {
            writeUpgradeRequired(w, p)
            log.Info("clientversion: upgrade required",
                "client", pv.Semver, "min", p.MinSupported, "path", r.URL.Path)
            return
        }
        ctx := context.WithValue(r.Context(), versionKey, pv)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}

func parse(raw string) (ParsedVersion, error) {
    raw = strings.TrimSpace(raw)
    if raw == "" {
        return ParsedVersion{}, errors.New("empty")
    }
    for _, r := range raw {
        if r == '\r' || r == '\n' || !unicode.IsPrint(r) {
            return ParsedVersion{}, errors.New("non-printable")
        }
    }
    pv := ParsedVersion{Raw: raw}
    // Accept "1.0.0", "1.0.0 (42)", "1.0.0+build42".
    head := raw
    if i := strings.Index(raw, " ("); i >= 0 {
        head = raw[:i]
        rest := raw[i+2:]
        if j := strings.Index(rest, ")"); j >= 0 {
            pv.Build = rest[:j]
        }
    } else if i := strings.Index(raw, "+"); i >= 0 {
        head = raw[:i]
        pv.Build = raw[i+1:]
    }
    if !strings.HasPrefix(head, "v") {
        head = "v" + head
    }
    if !semver.IsValid(head) {
        return ParsedVersion{}, errors.New("invalid semver")
    }
    pv.Semver = head
    return pv, nil
}

func writeUpgradeRequired(w http.ResponseWriter, p Policy) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusUpgradeRequired) // 426
    _ = json.NewEncoder(w).Encode(map[string]any{
        "error":                    "client_too_old",
        "min_version":              strings.TrimPrefix(p.MinSupported, "v"),
        "force_update_url_android": p.ForceUpdateURLAndroid,
        "force_update_url_ios":     p.ForceUpdateURLiOS,
    })
}

func sanitize(s string) string {
    if len(s) > 64 {
        s = s[:64]
    }
    return strings.Map(func(r rune) rune {
        if unicode.IsPrint(r) { return r }
        return '?'
    }, s)
}

func FromContext(ctx context.Context) (ParsedVersion, bool) {
    pv, ok := ctx.Value(versionKey).(ParsedVersion)
    return pv, ok
}
```

### Example 2: `pkg/featureflags/rollout.go`

```go
// Source: composed using stdlib hash/fnv. No external dep.
package featureflags

import (
    "encoding/binary"
    "hash/fnv"
)

// Rollout returns true if (userID, flagName) hashes into [0, percent).
// Deterministic: same inputs always return same output (idempotent per-user
// assignment).  Distribution at percent=50 across 100k synthetic IDs falls
// within ±1% in tests.
//
// percent is clamped to [0, 100].  percent=0 → always false;
// percent=100 → always true (skips hash for hot path).
func Rollout(userID int64, flagName string, percent int) bool {
    if percent <= 0  { return false }
    if percent >= 100 { return true  }
    h := fnv.New32a()
    var b [8]byte
    binary.LittleEndian.PutUint64(b[:], uint64(userID))
    _, _ = h.Write(b[:])
    _, _ = h.Write([]byte{0}) // separator: prevents userID/flagName boundary collisions
    _, _ = h.Write([]byte(flagName))
    bucket := int(h.Sum32() % 100)
    return bucket < percent
}
```

### Example 3: `apps/mobile-rn/src/auth/version.ts`

```typescript
// Source: composed from expo-application docs.
// Module-level evaluation: native-version read is cheap but cache anyway
// to avoid repeated native bridge crossings.
import * as Application from 'expo-application';

const semver = Application.nativeApplicationVersion ?? '0.0.0';
const build  = Application.nativeBuildVersion        ?? '0';

// Format: "1.0.0 (42)" — chosen for human-readable build numbers.
// Build number is informational only; server parses only the semver portion.
// Both sources are SDK-supplied and cannot contain CRLF — but apiClient
// sets the header via Headers.set() which itself rejects CRLF (RFC 7230 §3.2).
export const CLIENT_VERSION_HEADER = `${semver} (${build})`;

export function getClientVersionHeader(): string {
  return CLIENT_VERSION_HEADER;
}
```

### Example 4: `apps/mobile-rn/src/auth/apiClient.ts` patch (existing file, two minimal additions)

```typescript
// Existing imports + new:
import { getClientVersionHeader } from './version';
import { useForceUpdateStore } from '../state/forceUpdate';

// In doFetch(), inside the headers block (around current line 110-117):
private async doFetch(base: string, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (this.accessToken) {
    headers.set('Authorization', `Bearer ${this.accessToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Client-Version', getClientVersionHeader()); // NEW

  const resp = await fetch(`${base}${path}`, { ...init, headers });

  // NEW: intercept 426 once, globally.
  if (resp.status === 426) {
    try {
      const body = await resp.clone().json() as {
        min_version?: string;
        force_update_url_android?: string;
        force_update_url_ios?: string;
      };
      useForceUpdateStore.getState().set({
        required: true,
        minVersion: body.min_version ?? '',
        forceUpdateUrl: pickUrl(body),
      });
    } catch {
      // body unparseable — still flag force update with empty URL; UI shows generic message
      useForceUpdateStore.getState().set({ required: true, minVersion: '', forceUpdateUrl: '' });
    }
  }

  return resp;
}

function pickUrl(body: { force_update_url_android?: string; force_update_url_ios?: string }): string {
  // Platform import lazily to keep module load cost minimal.
  const { Platform } = require('react-native');
  return Platform.OS === 'ios'
    ? (body.force_update_url_ios ?? '')
    : (body.force_update_url_android ?? '');
}
```

### Example 5: `apps/mobile-rn/src/state/featureflags.ts` (Zustand + MMKV)

```typescript
// Source: composed using Zustand v5 patterns from existing src/state/auth.ts + settings.ts.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MMKV } from 'react-native-mmkv';
import { FEATURE_FLAG_DEFAULTS, FlagName } from './featureflags.defaults';
import { fetchFeatureFlags } from './featureflagsApi';

const storage = new MMKV({ id: 'featureflags-cache-v1' });

const mmkvStorage = {
  getItem: (k: string) => storage.getString(k) ?? null,
  setItem: (k: string, v: string) => storage.set(k, v),
  removeItem: (k: string) => storage.delete(k),
};

const TTL_MS = 5 * 60 * 1000;

type State = {
  flags: Record<FlagName, boolean>;
  lastFetchedAt: number;            // epoch ms; 0 = never fetched
  refresh: () => Promise<void>;
  useFlag: (name: FlagName) => boolean;
};

export const useFeatureFlagsStore = create<State>()(
  persist(
    (set, get) => ({
      flags: FEATURE_FLAG_DEFAULTS,
      lastFetchedAt: 0,
      refresh: async () => {
        try {
          const resp = await fetchFeatureFlags();
          if (resp) {
            set({
              flags: { ...FEATURE_FLAG_DEFAULTS, ...resp.flags },
              lastFetchedAt: Date.now(),
            });
          }
        } catch (e) {
          // Silent: keep existing cache + defaults. Log for diagnostics.
          console.warn('[featureflags] refresh failed', e);
        }
      },
      useFlag: (name) => {
        const { flags, lastFetchedAt, refresh } = get();
        // Stale-while-revalidate: if cache > TTL, kick off refresh async; return current value.
        if (Date.now() - lastFetchedAt > TTL_MS) {
          void refresh();
        }
        return flags[name] ?? FEATURE_FLAG_DEFAULTS[name] ?? false;
      },
    }),
    {
      name: 'featureflags',
      storage: createJSONStorage(() => mmkvStorage),
      // Only persist flags + lastFetchedAt; refresh fn is recreated.
      partialize: (s) => ({ flags: s.flags, lastFetchedAt: s.lastFetchedAt }),
    },
  ),
);
```

### Example 6: `services/backend/migrations/0021_featureflags.up.sql`

```sql
-- Phase 1 / REL-03
-- Source-of-truth table for feature flags. Read by every Go service via pkg/featureflags;
-- written only by /admin/featureflags endpoints (gated by global_role=admin).
CREATE TABLE IF NOT EXISTS featureflags (
    flag_name           TEXT PRIMARY KEY,
    enabled_bool        BOOLEAN NOT NULL DEFAULT false,
    rollout_percent     INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
    description         TEXT,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id  TEXT  -- references users.id, but kept loose to allow system writes
);

-- Seed the v1.0 flag set per D-16 (all OFF).
INSERT INTO featureflags (flag_name, description) VALUES
    ('strava_oauth_enabled',         'Enable Strava OAuth UI; flipped ON when HEALTH-04 ships (Phase 11/12).'),
    ('mapbox_sdk_v11',               'Use Mapbox SDK 11.x code paths (Phase 13 migration soak).'),
    ('release_channel_force_update', 'Emergency kill-switch for force-update flow.'),
    ('tester_debug_logging',         'Tester-mode debug logging opt-in (OBS-08).'),
    ('crash_telemetry_opt_in',       'Crash telemetry opt-in (CRASH-04).')
ON CONFLICT (flag_name) DO NOTHING;
```

```sql
-- 0021_featureflags.down.sql
DROP TABLE IF EXISTS featureflags;
```

### Example 7: Admin UI extension — `gateway/admin/index.html` partial

```html
<!-- Inserted as new <section> in existing index.html, matching surrounding style. -->
<section id="featureflags-section" class="hidden">
  <h2>Feature flags</h2>
  <table>
    <thead>
      <tr>
        <th>Flag</th><th>Enabled</th><th>Rollout %</th>
        <th>Updated</th><th>By</th><th></th>
      </tr>
    </thead>
    <tbody id="featureflags-tbody"></tbody>
  </table>
</section>

<script>
// Phase 1: add to existing admin UI bootstrap.
async function loadFeatureFlags() {
  const r = await fetch('/admin/featureflags', {
    headers: { 'Authorization': 'Bearer ' + getAccessToken() },
  });
  if (!r.ok) return;
  const flags = await r.json();
  const tbody = document.getElementById('featureflags-tbody');
  tbody.innerHTML = '';
  for (const f of flags) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><code>${f.flag_name}</code><div class="meta">${f.description || ''}</div></td>
      <td><input type="checkbox" ${f.enabled_bool ? 'checked' : ''}
                 data-flag="${f.flag_name}" class="ff-enabled"></td>
      <td><input type="number" min="0" max="100" value="${f.rollout_percent}"
                 data-flag="${f.flag_name}" class="ff-percent" style="width:64px"></td>
      <td class="meta">${new Date(f.updated_at).toLocaleString('ru')}</td>
      <td class="meta">${f.updated_by_user_id || ''}</td>
      <td><button class="primary ff-save" data-flag="${f.flag_name}">Save</button></td>
    `;
    tbody.appendChild(tr);
  }
}

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('ff-save')) return;
  const name = e.target.dataset.flag;
  const enabled = document.querySelector(`.ff-enabled[data-flag="${name}"]`).checked;
  const percent = parseInt(document.querySelector(`.ff-percent[data-flag="${name}"]`).value, 10);
  const r = await fetch('/admin/featureflags/' + encodeURIComponent(name), {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer ' + getAccessToken(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled_bool: enabled, rollout_percent: percent }),
  });
  if (r.ok) loadFeatureFlags();
});
</script>
```

### Example 8: Drift-check Go tool sketch — `scripts/openapi-routes-check/main.go`

```go
// Source: composed using Go stdlib go/ast + go/parser.
// Walks each service's internal/handler/**/*.go; extracts string literals
// passed as the first arg to mux.HandleFunc(...) calls; diffs against
// the OpenAPI YAML files in services/backend/api/.
//
// Exit codes: 0=clean; 1=routes-in-code-not-in-spec; 2=routes-in-spec-not-in-code; 3=both.
package main

import (
    "fmt"
    "go/ast"
    "go/parser"
    "go/token"
    "os"
    "path/filepath"
    "strings"

    "gopkg.in/yaml.v3"
)

func main() {
    // 1. Parse OpenAPI YAMLs → set of "METHOD /path".
    specRoutes := loadSpecRoutes("services/backend/api")
    // 2. AST-walk all services for mux.HandleFunc literal args → set.
    codeRoutes := walkHandlers("services/backend")
    // 3. Diff.
    inCodeNotSpec := codeRoutes.Difference(specRoutes)
    inSpecNotCode := specRoutes.Difference(codeRoutes)
    if len(inCodeNotSpec) > 0 {
        fmt.Fprintln(os.Stderr, "routes in code but not in OpenAPI spec:")
        for r := range inCodeNotSpec { fmt.Fprintln(os.Stderr, "  ", r) }
    }
    if len(inSpecNotCode) > 0 {
        fmt.Fprintln(os.Stderr, "routes in OpenAPI spec but not in code:")
        for r := range inSpecNotCode { fmt.Fprintln(os.Stderr, "  ", r) }
    }
    if len(inCodeNotSpec) > 0 && len(inSpecNotCode) > 0 { os.Exit(3) }
    if len(inCodeNotSpec) > 0 { os.Exit(1) }
    if len(inSpecNotCode) > 0 { os.Exit(2) }
    fmt.Println("OK: routes match spec")
}

func walkHandlers(root string) routeSet {
    out := routeSet{}
    _ = filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
        if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") { return nil }
        if !strings.Contains(path, "/internal/handler/") { return nil }
        fset := token.NewFileSet()
        file, err := parser.ParseFile(fset, path, nil, parser.ParseComments)
        if err != nil { return nil }
        ast.Inspect(file, func(n ast.Node) bool {
            call, ok := n.(*ast.CallExpr)
            if !ok { return true }
            sel, ok := call.Fun.(*ast.SelectorExpr)
            if !ok || sel.Sel.Name != "HandleFunc" { return true }
            if len(call.Args) < 1 { return true }
            lit, ok := call.Args[0].(*ast.BasicLit)
            if !ok || lit.Kind != token.STRING { return true }
            raw := strings.Trim(lit.Value, "\"`")
            // Normalize "METHOD /path" → key.
            out[raw] = struct{}{}
            return true
        })
        return nil
    })
    return out
}

type routeSet map[string]struct{}
func (a routeSet) Difference(b routeSet) routeSet {
    out := routeSet{}
    for k := range a { if _, ok := b[k]; !ok { out[k] = struct{}{} } }
    return out
}

// loadSpecRoutes: walks api/*.yaml, parses paths + methods, emits "METHOD /path" set.
func loadSpecRoutes(dir string) routeSet { /* yaml.Unmarshal + iterate */ return routeSet{} }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| OpenAPI 3.0.x | OpenAPI 3.1.0 (JSON Schema 2020-12 aligned, nullable type unions, webhooks support) | 2021 (3.1 spec released); broad tooling support by 2024 | Use `type: ['string', 'null']` instead of `nullable: true` (3.1 idiom). Our existing YAMLs use 3.0-style `nullable: true` which is still permitted in 3.1 — keep for consistency. |
| URL-path versioning (`/v1/...`) | Header versioning (`X-Client-Version` + `Accept-Version`) | Industry shift ~2020 for mobile clients; route prefix doesn't survive API gateways well | D-05 picks this. Better with Caddy reverse_proxy + per-service mounting. |
| Spectral (Stoplight) for lint | Redocly CLI (faster, OpenAPI-purpose-built, simpler rule config than Spectral's JSONPath) — but Spectral is still industry-standard | Redocly 1.0 GA late 2023; Vacuum (Go-based) is emerging-faster but less mature | **Pick Redocly.** Faster than Spectral, purpose-built ruleset, simple config. `[CITED: https://cloudappi.net/en/vacuum-spectral-redocly-linter-apis-en/]` |
| Go-kit / chi / gin routing | Go 1.22+ `http.ServeMux` with method patterns (`mux.HandleFunc("GET /path", ...)`) | Go 1.22 release, Feb 2024 | Already adopted across all 7 services. Drift check leverages literal-string discipline of this style. `[CITED: https://go.dev/blog/routing-enhancements]` |
| LaunchDarkly / split.io / Statsig | Self-hosted Postgres + small in-memory cache for team-of-2 | n/a — scale-appropriate choice | Per D-11; v2.0+ may revisit. |
| FNV-1a for percentage rollout | xxhash / Murmur3 (industry leans this way for high-volume) | xxhash adoption ~2018-2020 | FNV-1a is stdlib and sufficient at our scale. Defer migration. |

**Deprecated/outdated:**
- `nullable: true` in OpenAPI 3.1 — technically replaced by `type: [..., 'null']` unions but still legal. Keep current style for consistency.
- Spectral's recommended ruleset for non-OpenAPI-specific concerns — Redocly's `recommended` covers everything OpenAPI-specific we need.
- xxhash-only-for-feature-flags — overcomplicated for our scale; FNV-1a is fine.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FNV-1a 32-bit distribution at percent=50 across 100k synthetic IDs falls within ±1% — sufficient for our needs | §Pattern 4, §Code Examples | If bias exceeds ±5%, percentage rollouts misrepresent reach. Mitigation: ship a unit test that asserts the ±2% boundary on a fixture set; if it fails, swap to `xxhash`. |
| A2 | App Store URL format `https://apps.apple.com/app/id<APP_STORE_ID>` is the correct deep link for force-update flow | §Don't Hand-Roll | If wrong, force-update modal sends user to invalid URL → silent UX failure. Mitigation: hard-code per-EAS-profile + manual test on TestFlight build before Phase 21 soak. |
| A3 | 30s in-memory cache per service is acceptable propagation delay for kill-switch flags (no NATS broadcast needed v1.0) | §Pattern 3 | If a flag flip needs sub-second propagation (e.g., security kill-switch), 30s lag is too long. Mitigation: documented limitation in ADR-0007; v1.1 can add NATS broadcast. |
| A4 | Existing `pkg/permissions` `global_role=admin` gate suffices for `/admin/featureflags` endpoints (no new permission needed) | §Component Responsibilities | If gating logic differs from existing `/admin/reports`, admins might lose access or unauthorized users gain it. Mitigation: read `pkg/permissions` source before writing handler; mirror pattern. |
| A5 | `nativeBuildVersion` is always a parseable integer string on both iOS and Android | §Code Examples (`version.ts`) | If iOS reports something exotic (e.g., `"42.1"` for nested CFBundleVersion), header format may surprise downstream parsing. Mitigation: backend parser already accepts arbitrary build-string content; semver portion is what's enforced. Safe. |
| A6 | OpenAPI 3.1 multi-file with relative `$ref` is fully supported by `@redocly/cli` `lint` and `bundle` | §Pattern 1 | If lint or bundle breaks, falling back to single-file 8 specs (no `_shared/`) adds duplication but works. Mitigation: bundle as the first CI step; if it fails, fall back to single-file pattern. |
| A7 | The pre-existing `gateway/admin/index.html` JWT flow uses `localStorage` or similar for the admin token, and `getAccessToken()` is already defined | §Code Example 7 | If the function name differs, admin UI integration needs a small adjustment. Mitigation: read existing admin/index.html script section before writing patch. |

## Open Questions

1. **App Store ID for `force_update_url_ios`**
   - What we know: Bundle ID is `com.runningecosystem.mobile`. App Store ID format is `id<8-or-10-digit-number>`.
   - What's unclear: The number is only assigned when Phase 10 (iOS signing) registers the app in App Store Connect. **Phase 1 cannot finalize this URL.**
   - Recommendation: Use a placeholder `https://apps.apple.com/app/idTBD` in the seed code and ADR; Phase 10/12 substitutes the real ID via EAS env var `EXPO_PUBLIC_APP_STORE_URL`. Document this in ADR-0007 as a known incomplete piece.

2. **Caddy passthrough of `X-Client-Version`**
   - What we know: Caddy v2 `reverse_proxy` forwards all request headers by default.
   - What's unclear: Whether any existing Caddyfile directive strips headers.
   - Recommendation: Add a unit/integration test that issues an HTTP request via Caddy and asserts `X-Client-Version` arrives at the upstream. Cheap verification.

3. **Mobile semver source-of-truth: `app.json.version` vs `expo-application.nativeApplicationVersion`**
   - What we know: They should match when EAS Build sets `versionName` / `CFBundleShortVersionString` from `app.json.version`.
   - What's unclear: Whether any local dev workflow drifts these.
   - Recommendation: ADR-0007 documents `app.json.version` as the single source of truth at build time; runtime reads `expo-application` (which reflects what the binary was built with).

4. **`docs/v1.0-SCOPE.md` placement**
   - What we know: CONTEXT D-17 says `docs/v1.0-SCOPE.md`. Existing convention is RU headers + EN body.
   - What's unclear: Whether it lives at `docs/` root or `docs/RELEASES/` or similar.
   - Recommendation: `docs/v1.0-SCOPE.md` at root, mirroring `docs/SECRETS.md` and `docs/TELEMETRY.md` precedent.

5. **Drift check execution placement**
   - What we know: D-04 says "drift check lives in Phase 4 CI work but the validation script lands here."
   - What's unclear: Whether Phase 1 wires the script into a pre-commit hook + a `make check-routes` target, or just lands the binary.
   - Recommendation: Phase 1 lands the binary + a `make check-routes` target. Phase 4 wires the GitHub Actions job.

## Environment Availability

> Phase 1 work occurs at coding/build time. Runtime deps are all already present in the existing dev stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Go 1.25 | `pkg/clientversion`, `pkg/featureflags`, drift-check tool | ✓ | 1.25.0 | — |
| Postgres 16 + TimescaleDB 2.17.2 | `pkg/featureflags` Postgres store + migration | ✓ | 16/2.17.2 | — |
| `golang-migrate` v4.18.1 | Apply migration `0021_featureflags` | ✓ | v4.18.1 | — |
| Node + npm | `redocly lint` + `redocly bundle` | ✓ | (mobile already uses npm) | — |
| `@redocly/cli` | OpenAPI lint + bundle in CI | ✗ (not installed) | — | Use Spectral CLI if Redocly install fails; both work |
| `expo-application` | Mobile version stamp | ✓ (transitive) | 7.0.8 | Must be added as direct dep via `npx expo install` |
| `golang.org/x/mod/semver` | `pkg/clientversion` semver compare | ⚠ (need to verify in go.work) | — | Vendor in or `go get` during Phase 1 |
| `golang.org/x/sync/singleflight` | `pkg/featureflags` cache fill | ⚠ (need to verify) | — | `go get` during Phase 1 |
| `gopkg.in/yaml.v3` | Drift-check tool YAML parsing | ⚠ (need to verify in scripts module) | — | `go get` |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** `@redocly/cli` is the main external add; Spectral is a viable fallback.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Backend framework | Go stdlib `testing` package |
| Backend test runner | `make test` in `services/backend/Makefile` (runs `go test ./...` per service) |
| Backend coverage tool | `make test-coverage` |
| Mobile framework | Jest 29.7 + `jest-expo` 54.0 + `@testing-library/react-native` 13.3 |
| Mobile config | `apps/mobile-rn/jest.config.js` |
| Mobile quick run | `cd apps/mobile-rn && npm test -- --testPathPattern=featureflags` |
| Full mobile suite | `cd apps/mobile-rn && npm test` |
| Full backend suite | `cd services/backend && make test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REL-01 | All mobile-facing endpoints documented in YAML | static + drift check | `cd services/backend && go run ./scripts/openapi-routes-check` | ❌ Wave 0 |
| REL-01 | OpenAPI specs lint clean | static | `npx redocly lint services/backend/api/*.yaml` | ❌ Wave 0 |
| REL-02 | `pkg/clientversion.parse()` accepts all 3 formats | unit | `cd services/backend && go test ./pkg/clientversion/...` | ❌ Wave 0 |
| REL-02 | Middleware returns 426 on version < min | unit | same as above | ❌ Wave 0 |
| REL-02 | `/healthz` exempt from version check | unit | same as above | ❌ Wave 0 |
| REL-02 | Malformed header logs warning + passes request | unit | same as above | ❌ Wave 0 |
| REL-02 | CRLF in header rejected as malformed | unit | same as above | ❌ Wave 0 |
| REL-02 | Mobile `apiClient.ts` stamps header on every request | unit | `cd apps/mobile-rn && npm test -- apiClient.test` | ❌ Wave 0 |
| REL-02 | Mobile 426 response triggers forceUpdate$ store | unit | same | ❌ Wave 0 |
| REL-03 | `featureflags.Rollout(uid, "x", 50)` distributes ~50% across 100k IDs | unit | `cd services/backend && go test ./pkg/featureflags/...` | ❌ Wave 0 |
| REL-03 | `featureflags.IsEnabled` falls back to cached value on DB error | unit | same | ❌ Wave 0 |
| REL-03 | Read-through cache invalidated after `Set()` | unit | same | ❌ Wave 0 |
| REL-03 | Singleflight prevents duplicate DB queries on cache miss | unit | same | ❌ Wave 0 |
| REL-03 | Audit log written on `Set()` | unit | same (uses pgxmock or real test DB) | ❌ Wave 0 |
| REL-03 | Mobile `useFlag()` returns default when MMKV empty | unit | `cd apps/mobile-rn && npm test -- featureflags` | ❌ Wave 0 |
| REL-03 | Mobile `useFlag()` returns server value when cache fresh | unit | same | ❌ Wave 0 |
| REL-03 | Mobile `refresh()` survives network error (keeps cache) | unit | same | ❌ Wave 0 |
| REL-04 | `docs/v1.0-SCOPE.md` exists with IN + OUT tables | static | `test -f docs/v1.0-SCOPE.md && grep -q "IN scope" docs/v1.0-SCOPE.md` | ❌ Wave 0 |
| REL-05 | ADR-0007 exists with three sections | static | `test -f docs/DECISIONS/0007-v1.0-release-contract.md` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `make test` for the affected `pkg/` + `npm test -- --testPathPattern=featureflags` for the affected mobile file.
- **Per wave merge:** Full backend `make test`, full mobile `npm test`, `redocly lint`, drift-check tool.
- **Phase gate:** All of the above green + manual smoke test of `X-Client-Version` 426 flow against a local Caddy + identity service.

### Wave 0 Gaps
- [ ] `services/backend/pkg/clientversion/middleware_test.go` — covers REL-02
- [ ] `services/backend/pkg/featureflags/featureflags_test.go` + `rollout_test.go` — covers REL-03
- [ ] `services/backend/scripts/openapi-routes-check/main.go` + `*_test.go` — covers REL-01 drift
- [ ] `apps/mobile-rn/src/auth/__tests__/version.test.ts` — covers REL-02 mobile
- [ ] `apps/mobile-rn/src/auth/__tests__/apiClient.test.ts` — extend existing test (if any) for 426 + header
- [ ] `apps/mobile-rn/src/state/__tests__/featureflags.test.ts` — covers REL-03 mobile
- [ ] `services/backend/api/redocly.yaml` — lint config (uses `extends: [recommended]` + per-rule overrides)
- [ ] `services/backend/api/_shared/{schemas,parameters,responses}.yaml` — shared components

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin UI) | Existing `pkg/permissions` `global_role=admin` gate; JWT bearer; no new auth surface |
| V3 Session Management | no | No new session surface; reuses existing access/refresh tokens |
| V4 Access Control | yes | `pkg/permissions` `CapFeatureFlagToggle` capability; `pkg/audit` writes on every Set |
| V5 Input Validation | yes | `X-Client-Version` header sanitization (CRLF reject); `rollout_percent` clamp [0,100]; `flag_name` regex `^[a-z][a-z0-9_]*$` |
| V6 Cryptography | no | FNV-1a is non-cryptographic hash by design; rollout determinism, not security |
| V7 Error Handling & Logging | yes | Audit log on every flag toggle; structured slog on version-check warnings/decisions |
| V8 Data Protection | partial | Flag values are non-PII; no encryption at rest needed beyond Postgres default |
| V9 Communication | yes | All endpoints behind Caddy TLS / Let's Encrypt; header value never logged in cleartext beyond `sanitize()` output |
| V13 API & Web Service | yes | OpenAPI specs ARE the V13 control — they document the surface and enable lint-based discipline |

### Known Threat Patterns for `Go + Postgres + Caddy + Expo RN`

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Header injection via `X-Client-Version` | Tampering | Reject CRLF / non-printable in `pkg/clientversion.parse` |
| SQL injection on `flag_name` in `featureflags.Set` | Tampering | pgx parameterized queries (existing pattern); validate `flag_name` against allowlist before write |
| Privilege escalation on `/admin/featureflags` | Elevation of Privilege | `pkg/permissions.Check(subject, CapFeatureFlagToggle, ctx)` gate before any handler logic |
| Audit log tampering | Repudiation | Audit writes are append-only by design (`audit_log` schema from Phase 8/L) |
| Thundering herd on cache miss across N services | DoS-via-amplification | `singleflight.Do(name, fetch)` per service |
| Cache poisoning via concurrent reads-during-write | Tampering | Cache invalidation under lock; readers see either old or new value, never partial |
| Force-update URL phishing | Spoofing | URL embedded in code or EAS env, signed by Phase 18 Caddy manifest (Ed25519); not user-controllable |
| Logging of full `X-Client-Version` header verbatim | Info disclosure (minor) | `sanitize()` strips non-printable + truncates to 64 chars before log |
| OpenAPI spec leaking internal endpoints | Info disclosure | D-02 restricts spec to mobile-facing endpoints; internal NATS/gRPC undocumented |

## Sources

### Primary (HIGH confidence)
- `services/backend/api/identity.yaml` — existing 3.1.0 hand-written spec pattern
- `services/backend/api/activity-sync.yaml` — same
- `services/backend/identity/internal/handler/http.go` — `mux.HandleFunc` registration pattern
- `services/backend/pkg/audit/audit.go` — audit Entry pattern (consumed by feature flag admin)
- `services/backend/pkg/ratelimit/ratelimit.go` — shape pattern for new `pkg/featureflags`
- `services/backend/pkg/permissions/capability.go` — Capability string constants pattern
- `services/backend/gateway/Caddyfile.prod` — discovered gateway is Caddy-only
- `services/backend/gateway/admin/index.html` — vanilla HTML+JS admin UI precedent
- `apps/mobile-rn/src/auth/apiClient.ts` — single seam for header stamping + 426 intercept
- `apps/mobile-rn/node_modules/expo-application/build/Application.d.ts` — exact API surface
- `apps/mobile-rn/package.json` — confirmed `expo-application` is NOT a direct dep
- `services/backend/migrations/` (file listing) — confirmed `0020_auth_otp` exists; next slot is `0021`
- `.planning/codebase/STACK.md` — full stack inventory (2026-05-14 generated)
- [Go 1.22 routing enhancements blog](https://go.dev/blog/routing-enhancements) — method-pattern mux
- [Expo runtime versions docs](https://docs.expo.dev/eas-update/runtime-versions/) — confirms OTA does not change `nativeApplicationVersion`

### Secondary (MEDIUM confidence)
- [Redocly multi-file definitions](https://redocly.com/learn/openapi/multi-file-definitions) — $ref + bundle pattern
- [Redocly bundle command](https://redocly.com/docs/cli/commands/bundle) — CI bundle step
- [CloudAPPi linter comparison](https://cloudappi.net/en/vacuum-spectral-redocly-linter-apis-en/) — Redocly vs Spectral
- [Speakeasy components best practices](https://www.speakeasy.com/openapi/components) — shared schema discipline
- [Jamie Tanna: introspecting `http.ServeMux`](https://www.jvt.me/posts/2024/03/04/go-net-http-routes/) — confirms no stdlib introspection API → AST approach is correct
- [oneuptime: percentage rollout flag design](https://oneuptime.com/blog/post/2026-01-30-percentage-rollout-flags/view) — deterministic hashing pattern
- [MojoAuth: FNV-1 vs xxHash comparison](https://mojoauth.com/compare-hashing-algorithms/fnv-1-vs-xxhash/) — distribution + speed tradeoffs
- [MDN: HTTP 426](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/426) — semantic of upgrade-required

### Tertiary (LOW confidence — flagged for validation)
- [Redocly issue #1862 on 3.1 multi-file SchemaDefinition](https://github.com/Redocly/redoc/issues/1862) — older issue; verify still applies to current redocly-cli version before relying on bundle workflow

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library/version directly verified against `package.json`, `go.mod`, or filesystem
- Architecture: HIGH — patterns mirror existing `pkg/ratelimit`, `pkg/audit`, `pkg/permissions` discovered in the codebase
- Code examples: HIGH — composed from stdlib + existing-pattern conventions; no speculative library usage
- Pitfalls: MEDIUM — Pitfalls 1, 2, 6 are verified from primary sources; Pitfalls 7-10 are well-known industry patterns
- Drift-check feasibility: MEDIUM — AST approach is sound but untested in this codebase; recommend a small spike during planning

**Research date:** 2026-05-15
**Valid until:** 2026-06-15 (30 days; stack is stable and unlikely to invalidate)

---

## Critical Correction Summary (for Planner)

Three corrections to CONTEXT that the planner MUST apply when authoring plans:

1. **Migration `0021_featureflags`, not `0020`.** D-11 was wrong about the migration number; `0020_auth_otp` already exists.
2. **`pkg/clientversion` middleware lives per-service**, not in a Go gateway, because gateway is Caddy-only. D-08 enforcement-point intent is preserved: single Go package, shared by all services, mounted once at each service's outermost wrap.
3. **Add `expo-application` to `apps/mobile-rn/package.json` as a direct dep** via `npx expo install expo-application`. It is currently only a transitive dep.

These corrections do not invalidate any locked decision in CONTEXT — they implement those decisions accurately against the actual codebase state.
