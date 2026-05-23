# Coding Conventions

**Analysis Date:** 2026-05-23

This codebase is a two-language monorepo (Expo RN TypeScript mobile + Go backend monorepo) for a solo-dev closed-beta. Conventions differ by language; this file documents both side by side and flags cross-cutting rules (commit format, naming, pre-commit hooks).

## Naming Patterns

**Files (TypeScript / mobile, `apps/mobile-rn/src/`):**
- Domain classes / value objects → `PascalCase.ts`: `AreaCalculator.ts`, `ClosureDetector.ts`, `SessionManager.ts`, `LocationAdapter.ts`
- Modules / barrel files / utilities / state stores → `camelCase.ts` or short lowercase: `activity.ts`, `auth.ts`, `pointRepository.ts`, `geo.ts`, `format.ts`, `index.ts`
- React components / screens / hooks → `PascalCase.tsx`: `Toast.tsx`, `App.tsx`, `RegionPickerOverlay.tsx`, `ScreenErrorBoundary.tsx`
- Tests → `<UnitName>.test.ts` / `<UnitName>.test.tsx`, snapshot variant `<Name>.snapshot.test.tsx`. All live in `src/__tests__/`.
- Lint-failure fixtures → `src/__fixtures__/` (excluded from default ESLint run, exercised with `--no-ignore`).

**Files (Go / backend, `services/backend/`):**
- Source → `snake_case.go`: `debug_session_middleware.go`, `pii_deny_list.go`, `slog_handler.go`, `otel_init.go`
- Tests → `<file>_test.go` co-located: `auth_test.go`, `jwt_test.go`
- Generated / `.gen.go` / `_gen.go` are excluded from a subset of linters (see `.golangci.yml:57`).

**Files (shell smokes, `.planning/phases/*/evidence/`):**
- `smoke-<area>.sh` kebab-case: `smoke-roundtrip.sh` (umbrella), `smoke-keystore-generated.sh`, `smoke-sops-roundtrip.sh`, `smoke-sha256-captured.sh`, `smoke-ios-cert-roundtrip.sh`, `smoke-ios-provprofile.sh`, `smoke-asc-api-key.sh`.

**Functions / methods:**
- TS — `camelCase`: `calculateArea`, `appendPoints`, `setMapboxAccessToken`, `getClientVersionHeader`. React hooks → `useFoo` prefix (`useToast`, `useActivityStore`, `useTheme`).
- Go — exported `PascalCase` / unexported `camelCase`: `NewSigner`, `IssueAccess`, `VerifyAccess`, `normalizeEmail`, `validatePassword`. Constructors are always `NewXxx`.

**Variables:**
- TS — `camelCase`, constants are `SCREAMING_SNAKE_CASE` at module scope: `FLUSH_THRESHOLD`, `AREA_RECOMPUTE_INTERVAL_MS` (see `apps/mobile-rn/src/domain/session/SessionManager.ts:24-25`), `MAPBOX_TOKEN`, `DB_NAME`, `TARGET_VERSION`.
- Go — exported `PascalCase`, unexported `camelCase`: `D17MetricNames`, `Issuer`, `bcryptC`.
- Env vars — `SCREAMING_SNAKE_CASE`: `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN`, `JWT_SECRET`, `SOPS_AGE_KEY_FILE`, `POSTGRES_PASSWORD`, `VPS_HOST`, `DB_URL`.

**Types / interfaces:**
- TS — `PascalCase` for types, interfaces, classes. Type-only imports are explicit: `import type { Foo } from './bar'` (see `apps/mobile-rn/src/state/activity.ts:21-56`).
- Interface names are descriptive (`SessionRepo`, `LocationAdapter`, `MapAdapter`, `FeatureFlagChecker`) — no `I`-prefix.
- Discriminated string-literal unions for state: `'idle' | 'recording' | 'stopped'` (`SessionManager.ts:29`), `'active' | 'paused' | 'background-slc'` (`LocationAdapter.ts:13`).

**Errors:**
- Go sentinel errors → `ErrXxx` exported vars in domain package: `ErrUserNotFound`, `ErrEmailAlreadyExists`, `ErrInvalidCredentials` (see `services/backend/identity/internal/domain/user.go:38-43`).

**Test names:**
- TS — Jest `describe` is the unit name (class / function), `it`-strings are usually Russian and behavior-oriented: `'пропускает точку с accuracy ≤ порога'`, `'квадрат 200×200м (≈40 000 м²) — tolerance 5%'`.
- Go — `TestSubject_Behavior` underscored: `TestNewSigner_RejectsShortSecret`, `TestDebugSessionMiddleware_AllThreeTrue`, `TestRegister_DuplicateEmail`.

## Code Style

**Formatting (mobile, `apps/mobile-rn/`):**
- Prettier `^3.8.3` configured at `apps/mobile-rn/.prettierrc.json`:
  - `semi: true`
  - `singleQuote: true`
  - `trailingComma: 'all'`
  - `printWidth: 90`
  - `tabWidth: 2`
  - `arrowParens: 'always'`
- `npm run format` → `prettier --write "src/**/*.{ts,tsx}" "App.tsx"`.
- TypeScript: `apps/mobile-rn/tsconfig.json` extends `expo/tsconfig.base` with `strict: true`.

**Formatting (backend):**
- `gofmt` + `goimports` are run as formatters via `.golangci.yml:76-79` (no `gofumpt` is wired in this repo despite project-context mention — only the two standard formatters).
- Tab indent (default Go style); editor settings in `.editorconfig:14` force `indent_size = 4` only as a soft hint.

**Editor (cross-cutting, `.editorconfig`):**
- `charset = utf-8`, `end_of_line = lf`, `insert_final_newline = true`, `trim_trailing_whitespace = true`.
- Default `indent_style = space`, `indent_size = 2`.
- `[*.{py,go}]` → `indent_size = 4`. `[Makefile]` → `indent_style = tab`.

**Linting (mobile):**
- ESLint v9 flat-config at `apps/mobile-rn/eslint.config.js`. Migrated from `.eslintrc.json` in PHASE1-13.
- Extends `eslint-config-expo/flat`.
- Project-specific rules:
  - `no-restricted-imports` blocks `@rnmapbox/maps` outside `src/map/**` and `src/__tests__/**` (enforces `MapAdapter` quarantine per ТЗ §3 принцип 10).
  - `no-restricted-syntax` blocks `process.env.EXPO_PUBLIC_*_SECRET` member access and any string literal matching `/^sk\.[A-Za-z0-9._-]{40,}/` (Mapbox secret-token shape). `{40,}` quantifier prevents false-positives on UI strings like `'sk-button'`.
- Ignore patterns: `dist/`, `node_modules/`, `android/`, `ios/`, `coverage/`, `.expo/`, `src/__fixtures__/`.
- `npm run lint` from `apps/mobile-rn/` runs `eslint .`.

**Linting (backend):**
- `.golangci.yml` (v2) at repo root. Conservative-first config: explicit-enable, 15 low-false-positive linters.
- Enabled linters: `govet`, `ineffassign`, `unused`, `errcheck`, `staticcheck`, `bodyclose`, `errorlint`, `rowserrcheck`, `sqlclosecheck`, `contextcheck`, `copyloopvar`, `nilerr`, `misspell`.
- Deferred to v1.0.1 (commented with rationale): `gocyclo`, `dupl`, `revive`, `gocritic`, `paralleltest`, `testifylint`.
- Test files (`_test\.go`) relax `errcheck`, `dupl`, `gocyclo`, `bodyclose`, `govet`.
- Every disabled linter / rule MUST carry an inline `# Disabled — <rationale>; revisit v1.0.1` annotation per `.golangci.yml:5-6`.
- CI runs per-module (services/backend has `go.work` workspace, no root `go.mod`) — see `.github/workflows/backend-ci.yml:69-89`.

**Pre-commit hooks (`.pre-commit-config.yaml`):**
- `gitleaks v8.30.1` (pinned, no `latest` per ROADMAP hard rule) — staged-files-only scan.
- Full-repo `gitleaks` + `trufflehog` run in CI (`.github/workflows/secret-scan-full.yml` + `backend-ci.yml:165-184`).
- Mobile ESLint token-secret guard (`no-restricted-syntax` rules in `eslint.config.js:47-60`) provides defense-in-depth at the lint layer.

## Import Organization

**TypeScript (mobile):**
Order observed in `apps/mobile-rn/src/state/activity.ts:21-56`:
1. External: `'react-native'`, `'zustand'`, third-party packages — blank line after.
2. Relative `../` (sibling-tree modules grouped by directory): `'../domain/...'`, `'../location'`, `'../pipeline'`, `'../storage/...'`.
3. Relative `./` (same-directory): `'./auth'`, `'./settings'`, `'./wallet'`.
- Type-only imports use `import type { Foo }` syntax (mandated by `strict: true`).
- Barrel files (`src/map/index.ts`, `src/pipeline/index.ts`) re-export the public surface; external consumers MUST import from barrels, never deep paths (see `src/map/index.ts:1-3` — direct `@rnmapbox/maps` import forbidden by ESLint rule).

**Path aliases:** None — relative paths only.

**Go:**
Order is standard `goimports`-enforced (validates via formatter in `.golangci.yml:79`):
1. Stdlib (`"context"`, `"net/http"`, `"testing"`).
2. Blank line.
3. Third-party (`"github.com/jackc/pgx/v5/pgxpool"`, `"golang.org/x/crypto/bcrypt"`).
4. Blank line.
5. Internal (`"github.com/runningecosystem/backend/..."`).

Example: `services/backend/identity/internal/service/auth.go:5-20`.

## Error Handling

**Go — sentinel errors + `errors.Is` / `errors.As` + `%w` wrapping:**
- Domain layer exports sentinel `errors.New(...)` values (`services/backend/identity/internal/domain/user.go:38-43`).
- Service layer wraps with context via `fmt.Errorf("op: %w", err)` (`services/backend/identity/internal/service/auth.go:63,75`).
- HTTP handler maps sentinels to status codes via `errors.Is` switch (`services/backend/identity/internal/handler/http.go:322-332`):
  ```go
  case errors.Is(err, domain.ErrEmailAlreadyExists):
      // → 409
  case errors.Is(err, domain.ErrInvalidCredentials):
      // → 401
  ```
- Linter enforces correct patterns: `errorlint` blocks `err == ErrXxx` direct comparison; `nilerr` blocks `return nil` after handling an error.
- **No `Result<T, E>` ADT** despite the project-context description — Go uses idiomatic multi-return `(value, error)` everywhere. The "Result-style" framing only refers to the discipline of always pairing sentinel errors with `errors.Is` mapping in handlers.

**TypeScript — `throw` + `ErrorBoundary`:**
- Throw `new Error(message)` from leaf functions for fail-fast cases (e.g. `apps/mobile-rn/src/auth/authProviders.ts:69,76,119`; `src/sensors/adapters/BleSensorAdapter.ts:37-53`).
- Root-level `ErrorBoundary` class component in `apps/mobile-rn/App.tsx:48-74`: catches via `getDerivedStateFromError` + `componentDidCatch`, renders Russian-language fallback UI (`Приложение упало`).
- `ScreenErrorBoundary` (`apps/mobile-rn/src/design/components/ScreenErrorBoundary.tsx`) — generic boundary for wrapping critical screens with custom fallback titles. Always logs to `console.error('[ScreenErrorBoundary]', error, info.componentStack)`.
- Filters in the GPS pipeline return `Point | null` to signal "drop" without exceptions (`AccuracyFilter`, `JumpFilter`, etc. in `src/pipeline/filters/`) — this is the closest analog to a `Result` type in the mobile codebase.

## Logging

**Mobile:**
- No structured logger — `console.error` / `console.warn` only. Tagged with bracket prefixes: `console.error('[App ErrorBoundary]', error, info.componentStack)` (`App.tsx:56`), `console.error('[ScreenErrorBoundary]', ...)` (`ScreenErrorBoundary.tsx:31`).

**Backend:**
- `log/slog` JSON handler from `services/backend/pkg/observability/slog_handler.go`. Configurable `Level` with per-request override via `WithLogLevel(ctx, slog.LevelDebug)` (driven by `DebugSessionMiddleware`'s D-22 three-gate rule — `slog_handler.go:71-83`).
- PII deny-list scrubbing at emit time (`pkg/observability/pii_deny_list.go`).
- CI-side PII audit grep in `.github/workflows/backend-ci.yml:234-243` (`scripts/pii_audit.sh`) — blocks PR merge if `slog.*Context` calls reference deny-listed attribute keys.
- Sentry SDK initialized via `MustInitSentry` (`pkg/observability/sentry_init.go`), wired in each service `cmd/server/main.go`.

## Comments

**When to comment (observed practice):**
- Module-header doc-comment on every TS file >50 LOC and every Go file. Explains scope, references (`ТЗ §X.Y`, ADR-NNNN, plan ID, decision ID like `D-22`), and architecture invariants.
  - Example: `apps/mobile-rn/src/location/LocationAdapter.ts:1-12` cross-references ТЗ §3 принцип 3 and §4.4.
  - Example: `services/backend/pkg/observability/debug_session_middleware.go:1-30` cross-references Plan 05-06, OBS-08, D-22, D-23, and RESEARCH §1.8.
- Inline rationale comments are heavy in CI configs and pre-commit configs — every disabled linter/rule explains "why" and "when to revisit" (`.golangci.yml:36-42`, `.golangci.yml:60-74`).
- TODO / FIXME comments are rare; pending work is tracked in `STATE.md` + `.planning/phases/` plan docs and `v1.0.1` backlog ADRs, not in code.

**JSDoc / TSDoc:**
- Use `/** */` for public exports (functions, types) that have non-obvious contracts. Common pattern: bullet-list of behavior + parameter semantics. Example: `apps/mobile-rn/src/location/LocationAdapter.ts:5-12,20-22` (Russian text).

**Russian-language sections:**
- ADR section headings, `it`-test descriptions, and most inline rationale comments are in Russian. Doc comments and public-API JSDoc are mixed RU+EN. Identifiers / function names are always English.

## Function Design

**Size:** Mostly short (<50 LOC). The `state/activity.ts` zustand store was refactored from a 466-line "god-store" into a thin wrapper around `SessionManager` (Phase A / D-09; see comment at `src/state/activity.ts:1-19`).

**Parameters:**
- Go services take `ctx context.Context` as first arg always: `func (s *AuthService) Register(ctx context.Context, email, password, displayName, userAgent string)`.
- TS functions accept positional args for ≤3 params, options-object for more. Domain helpers often use `Partial<X> & { ... }` for test/helper constructors (see `makePoint` in `src/__tests__/pipeline.test.ts:9-20`).

**Return values:**
- Go: idiomatic `(value, error)` or `(value1, value2, error)` tuples.
- TS pipeline filters: `Point | null` to signal drop.
- TS domain: result objects with explicit shape — e.g. `calculateArea` returns `{ areaM2: number | null, method: CalcMethod, warnings: AreaWarning[] }` (`src/domain/AreaCalculator.ts` + see `AreaCalculator.test.ts:30-44`).

## Module Design

**Exports (TS):**
- Named exports only. No default exports outside `App.tsx` (which Expo requires).
- Barrel `index.ts` per public boundary (`src/map/index.ts`, `src/pipeline/index.ts`, `src/location/index.ts`).
- Adapter interfaces live in their own files: `LocationAdapter.ts` (interface), `adapters/ExpoLocationAdapter.ts` (impl). Same pattern for map.

**Exports (Go):**
- `package <name>` matches dir name. Internal packages live under `internal/` (e.g. `identity/internal/service`, `identity/internal/handler`, `identity/internal/repository/memory`).
- Each microservice is its own `go.mod` under `services/backend/<svc>/`; shared library under `services/backend/pkg/`. Workspace tied together via `services/backend/go.work`.

**Adapter pattern (cross-cutting, ТЗ §3):**
- `MapAdapter` quarantine — `@rnmapbox/maps` may be imported only inside `apps/mobile-rn/src/map/adapters/` and `src/map/` boundary files. Enforced by ESLint rule.
- `LocationAdapter` interface (`apps/mobile-rn/src/location/LocationAdapter.ts`) with `ExpoLocationAdapter` impl (`apps/mobile-rn/src/location/adapters/ExpoLocationAdapter.ts`).
- `MockHealthAdapter` (`apps/mobile-rn/src/health/MockHealthAdapter.ts`), `BleSensorAdapter` (`apps/mobile-rn/src/sensors/adapters/BleSensorAdapter.ts`), `expoSpeechAdapter` (`apps/mobile-rn/src/util/expoSpeechAdapter.ts`).

**Repository pattern (storage):**
- Mobile: `apps/mobile-rn/src/storage/` — one file per aggregate (`sessionRepository.ts`, `pointRepository.ts`, `lapRepository.ts`, `recordsRepository.ts`, `sensorRepository.ts`, `socialRepository.ts`, `walletRepository.ts`, `relationsRepository.ts`).
- `database.ts` owns the singleton `expo-sqlite` connection + schema migrations (`TARGET_VERSION = 19` at `src/storage/database.ts:4`).
- Backend: per-service `internal/repository/<impl>/` — `memory/` for tests (`services/backend/identity/internal/repository/memory/memory.go`), `postgres/` for production (`services/backend/identity/internal/repository/postgres/`). Interfaces declared in `internal/repository/repository.go`.

**Three-gate `DebugSessionMiddleware` (backend, Phase 5 / D-22):**
- `services/backend/pkg/observability/debug_session_middleware.go` elevates per-request slog to `LevelDebug` only when ALL THREE gates pass:
  1. `X-Debug-Session: 1` HTTP header.
  2. Bearer JWT valid AND `claims.IsTester == true`.
  3. featureflag `tester_debug_logging` ON for that userID.
- Any gate fail → silent passthrough (no slog emission to avoid debug-DoS amplification per RESEARCH §1.8).
- Chain placement: OUTERMOST observability layer per-service `main.go` (D-32).

## Commit Message Conventions

Observed format from `git log` (50 most recent commits):

```
<type>(<scope>): <subject in english or russian>

<optional multi-paragraph body — explains why, references commit SHAs,
plan IDs (e.g. SIGN-01, BUILD-01), decisions (D-22), ADRs (ADR-0012),
research sections (RESEARCH §1.8). Body is usually English; subjects
are predominantly English.>
```

**Type prefixes (observed frequencies):**
- `feat(<scope>):` — new feature. Scopes seen: `06-01`, `07-01`, `05-04`, `05-05`, `05-06`, `scope-reset`, `phase-07`. Subjects often end with a plan-task ID in parens: `(SIGN-01)`, `(BUILD-01)`.
- `fix(<scope>):` — bug fix. Scopes: `security`, `07-01`, `05-04`.
- `chore(<scope>):` — non-functional: `chore(06-01): Wave 0 — evidence/ scaffolding ...`, `chore(security): rotate ...`, `chore(07-01): Wave 0 Part A — ...`.
- `docs(<scope>):` — docs/ADR/state changes: `docs(security): ADR-0012 amendment — ...`, `docs(phase-07): plan-check verdict — PASS-WITH-NITS`, `docs(state): record phase 7 context session`.

**Subject style:**
- Imperative mood ("add", "rotate", "extend", "mask", "wire").
- Em-dash (`—`, U+2014) frequently separates clauses: `"chore(security): re-rotate keystore password — self-inflicted chat-dump leak"`.
- Reference codes appended in parens: `(SIGN-01)`, `(BUILD-01)`, `(D-22)`.

**Body style:**
- Wrapped to ~72 cols.
- Backticks for code references (`` `xxd | tail -3` ``), commit SHAs in shortform (`commit 21b992c`), file paths, env-var names.
- Cross-references ADRs by number (`ADR-0006`, `ADR-0012`), plans (`Plan 06-02 Task 4`), and decision codes (`D-22`).
- Russian and English freely mixed in bodies and inline comments; subjects are predominantly English.

**Footer:**
- `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` is the standard footer for Claude-assisted commits (per `CLAUDE.md` GSD execution flow).
- `Refs:` footer used occasionally to link external trackers — rare in the observed window.

**Never:**
- Never use the `-i` flag with `git rebase` / `git add` (per `CLAUDE.md` working rules — interactive flows blocked).
- Never include secret values (passwords, tokens, fingerprints) in commit messages — see ADR-0012 amendment for the `xxd`-leak post-mortem.

---

*Convention analysis: 2026-05-23*
