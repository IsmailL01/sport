# Testing Patterns

**Analysis Date:** 2026-05-18

The project has two distinct test stacks running side-by-side:

- **Go backend** — `go test` with stdlib `testing` package. 15 test files
  across 9 modules in `services/backend/`.
- **Mobile (Expo RN)** — Jest 29 + `jest-expo` preset +
  `@testing-library/react-native`. 30+ test files under
  `apps/mobile-rn/src/__tests__/`.

There is no shared test-runner abstraction; each side stands alone in CI.

## Test Frameworks

### Go (backend)

**Runner:** stdlib `testing` package — Go 1.25.
**Assertion library:** none — plain `t.Errorf` / `t.Fatalf` / `t.Fatal`.
No `testify` (deferred per `.golangci.yml:42`: `testifylint` not yet enabled
because the project doesn't currently use testify).
**Race detector:** `-race` is enabled in CI (`.github/workflows/backend-ci.yml:54`).
**Coverage:** `-coverprofile=coverage.out` per module; reported via
`go tool cover -func=coverage.out | tail -1` into the GitHub Actions
step summary.

**Run commands** (`services/backend/Makefile:61-73`):
```bash
# All Go tests, sequential per module
cd services/backend && make test

# With coverage profiles (one file per module)
cd services/backend && make test-coverage

# Per-service ad-hoc:
cd services/backend/identity && go test ./...
cd services/backend/pkg && go test ./...
```

CI matrix runs each module independently in parallel
(`.github/workflows/backend-ci.yml:40-56`): `pkg`, `identity`,
`activity-sync`, `feed`, `media`, `messaging`, `notifications`,
`realtime-gw`, `social-graph`.

### Mobile (Expo RN)

**Runner:** Jest 29.7 with `jest-expo` preset 54.
**Renderer:** `@testing-library/react-native` 13.3 for component tests;
fake timers via `jest.useFakeTimers()` for animation/toast tests.
**Mocking:** built-in `jest.fn()` / `jest.mock()` — no `sinon` etc.
**SQLite shim:** custom `__mocks__/expo-sqlite.ts` re-implementing the
sync `expo-sqlite` API on top of `better-sqlite3` for in-memory testing.

**Config** — `apps/mobile-rn/jest.config.js`:
```js
{
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@sentry/.*|sentry-expo|native-base|react-native-svg|@rnmapbox/.*)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
}
```

**Run commands** (`apps/mobile-rn/package.json:11-14`):
```bash
cd apps/mobile-rn && npm test               # Run all tests
cd apps/mobile-rn && npm run test:coverage  # With coverage report
cd apps/mobile-rn && npm run typecheck      # tsc --noEmit
```

**Coverage output:** `apps/mobile-rn/coverage/` (clover.xml, lcov.info,
lcov-report/ html).

## Test File Organization

### Go

**Location:** Co-located with source. `<name>.go` paired with
`<name>_test.go` in the same package.

**External test packages (`package xxx_test`)** are used when a test
should exercise only the public API — observed at
`services/backend/identity/internal/handler/http_test.go:1`:
```go
package handler_test
```
This forces tests through public identifiers. The unit-test sibling for
the service layer (`services/backend/identity/internal/service/auth_test.go:1`)
uses the same package (`package service`) — chosen when tests need access
to unexported fields (e.g. `s.bcryptC = 4`).

**Test fixtures:** No dedicated `testdata/` directories observed.
Test data is built inline via helper functions
(`newTestService`, `newTestStore`, `newTestServer`, `newTestPolicy`,
`newLogger`).

**File inventory** (as of analysis):
```
services/backend/identity/cmd/server/main_test.go
services/backend/identity/internal/handler/http_test.go
services/backend/identity/internal/service/auth_test.go
services/backend/pkg/clientversion/middleware_test.go
services/backend/pkg/clientversion/parse_test.go
services/backend/pkg/auth/jwt_test.go
services/backend/pkg/gamification/gamification_test.go
services/backend/pkg/permissions/check_test.go
services/backend/pkg/featureflags/cache_test.go
services/backend/pkg/featureflags/featureflags_test.go
services/backend/pkg/featureflags/rollout_test.go
services/backend/scripts/openapi-routes-check/main_test.go
services/backend/activity-sync/internal/handler/http_test.go
services/backend/activity-sync/internal/service/sync_test.go
services/backend/messaging/internal/permissions/permissions_test.go
```

### Mobile

**Location:** Single directory — `apps/mobile-rn/src/__tests__/`. Tests
are NOT co-located next to source; the convention is one flat directory
with descriptive filenames. Snapshots go in
`apps/mobile-rn/src/__tests__/__snapshots__/`.

**Filename pattern:**
- `<Subject>.test.ts` — unit tests (e.g. `AreaCalculator.test.ts`,
  `pipeline.test.ts`, `SessionManager.test.ts`)
- `<Subject>.test.tsx` — React component tests (e.g. `Toast.test.tsx`,
  `usePauseUI.test.tsx`)
- `<Subject>.snapshot.test.tsx` — snapshot regression tests
  (e.g. `RunDetailsScreen.snapshot.test.tsx`)

**Test fixtures:** `apps/mobile-rn/src/__fixtures__/` holds intentional
lint-failure fixtures (e.g. `secret.lint-fixture.ts` — NOT a Jest fixture,
but an ESLint negative-test fixture). For Jest test data, the convention
is in-test helper functions (`p(lat, lon)`, `makePoint(opts)`,
`makeMockRepo()`, `makeMockAdapter()`).

**Global mocks:** `apps/mobile-rn/__mocks__/expo-sqlite.ts` is a
Jest auto-mock for `expo-sqlite` (loaded automatically when a test
imports from it), backed by `better-sqlite3` for in-memory SQLite
(`apps/mobile-rn/__mocks__/expo-sqlite.ts:1-94`).

## Test Structure

### Go — table-driven and helper-pattern

**Helper pattern** — factory functions returning a fully-wired SUT.
`t.Helper()` is mandatory inside helpers so failure-line points at the
calling test:

```go
// services/backend/pkg/auth/jwt_test.go:11-18
func newTestSigner(t *testing.T) *Signer {
    t.Helper()
    s, err := NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
    if err != nil {
        t.Fatalf("NewSigner: %v", err)
    }
    return s
}
```

```go
// services/backend/identity/internal/service/auth_test.go:13-23
func newTestService(t *testing.T) *AuthService {
    t.Helper()
    signer, err := auth.NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
    if err != nil {
        t.Fatal(err)
    }
    s := NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
    // Снижаем cost bcrypt'а чтобы тесты не были медленными.
    s.bcryptC = 4
    return s
}
```

**Test-function naming:** `Test<Subject>_<Scenario>` —
`TestRegister_HappyPath`, `TestRegister_DuplicateEmail`,
`TestRegister_RejectsInvalidEmail`, `TestVerify_RejectsExpired`,
`TestRollout_ZeroPercent_AlwaysFalse`, `TestCache_HitWithinTTL`,
`TestIsEnabled_PostgresDown_FailsClosed`.

**Table-driven tests** — used for parser and validator scenarios:

```go
// services/backend/pkg/clientversion/parse_test.go:8-50
func TestParse_TableDriven(t *testing.T) {
    t.Parallel()
    cases := []struct {
        name       string
        input      string
        wantSemver string
        wantBuild  string
        wantErr    error
    }{
        {name: "plain semver", input: "1.0.0", wantSemver: "1.0.0", wantBuild: ""},
        {name: "semver with paren build", input: "1.0.0 (42)", wantSemver: "1.0.0", wantBuild: "42"},
        // ...
        {name: "garbage", input: "garbage", wantErr: ErrInvalidSemver},
    }

    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            semver, build, err := Parse(tc.input)
            if tc.wantErr != nil {
                if !errors.Is(err, tc.wantErr) {
                    t.Fatalf("Parse(%q) err = %v, want %v", tc.input, err, tc.wantErr)
                }
                return
            }
            // ... positive-case assertions
        })
    }
}
```

**`t.Parallel()` usage:** Inconsistent. Some pkgs use it
(`clientversion/parse_test.go:9`, `clientversion/middleware_test.go:62`,
`clientversion/middleware_test.go:77`), others don't
(`identity/internal/service/auth_test.go`, `pkg/auth/jwt_test.go` —
zero `t.Parallel()` calls). The `paralleltest` linter is intentionally
DEFERRED in `.golangci.yml:41` because of debatable policy. New tests
SHOULD opt in to `t.Parallel()` unless they mutate shared state.

**Error assertions:** `errors.Is` for sentinel comparison, never raw
`==` on `error`:

```go
// services/backend/identity/internal/service/auth_test.go:49-51
_, _, err := s.Register(ctx, "a@b.com", "password456", "", "")
if !errors.Is(err, domain.ErrEmailAlreadyExists) {
    t.Errorf("expected ErrEmailAlreadyExists, got %v", err)
}
```

**HTTP testing:** `httptest.NewServer(h.Routes())` + standard
`net/http` client. Helper `postJSON` / `decode` reduce boilerplate.
`t.Cleanup(srv.Close)` registers teardown:

```go
// services/backend/identity/internal/handler/http_test.go:19-29
func newTestServer(t *testing.T) (*httptest.Server, *service.AuthService) {
    t.Helper()
    signer, _ := auth.NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
    svc := service.NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
    h := handler.NewAuthHandler(svc, nil, signer, slog.New(slog.NewTextHandler(io.Discard, nil)), false)
    srv := httptest.NewServer(h.Routes())
    t.Cleanup(srv.Close)
    return srv, svc
}
```

**Skip-on-missing-env idiom:** Postgres-backed tests skip rather than
fail when `PG_TEST_URL` is unset. See file header
`services/backend/pkg/featureflags/featureflags_test.go:4-5`:

> "Postgres-impl-тесты используют PG_TEST_URL env. Если она не выставлена —
> skip (CI без containers). См. RESEARCH.md §Pitfalls #1."

### Mobile — describe/it BDD style

**Layout:**

```ts
// apps/mobile-rn/src/__tests__/AreaCalculator.test.ts:29
describe('AreaCalculator.calculateArea', () => {
  it('< 3 точек → null + warning too-few-points', () => {
    const r = calculateArea([p(50, 10), p(50.001, 10)]);
    expect(r.areaM2).toBeNull();
    expect(r.method).toBeNull();
    expect(r.warnings).toContain('too-few-points');
  });

  it('квадрат 200×200м (≈40 000 м²) — tolerance 5%', () => {
    // ...
  });
});
```

**Nested `describe`** for sub-features — see
`apps/mobile-rn/src/__tests__/SessionManager.test.ts:132-507` which has
~12 nested `describe` blocks (`start()`, `ingestRawPoint()`, `markLap()`,
`stop()`, `recoverLast()`, `snapshot()`, `error handling`, `reset()`,
`acceptPoint()`, `setPaused() → LocationAdapter.setSamplingMode`,
`handleAppForeground() — constructor wiring smoke`).

**Test titles are Russian or English mixed** — same convention as code
comments. Acceptable when intent is clear.

**Helper builders** inline-defined at file top:

```ts
// apps/mobile-rn/src/__tests__/pipeline.test.ts:9-20
function makePoint(opts: Partial<Point> & { ts?: number; lat?: number; lon?: number }): Point {
  return {
    timestamp: opts.ts ?? 0,
    latitude: opts.lat ?? 50,
    longitude: opts.lon ?? 10,
    altitude: null,
    accuracy: opts.accuracy ?? 5,
    speed: opts.speed ?? null,
    heading: null,
    source: opts.source ?? 'raw',
  };
}
```

**Numerical tolerance** — domain tests assert geometric correctness
with a tolerance band, not exact equality:

```ts
// apps/mobile-rn/src/__tests__/AreaCalculator.test.ts:42-44
expect(r.areaM2).toBeGreaterThan(38_000);
expect(r.areaM2).toBeLessThan(42_000);
```

5% tolerance is the project norm for geometric assertions; 1% for
distribution assertions (Rollout uniformity tests in
`services/backend/pkg/featureflags/rollout_test.go:38-55`).

## Mocking

### Go

**Hand-written fakes** — no `mockery` / `gomock` in use.

The canonical fake is `services/backend/identity/internal/repository/memory/`:

```go
// services/backend/identity/internal/repository/memory/memory.go:1-3
// Package memory — in-memory реализации репозиториев для unit-тестов
// AuthService без необходимости поднимать Postgres.
package memory

// services/backend/identity/internal/repository/memory/memory.go:13-22
type UserRepo struct {
    mu     sync.RWMutex
    byID   map[string]*domain.User
    nextID int
}

func NewUserRepo() *UserRepo {
    return &UserRepo{byID: make(map[string]*domain.User)}
}
```

Fakes implement the same interfaces production code consumes
(`repository.UserRepo`, `repository.RefreshTokenRepo`). They are
goroutine-safe (mutex-guarded) so they're safe with `-race`.

**Spy / handler-stub pattern:**

```go
// services/backend/pkg/clientversion/middleware_test.go:24-33
type stubNext struct {
    calls atomic.Int32
}

func (s *stubNext) ServeHTTP(w http.ResponseWriter, r *http.Request) {
    s.calls.Add(1)
    w.WriteHeader(http.StatusOK)
    _, _ = io.WriteString(w, "ok")
}
```

**Log capture** — direct `slog` against a `bytes.Buffer`:

```go
// services/backend/pkg/clientversion/middleware_test.go:35-38
func newLogger() (*slog.Logger, *bytes.Buffer) {
    buf := &bytes.Buffer{}
    return slog.New(slog.NewTextHandler(buf, &slog.HandlerOptions{Level: slog.LevelDebug})), buf
}
```

Then assert log content with `strings.Contains(logBuf.String(), "clientversion")`.

### Mobile — `jest.mock` factory + `mock*` variable convention

**Module mocks** with hoisted factory:

```ts
// apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts:8-35
// Variable names prefixed with `mock` are allowed inside jest.mock() factories
// (Jest hoists jest.mock to the top of the file before imports).
const mockStartLocationUpdates: jest.Mock = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockStopLocationUpdates: jest.Mock = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockHasStarted: jest.Mock = jest.fn((_name?: string) => Promise.resolve(true));

jest.mock('expo-location', () => ({
  startLocationUpdatesAsync: (...args: unknown[]) => mockStartLocationUpdates(...args),
  stopLocationUpdatesAsync: (...args: unknown[]) => mockStopLocationUpdates(...args),
  hasStartedLocationUpdatesAsync: (name?: string) => mockHasStarted(name),
  // ...
}));
```

**Critical rule:** Variable names referenced inside `jest.mock()` factories
MUST start with `mock` — Jest hoists `jest.mock()` calls above imports,
and the hoist-guard only permits closures over `mock*` identifiers.
This is encoded in the test file header:

> "Variable names prefixed with `mock` are allowed inside jest.mock() factories
> (Jest hoists jest.mock to the top of the file before imports)."

**Mocking transitive heavy modules** — when the unit under test imports
something that transitively pulls SQLite / Mapbox / MMKV, stub those
modules to no-ops:

```ts
// apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts:42-46
// Mock activity ingestRawPoint (defineTask is a no-op above, but the module imports
// state/activity which transitively imports SQLite + other heavy modules). Stub it
// to a no-op to keep the adapter unit-test isolated.
jest.mock('../state/activity', () => ({
  ingestRawPoint: jest.fn(),
}));
```

**Mocking the design system** to avoid MMKV native dependency:

```ts
// apps/mobile-rn/src/__tests__/Toast.test.tsx:9-14
// Mock design barrel: реальный barrel импортирует ThemeProvider → MMKV (нативный
// модуль, не работает под jest-expo). Возвращаем минимально-достаточный
// useTheme stub — Toast.tsx читает `t.lime` и `t.text`.
jest.mock('../design', () => ({
  useTheme: () => ({ lime: '#C6F560', text: '#FFFFFF' }),
}));
```

**Hand-rolled fakes for collaborators** mirror the Go style — return an
object satisfying the interface plus extra spy-tracking fields:

```ts
// apps/mobile-rn/src/__tests__/SessionManager.test.ts:41-64
function makeMockRepo(): SessionRepo & { __calls: string[] } {
  const calls: string[] = [];
  return {
    createSession: jest.fn((s) => { calls.push(`createSession:${s.id}`); }),
    finalizeSession: jest.fn((sid) => { calls.push(`finalizeSession:${sid}`); }),
    // ...
    __calls: calls,
  };
}
```

**Mock reset patterns:**

```ts
// apps/mobile-rn/src/__tests__/ExpoLocationAdapter.test.ts:53-58
beforeEach(() => {
  mockStartLocationUpdates.mockClear();
  mockStopLocationUpdates.mockClear();
  mockHasStarted.mockReset();
  mockHasStarted.mockImplementation(() => Promise.resolve(true));
});
```

**What to mock:**
- Native modules (`expo-*`, `@rnmapbox/maps`, `react-native-mmkv`)
- Navigation hooks (`useNavigation`, `useRoute`)
- Transitive heavy state stores that pull SQLite/MMKV
- HTTP/network calls (none currently exercised — happens in
  integration tests `services/backend/...`)

**What NOT to mock:**
- Pure-function domain logic — exercise it directly
- Pipeline filters — exercise the real classes against constructed `Point` arrays
- Geometry / projection utilities

## SQLite Testing

`apps/mobile-rn/__mocks__/expo-sqlite.ts` is a Jest auto-mock backed by
`better-sqlite3`. It implements only the sync API surface that the storage
layer actually uses (`openDatabaseSync`, `execSync`, `runSync`,
`getFirstSync`, `getAllSync`, `prepareSync().executeSync()/finalizeSync()`,
`withTransactionSync`).

**Why the shim exists:** the `jest-expo` probe-test against the real
`expo-sqlite` returns `Cannot find module 'expo-asset'` (RESEARCH.md
§Pitfall 8). The shim sidesteps this without contaminating production code.

**File:** `apps/mobile-rn/__mocks__/expo-sqlite.ts:1-94`
**Usage:** Automatic — Jest loads `__mocks__/<module>` when a test imports
that module. `apps/mobile-rn/src/__tests__/expoSqlite.probe.test.ts`
verifies the shim works end-to-end.

## Snapshot Testing

Used sparingly for screen visual contracts. See
`apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx:1-19`:

> "RunDetailsScreen — snapshot regression test (Phase 1 / PHASE1-09).
> Покрывает D-20 + D-21 + D-22 (CONTEXT.md):
>   D-20 — Summary screen already implemented; lock visual contract в snapshot
>   D-21 — branch `closureFired && areaM2 !== null` рендерит ПЛОЩАДЬ tile +
>          ZoneLayer (closed polygon mapping)
>   D-22 — GPX share button присутствует"

**Stability discipline** — explicitly stub time-zone-dependent
APIs so snapshots are reproducible across CI / dev machines:

```ts
// apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx:20-24
// Stability: `Date.prototype.toLocaleString` зависит от TZ хоста ...
// Подменяем toLocaleString на детерминированный stub — snapshot стабилен
// независимо от TZ CI / dev-машины.
const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (this: Date, _locale?): string {
  return this.toISOString().replace('T', ', ').replace(/\.\d{3}Z$/, ' (UTC)');
};
```

**When to add a snapshot:** screen-level rendering with non-trivial
branching that is hard to assert structurally (e.g. area-tile present
vs absent). Do NOT snapshot pure-function output — assert specific values.

Snapshots live in `apps/mobile-rn/src/__tests__/__snapshots__/`.

## Async + Timer Testing

**Fake timers** — used for any UI component that runs animation /
timeout-based state machines:

```ts
// apps/mobile-rn/src/__tests__/Toast.test.tsx:18-24
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});
```

Drive time forward inside `act(() => { jest.advanceTimersByTime(3500); })`.

**Async promise testing** — `async/await` directly inside `it`. Race
conditions in singleflight / cache tests use real timeouts (`time.Sleep`
in Go, `await new Promise(r => setTimeout(...))` is rare but acceptable
for short tests).

## Coverage Targets

### Documented targets (`CLAUDE.md`)

- **GPS pipeline** — 80%+ line coverage required
  (`apps/mobile-rn/src/pipeline/`)
- **Area calculator** — 90%+ line coverage required
  (`apps/mobile-rn/src/domain/AreaCalculator.ts`,
  `apps/mobile-rn/src/util/geo.ts`, `apps/mobile-rn/src/util/douglasPeucker.ts`,
  `apps/mobile-rn/src/util/selfIntersection.ts`)

### Enforcement

**Currently advisory, NOT gating.** Coverage is collected and posted
to GitHub Step Summary (`.github/workflows/backend-ci.yml:54-56`), but
there is no `--coverage --threshold` enforcement either side. PRs that
drop coverage below documented targets in pipeline/area code SHOULD be
blocked by reviewer, not by CI.

### How to check locally

**Mobile:**
```bash
cd apps/mobile-rn
npm run test:coverage
# Open coverage/lcov-report/index.html
# Drill into src/domain/AreaCalculator.ts.html and src/pipeline/*
```

**Backend:**
```bash
cd services/backend
make test-coverage
# Per-module summaries printed at end:
go tool cover -func=coverage-identity.out
go tool cover -func=coverage-pkg.out
```

## Test Categories

### Unit tests

Dominant. Pure-function tests + DI'd-fake collaborators. Examples:

- `AreaCalculator.test.ts` — 5 cases covering edge geometry + warnings
- `pipeline.test.ts` — per-filter coverage (AccuracyFilter, JumpFilter,
  KalmanFilter, MinSegmentFilter, PauseDetector)
- `auth_test.go` — `Register`, `Login`, `Refresh`, `Logout` happy + edge
- `parse_test.go` — table-driven semver parser
- `rollout_test.go` — deterministic FNV-1a hashing + statistical
  distribution (100k synthetic users, ±1% band)
- `cache_test.go` — TTL + singleflight coalescing under concurrency

### Integration tests

**Go:** Postgres-backed tests gated on `PG_TEST_URL` (skip if unset).
Live in same package as unit tests; identified by helper-prefix
`mustTestPool(t)` / `mustResetSchema(t, pool)` (see
`services/backend/pkg/featureflags/featureflags_test.go:18-30`).

CI currently does NOT spin up Postgres for these; they run locally
when `PG_TEST_URL` is exported (planned containers in Phase 4 follow-up).

**Mobile HTTP-server tests:** `httptest.NewServer` + `http.Post` against
in-memory `memory.NewUserRepo()`. End-to-end through the HTTP layer
without touching real DB. See `identity/internal/handler/http_test.go`.

### E2E tests

**None at present.** No Detox / Maestro / Playwright wired into the
mobile bundle. End-to-end behaviour is covered by field protocol drills
(`tests/FIELD_PROTOCOL.md`, `tests/runs/`) — manual GPS verification
walks, not automated.

## CI Integration

**Trigger:** `.github/workflows/backend-ci.yml:8-26` runs on push to
`main` and on PR with matching path filters.

**Jobs that gate merge (8 jobs, names are a contract — see
`backend-ci.yml:3-5`):**

| Job | What it does | Blocks merge on |
|-----|--------------|-----------------|
| `Test (Go 1.25)` | `go test -race -coverprofile=coverage.out ./...` per service (9 matrix) | Test failure |
| `Lint (golangci-lint v2)` | golangci-lint v2.5.0 per module | Lint failure |
| `SAST (gosec)` | `gosec -severity high ./...` per module | HIGH findings (D-10) |
| `Vuln (govulncheck)` | govulncheck per module | Any vuln (D-10) |
| `SAST (semgrep)` | p/golang + p/owasp-top-ten, severity ERROR | ERROR findings (D-10) |
| `Secrets (gitleaks + trufflehog — PR diff)` | PR-diff scan only | Any secret detection |
| `Docker build (no push, verify)` | Build + Trivy scan per service (8 matrix) | HIGH/CRITICAL CVE not in `.trivyignore.yaml` |
| `Guard (no :latest)` | `grep` for `:latest` tags in workflows/compose | Any `:latest` reference |

**Coverage** is reported into `$GITHUB_STEP_SUMMARY` per service
(see `backend-ci.yml:54-56`), not enforced as a hard gate.

**Mobile tests** do NOT run in CI yet (no `mobile-ci.yml` workflow
present). Run locally before push. This is a known gap; see
`CONCERNS.md` if it has been mapped, otherwise add the workflow in a
future quality phase.

## Common Patterns Reference

### Async / promise testing (TypeScript)

```ts
it("setSamplingMode('paused') passes Balanced + distanceInterval 50", async () => {
  const adapter = new ExpoLocationAdapter();
  await adapter.start();
  await adapter.setSamplingMode('paused');
  expect(mockStartLocationUpdates).toHaveBeenCalledWith(
    TASK_NAME,
    expect.objectContaining({ accuracy: 3, distanceInterval: 50 }),
  );
});
```

### Error-path testing (Go)

```go
// Negative case via errors.Is — never bare equality
_, _, err := s.Login(ctx, "nobody@b.com", "password123", "")
if !errors.Is(err, domain.ErrInvalidCredentials) {
    t.Errorf("expected ErrInvalidCredentials, got %v", err)
}
```

### Statistical assertion (Go)

```go
// services/backend/pkg/featureflags/rollout_test.go:58-...
func assertDistributionInBand(t *testing.T, percent int, tolerance float64) {
    t.Helper()
    const N = 100_000
    // ... compute fraction over N synthetic user IDs
    // assert within `percent ± tolerance`
}
```

### Geometric assertion (TypeScript)

```ts
// 5% tolerance band for any GPS-projection-derived value
expect(r.areaM2).toBeGreaterThan(expected * 0.93);
expect(r.areaM2).toBeLessThan(expected * 1.02);
```

### Tag-and-cleanup HTTP server (Go)

```go
srv := httptest.NewServer(h.Routes())
t.Cleanup(srv.Close)
```

### Replace-and-restore global (TypeScript)

```ts
const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (...) { ... };
// (afterAll(() => { Date.prototype.toLocaleString = originalToLocaleString; }) recommended)
```

---

*Testing analysis: 2026-05-18*
