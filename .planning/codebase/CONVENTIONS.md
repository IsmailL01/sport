# Coding Conventions

**Analysis Date:** 2026-05-18

Project is a polyglot monorepo split between two surfaces with distinct
toolchains:

- **Mobile client (TypeScript / React Native)** — `apps/mobile-rn/`
- **Backend monorepo (Go 1.25, multi-module workspace)** — `services/backend/`

Each side has its own linter, formatter, and convention set. This document
describes the conventions actually observed in the codebase plus
project-mandated rules that lint cannot enforce.

## Language Split

| Language | Where | Toolchain |
|----------|-------|-----------|
| TypeScript 5.9 (strict) | `apps/mobile-rn/src/**/*.{ts,tsx}` | ESLint v9 flat-config + Prettier 3 |
| Go 1.25 | `services/backend/*/` (9 modules) | golangci-lint v2 + gofmt + goimports |
| SQL (migrations) | `services/backend/migrations/*.sql` | golang-migrate paired up/down |
| YAML / Makefile / Dockerfile | repo-wide | `.editorconfig` |

**Russian narrative + English code/CLI/identifiers**: All identifiers,
package names, type names, function names, file names, CLI flags, and
log keys are English. All long-form comments (doc blocks, decision
rationale, TODO/HACK explanations) are Russian. Inline short comments
inside expressions are typically English. This is consistent
project-wide and is NOT to be "translated" by future contributors.

Examples of mixed style:

```go
// services/backend/identity/internal/service/auth.go:46-51
// Register создаёт пользователя и сразу выпускает пару токенов.
// Email нормализуется (lowercase, trim) и валидируется.
// Password проверяется на минимальную длину 8 символов (без сложных правил
// для прототипа — добавим в Phase 4 настройки безопасности).
//
// Идемпотентность: повторная регистрация с тем же email вернёт ErrEmailAlreadyExists.
func (s *AuthService) Register(ctx context.Context, email, password, displayName, userAgent string) (*domain.User, *TokenPair, error) {
```

```ts
// apps/mobile-rn/src/domain/AreaCalculator.ts:22-28
/**
 * Посчитать площадь замкнутого трека.
 * Поведение: ТЗ §6.7 — самопересечения отмечаются warning'ом, но shoelace
 * всё равно вычисляется (со знаком). Фолбэк на coverage / convex hull —
 * Phase 2 (ТЗ §6.6 Подход C).
 */
export function calculateArea(points: readonly RawPoint[], options: { toleranceM?: number } = {}): AreaResult {
```

## Naming Patterns

### TypeScript

**Files:**
- Classes / single-export modules: `PascalCase.ts` — e.g. `AreaCalculator.ts`,
  `Pipeline.ts`, `SessionManager.ts`, `ExpoLocationAdapter.ts`, `KalmanFilter.ts`
- Lowercase utility / multi-export modules: `camelCase.ts` — e.g. `gpx.ts`,
  `metrics.ts`, `calories.ts`, `splits.ts`, `streak.ts`
- React components / screens: `PascalCase.tsx` — e.g. `Toast.tsx`,
  `TodayCard.tsx`, `RunDetailsScreen.tsx`, `MapboxView.tsx`
- Hooks: `camelCase.ts(x)` starting with `use` — e.g. `useTrackerCamera.ts`,
  `useClosureFeedback.ts`, `usePauseUI.ts`, `useLayerVisibility.ts`
- Tests: `<SourceName>.test.ts(x)` co-located in `src/__tests__/` (not next
  to source) — e.g. `AreaCalculator.test.ts`, `pipeline.test.ts`,
  `RunDetailsScreen.snapshot.test.tsx`

**Identifiers:**
- Types / interfaces / classes: `PascalCase` — `RawPoint`, `Session`,
  `LocationAdapter`, `SamplingMode`, `AreaResult`, `Filter`, `Pipeline`
- Functions / methods / variables: `camelCase` — `calculateArea`,
  `serializeToGpx`, `setSamplingMode`, `isClosed`, `totalDistance`
- Constants: `SCREAMING_SNAKE_CASE` for module-level tunables —
  `DEFAULT_TOLERANCE_M`, `FLUSH_THRESHOLD`, `AREA_RECOMPUTE_INTERVAL_MS`,
  `TASK_NAME`, `MAPBOX_TOKEN`
- Type aliases for string-enums use single-quoted union literals — e.g.
  `type SamplingMode = 'active' | 'paused' | 'background-slc'`
- Jest mock variables MUST start with `mock` (Jest hoist guard requirement):
  `mockStartLocationUpdates`, `mockHasStarted`, `mockGoBack`, `mockNavReplace`

**File locations encode layer boundaries:**
- `src/domain/` — pure types + value-object logic, no platform deps
- `src/pipeline/` — GPS filter chain
- `src/map/` — Mapbox SDK quarantine (ESLint enforces; see below)
- `src/location/` — `LocationAdapter` interface + `adapters/` implementations
- `src/storage/`, `src/state/`, `src/ui/`, `src/util/`, `src/sensors/`,
  `src/realtime/`, `src/health/`, `src/sync/`, `src/auth/`,
  `src/notifications/`, `src/media/`, `src/modules/`, `src/navigation/`,
  `src/design/`

### Go

**Files:**
- Snake_case is NOT used — Go-idiomatic short package-name + descriptive file
- Test files: `<name>_test.go` paired with `<name>.go` (e.g. `jwt_test.go`,
  `parse_test.go`, `middleware_test.go`, `http_test.go`)
- Repository pattern: one Postgres impl per entity — `user.go`,
  `refresh_token.go`, `otp.go` inside `internal/repository/postgres/`
- Subcommand-style binaries live at `cmd/server/main.go` per service

**Packages:**
- Lowercase single-word, no `_` / camelCase — `domain`, `handler`, `service`,
  `repository`, `memory`, `postgres`, `auth`, `audit`, `featureflags`,
  `clientversion`, `permissions`, `gamification`, `ratelimit`
- Test-helper package `memory` is purpose-built (`identity/internal/repository/memory/`)
- Internal-only packages live under `<service>/internal/` — public API is
  `<service>/cmd/server/`

**Identifiers:**
- Exported: `PascalCase` — `Signer`, `Claims`, `IssueAccess`, `VerifyRefresh`,
  `NewAuthService`, `TokenPair`, `Issuer`, `Rollout`, `Store`, `Policy`
- Unexported: `camelCase` — `normalizeEmail`, `validatePassword`, `cloneUser`,
  `statusRecorder`, `loggingMiddleware`, `writeJSON`, `writeError`,
  `writeServiceError`
- Errors: `ErrXxx` sentinel pattern compared via `errors.Is` —
  `ErrUserNotFound`, `ErrEmailAlreadyExists`, `ErrInvalidCredentials`,
  `ErrTokenRevoked`, `ErrTokenExpired`, `ErrTokenNotFound`, `ErrEmpty`,
  `ErrInvalidSemver`, `ErrInvalidBuild`
- Test functions: `Test<Subject>_<Scenario>` — e.g.
  `TestRegister_HappyPath`, `TestRegister_DuplicateEmail`,
  `TestRegister_RejectsInvalidEmail`, `TestVerify_RejectsExpired`,
  `TestRollout_ZeroPercent_AlwaysFalse`, `TestCache_HitWithinTTL`,
  `TestIsEnabled_PostgresDown_FailsClosed`

## Code Style

### TypeScript — Prettier + ESLint

**Formatter:** Prettier 3.8 — config at `apps/mobile-rn/.prettierrc.json`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 90,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always"
}
```

**Linter:** ESLint v9 flat-config at `apps/mobile-rn/eslint.config.js`,
extending `eslint-config-expo/flat`. Custom rules of note:

1. **MapAdapter quarantine** (`no-restricted-imports`):
   ```js
   '@rnmapbox/maps' — blocked outside src/map/** and src/__tests__/**
   ```
   Triggered by importing Mapbox SDK from any other layer. Message:
   "Импорт Mapbox SDK разрешён только из src/map/. См. ТЗ §3 принцип 10."

2. **Secret guards** (`no-restricted-syntax` — two selectors):
   - `process.env.EXPO_PUBLIC_*_SECRET` member-expression — error
   - `Literal` matching `/^sk\.[A-Za-z0-9._-]{40,}/` (Mapbox sk-token shape)
   See `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` for the
   intentional fixture used to verify the rule fires. The `{40,}` quantifier
   keeps UI strings like `'sk-button'` from false-positiving.

**TypeScript config** (`apps/mobile-rn/tsconfig.json`):
- Extends `expo/tsconfig.base`
- `"strict": true` (full strict mode — `strictNullChecks`,
  `noImplicitAny`, all on)
- No path aliases — relative imports `../domain/types` are the project norm

**Run commands** (`apps/mobile-rn/package.json` scripts):
- `npm run lint` → `eslint .`
- `npm run format` → `prettier --write "src/**/*.{ts,tsx}" "App.tsx"`
- `npm run typecheck` → `tsc --noEmit`

### Go — golangci-lint v2 + gofmt

**Formatter:** `gofmt` + `goimports` — enforced via `formatters.enable`
in `.golangci.yml`.

**Linter:** golangci-lint v2.5.0 — config at repo root `.golangci.yml`,
`version: "2"`, `default: none` (explicit-enable only). 13 enabled linters:

| Linter | Category | Why |
|--------|----------|-----|
| `govet` | correctness | stdlib `go vet` |
| `ineffassign` | correctness | unused assignments |
| `unused` | correctness | unused vars/funcs/types |
| `errcheck` | correctness | unchecked errors |
| `staticcheck` | correctness | comprehensive (bundles gosimple+stylecheck) |
| `bodyclose` | bug prevention | `http.Response.Body` unclosed |
| `errorlint` | bug prevention | wrong `errors.Is/As` patterns |
| `rowserrcheck` | bug prevention | `sql.Rows.Err()` unchecked |
| `sqlclosecheck` | bug prevention | `sql.Rows/Stmt` unclosed |
| `contextcheck` | bug prevention | context propagation |
| `copyloopvar` | bug prevention | Go 1.22+ loop-var capture |
| `nilerr` | bug prevention | nil error after handling |
| `misspell` | style | typos in comments/strings |

**Project-wide rule (file header of `.golangci.yml:5-6`):** Never silently
disable linters to make CI green — every disabled linter/rule MUST carry
an inline `# Disabled — <rationale>; revisit v1.0.1` annotation. The
`exclusions.rules` block in `.golangci.yml:50-74` follows this:

- Test files (`_test.go`) relax `errcheck, dupl, gocyclo, bodyclose, govet`
- Generated files (`*.gen.go`, `*_gen.go`) relax `govet, gocyclo, errcheck`
- `defer nc.Drain()` (NATS) — `errcheck` exemption with rationale
- `defer tx.Rollback(ctx)` (pgx) — `errcheck` exemption with rationale
- `realtime-gw/internal/gw/*.go` — `contextcheck` exemption for
  long-lived WebSocket goroutines

**Deferred linters** (commented in `.golangci.yml:36-42`, planned for
v1.0.1): `gocyclo`, `dupl`, `revive`, `gocritic`, `paralleltest`,
`testifylint`.

**Run commands:**
- `cd services/backend && make test` — per-module sequential
- `cd services/backend && make test-coverage` — emits `coverage-*.out`
- CI runs `golangci-lint run --timeout=5m --config=$PWD/.golangci.yml`
  per-module (see `.github/workflows/backend-ci.yml:69-89`)

### Whitespace and line endings (`.editorconfig`)

- UTF-8, LF, final newline, trim trailing whitespace
- 2 spaces default; 4 spaces for `*.{py,go}`; tabs for `Makefile`
- 2 spaces for `*.{yml,yaml}`, `*.dart`, `*.{swift,m,h,mm}` (note: Swift
  override is 4 spaces in the actual file — `.editorconfig:30`)
- Markdown preserves trailing whitespace (for hard-break compatibility)

## Import Organization

### TypeScript

Imports are written in the order observed in `App.tsx` and across `src/`:

1. **Polyfills** (side-effect import, no name) — e.g.
   `import 'react-native-get-random-values';`
2. **Stdlib / language built-ins** — none commonly needed
3. **Third-party packages** — `expo-*`, `@react-navigation/*`,
   `react-native-*`, `@rnmapbox/maps` (only in `src/map/`)
4. **Local imports**, relative — never absolute aliases:
   - `./src/map`, `./src/util/speech` from `App.tsx`
   - `../domain/types`, `../pipeline/Pipeline`, `../util/geo` within `src/`

**Type-only imports** use `import type { ... } from '...'`:

```ts
// apps/mobile-rn/src/domain/AreaCalculator.ts:4
import type { RawPoint } from './types';

// apps/mobile-rn/src/domain/session/SessionManager.ts:18-19
import type { ActivityType, Point, RawPoint, Session } from '../types';
import type { LocationAdapter } from '../../location/LocationAdapter';
```

**No path aliases** are configured. The project uses relative paths.
This is consistent.

### Go

Imports use `goimports`-grouped style: stdlib, blank line, third-party,
blank line, local — as seen in
`services/backend/identity/internal/service/auth.go:5-20`:

```go
import (
    "context"
    "crypto/sha256"
    "encoding/hex"
    "errors"
    "fmt"
    "net/mail"
    "strings"
    "time"

    "golang.org/x/crypto/bcrypt"

    "github.com/runningecosystem/backend/identity/internal/domain"
    "github.com/runningecosystem/backend/identity/internal/repository"
    "github.com/runningecosystem/backend/pkg/auth"
)
```

Module paths follow `github.com/runningecosystem/backend/<service>/<...>`
and `github.com/runningecosystem/backend/pkg/<...>` — declared in each
service's `go.mod` and stitched via `services/backend/go.work`.

## Error Handling

### Go

**Sentinel errors in `domain` package:**

```go
// services/backend/identity/internal/domain/user.go:36-44
var (
    ErrUserNotFound       = errors.New("user not found")
    ErrEmailAlreadyExists = errors.New("email already exists")
    ErrInvalidCredentials = errors.New("invalid credentials")
    ErrTokenNotFound      = errors.New("refresh token not found")
    ErrTokenRevoked       = errors.New("refresh token revoked")
    ErrTokenExpired       = errors.New("refresh token expired")
)
```

**Service layer wraps with `fmt.Errorf("...: %w", err)`:**

```go
// services/backend/identity/internal/service/auth.go:63
hash, err := bcrypt.GenerateFromPassword([]byte(password), s.bcryptC)
if err != nil {
    return nil, nil, fmt.Errorf("hash password: %w", err)
}
```

**Service layer translates lower-layer errors to domain errors:**

```go
// services/backend/identity/internal/service/auth.go:87-92
if errors.Is(err, domain.ErrUserNotFound) {
    // Не различаем "пользователь не найден" и "пароль неверен" —
    // защита от user enumeration.
    return nil, nil, domain.ErrInvalidCredentials
}
```

**HTTP handler maps domain errors to status + JSON body via central switch:**

```go
// services/backend/identity/internal/handler/http.go:320-338
func writeServiceError(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, domain.ErrEmailAlreadyExists):
        writeError(w, http.StatusConflict, "email_exists", "...")
    case errors.Is(err, domain.ErrInvalidCredentials):
        writeError(w, http.StatusUnauthorized, "invalid_credentials", "...")
    // ... etc
    default:
        // Скрываем internal errors от клиента, но логируем (см. middleware).
        writeError(w, http.StatusInternalServerError, "internal_error", "internal server error")
    }
}
```

**JSON error envelope:** `{"error": "<code>", "message": "<text>"}` —
emitted by `writeError` (`services/backend/identity/internal/handler/http.go:313-318`).

**Test assertions on errors:**

```go
// services/backend/identity/internal/service/auth_test.go:49-51
if !errors.Is(err, domain.ErrEmailAlreadyExists) {
    t.Errorf("expected ErrEmailAlreadyExists, got %v", err)
}
```

### TypeScript

**Domain-layer functions return result objects, not throws** — see
`AreaCalculator.calculateArea`:

```ts
// apps/mobile-rn/src/domain/AreaCalculator.ts:28-48
export function calculateArea(points: readonly RawPoint[], options): AreaResult {
  if (points.length < 3) {
    return { areaM2: null, method: null, warnings: ['too-few-points'] };
  }
  // ...
  return {
    areaM2: area,
    method: intersects ? 'shoelace_with_warning' : 'shoelace_simple',
    warnings: intersects ? ['self-intersection'] : [],
  };
}
```

**Pipeline filters use `null` to signal drop**, not exceptions:

```ts
// apps/mobile-rn/src/pipeline/Pipeline.ts:35-46
process(raw: RawPoint): Point | null {
  let point: Point = { ...raw, source: 'raw' };
  for (const filter of this.filters) {
    const result = filter.apply(point);
    if (result === null) {
      this.hooks.onDrop?.({ filterName: filter.name, point });
      return null;
    }
    point = result;
  }
  return point;
}
```

**Top-level UI errors caught by `ErrorBoundary`** in `App.tsx:48-74` —
shows a Russian fatal screen with `error.name`+`error.message` and
logs full stack via `console.error('[App ErrorBoundary]', ...)`.

**`async` operations:** Errors propagate as rejected promises; UI code
uses `try/catch` per call site. There is no global rejection handler
besides ErrorBoundary.

## Logging

### Go

**Framework:** stdlib `log/slog` everywhere — no third-party logger.
`*slog.Logger` is dependency-injected into every handler/service that
needs structured logging.

**Pattern:** `slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: ...})`
in `main.go`; tests use `io.Discard` to silence.

**Structured key/value:**

```go
// services/backend/identity/internal/handler/http.go:266-280
func loggingMiddleware(log *slog.Logger) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            rw := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
            next.ServeHTTP(rw, r)
            log.InfoContext(r.Context(), "http",
                "method", r.Method,
                "path", r.URL.Path,
                "status", rw.status,
                "duration_ms", time.Since(start).Milliseconds(),
            )
        })
    }
}
```

**Always `InfoContext` / `WarnContext` / `ErrorContext`** when a
`context.Context` is in scope — propagates traceability.

### TypeScript

**Framework:** `console.*` only. No Sentry / Bugsnag wired in yet.

**Pattern:** Bracketed-tag prefix for the module: `'[App ErrorBoundary]'`,
`'[Pipeline]'`, etc. — see `App.tsx:56`.

## Comments

### Doc-block conventions

**TypeScript** — JSDoc-style `/** ... */` above types and exported
functions. Russian narrative inside. Each `type` field carries its own
`/** ... */`:

```ts
// apps/mobile-rn/src/domain/types.ts:5-22
/**
 * Сырая точка — то что отдаёт сенсор гео-позиции до прохождения pipeline.
 * Источник: GPS-чип телефона, в Phase 5+ — также часы (через BLE).
 */
export type RawPoint = {
  /** Unix epoch milliseconds. */
  timestamp: number;
  latitude: number;
  longitude: number;
  /** Метры над эллипсоидом WGS84, null если устройство не предоставило. */
  altitude: number | null;
  // ...
};
```

**Go** — Standard Go doc-comment style: comment starts with the symbol
name, lives directly above. Russian rationale within.

```go
// services/backend/identity/internal/service/auth.go:1-3
// Package service содержит бизнес-логику identity-сервиса.
// Не зависит от HTTP — handler адаптирует HTTP-запросы к этим методам.
package service
```

```go
// services/backend/identity/internal/domain/user.go:10-12
// User — зарегистрированный пользователь системы.
// Соответствует ТЗ §4.2 (минимальный набор Phase 2). В Phase 4
// добавляется отдельная сущность Athlete с физическими параметрами.
type User struct {
```

### Inline-comment idioms

**Reference back to source-of-truth documents.** Every non-trivial
decision is tagged with an anchor for traceability:

- `ТЗ §<section>` — references `docs/RUNNING_ECOSYSTEM_TZ.md`
  (e.g. `ТЗ §3 принцип 10`, `ТЗ §4.3`, `ТЗ §6.6`, `ТЗ §6.7`)
- `Phase <N> / <TASK-ID>` — references `docs/DEVELOPMENT_PLAN.md`
  (e.g. `Phase 1 / PHASE1-11`, `Phase 1 / REL-03`, `Phase 2 / SEC-08`)
- `D-<N>` — references a decision from the phase's CONTEXT / DECISIONS
  (e.g. `D-08`, `D-13`, `D-20`, `D-27`)
- `RESEARCH.md §<...>` / `Pitfall <N>` — references phase research notes
- `revisit v1.0.1` — sunsetting hint for tactical exceptions

These are not optional decoration — they let any reader trace why
a deviation, exemption, or constraint exists.

### TODOs

Treated as commit-able only with a follow-up issue or ADR pending.
Inline TODOs in active code are rare (none observed in `domain/`,
`pipeline/`, `service/`, `handler/`); future contributors should
prefer ADRs in `docs/DECISIONS/` per `CLAUDE.md`.

## Function Design

### Sizes

Observed function sizes:
- Domain functions: typically 15-40 lines, single concern (e.g.
  `calculateArea` is 19 lines; `Pipeline.process` is 11 lines)
- Service methods: 20-50 lines (e.g. `AuthService.Register` is ~30 lines)
- HTTP handlers: 20-60 lines, all delegate to service layer

No hard rule encoded in lint (`gocyclo` is deferred). Practice: extract
helpers when a function grows past ~50 lines.

### Parameters

**Go:**
- `context.Context` is always the first parameter on any function that
  does I/O or could be cancelled. See `AuthService.Register(ctx, email, ...)`,
  `AuthService.Login(ctx, ...)`, `Store.IsEnabled(ctx, ...)`.
- 5+ params is acceptable for service constructors and operations; no
  builder pattern in use.

**TypeScript:**
- Long parameter lists use a single options object with a TypeScript type:
  `calculateArea(points, options: { toleranceM?: number } = {})`.
- Adapters / classes are constructor-injected, not factory-functioned:
  `new Pipeline(filters, hooks)`, `new AccuracyFilter(threshold)`.

### Return values

**Go:** Multi-return `(value, error)` is the universal pattern.
For paired returns, use named return when meaning is non-obvious
(rare in this codebase — observed in `clientversion.Parse` test
helper at `parse_test.go:32`).

**TypeScript:** Result objects (`{ areaM2, method, warnings }`) are
preferred over throws for domain logic. Pipeline filters return
`Point | null` to encode drop.

## Module Design

### Exports

**TypeScript:**
- Named exports only — no `export default` for new code (App.tsx uses
  default because RN entry requires it)
- Re-export barrels exist at layer roots: `src/design/index.ts`,
  `src/pipeline/index.ts`, `src/sensors/index.ts`, `src/location/index.ts`,
  `src/health/index.ts`, `src/realtime/index.ts`, `src/map/index.ts`,
  `src/notifications/index.ts`, `src/media/index.ts`,
  `src/modules/gamification/index.ts`

**Go:**
- Capitalize-to-export. Test-only helpers are unexported and live in the
  same `_test.go` file or in a sibling `*/memory/` package.
- Internal packages live under `<service>/internal/` — Go enforces no
  cross-service imports.

### Barrel files

Barrels are SHALLOW re-exports (single file → handful of named
re-exports). Do NOT use barrels for type-only modules; import
`type { ... }` directly from the source module to keep
TypeScript tree-shaking obvious.

## Architectural Conventions (Lint Cannot Enforce These — Reviewers Must)

These rules come from `CLAUDE.md` and `docs/RUNNING_ECOSYSTEM_TZ.md`
and override default behaviour:

1. **Domain-driven** — `src/domain/` must not import from `src/storage/`,
   `src/ui/`, `src/state/`, `src/map/`, `src/location/`. The reverse is
   allowed.

2. **Sensor-agnostic** — GPS is one source of many. All sensor access
   goes through `LocationAdapter` interface
   (`apps/mobile-rn/src/location/LocationAdapter.ts`). Never import
   `expo-location` outside `src/location/adapters/`.

3. **MapAdapter quarantine** — Never import `@rnmapbox/maps` outside
   `src/map/**`. Enforced by ESLint (`no-restricted-imports` rule);
   PR reviewers must also check that domain code does not pass Mapbox
   types around.

4. **Area calculation requires local projection** — never compute
   shoelace area on raw lat/lon. Use `util/geo.localProjection` →
   `shoelaceArea` (`apps/mobile-rn/src/domain/AreaCalculator.ts:39-41`).

5. **Track rendering** — `LineLayer + GeoJsonSource` only, never
   `PolylineAnnotation` / `AnnotationManager` (ТЗ §10.5).

6. **Multi-tenant from day 1** — every DB table has a `user_id` column.
   See `services/backend/migrations/0001_users.up.sql` onward; new tables
   must follow.

7. **No secrets via `EXPO_PUBLIC_*_SECRET`** — public envvars ship in
   the bundle. Enforced by ESLint `no-restricted-syntax`.

8. **No `:latest` Docker tags anywhere** — enforced by
   `no-latest-tag-guard` CI job in `.github/workflows/backend-ci.yml:218-232`.

9. **Pinned dependency versions** — pre-commit hooks (gitleaks v8.30.1
   in `.pre-commit-config.yaml`), action versions
   (`actions/checkout@v4`, `actions/setup-go@v5`), tool downloads
   (`golangci-lint v2.5.0`).

## Commit hygiene

- **`gitleaks` pre-commit hook** blocks commits containing detected
  secrets. Pinned to `v8.30.1` in `.pre-commit-config.yaml:9`.
- **`--no-verify` is NOT permitted** — bypassing hooks loses the secret-scan
  signal. If a hook fails legitimately, fix the underlying cause; do not
  skip.
- **Commit-style:** Russian narrative for body, English for subject is
  common but not strictly enforced. Recent log shows Russian-prefixed
  bodies (`docs(03): add validation strategy (Nyquist gate)`).
- **Phase tagging in commit subjects** uses `docs(<phase>):`,
  `feat(<phase>-<task>):`, etc. (e.g. `docs(03): ...`,
  `docs(02): Phase 2 closeout — ...`).

## Migration Conventions

- **Format:** `golang-migrate` paired `<NNNN>_<name>.up.sql` /
  `<NNNN>_<name>.down.sql` in `services/backend/migrations/`
- **Numbering:** Production migrations use `0000`-`002x+`; drill/disaster
  recovery migrations use `9990+` to remain collision-safe with
  Phase 7 production migrations starting at `0022+`.
- Run via `make migrate` (up) / `make migrate-down` (1 step).

## Configuration

- **`.env` files** are listed in `.gitignore`. The only committed envvar
  reference is `.env.example` (`apps/mobile-rn/.env.example`) which
  enumerates required keys without values.
- **Secrets at runtime** flow via `.secrets/` (SOPS-encrypted, see
  `.sops.yaml`) and never via `EXPO_PUBLIC_*` in mobile.
- **Mapbox token** is the one `EXPO_PUBLIC_*` allowed in mobile —
  a publishable token only. Set via `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`.

---

*Convention analysis: 2026-05-18*
