# Phase 1: Release Contract & Version Baseline — Pattern Map

**Mapped:** 2026-05-15
**Files analyzed:** 39 (NEW: 30, MODIFIED: 9)
**Analogs found:** 36 / 39 (3 greenfield — no analog)

## Scope Reminder

This phase ships three concerns in parallel:
1. **OpenAPI spec extension** — 7 new YAMLs + `_shared/` components + drift-check Go tool
2. **`X-Client-Version` end-to-end** — mobile stamp + per-service Go middleware + 426 force-update UX
3. **Feature flags** — backend `pkg/featureflags` + Postgres table + mobile Zustand store + admin UI

All patterns below extend established conventions; no new architectural primitives are introduced.

---

## File Classification

### Backend — shared Go libs (`services/backend/pkg/`)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `pkg/clientversion/clientversion.go` | utility (package root) | request-response (middleware) | `pkg/ratelimit/ratelimit.go` | role-match |
| `pkg/clientversion/parse.go` | utility | transform | `pkg/permissions/role.go` (small standalone util) | role-match |
| `pkg/clientversion/middleware.go` | middleware | request-response | `services/backend/social-graph/internal/handler/http.go` (loggingMiddleware pattern at lines 90-91) | exact |
| `pkg/clientversion/*_test.go` | test | unit | `pkg/permissions/check_test.go` | exact |
| `pkg/featureflags/featureflags.go` | service (public API) | CRUD | `pkg/ratelimit/ratelimit.go` | role-match |
| `pkg/featureflags/postgres.go` | service (Postgres impl) | CRUD | `services/backend/social-graph/internal/repository/postgres/*.go` (pgxpool QueryRow / Exec) | role-match |
| `pkg/featureflags/cache.go` | utility (in-memory cache + singleflight) | transform | none — greenfield | none |
| `pkg/featureflags/rollout.go` | utility (FNV-1a hash) | transform | `pkg/gamification/xp.go` (pure stdlib utility) | role-match |
| `pkg/featureflags/*_test.go` | test | unit | `pkg/permissions/check_test.go` | exact |

### Backend — service main.go modifications

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `identity/cmd/server/main.go` | config (wrap mux) | request-response | self (existing service main with mux wrap) | exact |
| `feed/cmd/server/main.go` | config | same | `identity/cmd/server/main.go` lines 75-82 | exact |
| `social-graph/cmd/server/main.go` | config | same | `social-graph/cmd/server/main.go` lines 80-89 | exact |
| `activity-sync/cmd/server/main.go` | config | same | same shape | exact |
| `realtime-gw/cmd/server/main.go` | config | same | same shape | exact |
| `messaging/cmd/server/main.go` | config | same | same shape | exact |
| `notifications/cmd/server/main.go` | config | same | same shape | exact |
| `media/cmd/server/main.go` | config | same | same shape | exact |

### Backend — handlers (admin + flag-fetch endpoints)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `*/internal/handler/featureflags.go` (per service) | controller | request-response | `social-graph/internal/handler/moderation.go` | exact |
| Admin endpoints (`GET /admin/featureflags`, `PUT /admin/featureflags/{flag_name}`) | controller | CRUD (gated) | `social-graph/internal/handler/moderation.go` lines 108-120 (`adminListReports`) | exact |
| `GET /featureflags` (auth-optional public read) | controller | request-response | `identity/internal/handler/http.go` (public `/healthz` style) | role-match |

### Backend — migrations

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `migrations/0021_featureflags.up.sql` | migration | DDL | `migrations/0020_auth_otp.up.sql` | exact |
| `migrations/0021_featureflags.down.sql` | migration | DDL | `migrations/0020_auth_otp.down.sql` | exact |

### Backend — API specs (OpenAPI)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `api/feed.yaml` | config (spec) | docs | `api/identity.yaml` + `api/activity-sync.yaml` | exact |
| `api/social-graph.yaml` | config (spec) | docs | same | exact |
| `api/messaging.yaml` | config (spec) | docs | same | exact |
| `api/realtime-gw.yaml` | config (spec) | docs | `api/activity-sync.yaml` (note: WS upgrade is single endpoint + envelope) | role-match |
| `api/notifications.yaml` | config (spec) | docs | same | exact |
| `api/media.yaml` | config (spec) | docs | same | exact |
| `api/gateway.yaml` | config (spec, aggregate) | docs | `api/identity.yaml` (root-server doc) | role-match |
| `api/_shared/schemas.yaml` | config (shared OAS components) | docs | `api/identity.yaml` lines 129-186 (inline components section to extract) | role-match |
| `api/_shared/parameters.yaml` | config | docs | same (extract) | role-match |
| `api/_shared/responses.yaml` | config | docs | same (extract) | role-match |
| `api/redocly.yaml` | config (lint) | tooling | none — greenfield | none |

### Backend — CI tooling

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `scripts/openapi-routes-check/main.go` | utility (CI tool) | batch (AST walk) | none — greenfield | none |

### Backend — admin UI extension

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `gateway/admin/index.html` | component (vanilla HTML+JS) | request-response | self (existing `<section>` for reports + audit) — extend with `<section>` for feature flags | exact |

### Mobile — Zustand stores

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/state/featureflags.ts` | store (Zustand + MMKV persist) | CRUD (in-mem read; refresh on triggers) | `src/state/settings.ts` (persist + MMKV) | exact |
| `src/state/featureflags.defaults.ts` | utility (constants) | — | `src/state/settings.ts` lines 62-77 (`DEFAULT_ATHLETE`, `DEFAULT_GOALS` constants) | exact |
| `src/state/featureflagsApi.ts` | service (HTTP client) | request-response | `src/modules/gamification/sync/xpApi.ts` | exact |
| `src/state/forceUpdate.ts` | store (Zustand in-memory) | event-driven | `src/state/auth.ts` (in-memory Zustand) | exact |
| `src/util/version.ts` | utility | — | `src/util/geo.ts` (pure stateless module) | role-match |
| `src/ui/screens/ForceUpdateScreen.tsx` | component | event-driven | `src/ui/HistoryModal.tsx` (RN Modal with theme dark palette) | role-match |

### Mobile — modifications

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/auth/apiClient.ts` | service (HTTP wrapper) | request-response | self (existing `doFetch` at lines 109-118) — extend with header stamp + 426 intercept | exact |
| `package.json` | config | — | self (existing `dependencies` block, alphabetical) | exact |
| `App.tsx` | component (root) | — | self (existing top-level conditional rendering style; insert at line 75-86) | exact |

### Docs

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `docs/v1.0-SCOPE.md` | docs | — | `docs/DECISIONS/0001-framework-react-native.md` (RU header + sectioned body) | role-match |
| `docs/DECISIONS/0007-v1.0-release-contract.md` | docs (ADR) | — | `docs/DECISIONS/0001-framework-react-native.md` | exact |
| `docs/API-CONTRACT-v1.0.md` | docs (index) | — | `docs/DECISIONS/0001-framework-react-native.md` (RU header) + link to OpenAPI bundle | role-match |

---

## Pattern Assignments

### `services/backend/pkg/clientversion/` (utility/middleware, request-response)

**Analog:** `services/backend/pkg/ratelimit/ratelimit.go` (package shape) + `services/backend/social-graph/internal/handler/http.go` (middleware wrap shape).

**Package header pattern** (mirror `pkg/ratelimit/ratelimit.go` lines 1-18):
```go
// Package clientversion — HTTP middleware для проверки X-Client-Version.
// Phase 1 / REL-02.
//
// Parses "1.0.0", "1.0.0 (42)", "1.0.0+build42". On semver < policy.MinSupported
// → 426 Upgrade Required with structured body. Graceful-degrade on missing or
// malformed header (log warn, pass-through) — v1.0 не строгий; v1.1 может flip.
//
// Mounted per-service в cmd/server/main.go в outermost wrap (перед auth и log).
package clientversion
```

**Imports pattern** (Go stdlib + slog + semver — already in service main.go imports):
```go
import (
    "context"
    "encoding/json"
    "errors"
    "log/slog"
    "net/http"
    "strings"
    "unicode"

    "golang.org/x/mod/semver"  // NEW dep — `go get golang.org/x/mod`
)
```

**Constructor + Decision-struct pattern** (mirror `pkg/ratelimit/ratelimit.go` lines 33-62):
```go
// Policy — config для middleware. Заполняется в cmd/server/main.go.
type Policy struct {
    MinSupported          string   // e.g. "v1.0.0" (с "v"-префиксом для semver pkg)
    ForceUpdateURLAndroid string
    ForceUpdateURLiOS     string
    SkipPaths             []string // ["/healthz", "/metrics"]
}

// Middleware — оборачивает http.Handler. Caller pass-it-through outermost.
// На malformed/missing → log warn + pass-through (graceful, v1.0).
// На semver < MinSupported → 426 + body { error, min_version, force_update_url_* }.
func Middleware(next http.Handler, p Policy, log *slog.Logger) http.Handler { ... }
```

**Graceful-degrade pattern** (matches `pkg/ratelimit/ratelimit.go` line 71-73 "Redis-down → Allow=true"):
- Missing header → `log.Warn(...)`; pass-through.
- Malformed → same.
- Below MinSupported → write 426 (terminal).

**Test pattern** (mirror `pkg/permissions/check_test.go` shape: table-driven tests; one `_test.go` per file under test).

**Mount point in service main.go** (extend identity/cmd/server/main.go lines 75-82):
```go
// BEFORE:
srv := &http.Server{
    Addr:    addr,
    Handler: h.Routes(),
    ...
}

// AFTER (added 3 lines):
policy := clientversion.Policy{
    MinSupported:          "v1.0.0",
    ForceUpdateURLAndroid: envOr("FORCE_UPDATE_URL_ANDROID", ""),
    ForceUpdateURLiOS:     envOr("FORCE_UPDATE_URL_IOS", ""),
    SkipPaths:             []string{"/healthz", "/metrics"},
}
srv := &http.Server{
    Addr:    addr,
    Handler: clientversion.Middleware(h.Routes(), policy, logger),
    ...
}
```

---

### `services/backend/pkg/featureflags/` (service, CRUD with cache)

**Analog:** `services/backend/pkg/ratelimit/ratelimit.go` (shape + constructor + Decision struct) + `services/backend/pkg/audit/audit.go` (Postgres `querier` interface for tx/pool flexibility).

**Package header pattern** (mirror `pkg/audit/audit.go` lines 1-22):
```go
// Package featureflags — Postgres-backed boolean + percentage rollout flags.
// Phase 1 / REL-03.
//
// Source-of-truth: table `featureflags` (migration 0021_featureflags.up.sql).
// Each service holds 30-second in-memory cache + singleflight to prevent
// thundering herd on cache miss. Cross-service invalidation is best-effort
// via TTL expiry — accept 30s lag for kill-switch flags.
//
// Usage:
//   store, _ := featureflags.NewPostgresStore(pool, 30*time.Second)
//   on := store.IsEnabled(ctx, userID, "strava_oauth_enabled")
//
// Per-user rollout: FNV-1a(userID || flagName) % 100 < rollout_percent.
// Deterministic — same (user, flag) returns same bucket across services.
package featureflags
```

**Imports pattern** (mirror `pkg/audit/audit.go` lines 24-33):
```go
import (
    "context"
    "errors"
    "log/slog"
    "sync"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "golang.org/x/sync/singleflight"
)
```

**Constructor + Store struct pattern** (mirror `pkg/audit/audit.go` lines 55-68):
```go
type Store struct {
    pool  *pgxpool.Pool
    ttl   time.Duration
    cache sync.Map         // map[string]cachedFlag
    sf    singleflight.Group
    log   *slog.Logger
}

type cachedFlag struct {
    enabled     bool
    percent     int
    fetchedAt   time.Time
}

func NewPostgresStore(pool *pgxpool.Pool, ttl time.Duration) *Store {
    return &Store{pool: pool, ttl: ttl, log: slog.Default()}
}
```

**Core API pattern** (the public surface, mirror `pkg/audit/audit.go` lines 70-101 method-receiver style):
```go
// IsEnabled — main read path. ttl-cached + singleflight on miss.
// userID=0 → anonymous (skip rollout, just check global enabled).
func (s *Store) IsEnabled(ctx context.Context, userID int64, name string) bool { ... }

// Set — admin write. UPDATE featureflags + invalidate local cache.
// Best-effort audit.Log inside same handler (caller's responsibility).
func (s *Store) Set(ctx context.Context, name string, enabled bool, percent int, actorID string) error { ... }

// List — admin read for UI.
func (s *Store) List(ctx context.Context) ([]Flag, error) { ... }
```

**Postgres query pattern** (mirror `pkg/audit/audit.go` lines 93-99):
```go
_, err := s.pool.Exec(ctx, `
    UPDATE featureflags
    SET enabled_bool = $2, rollout_percent = $3, updated_at = NOW(), updated_by_user_id = $4
    WHERE flag_name = $1`,
    name, enabled, percent, actorID)
```

**Rollout function** — see RESEARCH.md §Code Examples #2 (lines 645-675). Drop in `pkg/featureflags/rollout.go` verbatim with package comment matching `pkg/gamification/xp.go` style.

---

### `services/backend/migrations/0021_featureflags.{up,down}.sql` (migration, DDL)

**Analog:** `services/backend/migrations/0020_auth_otp.up.sql` (most recent migration on disk).

**Header comment pattern** (mirror lines 1-15):
```sql
-- Phase 1 / REL-03: feature flags table.
--
-- One row per flag. `enabled_bool` is the global on/off; `rollout_percent`
-- (0-100) determines deterministic per-user assignment via FNV-1a hash of
-- (user_id, flag_name) computed in pkg/featureflags.
--
-- Single writer (admin UI via PUT /admin/featureflags/{name}); N readers
-- (every service via pkg/featureflags.IsEnabled).  30s in-memory cache per
-- service process; cross-service invalidation via TTL expiry only.
--
-- Audit: every Set() writes audit_log row via pkg/audit with capability
-- = "featureflag.toggle".  See pkg/permissions for capability registration.
```

**Table DDL pattern** (mirror `0020_auth_otp.up.sql` lines 17-25; v1.0 schema sketched in CONTEXT §Specifics):
```sql
CREATE TABLE IF NOT EXISTS featureflags (
    flag_name          TEXT PRIMARY KEY,
    enabled_bool       BOOLEAN NOT NULL DEFAULT false,
    rollout_percent    INTEGER NOT NULL DEFAULT 0
                       CHECK (rollout_percent BETWEEN 0 AND 100),
    description        TEXT,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by_user_id UUID REFERENCES users(id)
);

-- Initial v1.0 flag rows (all OFF; flipped via admin UI in later phases).
INSERT INTO featureflags (flag_name, description) VALUES
    ('strava_oauth_enabled',         'Strava OAuth read-only sync (HEALTH-04, Phase 11/12).'),
    ('mapbox_sdk_v11',               'Mapbox SDK 10→11 migration soak (Phase 13).'),
    ('release_channel_force_update', 'Emergency kill-switch for force-update UX.'),
    ('tester_debug_logging',         'Opt-in verbose logging for testers (OBS-08).'),
    ('crash_telemetry_opt_in',       'Opt-in crash telemetry collection (CRASH-04).')
ON CONFLICT (flag_name) DO NOTHING;

COMMENT ON TABLE featureflags IS 'Boolean + percentage rollout flags (Phase 1 / REL-03).';
```

**Down migration pattern** (mirror `0020_auth_otp.down.sql` — minimal, drop in reverse order):
```sql
DROP TABLE IF EXISTS featureflags;
```

**Verification before commit** (per RESEARCH.md Pitfall 1):
```bash
ls services/backend/migrations | sort | tail -3
# expect: 0019_xp_grades.{up,down}.sql / 0020_auth_otp.{up,down}.sql / 0021_featureflags.{up,down}.sql
```

---

### `services/backend/api/*.yaml` (config, docs)

**Analog:** `services/backend/api/identity.yaml` (most fleshed; covers auth pattern + Error schema + servers list).

**File header pattern** (mirror `api/identity.yaml` lines 1-13):
```yaml
openapi: 3.1.0
info:
  title: Running Ecosystem — <Service> Service
  description: |
    <RU one-liner>. Phase 1 / REL-01.
    См. [docs/RUNNING_ECOSYSTEM_TZ.md](../../docs/RUNNING_ECOSYSTEM_TZ.md) §<N>.
  version: 0.1.0
servers:
  - url: http://localhost:<port>
    description: Local dev
  - url: https://api-staging.runningecosystem.app
    description: Staging (P3+)
```

**Security pattern** (mirror `api/identity.yaml` lines 129-134 + `api/activity-sync.yaml` lines 19-20):
```yaml
security:
  - bearerAuth: []  # global default; override with `security: []` per public op

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
```

**Path operation pattern with idempotency note** (mirror `api/activity-sync.yaml` lines 9-13 + lines 32-39):
```yaml
paths:
  /healthz:
    get:
      summary: Liveness probe
      tags: [system]
      security: []
      responses:
        '200': { description: OK }

  /<resource>:
    post:
      summary: <RU описание>
      tags: [<resource>]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/<Req>' }
      responses:
        '201': { description: Created, content: { application/json: { schema: { $ref: '#/components/schemas/<Res>' } } } }
        '401': { $ref: './_shared/responses.yaml#/components/responses/Unauthorized' }
        '426': { $ref: './_shared/responses.yaml#/components/responses/UpgradeRequired' }
        '429': { $ref: './_shared/responses.yaml#/components/responses/RateLimited' }
```

**Error schema pattern** (extract from `api/identity.yaml` lines 176-186 into `_shared/schemas.yaml`):
```yaml
Error:
  type: object
  properties:
    error:
      type: string
      description: Машинно-читаемый код ошибки.
      example: email_exists
    message:
      type: string
      description: Human-readable.
```

**Per-service port mapping** (use existing service ports from main.go envOr defaults):
- identity → `:8081`
- activity-sync → `:8082`
- social-graph → `:8084`
- feed → `:8085` (check main.go)
- messaging → check main.go
- realtime-gw → check main.go
- notifications → check main.go
- media → check main.go

**`_shared/responses.yaml` (NEW — extract from existing patterns):**
```yaml
# services/backend/api/_shared/responses.yaml
components:
  responses:
    Unauthorized:
      description: Bearer-токен отсутствует / невалиден / expired
      content:
        application/json:
          schema: { $ref: './schemas.yaml#/components/schemas/Error' }
    UpgradeRequired:
      description: Client app version below min supported. See ADR-0007.
      content:
        application/json:
          schema:
            type: object
            properties:
              error: { type: string, example: client_too_old }
              min_version: { type: string, example: "1.0.0" }
              force_update_url_android: { type: string, format: uri }
              force_update_url_ios: { type: string, format: uri }
    RateLimited:
      description: Rate limit exceeded (см. pkg/ratelimit). `Retry-After` header set.
      headers:
        Retry-After: { schema: { type: integer }, description: Seconds until next allowed request. }
      content:
        application/json:
          schema: { $ref: './schemas.yaml#/components/schemas/Error' }
```

---

### `services/backend/scripts/openapi-routes-check/main.go` (utility, batch CI tool)

**Analog:** none exact — greenfield Go CLI tool. Reference for general shape:
- Use `go/ast` + `go/parser` (RESEARCH.md §Don't Hand-Roll line 428).
- AST-walk pattern: parse each `services/backend/<service>/internal/handler/*.go`, find `mux.HandleFunc("METHOD /path", ...)` CallExpr with literal first arg, collect literals into a set.
- Parse YAML side via `gopkg.in/yaml.v3`.
- Diff: routes-in-Go-not-in-YAML → error; routes-in-YAML-not-in-Go → warn (could be intentional future spec).
- Exit code 1 on mismatch.

**Convention to follow** (from CONVENTIONS.md): `services/backend/scripts/` is for tooling; existing siblings are Python smoke tests. This is the first Go script — place at `services/backend/scripts/openapi-routes-check/main.go` (with own go.mod or join workspace).

**Sketch:**
```go
// openapi-routes-check — CI tool. Parses each service's handler/*.go and
// diffs registered routes against services/backend/api/<service>.yaml.
// Exits 1 on drift.
//
// Usage:
//   go run ./services/backend/scripts/openapi-routes-check
//
// Limitations: AST-only; non-literal mux.HandleFunc calls are invisible.
// Enforce literal-only convention via golangci-lint forbidigo rule.
package main
```

---

### `services/backend/gateway/admin/index.html` (component extension, vanilla HTML+JS)

**Analog:** self — extend with new `<section>` mirroring existing "Reports queue" (lines 109-119) and "Audit log" (lines 121-125).

**Tab/section pattern** (existing lines 109-119):
```html
<section>
  <h2>Reports queue</h2>
  <div class="tabs">
    <button data-status="open" class="tab active">Open</button>
    ...
  </div>
  <div id="reports-area"></div>
</section>
```

**New section to add (after Audit log section, before `</main>`):**
```html
<section>
  <h2>Feature flags (v1.0)</h2>
  <button id="refresh-flags">↻ Обновить</button>
  <div id="flags-area" style="margin-top:12px"></div>
</section>
```

**Loader function pattern** (mirror existing `loadReports()` at lines 204-265 + `loadAudit()` at lines 267-306). Use the existing `api("GET", "/admin/featureflags")` and `api("PUT", "/admin/featureflags/" + name, { enabled, percent })` helpers.

**Toggle UI**: each flag row → table with `flag_name`, `description`, `enabled` (checkbox), `rollout_percent` (number input 0-100), `updated_at`, "Save" button. On save → `PUT` then reload + reload audit log.

**Auth/permission pattern**: same as reports section — `loadFlags()` catches 403, displays "нужна global_role admin". The endpoint enforces via existing `pkg/permissions` + `audit.Log` (capability = `featureflag.toggle`).

---

### Backend service handlers — `*/internal/handler/featureflags.go` (controller, CRUD)

**Analog:** `services/backend/social-graph/internal/handler/moderation.go` (admin-gated handlers with audit).

**File header pattern** (mirror moderation.go line 1):
```go
// Feature flag HTTP handlers — Phase 1 / REL-03.
package handler
```

**DTO + handler pattern** (mirror moderation.go lines 14-58 + lines 108-122):
```go
type flagDTO struct {
    Name           string `json:"name"`
    Enabled        bool   `json:"enabled"`
    RolloutPercent int    `json:"rolloutPercent"`
    Description    string `json:"description"`
    UpdatedAt      int64  `json:"updatedAt"`
}

func (h *Handler) listFlags(w http.ResponseWriter, r *http.Request) {
    actorID := userIDFromContext(r.Context())  // empty string for anonymous
    ctx, cancel := context.WithTimeout(r.Context(), requestTimeout)
    defer cancel()
    flags, err := h.flags.List(ctx)
    if err != nil {
        writeServiceError(w, err)
        return
    }
    // Per-user rollout decision applied here on read path.
    out := make([]flagResolvedDTO, 0, len(flags))
    for _, f := range flags {
        out = append(out, flagResolvedDTO{
            Name:    f.Name,
            Enabled: h.flags.IsEnabled(ctx, actorIDToInt64(actorID), f.Name),
        })
    }
    writeJSON(w, http.StatusOK, out)
}

func (h *Handler) adminPutFlag(w http.ResponseWriter, r *http.Request) {
    actorID := userIDFromContext(r.Context())
    name := r.PathValue("flag_name")
    var req struct {
        Enabled bool `json:"enabled"`
        Percent int  `json:"percent"`
    }
    if err := readJSON(r, &req); err != nil { ... }
    // Permission check via pkg/permissions:
    decision := permissions.Check(subject, permissions.CapFeatureFlagToggle, ctx)
    if !decision.Allow { writeError(w, http.StatusForbidden, "forbidden", decision.Reason); return }
    if err := h.flags.Set(ctx, name, req.Enabled, req.Percent, actorID); err != nil { ... }
    // Audit write (mirror moderation pattern):
    h.audit.LogQuiet(ctx, audit.Entry{
        ActorID:    &actorID,
        Capability: permissions.CapFeatureFlagToggle,
        Action:     "toggle_feature_flag",
        TargetKind: "feature_flag",
        TargetID:   name,
        Metadata:   map[string]any{"enabled": req.Enabled, "percent": req.Percent},
    })
    writeJSON(w, http.StatusOK, ...)
}
```

**Route registration** (mirror `social-graph/internal/handler/http.go` lines 84-88):
```go
mux.HandleFunc("GET /featureflags",                       h.requireAuth(h.listFlags))   // or no requireAuth for anon
mux.HandleFunc("GET /admin/featureflags",                 h.requireAuth(h.adminListFlags))
mux.HandleFunc("PUT /admin/featureflags/{flag_name}",     h.requireAuth(h.adminPutFlag))
```

**Capability to register** in `pkg/permissions/capability.go`:
```go
const CapFeatureFlagToggle Capability = "featureflag.toggle"
```
And add to `pkg/permissions/check.go` global moderation override case (lines 124-132) so admin/moderator can call it.

---

### `apps/mobile-rn/src/util/version.ts` (utility, pure)

**Analog:** `apps/mobile-rn/src/util/geo.ts` (pure module, no platform deps shape).

**Module header pattern** (mirror CONVENTIONS.md §Comments + project style):
```typescript
// Чтение версии нативного бинарника через expo-application.
// EAS OTA НЕ обновляет nativeApplicationVersion — это binary-version,
// корректная семантика для compat negotiation (см. ADR-0007).
//
// Phase 1 / REL-02.
```

**Implementation** — copy verbatim from RESEARCH.md §Code Examples #3 (lines 679-697). Single named export `getClientVersionHeader()` returning `${semver} (${build})`. Module-level eval avoids per-request bridge crossings.

**No-default-export rule** (CONVENTIONS.md §Module Design): use `export const` / `export function`, no `export default`.

---

### `apps/mobile-rn/src/state/featureflags.ts` (store, MMKV-persisted Zustand)

**Analog:** `apps/mobile-rn/src/state/settings.ts` (the canonical persist+MMKV pattern).

**Imports pattern** (mirror `settings.ts` lines 1-4):
```typescript
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';

import { DEFAULT_FLAGS } from './featureflags.defaults';
import { fetchFeatureFlags } from './featureflagsApi';
```

**Store type pattern** (mirror `settings.ts` lines 23-60):
```typescript
type FeatureFlagsStore = {
  flags: Record<string, boolean>;          // resolved booleans (server > default)
  lastFetchedAt: number | null;            // ms epoch
  loading: boolean;
  error: string | null;

  /** Idempotent: triggers fetch only if lastFetchedAt > TTL ago. */
  refresh: () => Promise<void>;
  /** Read a single flag (defaults to bundled default → false). */
  isEnabled: (name: string) => boolean;
  /** Drop server-overrides; revert to bundled defaults. Called from logout. */
  clearAll: () => void;
};

const TTL_MS = 5 * 60 * 1000;  // 5 min per D-13
```

**MMKV adapter pattern** (copy verbatim from `settings.ts` lines 79-92):
```typescript
const mmkv = createMMKV();
const mmkvStorage = {
  getItem: (name: string): string | null => {
    const value = mmkv.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string): void => { mmkv.set(name, value); },
  removeItem: (name: string): void => { mmkv.remove(name); },
};
```

**create+persist pattern** (mirror `settings.ts` lines 94-171):
```typescript
export const useFeatureFlagsStore = create<FeatureFlagsStore>()(
  persist(
    (set, get) => ({
      flags: { ...DEFAULT_FLAGS },
      lastFetchedAt: null,
      loading: false,
      error: null,

      refresh: async () => {
        const { lastFetchedAt, loading } = get();
        if (loading) return;
        if (lastFetchedAt !== null && Date.now() - lastFetchedAt < TTL_MS) return;
        set({ loading: true, error: null });
        try {
          const server = await fetchFeatureFlags();
          if (server === null) {
            // Network error: keep cached/defaults; do NOT clear.
            set({ loading: false });
            return;
          }
          set({
            flags: { ...DEFAULT_FLAGS, ...server },
            lastFetchedAt: Date.now(),
            loading: false,
          });
        } catch (e) {
          set({ loading: false, error: 'Не удалось обновить feature flags' });
          console.warn('[featureflags] refresh failed', e);
        }
      },

      isEnabled: (name) => {
        const value = get().flags[name];
        return value ?? DEFAULT_FLAGS[name] ?? false;
      },

      clearAll: () => set({
        flags: { ...DEFAULT_FLAGS },
        lastFetchedAt: null,
        error: null,
      }),
    }),
    {
      name: 'running-ecosystem-featureflags',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
    },
  ),
);
```

**Mandatory `clearAll` + dynamic-import wiring in auth logout** (per CONVENTIONS.md §State Management lines 258-265 + auth.ts lines 217-251):
- Add to `apps/mobile-rn/src/state/auth.ts` logout (after wallet clearAll):
```typescript
try {
  const { useFeatureFlagsStore } = await import('./featureflags');
  useFeatureFlagsStore.getState().clearAll();
} catch (e) {
  console.warn('[auth] featureflags clearAll failed', e);
}
```

---

### `apps/mobile-rn/src/state/featureflags.defaults.ts` (utility, constants)

**Analog:** `src/state/settings.ts` lines 62-77 (DEFAULT_ATHLETE / DEFAULT_GOALS constants block).

**Pattern:**
```typescript
// Phase 1 / REL-03: v1.0 bundled feature flag defaults.
// All flags default OFF — server overrides enable them per CONTEXT D-16.
// Updated when adding a new flag to migration 0021_featureflags.up.sql.

export const DEFAULT_FLAGS: Readonly<Record<string, boolean>> = Object.freeze({
  strava_oauth_enabled:         false,  // Phase 11/12 HEALTH-04
  mapbox_sdk_v11:               false,  // Phase 13 migration
  release_channel_force_update: false,  // Emergency kill-switch
  tester_debug_logging:         false,  // OBS-08 opt-in
  crash_telemetry_opt_in:       false,  // CRASH-04 opt-in
});
```

---

### `apps/mobile-rn/src/state/featureflagsApi.ts` (service, HTTP wrapper)

**Analog:** `apps/mobile-rn/src/modules/gamification/sync/xpApi.ts` (smallest exact match — single `fetch*` function with graceful null on error).

**Imports + module header pattern** (mirror `xpApi.ts` lines 1-12):
```typescript
// Feature flags fetch — wrap GET /featureflags. Phase 1 / REL-03.
//
// Returns server response or null on error. Caller (useFeatureFlagsStore.refresh)
// keeps cached values when this returns null (offline-first per CLAUDE.md).

import { apiClient } from '../auth/apiClient';

type ServerFlagDTO = {
  name: string;
  enabled: boolean;
};

export async function fetchFeatureFlags(): Promise<Record<string, boolean> | null> {
  try {
    const resp = await apiClient.api('/featureflags');
    if (!resp.ok) {
      console.warn('[featureflags] fetch non-ok', resp.status);
      return null;
    }
    const data = (await resp.json()) as ServerFlagDTO[];
    const out: Record<string, boolean> = {};
    for (const f of data) out[f.name] = f.enabled;
    return out;
  } catch (e) {
    console.warn('[featureflags] fetch failed', e);
    return null;
  }
}
```

**Logging pattern** — `console.warn('[featureflags] message', e)` matches CONVENTIONS.md §Logging (square-bracketed lowercase scope tag).

---

### `apps/mobile-rn/src/state/forceUpdate.ts` (store, in-memory Zustand)

**Analog:** `src/state/auth.ts` lines 50-54 (in-memory Zustand without persist).

**Pattern:**
```typescript
// Force-update banner state. Phase 1 / REL-02.
//
// Triggered by apiClient.ts on 426 response. Top-level App.tsx watches
// `required` and conditionally renders ForceUpdateScreen instead of
// RootNavigator. Not persisted — server re-issues 426 on every request
// after binary install update.

import { create } from 'zustand';

type ForceUpdateStore = {
  required: boolean;
  minVersion: string;
  forceUpdateUrl: string;
  set: (next: { required: boolean; minVersion: string; forceUpdateUrl: string }) => void;
  reset: () => void;
};

export const useForceUpdateStore = create<ForceUpdateStore>((set) => ({
  required: false,
  minVersion: '',
  forceUpdateUrl: '',
  set: (next) => set(next),
  reset: () => set({ required: false, minVersion: '', forceUpdateUrl: '' }),
}));
```

---

### `apps/mobile-rn/src/auth/apiClient.ts` (MODIFIED — request-response wrapper)

**Analog:** self — extend existing `doFetch` at lines 109-118.

**Existing code to extend** (lines 109-118):
```typescript
private async doFetch(base: string, path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers);
  if (this.accessToken) {
    headers.set('Authorization', `Bearer ${this.accessToken}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${base}${path}`, { ...init, headers });
}
```

**Modification pattern** — per RESEARCH.md §Code Examples #4 (lines 699-747):
1. Add import `import { getClientVersionHeader } from '../util/version';` at top.
2. Add import `import { useForceUpdateStore } from '../state/forceUpdate';` at top.
3. Inside `doFetch`, after the Content-Type set, add:
   ```typescript
   headers.set('X-Client-Version', getClientVersionHeader());
   ```
4. After the `await fetch(...)`, before returning, intercept 426:
   ```typescript
   const resp = await fetch(`${base}${path}`, { ...init, headers });
   if (resp.status === 426) {
     try {
       const body = await resp.clone().json() as {
         min_version?: string;
         force_update_url_android?: string;
         force_update_url_ios?: string;
       };
       const { Platform } = require('react-native');
       const url = Platform.OS === 'ios'
         ? (body.force_update_url_ios ?? '')
         : (body.force_update_url_android ?? '');
       useForceUpdateStore.getState().set({
         required: true,
         minVersion: body.min_version ?? '',
         forceUpdateUrl: url,
       });
     } catch (e) {
       useForceUpdateStore.getState().set({
         required: true, minVersion: '', forceUpdateUrl: '',
       });
       console.warn('[apiClient] 426 body unparseable', e);
     }
   }
   return resp;
   ```

**Why before 401 retry**: 426 must not trigger a refresh loop. Add the 426 check inside `doFetch` (lowest level), so it fires for both initial and retried-after-refresh requests.

---

### `apps/mobile-rn/src/ui/screens/ForceUpdateScreen.tsx` (component, blocking modal)

**Analog:** `apps/mobile-rn/src/ui/HistoryModal.tsx` (Modal-based screen with RN primitives; matches CONVENTIONS.md §Naming PascalCase.tsx).

**Imports pattern** (mirror HistoryModal.tsx lines 4-13):
```typescript
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useForceUpdateStore } from '../../state/forceUpdate';
```

**Component shape** (RN Modal that cannot be dismissed; only "Update" button opens store URL):
```typescript
export function ForceUpdateScreen() {
  const { required, minVersion, forceUpdateUrl } = useForceUpdateStore();
  if (!required) return null;

  const onUpdate = () => {
    if (forceUpdateUrl) Linking.openURL(forceUpdateUrl);
  };

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <View style={styles.container}>
        <Text style={styles.title}>Требуется обновление</Text>
        <Text style={styles.body}>
          Версия приложения устарела. Минимальная поддерживаемая: {minVersion || 'N/A'}.
        </Text>
        <Pressable style={styles.button} onPress={onUpdate}>
          <Text style={styles.buttonText}>Обновить сейчас</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
```

**Style palette** — match dark theme used across App.tsx error boundary (lines 53-65):
- background `#0A0A0A`
- error accent `#FF4D2E`
- text `#FFFFFF`
- Use `useTheme()` from `src/design` if cleaner — but App.tsx's ErrorBoundary uses inline styles, so inline is precedent.

**Russian-language UI strings** per CONVENTIONS.md §Comments: "Domain-specific (currency, antifraud, UX-facing strings) tends to be Russian".

---

### `apps/mobile-rn/App.tsx` (MODIFIED — top-level conditional render)

**Analog:** self — extend existing top-level conditional render at lines 75-86.

**Existing code** (lines 71-92):
```typescript
export default function App() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <StatusBar style="light" />
            {mapboxInitError ? <Text>⚠ Mapbox: {mapboxInitError}</Text> : null}
            <RootNavigator />
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
```

**Modification:**
1. Import: `import { ForceUpdateScreen } from './src/ui/screens/ForceUpdateScreen';` and `import { useForceUpdateStore } from './src/state/forceUpdate';`.
2. Add inside `App` (just outside `<RootNavigator />`, sibling): `<ForceUpdateScreen />`. The component itself short-circuits to `null` when `required=false`.

This matches the existing conditional-overlay precedent (the Mapbox warning Text element).

---

### `apps/mobile-rn/package.json` (MODIFIED)

**Analog:** self — existing dependencies block, alphabetical.

**Modification:**
- Run `npx expo install expo-application` from `apps/mobile-rn/`.
- Verify final addition: `"expo-application": "~7.0.8"` in `dependencies`.

**Verification command** (per RESEARCH.md Pitfall 2):
```bash
grep expo-application apps/mobile-rn/package.json
# expect: "expo-application": "~7.0.8"
```

---

### `docs/v1.0-SCOPE.md` (NEW docs, IN/OUT freeze)

**Analog:** `docs/DECISIONS/0001-framework-react-native.md` for RU-header + sectioned-body style.

**Header pattern** (from CONTEXT §Specifics, mirrors STATUS.md / DECISION.md):
```markdown
# Running Ecosystem — v1.0 Scope

**Версия:** v1.0 Production Readiness
**Дата заморозки:** 2026-05-15
**Парные документы:** `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, ADR-0007

## IN scope (closed beta capabilities)

| Capability | REQ-ID + Phase | Notes |
|------------|----------------|-------|
| Territory Core | (baseline + Phase 16 validation) | Map + record + session detail |
| ... | ... | ... |

## OUT of scope (deferred to v1.1+)

| Capability | Deferred to | Reason |
|------------|-------------|--------|
| HealthKit / Health Connect bidirectional sync | v1.1 | Closed beta runs Strava read-only |
| ... | ... | ... |
```

Mirror IN/OUT bullets from CONTEXT D-18 + D-19 verbatim into table rows.

---

### `docs/DECISIONS/0007-v1.0-release-contract.md` (NEW ADR)

**Analog:** `docs/DECISIONS/0001-framework-react-native.md` (canonical ADR shape).

**Required sections** (mirror ADR-0001 structure):
1. **Header**: Дата / Статус / Контекст / Решение (one-liner) — RU.
2. **Контекст** — link to phase 1 in DEVELOPMENT_PLAN.md / REQUIREMENTS.md.
3. **Решение** — three sub-decisions per D-20:
   - API contract format = OpenAPI 3.1.0 hand-written, no codegen.
   - Version negotiation via `X-Client-Version` header + 426 upgrade flow.
   - Feature flags = Postgres single-table + 30s in-mem cache + FNV-1a rollout + bundled defaults + 5min mobile TTL.
4. **Альтернативы** — list rejected options (URL versioning, OpenAPI codegen, LaunchDarkly, etc.) from RESEARCH.md §Alternatives Considered.
5. **Обоснование** — why each pick.
6. **Последствия** — what changes in code/process.
7. **SCP-throughout cross-cut** — per D-21, brief reference to Phase 3 (Ansible) + Phase 18 (SCP-over-SSH).
8. **Сценарии пересмотра** — when to revisit (v1.1+ trigger conditions).
9. **Ссылки** — link to OpenAPI specs, `docs/v1.0-SCOPE.md`, REQUIREMENTS.md.

**Language convention** (per ADR-0001): RU headers + section titles; technical body may mix RU/EN.

---

## Shared Patterns

### Authentication / Authorization (admin gating)

**Source:** `services/backend/pkg/permissions/` + `services/backend/pkg/audit/`
**Apply to:** All `/admin/featureflags` handlers; all admin-section UI

**Capability registration pattern** (extend `pkg/permissions/capability.go`):
```go
const CapFeatureFlagToggle Capability = "featureflag.toggle"
```

**Override gate** (extend `pkg/permissions/check.go` lines 124-132):
```go
if IsModerator(subject.GlobalRole) {
    switch cap {
    case ...,
        CapFeatureFlagToggle:
        return allow()
    }
}
```

**Audit write pattern** (mirror `pkg/audit/audit.go` lines 12-19 usage example):
```go
h.audit.LogQuiet(ctx, audit.Entry{
    ActorID:    &actorID,
    Capability: permissions.CapFeatureFlagToggle,
    Action:     "toggle_feature_flag",
    TargetKind: "feature_flag",
    TargetID:   flagName,
    Metadata:   map[string]any{"enabled": enabled, "percent": percent},
})
```

### Error Handling

**Source:** `services/backend/pkg/ratelimit/ratelimit.go` (graceful-degrade pattern) + `apps/mobile-rn/src/auth/apiClient.ts` (HTTP error semantics)

**Backend pattern** (mirror ratelimit.go line 71-73 "graceful allow on Redis down"):
- `pkg/clientversion`: missing/malformed header → log warn + pass-through.
- `pkg/featureflags`: Postgres-down on `IsEnabled` → return `false` (fail-closed) + log warn; do NOT throw.

**Mobile pattern** (mirror CONVENTIONS.md §Error Handling lines 113-152 + apiClient.ts lines 142-148):
- All store actions: `try / catch` → `set({ error: '...' })` + `console.warn('[scope]', e)`.
- Never throw out of Zustand action.
- HTTP wrappers (featureflagsApi.ts): return `null` on error; caller decides recovery.

### Validation / Input parsing

**Source:** `services/backend/social-graph/internal/handler/moderation.go` lines 67-71 (readJSON + writeError pattern).

**Apply to:** All new handler files.
```go
if err := readJSON(r, &req); err != nil {
    writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
    return
}
```

### Logging (scope tags)

**Source:** CONVENTIONS.md §Logging + apiClient.ts line 143.

**Apply to:** All new files.
- Backend Go: `slog.Default()` JSON handler (already initialized in each `cmd/server/main.go` lines 39-40).
- Mobile TS: `console.warn('[<scope>] <message>', err)` where `<scope>` ∈ `[apiClient]`, `[featureflags]`, `[forceUpdate]`, `[clientversion]` (mobile-side parser).

### Multi-tenant `user_id` discipline

**Source:** CLAUDE.md §Multi-tenant + STRUCTURE.md "Multi-tenant: add `user_id TEXT` column".

**Apply to:** `featureflags` table — uses `updated_by_user_id` (FK to users). Rollout decisions are computed per-`user_id` server-side; mobile receives resolved booleans per-user.

### Russian-language docs convention

**Source:** CLAUDE.md + CONVENTIONS.md §Comments lines 186-189 ("Russian for user-facing strings; English (or Russian) for technical").

**Apply to:** All new doc files (`v1.0-SCOPE.md`, ADR-0007, OpenAPI summaries). Technical config (YAML keys, code identifiers) stays English.

### Adapter / SDK quarantine (no direct platform imports)

**Source:** CLAUDE.md "Не импортировать Mapbox SDK напрямую" + CONVENTIONS.md §Adapters.

**Apply to:** `src/state/featureflags.ts` — must NOT import `expo-application` directly. The version-detection logic lives in `src/util/version.ts`, which the apiClient (not featureflags store) consumes. Featureflags is platform-agnostic.

---

## No Analog Found (greenfield)

These files have no close codebase match and must be built from scratch using RESEARCH.md guidance:

| File | Role | Data Flow | Why no analog |
|------|------|-----------|---------------|
| `services/backend/pkg/featureflags/cache.go` | utility (in-mem cache + singleflight) | transform | No existing in-process cache + singleflight pattern in the repo. Use `sync.Map` + `golang.org/x/sync/singleflight` per RESEARCH.md §Don't Hand-Roll. |
| `services/backend/scripts/openapi-routes-check/main.go` | CI tool | batch | No Go CLI tool exists under `scripts/` (sibling files are Python smokes). Use `go/ast` + `go/parser` + `gopkg.in/yaml.v3`. |
| `services/backend/api/redocly.yaml` | config (lint) | tooling | Greenfield. Use `@redocly/cli` defaults with selective rule overrides. |

---

## Pattern-Extraction Quality Indicators

- **Concrete excerpts:** Every backend Go pattern cites file + line range. Every mobile TS pattern cites file + line range. All excerpts ≤ 30 lines per spec.
- **Best analog selected:**
  - `pkg/ratelimit/ratelimit.go` (constructor + Decision struct shape) chosen as analog for `pkg/clientversion` over `pkg/audit` (which is closer to `pkg/featureflags`).
  - `pkg/audit/audit.go` (querier interface + LogQuiet pattern + same package layout) chosen as analog for `pkg/featureflags` Store API surface.
  - `social-graph/internal/handler/moderation.go` chosen as admin-handler analog (it already wires `pkg/audit` + `pkg/permissions` + `pkg/ratelimit`).
  - `src/state/settings.ts` chosen over `src/state/auth.ts` for featureflags store because settings has the full persist+MMKV+versioning pattern.
- **No re-reads:** Files read once, extracted excerpts cover all needed sections (imports, core pattern, error handling, audit) in single pass.

## Metadata

**Analog search scope:** `services/backend/pkg/`, `services/backend/<service>/internal/handler/`, `services/backend/<service>/cmd/server/`, `services/backend/migrations/`, `services/backend/api/`, `services/backend/gateway/admin/`, `apps/mobile-rn/src/state/`, `apps/mobile-rn/src/auth/`, `apps/mobile-rn/src/modules/<feature>/sync/`, `apps/mobile-rn/src/ui/`, `docs/DECISIONS/`.

**Files scanned (Read):** 18 distinct files; 0 re-reads.

**Pattern extraction date:** 2026-05-15
