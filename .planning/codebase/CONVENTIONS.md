# Coding Conventions

**Analysis Date:** 2026-05-25

Conventions span two main code surfaces:
- **Mobile (Expo React Native + TypeScript):** `apps/mobile-rn/`
- **Backend (Go monorepo):** `services/backend/`

Both share the same commit conventions, secret-handling discipline, and Russian-language documentation/UI strings.

## Naming Patterns

### Files

**TypeScript modules (mobile):**
- `camelCase.ts` for plain modules — e.g., `apps/mobile-rn/src/update/manifestCheck.ts`, `apps/mobile-rn/src/update/semverLite.ts`, `apps/mobile-rn/src/util/version.ts`, `apps/mobile-rn/src/util/timeFormat.ts`, `apps/mobile-rn/src/design/avatarInitials.ts`
- `PascalCase.ts` for class-shaped abstractions / adapters — e.g., `apps/mobile-rn/src/location/LocationAdapter.ts`, `apps/mobile-rn/src/pipeline/Pipeline.ts`, `apps/mobile-rn/src/pipeline/filters/KalmanFilter.ts`, `apps/mobile-rn/src/pipeline/filters/PauseDetector.ts`, `apps/mobile-rn/src/domain/session/SessionManager.ts`
- `PascalCase.tsx` for components and screens — e.g., `apps/mobile-rn/src/update/UpdateBanner.tsx`, `apps/mobile-rn/src/vendor/AutostartDialog.tsx`, `apps/mobile-rn/src/design/components/Skeleton.tsx`
- `use*.ts` for React hooks — e.g., `apps/mobile-rn/src/update/useUpdateCheckOnForeground.ts`, `apps/mobile-rn/src/navigation/screens/record/hooks/useTrackerCamera.ts`
- `*.defaults.ts` for default-only constant modules — e.g., `apps/mobile-rn/src/state/featureflags.defaults.ts`
- `*Api.ts` for API-shaped sibling modules — e.g., `apps/mobile-rn/src/state/featureflagsApi.ts`

**Test fixtures:**
- `__tests__/<source>.test.ts(x)` co-located beside source — e.g., `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts`, `apps/mobile-rn/src/util/__tests__/timeFormat.test.ts`, `apps/mobile-rn/src/design/__tests__/avatarInitials.test.ts`, `apps/mobile-rn/src/pipeline/filters/__tests__/PauseDetector.warmup.test.ts`, `apps/mobile-rn/src/domain/session/__tests__/SessionManager.timeFreezing.test.ts`
- `__mocks__/<module>.ts` at package root for Jest auto-mocks — e.g., `apps/mobile-rn/__mocks__/expo-sqlite.ts`
- `__fixtures__/*.ts` for intentional-lint-failure fixtures — e.g., `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts`
- Smoke shell scripts: `smoke-<area>.sh` in `evidence/` — e.g., `.planning/phases/08-closed-beta-distribution/evidence/smoke-manifest-sign-roundtrip.sh`

**Go (backend):**
- `lower_snake_case.go` aligned with package name — e.g., `services/backend/identity/internal/service/auth.go`
- Tests in same package: `*_test.go` — e.g., `services/backend/identity/internal/service/auth_test.go`
- Standard layout: `cmd/<binary>/main.go`, `internal/<layer>/*.go`, `pkg/<shared>/*.go`

### Functions

**TypeScript:** `camelCase` verbs — `checkForUpdate`, `parseManifest`, `canonicalJsonWithoutSignature`, `verifyManifestSignature`, `getInstalledVersion`, `formatChatTime`, `initialsForName`, `colorForName`, `hashName`, `effectiveElapsedMs`. React components are `PascalCase`. Test helpers inside test files are also `camelCase` (`signTestManifest`, `squareAround`, `makePoint`, `makeRaw`, `makeManager`).

**Go:** `PascalCase` for exported (`Register`, `NewAuthService`, `Refresh`), `camelCase` for unexported (`bcryptC`). Constructors are `New<Type>` (`NewAuthService`, `NewSigner`).

### Variables and Constants

**TypeScript:**
- Module-level constants: `UPPER_SNAKE_CASE` with `as const` for hardcoded literals — `MANIFEST_PUBKEY_BASE64 = '...' as const` in `apps/mobile-rn/src/update/manifestSigning.ts:30`, `MANIFEST_URL`, `THROTTLE_MS` in `apps/mobile-rn/src/update/manifestCheck.ts:25-27`, `RU_WEEKDAY_SHORT` in `apps/mobile-rn/src/util/timeFormat.ts:11`, `ONE_DAY_MS` in `apps/mobile-rn/src/util/timeFormat.ts:14`
- Regex constants: `<NAME>_RE` — `SEMVER_RE`, `SHA256_RE`, `RFC3339_RE`, `URL_RE`, `SIG_B64_RE` in `apps/mobile-rn/src/update/manifestSchema.ts:18-24`
- Locals: `camelCase`
- Test fixtures: `UPPER_SNAKE_CASE` for top-level fixture objects (`VALID`, `VALID_MANIFEST`, `PAYLOAD`, `TEST_SEED_B64`, `TEST_PUB_B64`, `T0`, `NOW`)

**Go:** mixedCaps per Go idiom; exported first letter capitalized.

### Types

**TypeScript:**
- `PascalCase` for type aliases and interfaces — `LocationAdapter`, `SamplingMode`, `Manifest`, `ParseResult`, `CheckResult`, `CheckOptions`, `ManifestForSigning`, `PauseEvent`, `SessionRepo`
- Discriminated unions use `state` tag — `CheckResult` in `apps/mobile-rn/src/update/manifestCheck.ts:33-38` uses `{ state: 'no-update' } | { state: 'banner-shown' } | { state: 'force-required' } | { state: 'throttled' } | { state: 'failed'; error: string }`
- Result tagged unions use `ok` — `ParseResult` in `apps/mobile-rn/src/update/manifestSchema.ts:26-28` is `{ ok: true; value: T } | { ok: false; error: string }`
- Pause-event tagged unions use `type` — `PauseEvent` distinguishes `'auto-paused'` / `'auto-resumed'`
- No `interface` for value-object shapes; prefer `type =`. `interface` reserved for adapter contracts (e.g., `LocationAdapter`, `SessionRepo`).

## Code Style

**Formatting (mobile):**
- Tool: **Prettier 3.8.3** (configured via `prettier --write "src/**/*.{ts,tsx}" "App.tsx"` script in `apps/mobile-rn/package.json:11`)
- No `.prettierrc` checked in — Prettier defaults apply
- `.editorconfig` at repo root pins `indent_style = space`, `indent_size = 2` for TS/JS, `4` for `.py`/`.go`/Kotlin/Java, tab for Makefile, LF, UTF-8, trim trailing whitespace (except `.md`)

**Linting (mobile):**
- Tool: **ESLint 9 (flat config)** in `apps/mobile-rn/eslint.config.js`
- Base: `eslint-config-expo/flat`
- Run: `npm run lint` (= `eslint .`)
- Key custom rules:
  - `no-restricted-imports` blocks `@rnmapbox/maps` outside `src/map/` and `src/__tests__/` — enforces ТЗ §3 принцип 10 (Mapbox adapter quarantine)
  - `no-restricted-syntax` blocks `process.env.EXPO_PUBLIC_*_SECRET` (secrets ship in the JS bundle — see `docs/SECRETS.md`)
  - `no-restricted-syntax` blocks string Literal matching `/^sk\.[A-Za-z0-9._-]{40,}/` (hard-coded Mapbox sk. tokens). `{40,}` quantifier prevents UI-string false positives like `'sk-button'`
- Ignored: `dist/`, `node_modules/`, `android/`, `ios/`, `coverage/`, `.expo/`, `src/__fixtures__/` (latter contains intentional-fail samples that CI verifies with `eslint --no-ignore`)

**Linting (backend Go):**
- Tool: **golangci-lint v2.5.0** pinned in `.github/workflows/backend-ci.yml:71-75`; config at `.golangci.yml`
- Mode: `default: none` — explicit-enable only, 15 conservative linters: `govet`, `ineffassign`, `unused`, `errcheck`, `staticcheck`, `bodyclose`, `errorlint`, `rowserrcheck`, `sqlclosecheck`, `contextcheck`, `copyloopvar`, `nilerr`, `misspell` (+ exclusion presets)
- Test files relax `errcheck, dupl, gocyclo, bodyclose, govet`
- Rule: **never silently disable a linter** — every disabled rule has an inline `# Disabled — <rationale>; revisit v1.0.1` annotation (see `.golangci.yml:24-32`)
- **All 9 backend modules now 0 lint issues** (commit `92fe656` 2026-05-24 cleared the `pkg/observability` backlog of 8 issues: 5 gofmt + 2 staticcheck ST1023 + 1 contextcheck `//nolint`). Prior modules (identity/activity-sync/feed/media/messaging/notifications/realtime-gw/social-graph) were already clean from Phase 5 wave 6.

**`//nolint:CHECK // <rationale>` annotation convention (Go):**
Established by `92fe656`: when a linter must be intentionally bypassed, place `//nolint:<check>` on the SAME line as the flagged statement, with a `//` comment explaining WHY this is correct (not just suppression):
```go
// Shutdown closure intentionally uses its own context.Background() —
// the parent ctx passed to MustInitTracer is typically the caller's
// request/startup context, often already cancelled by the time
// shutdown runs. A fresh background ctx + 5s deadline is the standard
// pattern for OTel/Sentry SDK Shutdown calls.
return func() { //nolint:contextcheck // shutdown deliberately decoupled from startup ctx
    ctxStop, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    ...
}
```
Reference: `services/backend/pkg/observability/otel_init.go:228-232`. A bare `//nolint` with no rationale is forbidden.

**Dependency-vulnerability discipline (Go):**
Backend keeps Go runtime + critical dependencies bumped to clear `govulncheck` (commit `69cc8eb`): Go `1.25.0 → 1.25.10`, `go.opentelemetry.io/otel v1.32 → v1.43`. All 9 modules now report **0 vulns** (was 19-26 per module). Rule: any `govulncheck` finding blocks the `Vuln (govulncheck)` CI job (per D-10) — bump or `//nolint`-justify, never ignore silently.

**TypeScript strict mode:**
- `apps/mobile-rn/tsconfig.json:4` extends `expo/tsconfig.base` with `"strict": true`
- Run: `npm run typecheck` (= `tsc --noEmit`)
- Zero `any` introduced in Plan 08-01 + 2026-05-25 quick tasks
- **Per-commit `npx tsc --noEmit` verification** is mandatory for both quick tasks (chat-polish-pass + tracker-live-polish-pass enforced this across all 14 production-code commits — 0 type errors introduced)
- `as const` mandatory for hardcoded singleton literals (`MANIFEST_PUBKEY_BASE64`, `RU_WEEKDAY_SHORT`)
- `unknown` preferred over `any` for parsing untrusted JSON (see `apps/mobile-rn/src/update/manifestSchema.ts:30` — `parseManifest(raw: unknown)`)

## Import Organization

**Order (observed across mobile codebase):**
1. Node / external packages — `import * as ed25519 from '@noble/ed25519';`
2. Cross-module relative imports going up — `import { getInstalledVersion } from '../util/version';`
3. Same-module relative imports — `import { parseManifest } from './manifestSchema';`
4. Type-only imports use `import type { … }` — `import type { Point } from '../domain/types';`

**Path Aliases:** None configured — relative paths only.

## Error Handling

**TypeScript:**
- **Tagged-union Results** for parser-style returns: `ParseResult` (`{ ok, value | error }`) and `CheckResult` (`{ state, error? }`). Callers narrow via `if (!r.ok)` / `if (r.state === 'failed')` — no exceptions thrown for expected failures.
- **try/catch with silent failure** in fire-and-forget update path: `checkForUpdate` catches all errors and returns `{ state: 'failed', error: msg }`, only logs via `console.warn` when `__DEV__` (per 08-CONTEXT D-13). See `apps/mobile-rn/src/update/manifestCheck.ts:138-146`.
- **Defensive `try/catch` returning false** for verification functions: `verifyManifestSignature` wraps the full verify chain in try/catch and returns `false` on any throw — never propagates crypto errors (see `apps/mobile-rn/src/update/manifestSigning.ts:79-91`).
- **Throw `Error('<tag>: …')`** inside catch-wrapped paths so error.message carries a grep-able tag — `throw new Error('signature verification failed')`, `throw new Error(\`schema: ${parsed.error}\`)`, `throw new Error('replay: manifest older than installed baseline')`.

**Go:**
- Sentinel errors in `internal/domain` — `domain.ErrEmailAlreadyExists`, `domain.ErrInvalidCredentials`
- `errors.Is(err, sentinel)` for comparison (enforced by `errorlint` linter)
- User-enumeration mitigation: `Login` returns `ErrInvalidCredentials` for both unknown user AND wrong password (see `services/backend/identity/internal/service/auth_test.go:98-105`)

## Logging

**Framework:** `console.warn` / `console.log` on mobile (production code), gated behind `if (__DEV__)` for diagnostics that should be silenced in release bundles.

**Patterns:**
- Diagnostic tag prefix: `[update]` for module-scoped warnings — `console.warn('[update] check failed:', msg)` in `apps/mobile-rn/src/update/manifestCheck.ts:142`
- Backend logging uses `slog` via `pkg/observability/slog_handler.go` with a deny-list for PII attrs (D-12) — enforced by `scripts/pii_audit.sh` in CI

## Comments

**Header block convention (mobile):** Every non-trivial module opens with a doc-block in this shape:
```typescript
// Phase 8 Plan 08-01 Task 5 — manifest fetch + verify + dispatch.
//
// Single entry point: `checkForUpdate({ force? })`. Triggered by
//   1. useUpdateCheckOnForeground hook on AppState='active'
//   2. SettingsScreen "Проверить обновления" tap (force: true)
//
// Throttle: 6 hours between auto-checks (force: true bypasses).
// ...
```
The header cites the originating phase/plan/task (or quick-task slug + date) + states purpose, dispatch behavior, throttle, and decision-anchors. Examples: `apps/mobile-rn/src/update/manifestCheck.ts:1-15`, `apps/mobile-rn/src/pipeline/filters/__tests__/PauseDetector.warmup.test.ts:1-2` (`Tests for PauseDetector warmup gate (2026-05-25 polish pass)`), `apps/mobile-rn/src/util/timeFormat.ts:1-10` (strategy block).

**Russian inline comments** are the norm in domain/state/UI modules — e.g., `apps/mobile-rn/src/state/forceUpdate.ts:1-12`, `apps/mobile-rn/src/__tests__/pipeline.test.ts:23-30`. Module headers + ADRs may use English when documenting incidents/infrastructure (e.g., `apps/mobile-rn/src/update/manifestCheck.ts`).

**Pitfall citations:** Comments reference specific RESEARCH pitfalls when defending non-obvious code — `// RESEARCH Pitfall 4 — @noble/ed25519 requires explicit hash injection`, `// RESEARCH Pitfall 5 — no Buffer in RN runtime`. See `apps/mobile-rn/src/update/manifestSigning.ts:17-22, 49`.

**JSDoc/TSDoc:** Reserved for exported public surface (functions, constants, types) where the contract is non-obvious — see `verifyManifestSignature` docblock in `apps/mobile-rn/src/update/manifestSigning.ts:63-72`, `formatChatTime` parameter doc in `apps/mobile-rn/src/util/timeFormat.ts:16-22` (documents the injectable clock pattern). Not enforced as a lint rule.

## Function Design

**Size:** Pure utilities small (10-40 LOC). State-machine orchestrators (e.g., `checkForUpdate`) up to ~100 LOC with clear linear path + early returns.

**Parameters:** Prefer single object for options with defaults — `checkForUpdate(opts: CheckOptions = {})` with `const { force = false } = opts`. Single-arg primitives stay positional.

**Testability override — injectable clock pattern (chat-polish-pass + tracker-live-polish-pass):**
For any function whose behavior depends on `Date.now()` or the wall clock, add an **optional `nowMs: number` parameter** defaulted to `Date.now()`. Tests then pass a fixed reference clock for deterministic results. Examples:
- `formatChatTime(ts: number, nowMs: number = Date.now()): string` — `apps/mobile-rn/src/util/timeFormat.ts:22`
- `effectiveElapsedMs(nowMs: number): number` on `SessionManager` — caller supplies `Date.now()` in production, tests pass `T0 + delta_ms`

The pattern is preferred over `jest.useFakeTimers` for **pure** logic, because:
1. The unit test reads as plain logic (no setup), no need to advance timers
2. The production signature stays single-arg-callable
3. Tests cover boundary cases (`23:59` today, `00:00` yesterday) without timezone juggling

For functions where the clock is read deeply inside (e.g., `SessionManager.setPaused(true)` reads `Date.now()` internally to record `pausedAt`), tests use `jest.useFakeTimers().setSystemTime(T0)` instead — see Testing patterns.

**Testability override — closure-bound constant:**
When a function depends on a module-level constant the tests need to override, **add an optional parameter** rather than relying on `jest.mock`. Closure-bound `const`s cannot be swapped via mock-spread (Plan 08-01 Task 5 — see `verifyManifestSignature(manifest, pubkeyBase64: string = MANIFEST_PUBKEY_BASE64)` in `apps/mobile-rn/src/update/manifestSigning.ts:73-79`). The production caller omits the arg; tests pass an override.

**Return values:** Tagged unions for fallible operations (above); never use `null` ambiguously when an error state needs distinguishing from absent-data state.

## Module Design

**Exports:** Named exports only — no default exports (matches Expo + RN community convention; verified across `src/update/`, `src/vendor/`, `src/state/`, `src/util/`, `src/design/`).

**Barrel Files:** Minimal use — `apps/mobile-rn/src/pipeline/index.ts`, `apps/mobile-rn/src/map/index.ts`, `apps/mobile-rn/src/sensors/index.ts`, `apps/mobile-rn/src/location/index.ts`, `apps/mobile-rn/src/design/index.ts`. New module surfaces (e.g., `src/update/`) do NOT add `index.ts` — direct path imports are preferred. Jest `collectCoverageFrom` excludes `**/index.ts` (`apps/mobile-rn/jest.config.js:13`).

**State stores (Zustand):**
- One store per concern, file named `use<Domain><Suffix>Store.ts` — `useForceUpdateStore`, `useUpdateBannerStore`, `useUpdateCheckStore`
- In-memory by default; persist to MMKV only when at-rest survival is meaningful (see `apps/mobile-rn/src/state/forceUpdate.ts:1-12` which deliberately avoids MMKV because server re-issues 426 on every request)
- Store shape: `INITIAL` constant + `set/reset` mutators — see `apps/mobile-rn/src/state/forceUpdate.ts:29-39`

**Adapter pattern (ТЗ §3 принципы 3, 10):**
- Platform/SDK concerns live behind a TS interface — `LocationAdapter` in `apps/mobile-rn/src/location/LocationAdapter.ts`, `MapAdapter` (under `src/map/`)
- Concrete implementations live in `<module>/adapters/` — `apps/mobile-rn/src/location/adapters/`
- Mapbox SDK import quarantine enforced by ESLint `no-restricted-imports` (off only for `src/map/**` and `src/__tests__/**`)

**Module location patterns (current state — pattern inconsistency noted):**

The mobile codebase has TWO valid layouts living side by side:

1. **Flat-by-concern (legacy, dominant):** Top-level `apps/mobile-rn/src/<concern>/` directories — `auth/`, `design/`, `domain/`, `foreground/`, `health/`, `location/`, `map/`, `media/`, `navigation/`, `notifications/`, `pipeline/`, `realtime/`, `sensors/`, `state/`, `storage/`, `sync/`, `ui/`, `update/`, `util/`, `vendor/`. Each carries its own `__tests__/` subdirectory.
2. **Modular (Phase 8/C + 8/E pattern):** `apps/mobile-rn/src/modules/<feature>/{domain,state,sync,ui,storage}/` — currently used by `modules/gamification/`, `modules/moderation/`, `modules/permissions/`. Each feature is a self-contained vertical slice.

**Convention for NEW code:** Stay in the flat-by-concern layout for cross-cutting helpers (e.g., `src/util/`, `src/design/`); reach for `src/modules/<feature>/` only when adding a fully self-contained vertical feature with its own domain + sync + state + UI tier. Migrating existing flat-layout code (e.g., chat code currently spread across `src/state/social/`, `src/storage/`, `src/domain/`, `src/ui/social/`) into the modular pattern is tracked as **v1.0.1 backlog item `CHAT-MODULE-MIGRATION`** (see `.planning/quick/20260525-chat-polish-pass/CONTEXT.md` §D-02).

**New `src/update/` module shape (Plan 08-01):**
```
apps/mobile-rn/src/update/
├── __tests__/                         # co-located unit tests (4 files, 48 cases)
│   ├── manifestCheck.test.ts          # state-machine + dispatch
│   ├── manifestSchema.test.ts         # hand-rolled validator
│   ├── manifestSigning.test.ts        # Ed25519 sign/verify
│   └── semverLite.test.ts             # it.each parametric comparator
├── UpdateBanner.tsx                   # PascalCase component
├── manifestCheck.ts                   # orchestrator (single public entry)
├── manifestSchema.ts                  # hand-rolled (zod NOT installed — RESEARCH §9 Q2 documented tradeoff in module header)
├── manifestSigning.ts                 # @noble/ed25519 + canonical JSON
├── semverLite.ts                      # hand-rolled comparator (rc/beta only)
├── updateBannerStore.ts               # Zustand
├── updateCheckStore.ts                # Zustand
└── useUpdateCheckOnForeground.ts      # React hook
```
Notable: no `index.ts` barrel; each test file imports directly from `../<module>`.

## Quick Task Workflow Convention (established 2026-05-25)

Two TIGHT-scope polish passes shipped 2026-05-25 established a standardized lightweight workflow for non-phase tactical improvements:

**Directory:** `.planning/quick/YYYYMMDD-<slug>/`

**Required files (3-doc trio):**
- `PLAN.md` — frontmatter (`slug`, `created`, `type: quick`) + list of TIGHT-scope items with file targets and estimated effort
- `CONTEXT.md` — origin (user-request quote), discussion-phase decisions (`D-01`..`D-NN` table), out-of-scope items with deferral rationale, atomic-commit plan, files-touched preview
- `SUMMARY.md` — completed-item table (item / files / commit-sha / status), acceptance criteria checked, tests-added breakdown, files-changed manifest, performance metrics, backlog-promotion suggestions

**Commit cadence (typical TIGHT task):**
- 8 commits total: 1 PLAN+CONTEXT, ~5-6 atomic feature/fix commits (one per deliverable item), 1 SUMMARY+STATE update
- All commits TypeScript-clean (`npx tsc --noEmit` per commit) + jest-green
- Test additions only for **pure logic** (utility functions, state transitions) — never visual snapshots for UI polish

**STATE.md integration:** After SUMMARY commit, append row to "Quick Tasks Completed" table in `.planning/STATE.md` recording `date`, `slug`, `commits`, `tests_delta`, `outcome`.

**Discussion phase artifact:** Any scope ambiguity is resolved BEFORE writing code — user is offered Tight/Mid/Full options with effort estimates ("Go tight" / "Расширяй" pattern), and the chosen scope is captured in CONTEXT.md §"Discussion phase decisions".

**Two reference examples:**
- `.planning/quick/20260525-chat-polish-pass/` — 7 commits, +31 tests (14 timeFormat + 17 avatarInitials)
- `.planning/quick/20260525-tracker-live-polish-pass/` — 8 commits, +17 tests (6 PauseDetector warmup + 9 SessionManager time-freeze + 2 pause-flow integration)

## Commit Conventions

**Format:** `<type>(<scope>): <summary> [(<TASK-ID>)]`

**Types observed (recent 50 commits):**
- `feat(<plan-or-area>): <description> [(<TASK-ID>)]` — code tasks (e.g., `feat(08-01): mobile update module — manifest fetch + Ed25519 verify + dispatch (DIST-01)`, `feat(util): timeFormat helper — Telegram-style chat timestamps`, `feat(pipeline): PauseDetector warmup gate — fixes "ПРОДОЛЖИТЬ on start" UX`)
- `chore(<plan>): <description> (<TASK-ID>)` — evidence scaffolding, tool-version audits
- `fix(<plan-or-area>): <description>` — in-task corrections (`fix(pkg/observability): clear golangci-lint v2.5 backlog (8 issues, pkg-only)`, `fix(backend): bump Go 1.25.0→1.25.10 + otel v1.32→v1.43 to clear govulncheck`)
- `docs(<area>): <description>` — ADRs, plans, RESEARCH, STATE updates, quick-task scaffolding (`docs(quick/chat-polish): PLAN + CONTEXT for chat-polish-pass`, `docs(quick/tracker-live): SUMMARY + STATE table — closeout`)
- `test(<area>): <description>` — pure test-additions when scope is the test file itself (`test(session): integration test for PauseDetector+SessionManager flow`)

**Scopes:**
- Numeric plan ID: `01`, `02`, `04-02`, `06-01`, `07-01`, `08`, `08-01` (matches `.planning/phases/<NN-<slug>>/<NN-MM>-PLAN.md`)
- Cross-cutting tags: `state`, `planning`, `codebase`, `security`, `util`, `design`, `chats`, `session`, `tracker-live`, `pipeline`, `ci`, `backend`, `pkg/<name>`
- Quick-task scope: `quick/<slug>` — e.g., `docs(quick/chat-polish)`, `docs(quick/tracker-live)`

**Task ID suffix:** `(DIST-01)`, `(STAB-01)`, `(BUILD-01)`, `(SIGN-01)` — matches the requirement-ID in `docs/REQUIREMENTS.md` / `docs/DEVELOPMENT_PLAN.md`. Omit when scope already disambiguates (e.g., quick-task feature commits, lint/vuln-clearing fixes, in-task `fix(07-01)`).

**Body:**
- Multi-paragraph prose explaining the WHY, not just the WHAT
- Cite `Pitfall N` references from the corresponding `<NN>-RESEARCH.md` when defending non-obvious choices
- Cite decision IDs (`D-09`, `D-11`, `D-13`) when implementing a CONTEXT-locked design

**Pre-commit gating (must pass on every commit):**
- `gitleaks v8.30.1` via `.pre-commit-config.yaml` (staged-files-only)
- Custom rules in `.gitleaks.toml` extend defaults to catch bare Mapbox `pk.` + `sk.` literals (RESEARCH Pitfall 2)
- ESLint v9 (mobile) + trufflehog config (full-history scan runs in `secret-scan-full.yml` cron, not pre-commit)
- All recent commits (Plan 08-01 + 2026-05-25 quick tasks + 92fe656 lint cleanup + 69cc8eb dep bump) passed the gate cleanly

## CI Gates Currently Active (2026-05-25)

Five GitHub Actions workflows enforce repo-wide hard rules. ALL gates must remain green for `main` and `feat/cursona-redesign`.

**`backend-ci.yml`** (push to main + PR against main, paths-filtered):
- `Test (Go 1.25)` per-service matrix with `-race -coverprofile`
- `Lint (golangci-lint v2)` — pinned v2.5.0, per-module loop (currently 0 issues across 9 modules)
- `SAST (gosec)` — `-severity high` block
- `Vuln (govulncheck)` — per-module; blocks on any finding (currently 0 vulns across 9 modules after `69cc8eb` Go 1.25.10 + otel v1.43 bump)
- `SAST (semgrep)` — `p/golang` + `p/owasp-top-ten` ERROR-level
- `Secrets (gitleaks + trufflehog — PR diff)` — em-dash `—` in job name is contractual (Plan 04-05 branch-protection JSON)
- `Docker build (no push, verify)` + Trivy HIGH/CRITICAL block
- `Guard (no :latest)` — negative grep across workflows + compose
- `PII Audit (slog grep)` — runs `scripts/pii_audit.sh` blocking on D-12 deny-list violations
- `Cardinality Probe (Prom labels)` — boots docker-compose + polls `/metrics`, blocks on forbidden labels or series count > 1000

**`android-release.yml`** (tag-triggered, Phase 8 distribution pipeline; gated per ADR-0011 Amendment 5):
- EAS Cloud build + SOPS-decrypt keystore + `bundletool build-apks` + MinIO upload + signed manifest (Ed25519)
- `::add-mask::$STORE_PASS` requirement before any `$GITHUB_ENV` write of a decrypted secret (canonical pattern at `android-release.yml:87-91`)

**`android-debug-apk.yml`** (`workflow_dispatch` + push to `main` / `feat/cursona-redesign` with `apps/mobile-rn/**` paths):
- Universal debug APK build (arm64-v8a + x86_64), JS bundle embedded
- Uploads `app-debug-<sha>` artifact for ad-hoc tester distribution / BlueStacks dev-loop
- Uses repo-committed `apps/mobile-rn/android/app/debug.keystore` (negate-pattern `!debug.keystore` in `.gitignore:54`)

**`secret-scan-full.yml`** (cron + manual trigger):
- gitleaks + trufflehog full-history scan (vs PR-diff in `backend-ci.yml`)

**Pre-commit (local, every commit):**
- `.pre-commit-config.yaml` runs `gitleaks v8.30.1` (staged files only)
- All commits to date pass; bypassing with `--no-verify` is forbidden unless user explicitly authorizes it

## Gradle Properties — Parameterized Signing Convention

Release-signing credentials are pulled at Gradle config time via `findProperty(...)` lookups, never hardcoded:
```groovy
// apps/mobile-rn/android/app/build.gradle:140-148
def storeFileName = project.findProperty('RUNNING_ECO_RELEASE_STORE_FILE')
if (storeFileName) {
    storeFile file(storeFileName)
    storePassword project.findProperty('RUNNING_ECO_RELEASE_STORE_PASSWORD') ?: ''
    keyAlias project.findProperty('RUNNING_ECO_RELEASE_KEY_ALIAS') ?: ''
    keyPassword project.findProperty('RUNNING_ECO_RELEASE_KEY_PASSWORD') ?: ''
}
```
Falls back to debug signing if `RUNNING_ECO_RELEASE_STORE_FILE` is unset. CI injects the four properties via `~/.gradle/gradle.properties` after SOPS-decrypting `.secrets/prod/mobile-signing.yaml`, gated by `::add-mask::` for the password fields (see Credential-Diagnostics Discipline rule 4).

Other Gradle props using the same `findProperty('<name>') ?: <default>` pattern: `android.enableBundleCompression`, `android.enableMinifyInReleaseBuilds`, `reactNativeReleaseLevel`, `android.enableShrinkResourcesInReleaseBuilds`, `android.enablePngCrunchInReleaseBuilds`. The pattern is preferred over `if (project.hasProperty(...)) … else …` because `findProperty` returns null cleanly + the `?:` elvis-default reads as a single config line.

## Gitignore Policy

**Debug keystore IS committed** (`.gitignore:53-54`):
```
*.keystore
!debug.keystore
```
The single `apps/mobile-rn/android/app/debug.keystore` (2 KB, standard Android dev keypair, alias `androiddebugkey`, password `android` — Android-wide convention, not a secret) is checked in deliberately. Rationale (commit `0f6f840` 2026-05-24): CI debug-APK builds need a stable signing identity so the resulting APK can be reinstalled over a previous build without "signing mismatch" errors. The convention matches Android Studio's default keystore — every Android dev's `~/.android/debug.keystore` has the same effective password.

**Release keystore stays SOPS-encrypted only:**
- `apps/mobile-rn/android/app/release.keystore` — explicitly listed in `.gitignore:159` (defense-in-depth; `*.keystore` already covers it)
- Encrypted source-of-truth: `.secrets/prod/mobile-signing.yaml` (SOPS + age)
- Decrypted into CI runtime via `android-release.yml` per ADR-0012 amendment rules

**`apps/mobile-rn/credentials.json` is gitignored** (`.gitignore:166`) — contains plaintext `keystorePassword` + `keyPassword` because `credentialsSource: "local"` in `eas.json` requires them on disk during the EAS build phase. Generated from SOPS at CI time; never committed.

## Credential-Diagnostics Discipline (ADR-0012 Amendment, 2026-05-22)

After the self-inflicted chat-dump leak documented in `docs/DECISIONS/0012-keystore-password-leak-2026-05-22.md`, the following rules are now load-bearing for anyone (human or AI agent) handling decrypted secrets:

1. **Single canonical fingerprint form.**
   Use `printf '%s' "$VAR" | shasum -a 256 | cut -c1-12` **exclusively** when fingerprinting a secret for comparison. Do NOT mix forms (`echo "$VAR" | shasum`, `yq … | shasum`, `<<<"$VAR" shasum`). `yq -r` appends a trailing newline; `$()` strips it; the two forms hash to different prefixes and can be mistaken for evidence of corruption. (See ADR-0012 amendment §"Root cause".)

2. **No byte-level inspection of secret values.**
   **Never** `xxd`, `od -c`, `hexdump`, `wc -c` paired with sample-char display, `${VAR:0:N}`, `${VAR: -N}`, or any operation that surfaces individual bytes. **The bytes ARE the secret.** A 12-char fingerprint mismatch is the maximum diagnostic detail allowed; rotate-on-suspicion is the response, not deeper inspection.

3. **`SOPS_AGE_KEY_FILE` must be set explicitly.**
   Every verification script / smoke in `evidence/` and `scripts/` must (a) require `SOPS_AGE_KEY_FILE` (use `: "${SOPS_AGE_KEY_FILE:=$HOME/.config/sops/age/keys.txt}"`), (b) check `sops -d` exit code (no `2>/dev/null` swallow), (c) validate decrypted value length > 0 before downstream processing. A silent decrypt-failure that produces the string `null` hashes to `74234e98…` — that prefix is the false-positive signature for misconfigured SOPS, never a real secret.

4. **`::add-mask::` MUST precede every `$GITHUB_ENV` write of a decrypted secret.**
   GitHub Actions does NOT auto-mask values that arrive through `echo "VAR=$value" >> $GITHUB_ENV` — only `${{ secrets.X }}` template substitutions are auto-registered. The required pattern (enforced by `smoke-release-distribute.sh`):
   ```yaml
   - run: |
       STORE_PASS=$(sops -d ... | yq -r '.android.keystore_password')
       echo "::add-mask::$STORE_PASS"
       echo "RUNNING_ECO_RELEASE_STORE_PASSWORD=$STORE_PASS" >> "$GITHUB_ENV"
   ```
   See `.github/workflows/android-release.yml:87-91` for the canonical example. Verified by `must "::add-mask::\\\$STORE_PASS"` assertion in `.planning/phases/08-closed-beta-distribution/evidence/smoke-release-distribute.sh:34`.

5. **Treat-as-compromise on first sign of log/transcript leakage.**
   Once a secret value is observable in any pipe outside the local process — CI logs, AI agent transcript, chat tool — rotate immediately. No "monitoring" alternative is acceptable because keystore-password compromise has no usage dashboard analog. Pattern is universal across `ADR-0006` (Mapbox), `ADR-0012` (keystore).

6. **No `EXPO_PUBLIC_*_SECRET` ever.**
   Enforced by `no-restricted-syntax` in `apps/mobile-rn/eslint.config.js:47-60`. Secrets ship in the JS bundle when exposed via `EXPO_PUBLIC_*` — they must come from `~/.netrc` / `~/.gradle/gradle.properties` at build time, never runtime env.

7. **No hardcoded Mapbox `sk.` tokens.**
   Enforced by `no-restricted-syntax` Literal rule. The companion intentional-fail fixture `apps/mobile-rn/src/__fixtures__/secret.lint-fixture.ts` is excluded from normal lint but exercised in CI via `eslint --no-ignore` to verify the rule still fires.

8. **Pre-commit `gitleaks v8.30.1` is non-negotiable.**
   Custom rules in `.gitleaks.toml` extend `useDefault = true` with `mapbox-secret-token` and `mapbox-public-token-bare` patterns. Bypassing with `--no-verify` is forbidden unless the user explicitly authorizes it.

---

*Convention analysis: 2026-05-25*
