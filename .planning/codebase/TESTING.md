# Testing Patterns

**Analysis Date:** 2026-05-23

This codebase has three distinct test surfaces: Jest for the Expo RN mobile app, `go test` for the Go backend monorepo, and a `bash` smoke-test family in `.planning/phases/*/evidence/` that verifies release-signing infra. Each has its own conventions; this file documents all three. **Note:** despite the project-context mention of Vitest + RN Testing Library / testify + gomock / msw, the actual stack on disk is **Jest + RN Testing Library** on mobile and **stdlib `testing` + `httptest`** on backend — no Vitest, no testify usage in test code, no gomock, no msw. Mocks are hand-rolled.

## Test Framework

### Mobile (`apps/mobile-rn/`)

**Runner:**
- Jest `^29.7.0` with the `jest-expo` preset (`jest-expo ~54.0.0`).
- Config: `apps/mobile-rn/jest.config.js`.
- `@testing-library/react-native ^13.3.3` for component tests.
- TypeScript: handled by `jest-expo` preset (Babel-based transform).

**Config highlights (`apps/mobile-rn/jest.config.js`):**
```js
{
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [/* allow-list for RN / Expo / Mapbox / Sentry / SVG */],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
}
```

**Run commands (`apps/mobile-rn/package.json:12-14`):**
```bash
npm test                # jest
npm run test:coverage   # jest --coverage
npm run typecheck       # tsc --noEmit
npm run lint            # eslint .
```

### Backend (`services/backend/`)

**Runner:**
- Stdlib `testing` package — `go test` only.
- Go 1.25 (pinned in `.golangci.yml:13` and `.github/workflows/backend-ci.yml:48`).
- Assertions are hand-written: `if got != want { t.Fatalf(...) }` / `t.Errorf(...)`. **No `stretchr/testify` is imported by test code** despite being present in some `go.sum` files (transitive dep).
- `httptest.NewServer` / `httptest.NewRecorder` for HTTP-layer tests (`identity/internal/handler/http_test.go`, `pkg/observability/debug_session_middleware_test.go`, etc.).

**Run commands (`services/backend/Makefile:61-73`):**
```bash
make test               # per-module: cd pkg && go test ./...; cd identity && go test ./...; ...
make test-coverage      # adds -coverprofile=... per module + go tool cover -func | tail -1
```

In CI (`.github/workflows/backend-ci.yml:35-56`):
```bash
go test -race -coverprofile=coverage.out ./...
go tool cover -func=coverage.out | tail -1 >> $GITHUB_STEP_SUMMARY
```

### Smoke scripts (`.planning/phases/*/evidence/`)

**Runner:**
- `bash` shell scripts with `set -euo pipefail` (or `set -uo pipefail` for the umbrella runner that needs to keep going).
- Shared assertion helper `must NAME EXPECTED ACTUAL [DETAIL]` is **redefined verbatim in each script** (no shared library) — pattern lives in `smoke-keystore-generated.sh:14-18`, `smoke-sops-roundtrip.sh:18-22`, `smoke-sha256-captured.sh:10-14`:
  ```bash
  must() {
    local name="$1" expected="$2" actual="$3" detail="${4:-}"
    [ "$actual" = "$expected" ] || { echo "❌ ${name}: expected '${expected}', got '${actual}' ${detail}"; exit 1; }
    echo "✓ ${name} → ${actual}"
  }
  ```
- Exit-code contract (uniform across the family):
  - `0` — smoke green.
  - `1` — smoke red (assertion failed).
  - `2` — prerequisite missing OR Wave-0 stub not yet implemented.
- Umbrella runner `smoke-roundtrip.sh` invokes every sibling smoke, classifies each result, and returns `0` only when all are green; returns `2` when any sub-smoke is still in stub state.

## Test File Organization

**Mobile — centralized under `apps/mobile-rn/src/__tests__/`:**

Tests are NOT co-located next to source files. All Jest tests live in `apps/mobile-rn/src/__tests__/<UnitName>.test.{ts,tsx}`. Example census (40+ files):
- `pipeline.test.ts` — GPS filters
- `AreaCalculator.test.ts` — closure-area math
- `SessionManager.test.ts` — domain session lifecycle
- `gpx.test.ts`, `geo.test.ts`, `streak.test.ts`, `records.test.ts`, `gamification.test.ts`, `metrics.test.ts`, `splits.test.ts`, `calories.test.ts`, `walletDomain.test.ts`, `training.test.ts`, `social.test.ts`, `moderation.test.ts`, `athlete.test.ts`, ...
- Hook tests (`*.test.tsx`): `useClosureFeedback.test.tsx`, `useLayerVisibility.test.tsx`, `useTrackerCamera.test.tsx`, `usePauseUI.test.tsx`.
- Component / screen tests (`*.test.tsx`): `Toast.test.tsx`, `TrackerLiveScreen.navAfterSave.test.tsx`.
- Snapshot tests: `RunDetailsScreen.snapshot.test.tsx`.
- Probes (env diagnostics, not behavior tests): `expoSqlite.probe.test.ts`, `importSanity.test.ts`.

**Backend — co-located `_test.go` next to the file under test:**
- `services/backend/identity/internal/service/auth_test.go` ↔ `auth.go`
- `services/backend/identity/internal/handler/http_test.go` ↔ `http.go`
- `services/backend/pkg/auth/jwt_test.go` ↔ `jwt.go`
- `services/backend/pkg/observability/debug_session_middleware_test.go` ↔ `debug_session_middleware.go`
- Package tests for HTTP handlers use the `package <name>_test` external-test pattern (see `handler_test.go:1` and `debug_session_middleware_test.go:12`) to verify only the public surface.

**Smoke scripts — co-located under each phase's `evidence/`:**
- `.planning/phases/06-release-signing/evidence/smoke-*.sh` (current Phase 6 set).
- Future phases follow the same convention.

**Naming:**
- Mobile: `<Unit>.test.ts`, hooks/components `<Unit>.test.tsx`, snapshots `<Unit>.snapshot.test.tsx`.
- Backend: `<file>_test.go`.
- Smokes: `smoke-<area>.sh`.

## Test Structure

**Mobile — `describe` / `it` blocks, Russian behavior strings:**

Example pattern (`apps/mobile-rn/src/__tests__/pipeline.test.ts:22-36`):
```typescript
describe('AccuracyFilter', () => {
  it('пропускает точку с accuracy ≤ порога', () => {
    const f = new AccuracyFilter(20);
    expect(f.apply(makePoint({ accuracy: 5 }))).not.toBeNull();
    expect(f.apply(makePoint({ accuracy: 20 }))).not.toBeNull();
  });
  it('отбрасывает с accuracy > порога', () => {
    const f = new AccuracyFilter(20);
    expect(f.apply(makePoint({ accuracy: 25 }))).toBeNull();
  });
});
```

**Test helpers — co-located in the test file as `function` declarations** (NOT a shared `testUtils` module):
- `makePoint(opts)` constructor — appears in multiple files, copy-paste-adapted (`pipeline.test.ts:9-20`, `SessionManager.test.ts:16-27`, etc.). Comments cite the original: `// Mock-репо паттерн адаптирован из walletStore.test.ts:8-45. makePoint-хелпер заимствован из pipeline.test.ts:1-20.`
- Mock-repo factories: `makeMockRepo()` returns an interface-shaped object whose methods are `jest.fn(...)` instrumented with a `__calls: string[]` audit trail (`SessionManager.test.ts:41-64`).

**Backend — table-less Go tests, `_test` external package for handlers:**

Service-layer pattern (`services/backend/identity/internal/service/auth_test.go:13-23,25-40`):
```go
func newTestService(t *testing.T) *AuthService {
    t.Helper()
    signer, err := auth.NewSigner([]byte("test-secret-must-be-at-least-32-bytes-long-for-hs256"))
    if err != nil { t.Fatal(err) }
    s := NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
    s.bcryptC = 4   // lower bcrypt cost for fast tests
    return s
}

func TestRegister_HappyPath(t *testing.T) {
    s := newTestService(t)
    u, pair, err := s.Register(context.Background(), "  Alice@Example.COM  ", "password123", "Alice", "test")
    if err != nil { t.Fatalf("Register: %v", err) }
    if u.Email != "alice@example.com" { t.Errorf("email not normalized: %q", u.Email) }
    ...
}
```

HTTP-handler pattern (`identity/internal/handler/http_test.go:19-47`):
```go
func newTestServer(t *testing.T) (*httptest.Server, *service.AuthService) {
    t.Helper()
    signer, _ := auth.NewSigner([]byte("test-secret-..."))
    svc := service.NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
    h := handler.NewAuthHandler(svc, nil, signer, slog.New(slog.NewTextHandler(io.Discard, nil)), false)
    srv := httptest.NewServer(h.Routes())
    t.Cleanup(srv.Close)
    return srv, svc
}

func postJSON(t *testing.T, url string, body any) *http.Response { ... }
func decode(t *testing.T, r *http.Response, dst any) { ... }
```

**`t.Parallel()` usage:**
- Used for stateless tests (`debug_session_middleware_test.go:102,125,145,165,189`).
- Avoided for tests that mutate package-level state (e.g. `featureflags_test.go` Postgres-backed tests use `mustResetSchema`).
- `paralleltest` linter is **deferred to v1.0.1** (`.golangci.yml:42`) — not currently enforced.

**Smoke patterns:**
```bash
set -euo pipefail
for bin in keytool grep awk; do
  command -v "$bin" >/dev/null 2>&1 || { echo "❌ pre-req missing: $bin"; exit 2; }
done
must() { ... }   # redefined verbatim per script
# ... assertions ...
must "alias-present-in-roundtrip" "1" "$LISTING"
must "sha256-roundtrip-matches-original" "$SHA_ORIG" "$SHA_RT"
echo "🎉 smoke green: SOPS round-trip → base64 -d → keytool lists alias + SHA-256 matches"
```

## Mocking

**Mobile — hand-rolled `jest.mock()` factories, no msw:**

`__mocks__/` directory at `apps/mobile-rn/__mocks__/` contains a single auto-loaded mock: `expo-sqlite.ts` (~94 LOC) shims the sync `expo-sqlite` API on top of `better-sqlite3`. This is the only file in `__mocks__/`.
- Rationale captured in the file header (`__mocks__/expo-sqlite.ts:1-11`): `jest-expo` cannot load the real `expo-sqlite` because of `Cannot find module 'expo-asset'` import chain.

**Inline `jest.mock(...)` factories per test file** for everything else:

Design barrel stub (`__tests__/Toast.test.tsx:12-14`):
```typescript
jest.mock('../design', () => ({
  useTheme: () => ({ lime: '#C6F560', text: '#FFFFFF' }),
}));
```

Navigation + map mocks for snapshot tests (`__tests__/RunDetailsScreen.snapshot.test.tsx:34-52`):
```typescript
const mockGoBack: jest.Mock = jest.fn();
const mockPopToTop: jest.Mock = jest.fn();
const mockNavReplace: jest.Mock = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, popToTop: mockPopToTop, replace: mockNavReplace }),
  useRoute: () => ({ params: { sessionId: '1' } }),
}));
jest.mock('../map', () => ({
  HistoryTerritoryLayer: () => null,
  LocationPuckLayer: () => null,
  MapboxView: ({ children }: any) => children ?? null,
  TrackLayer: () => null,
  ZoneLayer: () => null,
}));
```

**Zustand-mock pattern** (`__tests__/RunDetailsScreen.snapshot.test.tsx:11-14`):
- Module-level `mockState` + `getState()` returns the same `mockState`. Mock-names MUST begin with `mock` (verbatim string prefix) to pass Jest's hoist-guard for `jest.mock` factories. Pattern is canonized in Plan 02 SUMMARY.

**Fake timers** (`__tests__/Toast.test.tsx:18-24`):
```typescript
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });
// ... in test:
act(() => { jest.advanceTimersByTime(3500); });
```

**TZ-stable snapshots** (`__tests__/RunDetailsScreen.snapshot.test.tsx:20-24`):
```typescript
const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function (this: Date, _locale?: string | string[]): string {
  return this.toISOString().replace('T', ', ').replace(/\.\d{3}Z$/, ' (UTC)');
};
```

**Backend — interface seams + in-memory implementations, no gomock:**

- Test seams are **interfaces declared at the consumer**, not mock-generated stubs. Example: `FeatureFlagChecker` in `services/backend/pkg/observability/debug_session_middleware.go:51-56` is satisfied in tests by a tiny `stubFFStore` struct (`debug_session_middleware_test.go:30-38`):
  ```go
  type stubFFStore struct {
      enabled bool
      calls   atomic.Int32
  }
  func (s *stubFFStore) IsTesterDebugEnabled(_ context.Context, _ string) bool {
      s.calls.Add(1)
      return s.enabled
  }
  ```
- For repository-layer tests, `services/backend/identity/internal/repository/memory/memory.go` provides thread-safe in-memory implementations of `UserRepo` / `RefreshTokenRepo` used by service-layer tests.
- Postgres-backed tests gate on `PG_TEST_URL` env and `t.Skip` when unset (`featureflags_test.go` comment `RESEARCH.md §Pitfalls #1`).

**What to mock:**
- External SDKs at the adapter boundary (Mapbox, navigation, design system / MMKV-backed theme).
- Native modules unavailable under `jest-expo` (SQLite — via `__mocks__/expo-sqlite.ts`; MMKV — stubbed per-test via `jest.mock('../design', ...)`).
- Time (`jest.useFakeTimers`), date-locale (`Date.prototype.toLocaleString` stub).
- Backend external dependencies: signer (used as real instance with test secret), feature-flag store (stub), repositories (in-memory).

**What NOT to mock:**
- Pure domain code (`AreaCalculator`, `Pipeline` filters, `ClosureDetector`, `gpx` serializer) — tested with real inputs against real outputs.
- The pipeline `Filter` chain and `SessionManager`'s state machine — tested as integrated units with mock `SessionRepo` only.

## Fixtures and Factories

**Mobile — `function makePoint(opts)` pattern** (no `factory.ts` module):
- Each test file declares its own constructor at top of file. Slight variants: `pipeline.test.ts:9-20` vs `SessionManager.test.ts:16-27` vs `AreaCalculator.test.ts:3-14` (which uses `p(latitude, longitude)` for terseness).
- `RawPoint` vs `Point` distinction handled by separate helpers (`makeRaw` / `makePoint` in `SessionManager.test.ts:16-39`).

**Lint-failure fixtures** (intentional ESLint trip-wires):
- `apps/mobile-rn/src/__fixtures__/` — excluded from default ESLint runs via `ignores: ['src/__fixtures__/**']` in `eslint.config.js:29`.
- Exercised in CI via `npx eslint --no-ignore -- src/__fixtures__/...` to verify the token-secret guard (PHASE1-13 / D-33) actually fires on `EXPO_PUBLIC_*_SECRET` and `sk\..*` literals.

**Backend — no `testdata/` directories in active modules.** Test data is inlined as string literals (JWT secrets, test emails, etc.).

## Coverage

**Mobile (`apps/mobile-rn/coverage/`):**
- `npm run test:coverage` produces `coverage/lcov.info`, `coverage/clover.xml`, `coverage/coverage-final.json`, `coverage/lcov-report/` (HTML).
- `collectCoverageFrom` in `jest.config.js:8-12` includes `src/**/*.{ts,tsx}`, excludes `*.d.ts` and `index.ts` barrels.
- No coverage threshold enforced in `jest.config.js`. Targets (per `CLAUDE.md` §Что НЕ делать никогда):
  - **80%+ general.**
  - **90%+ for `src/pipeline/` and `src/domain/AreaCalculator.ts`** (the two units called out by name in `CLAUDE.md`).
- No CI enforcement step yet — coverage is informational.

**Backend (`services/backend/`):**
- Per-service `go test -coverprofile=coverage.out ./...` in CI (`.github/workflows/backend-ci.yml:54`). Result piped to `$GITHUB_STEP_SUMMARY` via `go tool cover -func=coverage.out | tail -1`.
- Local: `make test-coverage` writes `coverage-pkg.out`, `coverage-identity.out`, `coverage-activity-sync.out` at backend root (`services/backend/Makefile:66-73`).
- No coverage threshold gate — informational only.

## Test Types

**Unit tests:**
- Domain pure-logic: pipeline filters, area calculator, closure detector, GPX serializer, splits, streaks, records, gamification, calories, training plan generator, wallet domain, social moderation.
- Go service-layer business logic (Auth Register/Login/Refresh/Logout) against in-memory repos.

**Integration tests:**
- HTTP-level via `httptest.NewServer(h.Routes())` exercising full handler chain (`identity/internal/handler/http_test.go`, `activity-sync/internal/handler/http_test.go`).
- Middleware chains tested end-to-end with stub deps: `debug_session_middleware_test.go` boots a signer + stub FF store + real `httptest.NewRecorder`.
- Postgres-backed featureflag store tests run against a real Postgres if `PG_TEST_URL` is set; `t.Skip` otherwise.

**Snapshot tests:**
- `RunDetailsScreen.snapshot.test.tsx` is the canonical example. Establishes the pattern for future screen tests (Plans 06/07 — RegionPickerScreen etc.). Heavy reliance on inline `jest.mock` for design barrel, navigation, map components.

**Hook tests:**
- `useClosureFeedback`, `useLayerVisibility`, `useTrackerCamera`, `usePauseUI` — render a tiny consumer via `@testing-library/react-native` and exercise the hook.

**Smoke tests (release signing):**
- `.planning/phases/06-release-signing/evidence/smoke-*.sh` verify operational invariants (keystore SHA-256 captured to evidence file with two bands; SOPS decrypt → base64 → keytool round-trip preserves SHA-256; ASC API key parses as EC private key).
- Run manually during phase execution; not in CI yet (Phase 6 still mid-execution per `STATE.md`).

**E2E tests:**
- None. The closed-beta scope explicitly excludes E2E (per ADR-0011 lean-scope reset).

## Common Patterns

**Async testing (TS):**
```typescript
it('start() запускает adapter и подписывается на updates', async () => {
  await manager.start('run');
  expect(adapter.startCalls).toBe(1);
});
```

**Error testing (Go):**
```go
_, _, err := s.Register(ctx, "a@b.com", "password456", "", "")
if !errors.Is(err, domain.ErrEmailAlreadyExists) {
    t.Errorf("expected ErrEmailAlreadyExists, got %v", err)
}
```

**HTTP status assertions (Go):**
```go
if resp.StatusCode != http.StatusUnauthorized {
    t.Errorf("expected 401 without auth header, got %d", resp.StatusCode)
}
```

**Tolerance / range assertions (TS — physical-units tests):**
```typescript
expect(r.areaM2).toBeGreaterThan(38_000);
expect(r.areaM2).toBeLessThan(42_000);   // ±5% tolerance on 200×200m square
```

**Smoke regex banding** (assert evidence-file structure rather than the value itself):
```bash
must "sha256-colon-band-present" "1" "$(grep -cE '^[A-F0-9]{2}(:[A-F0-9]{2}){31}$' "$F")"
must "sha256-bare-band-present"  "1" "$(grep -cE '^[A-F0-9]{64}$' "$F")"
must "sha256-length-95" "95" "${#SHA_FROM_EVIDENCE}"
```

## CI Integration

**Workflows (`.github/workflows/`):**
- `backend-ci.yml` — PR + push-to-main pipeline for the Go backend. Jobs (each name is a verbatim contract for `Plan 04-05` branch-protection JSON, including em-dash U+2014):
  - `Test (Go 1.25)` — matrix over 9 services, `go test -race -coverprofile=coverage.out`.
  - `Lint (golangci-lint v2)` — per-module loop with shared `.golangci.yml`.
  - `SAST (gosec)` — `gosec -severity high`, fail on HIGH.
  - `Vuln (govulncheck)` — per-module.
  - `SAST (semgrep)` — `p/golang` + `p/owasp-top-ten`, `--severity ERROR`.
  - `Secrets (gitleaks + trufflehog — PR diff)` — only on `pull_request`. Full-history scan runs in `secret-scan-full.yml` cron.
  - `Docker build (no push, verify)` — matrix build + Trivy image scan (`HIGH,CRITICAL`, `exit-code: '1'`).
  - `Guard (no :latest)` — negative grep over `.github/workflows/*.yml` + `docker-compose.prod.yml` (excluding comment lines).
  - `PII Audit (slog grep)` — runs `bash scripts/pii_audit.sh` per D-12 / D-14.
  - `Cardinality Probe (Prom labels)` — boots services via docker-compose, runs `scripts/cardinality_probe.py` to assert no forbidden labels + ≤1000 series per metric family.
- `backend-cd.yml` — backend deployment pipeline.
- `android-release.yml` — tag-triggered EAS build (Phase 7 / BUILD-01).
- `secret-scan-full.yml` — full-history gitleaks + trufflehog cron.

**Mobile CI:** No dedicated workflow yet — mobile tests run locally via `npm test` + `npm run lint` + `npm run typecheck`. Wiring planned in subsequent phases.

**Branch protection:** Required checks reference job `name:` strings verbatim (including em-dash characters) — see comment at `.github/workflows/backend-ci.yml:1-6`.

## Smoke-Test Conventions

**Where:** `.planning/phases/<phase>/evidence/smoke-*.sh`. Current Phase 6 set in `.planning/phases/06-release-signing/evidence/`:
- `smoke-roundtrip.sh` — umbrella runner. `set -uo pipefail` (NOT `-e`) so it can collect all child results. Returns `0` only if all sub-smokes are green; returns `2` if any sub-smoke is still in stub state; returns `1` if any sub-smoke failed.
- `smoke-keystore-generated.sh` — asserts `keystore-sha256.txt` evidence file structure (two bands: colon-form `XX:XX:...`, bare-form 64-hex).
- `smoke-sops-roundtrip.sh` — decrypts SOPS `.secrets/prod/mobile-signing.yaml`, base64-decodes `android.keystore_base64`, runs `keytool -list`, confirms SHA-256 matches the evidence file. Uses `mktemp -d` + `trap 'rm -rf "$TMP"; unset VER_PASS' EXIT` for cleanup.
- `smoke-sha256-captured.sh` — internal consistency: file exists, both bands present, bare form ≡ colon-form with colons stripped.
- `smoke-ios-cert-roundtrip.sh`, `smoke-ios-provprofile.sh`, `smoke-asc-api-key.sh` — Wave-0 stubs (exit `2`, awaiting Plan 06-02 implementation).

**Conventions:**
- Header docstring cites phase, plan, task, validation row (e.g. `# Phase 6 / Plan 06-01 Task 3 — smoke: SOPS → base64 → keystore round-trip`, `# Verifies VALIDATION row 06-01-02.`).
- Document exit-code contract in header.
- Prerequisite check loop before any work: `for bin in sops yq keytool base64 awk grep; do command -v "$bin" >/dev/null || { echo "❌ pre-req missing: $bin"; exit 2; }; done`.
- Hand-roll the `must` helper at top — never shared, never refactored (deliberate per-script self-containment for `bash <file>` standalone runs).
- Output emojis as status: `❌`, `✓`, `🎉`, `⏳` (umbrella pending banner).
- Exit `2` for both prerequisite missing and stub-not-implemented — the umbrella runner classifies these separately from real failures.

---

*Testing analysis: 2026-05-23*
