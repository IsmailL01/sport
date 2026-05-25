# Testing Patterns

**Analysis Date:** 2026-05-25

The repo has two distinct test surfaces:
- **Mobile (Jest + RN Testing Library):** **64 test files, 686 individual cases, 2 snapshots**, all green. Distributed across top-level `apps/mobile-rn/src/__tests__/` (~47 files) + module-local `<module>/__tests__/` directories (17 files). **Unchanged since prior refresh** — social-yolo-pass session 1 did not touch mobile (next session 2 will add mobile + tests).
- **Backend (Go `testing` + `httptest` + in-memory repos):** **23 `*_test.go` files** across `services/backend/`, executed per-module via the `backend-ci` matrix (race detector enabled). **Unchanged since prior refresh** — social-yolo-pass session 1 shipped 4 new Go files in `social-graph` + `messaging` but **deliberately deferred test additions** to session 2 (see "Test growth" below).

In addition, `.planning/phases/<NN-…>/evidence/smoke-*.sh` shell smokes exercise cross-language and CI-shape contracts that Jest/Go-test can't reach.

**Test growth since prior refresh (commit `ac76df0` 2026-05-24 → today):**

| Source | Tests added | Files added |
|---|---|---|
| `chat-polish-pass` (quick task 2026-05-25 AM) | +31 (14 timeFormat + 17 avatarInitials) | 2 new test files |
| `tracker-live-polish-pass` (quick task 2026-05-25 midday) | +17 (6 PauseDetector warmup + 9 SessionManager time-freeze + 2 pause-flow integration) | 3 new test files |
| `social-yolo-pass` session 1 (quick-XL 2026-05-25 PM, commits `a827bc5..830b8db`) | **+0 (intentionally deferred)** | 0 new test files |
| **Total delta** | **+48** | **+5 files (638 → 686 tests, 59 → 64 suites)** |

**Session 1 of social-yolo-pass — deliberate test-deferral pattern (NEW):**

The XL multi-session quick-task at `.planning/quick/20260525-social-yolo-pass/` shipped Phase 10 backend in session 1 (4 production Go files: migration `0022_friend_requests`, `social-graph/internal/service/friend_requests.go`, `social-graph/internal/repository/.../friend_requests_repo.go`, `messaging/internal/permissions/friendship_gate.go`) with **zero new `*_test.go` files**.

The CONTEXT.md progress log explicitly captures this as a deliberate decision, not an oversight:
> "No new Go tests yet — added in session 2 or 3 once mobile lands and full e2e smoke is needed."

Rationale:
1. **Smoke surface is mobile + backend together** — meaningful coverage for friend-requests requires the mobile client posting to `/friend-requests/{receiverId}`, then the receiver mobile client accepting it, then the messaging service refusing/allowing the DM. A unit test of `SendFriendRequest` alone would re-prove the behavior matrix already documented in the function doc-comment without exercising the cross-service `messaging → social-graph` SQL coupling.
2. **Test-deferral is now an explicit session-checklist item** — the next session 2 starts with "Mobile friends module" but session 3 closeout includes "backend test gap closure for Phase 10" before SUMMARY.md ships.
3. **Lint + build + govulncheck remain green** — `golangci-lint v2.5: 0 issues across both services`, both services compile clean, no new vulns. The deferred work is test coverage, not quality gates.

This is opposite the TIGHT-pass cadence (chat-polish-pass + tracker-live-polish-pass both added tests in every feature commit). When deferring, the session checklist MUST flag it explicitly so reviewers know it's deliberate, and the deferred tests MUST land before SUMMARY.md.

## Test Framework

**Mobile runner:**
- **Jest 29.7.0** with **jest-expo ~54.0.0** preset
- Config: `apps/mobile-rn/jest.config.js`
- Assertion library: built-in `expect` + `@testing-library/react-native 13.3.3`

**Mobile config highlights** (`apps/mobile-rn/jest.config.js`):
```js
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  transformIgnorePatterns: [
    // @noble/ed25519 + @noble/hashes are ESM-only; Jest needs to transform them
    // (Plan 08-01 Task 5 introduced these deps for manifest signature verification).
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-clone-referenced-element|@sentry/.*|sentry-expo|native-base|react-native-svg|@rnmapbox/.*|@noble/.*)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
  ],
};
```
- `transformIgnorePatterns` allowlist added `@noble/*` in Plan 08-01 Task 5 (Ed25519 deps are ESM-only and need Babel transform)
- Barrel `index.ts` excluded from coverage
- **No `coverageThreshold`** set — 80%+ / 90%+ targets in `CLAUDE.md` are policy, not enforced

**Backend runner:**
- Standard Go `testing` package + `net/http/httptest` for handler tests
- In-memory repository implementations (`internal/repository/memory/`) substitute for Postgres in service-level unit tests
- Race detector enabled: `go test -race -coverprofile=coverage.out ./...` (see `.github/workflows/backend-ci.yml:54`)
- Tracked-as-clean: 9 backend modules with golangci-lint v2.5.0 + govulncheck both 0-issue (verified `92fe656` + `69cc8eb` 2026-05-24 / 2026-05-25, re-verified after social-yolo-pass session 1 added Phase 10 code)

**Run Commands:**

Mobile:
```bash
cd apps/mobile-rn
npm test                                                # Run all suites — 686/686 expected
npm run test:coverage                                   # With coverage report
npx jest --testPathPattern='update'                     # Pattern filter (e.g., update module)
npx jest --testPathPattern='SessionManager'             # Multi-file pattern (5 SessionManager-touching files)
npx jest path/to/file.test.ts                           # Single file
npx jest -t 'force-update path'                         # By test-name regex
npm run lint                                            # ESLint
npm run typecheck                                       # tsc --noEmit  ← per-commit gate during quick tasks
```

Backend:
```bash
cd services/backend/<service>
go test -race -coverprofile=coverage.out ./...          # Per-service
go tool cover -func=coverage.out | tail -1              # Coverage summary
```

Smokes (cross-cutting, run from repo root):
```bash
bash .planning/phases/08-closed-beta-distribution/evidence/smoke-manifest-sign-roundtrip.sh
bash .planning/phases/08-closed-beta-distribution/evidence/smoke-mobile-update-flow.sh
bash .planning/phases/08-closed-beta-distribution/evidence/smoke-release-distribute.sh
```

## Test File Organization

**Location pattern (mobile):** TWO co-location styles coexist (both in active use):

1. **Centralized `src/__tests__/` (original, dominant — ~47 files):** Domain / pipeline / util / state / integration tests live in the top-level `apps/mobile-rn/src/__tests__/` (e.g., `pipeline.test.ts`, `AreaCalculator.test.ts`, `geo.test.ts`, `SessionManager.test.ts`, `sessionRepository.integration.test.ts`).
2. **Co-located `<module>/__tests__/` (newer pattern — 17 files):** Module-local tests live beside the source they test:
   - `apps/mobile-rn/src/update/__tests__/` (4 files, 48 cases — Plan 08-01)
   - `apps/mobile-rn/src/vendor/__tests__/` (2 files — Plan 07-03)
   - `apps/mobile-rn/src/state/__tests__/` (2 files: featureflags, forceUpdate)
   - `apps/mobile-rn/src/auth/__tests__/` (apiClient)
   - `apps/mobile-rn/src/util/__tests__/` (version, **timeFormat** — chat-polish-pass)
   - `apps/mobile-rn/src/design/__tests__/` (**avatarInitials** — chat-polish-pass)
   - `apps/mobile-rn/src/ui/screens/__tests__/` (ForceUpdateScreen)
   - `apps/mobile-rn/src/domain/session/__tests__/` (3 files: smoke, **timeFreezing**, **pauseFlow** — tracker-live-polish-pass)
   - `apps/mobile-rn/src/pipeline/filters/__tests__/` (**PauseDetector.warmup** — tracker-live-polish-pass)

**Convention for NEW tests:** Co-located `<module>/__tests__/` is the preferred default for **new** code. The centralized `src/__tests__/` remains for cross-module integration tests + tests added before the co-location convention took hold. Either location is valid; both are picked up by `jest.config.js:7` `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']`.

For Phase 10 + Phase 11 mobile work (`src/modules/friends/` + `src/modules/stories/` landing in social-yolo-pass session 2-3), tests will live at `src/modules/<feature>/<tier>/__tests__/` — e.g., `src/modules/friends/domain/__tests__/`, `src/modules/friends/state/__tests__/`. The modular-layout test placement matches the source code's vertical-slice structure.

**Naming:**
- Unit tests: `<source>.test.ts(x)` — `manifestSchema.test.ts`, `AutostartDialog.test.tsx`, `timeFormat.test.ts`, `avatarInitials.test.ts`
- Feature-specific test variants on same source: `<source>.<feature>.test.ts` — `PauseDetector.warmup.test.ts` (tests new warmup gate; doesn't touch existing PauseDetector behavior), `SessionManager.timeFreezing.test.ts` (tests new `effectiveElapsedMs()` API only), `SessionManager.pauseFlow.test.ts` (integration test wiring PauseDetector + SessionManager together)
- Integration tests: `<source>.integration.test.ts` — `sessionRepository.integration.test.ts`
- Snapshot tests: `<source>.snapshot.test.tsx` — `RunDetailsScreen.snapshot.test.tsx` (snapshots stored in `__snapshots__/<source>.snapshot.test.tsx.snap`)
- Smoke tests outside Jest: `<source>.smoke.test.ts` — `SessionManager.smoke.test.ts`
- Probe tests for environment validation: `<area>.probe.test.ts` — `expoSqlite.probe.test.ts`

**Location pattern (backend):** Go convention — `*_test.go` lives in the same package as the SUT.
- `services/backend/identity/internal/service/auth_test.go` next to `auth.go`
- `services/backend/identity/internal/handler/http_test.go` next to `http.go`
- `services/backend/pkg/observability/*_test.go` for shared infrastructure (7 test files; all golangci-lint v2.5 clean post-`92fe656`)
- **Pending for Phase 10 (deferred):** `services/backend/social-graph/internal/service/friend_requests_test.go` + `services/backend/messaging/internal/permissions/friendship_gate_test.go` — to be added in social-yolo-pass session 2 or 3 alongside mobile-side flow tests

**Smoke shell scripts:** `.planning/phases/<NN-…>/evidence/smoke-*.sh` — one script per cross-cutting concern within a plan. Each script is self-contained, exits non-zero on failure, and is committed alongside the plan it validates.

**Structure:**
```
apps/mobile-rn/
├── __mocks__/                          # Jest auto-mocks (package-root)
│   └── expo-sqlite.ts                  # better-sqlite3 shim
├── src/
│   ├── __tests__/                      # cross-module / top-level tests (~47 files)
│   │   ├── __snapshots__/              # auto-generated Jest snapshots
│   │   ├── pipeline.test.ts
│   │   ├── AreaCalculator.test.ts
│   │   ├── SessionManager.test.ts      # original full-coverage suite
│   │   └── ...
│   ├── __fixtures__/                   # intentional lint-failure fixtures
│   │   └── secret.lint-fixture.ts
│   ├── update/__tests__/               # 4 files, 48 cases (Plan 08-01)
│   ├── vendor/__tests__/               # 2 files (Plan 07-03)
│   ├── state/__tests__/                # featureflags, forceUpdate
│   ├── auth/__tests__/                 # apiClient
│   ├── util/__tests__/                 # version, timeFormat (2 files)
│   ├── design/__tests__/               # avatarInitials (1 file)
│   ├── pipeline/filters/__tests__/     # PauseDetector.warmup (1 file)
│   ├── ui/screens/__tests__/           # ForceUpdateScreen
│   └── domain/session/__tests__/       # SessionManager.smoke + .timeFreezing + .pauseFlow (3 files)
.planning/phases/
└── <NN-slug>/
    └── evidence/
        └── smoke-*.sh                  # one per validated concern
```

## Test Structure

**Suite organization (mobile):**
```typescript
// 1. Module-header comment: phase / plan / task OR quick-task slug + date + strategy
// Phase 8 Plan 08-01 Task 5 — manifestCheck.ts unit tests.
//   OR
// Time-freeze on pause — 2026-05-25 tracker-live-polish-pass.
// Validates that SessionManager.effectiveElapsedMs() freezes the clock
// during pause windows so UI timer doesn't tick while paused.

// 2. Fixtures at module scope (UPPER_SNAKE_CASE)
const VALID_MANIFEST = { ... };
const T0 = new Date(2026, 4, 25, 12, 0, 0).getTime();  // Fixed reference clock

// 3. jest.mock() declarations BEFORE imports (hoisted — see Mocking section)
jest.mock('react-native-mmkv', () => ({ ... }));
jest.mock('../manifestSigning', () => ({ ... }));

// 4. SUT + collaborator imports
import { checkForUpdate } from '../manifestCheck';
import { useForceUpdateStore } from '../../state/forceUpdate';

// 5. Mock-handle retrieval for per-test control (when applicable)
const mockVerify = jest.requireMock('../manifestSigning').verifyManifestSignature as jest.Mock;

// 6. Reset helper + beforeEach
const __reset = () => { ... };
beforeEach(() => {
  __reset();
  jest.useFakeTimers().setSystemTime(T0);  // ← new convention for time-dependent suites
});
afterEach(() => {
  jest.useRealTimers();
});

// 7. describe blocks grouped by scenario
describe('checkForUpdate — optional update path', () => {
  it('shows banner when manifest.version > installed AND ...', async () => { ... });
});
describe('SessionManager.effectiveElapsedMs — time-freeze on pause', () => { ... });
```

**Time-freeze pattern (NEW, tracker-live-polish-pass + chat-polish-pass):**

Two complementary patterns for handling clock-dependent code:

1. **Injectable clock parameter** (preferred for pure functions): function accepts optional `nowMs: number = Date.now()`, tests pass a fixed `NOW`. Reference: `formatChatTime(ts, nowMs)` — `apps/mobile-rn/src/util/timeFormat.ts:22`. Test pattern:
   ```typescript
   // apps/mobile-rn/src/util/__tests__/timeFormat.test.ts:6
   const NOW = new Date(2026, 4, 22, 15, 0, 0).getTime();
   function at(year, month1to12, day, hour=12, min=0) { ... }
   expect(formatChatTime(at(2026, 5, 22, 14, 30), NOW)).toBe('14:30');
   ```
   No `beforeEach` / `setSystemTime` — every call carries its own clock. Cleanest for boundary-case coverage (midnight, prior-year cutoff).

2. **`jest.useFakeTimers().setSystemTime(T0)`** (for stateful methods that read `Date.now()` internally): set the system time before each test, advance with `jest.setSystemTime(T0 + delta)` between assertions. Reference: `SessionManager.timeFreezing.test.ts:60-68`:
   ```typescript
   const T0 = new Date(2026, 4, 25, 12, 0, 0).getTime();
   beforeEach(() => {
     jest.useFakeTimers().setSystemTime(T0);
   });
   afterEach(() => {
     jest.useRealTimers();
   });

   it('FREEZES during active pause — clock stops moving for UI', () => {
     const m = makeManager();
     m.start();
     expect(m.effectiveElapsedMs(T0 + 30_000)).toBe(30_000);
     // Advance system time to T0+30s, then trigger setPaused which reads Date.now()
     jest.setSystemTime(T0 + 30_000);
     m.setPaused(true);
     // Wall clock advances — but timer should remain at 30s
     expect(m.effectiveElapsedMs(T0 + 60_000)).toBe(30_000);
   });
   ```

The two patterns combine in integration tests: SessionManager methods read `Date.now()` internally so `jest.setSystemTime` is required, but assertions pass `T0 + delta` to `effectiveElapsedMs(nowMs)` for explicit control.

**`describe` naming convention:** `<unit> — <scenario>` with em-dash. Russian names are common in pipeline/domain tests (`describe('AreaCalculator.calculateArea')` with `it('квадрат 200×200м (≈40 000 м²) — tolerance 5%')` in `apps/mobile-rn/src/__tests__/AreaCalculator.test.ts`).

**`it` naming convention:** Behavioral assertions in present tense — `'shows banner when …'`, `'rejects a signature when one byte is mutated'`, `'preserves suppressedUntil when same manifest version returns'`, `'FREEZES during active pause — clock stops moving for UI'`, `'emits auto-paused after warmupMs elapses even with no motion'`.

**Parametric tests:** Use `it.each` with a typed cases array — see `apps/mobile-rn/src/vendor/__tests__/oem.test.ts:18-39`:
```typescript
const cases: Array<[string, ReturnType<typeof detectVendor>]> = [
  ['Xiaomi', 'xiaomi'],
  ['Redmi', 'xiaomi'],
  ...
];
it.each(cases)('detects vendor for "%s" → %s', (manuf, expected) => {
  mockState.manufacturer = manuf;
  expect(detectVendor()).toBe(expected);
});
```

**Suite organization (backend Go):**
```go
package service

import (
    "context"
    "errors"
    "testing"

    "github.com/runningecosystem/backend/identity/internal/domain"
    "github.com/runningecosystem/backend/identity/internal/repository/memory"
)

// Construction helper — t.Helper() + low bcrypt cost for speed
func newTestService(t *testing.T) *AuthService {
    t.Helper()
    signer, err := auth.NewSigner([]byte("test-secret-…"))
    if err != nil { t.Fatal(err) }
    s := NewAuthService(memory.NewUserRepo(), memory.NewRefreshTokenRepo(), signer)
    s.bcryptC = 4
    return s
}

func TestRegister_HappyPath(t *testing.T) { ... }
func TestRegister_RejectsInvalidEmail(t *testing.T) {
    s := newTestService(t)
    for _, e := range []string{"", "not-an-email", "@b.com", "a@"} {
        if _, _, err := s.Register(context.Background(), e, "password123", "", ""); err == nil {
            t.Errorf("expected error for email %q", e)
        }
    }
}
```
- Test names: `Test<Function>_<Scenario>` — `TestLogin_WrongPassword`, `TestRefresh_RotatesTokens`
- Sentinel error comparison via `errors.Is(err, domain.ErrInvalidCredentials)` (enforced by `errorlint`)
- `t.Helper()` on construction helpers so error lines point at the caller
- **staticcheck ST1023 convention** (post-`92fe656`): drop redundant type annotations from assignment expressions where Go can infer — use `var capturedLevel = slog.LevelInfo` instead of `var capturedLevel slog.Level = slog.LevelInfo`. Lint flags the redundant form.

**Behavior matrices drive test tables (NEW guidance for deferred Phase 10 tests):**

When a function's doc-comment lists a behavior matrix (the `// → ErrFoo` arrow notation introduced in `SendFriendRequest` — see CONVENTIONS.md "Behavior-matrix doc-comments"), the corresponding `*_test.go` should add one `TestFunction_<Outcome>` per matrix row. Example for the deferred `friend_requests_test.go`:

| Behavior-matrix row (doc-comment) | Test name to add |
|---|---|
| `sender == receiver → ErrSelfTarget` | `TestSendFriendRequest_RejectsSelf` |
| `already friends → ErrAlreadyFriends` | `TestSendFriendRequest_RejectsWhenAlreadyFriends` |
| `existing pending → idempotent return` | `TestSendFriendRequest_IsIdempotentForPending` |
| `existing rejected/cancelled → flip back to pending` | `TestSendFriendRequest_FlipsRejectedToPending` |
| `no prior row → create new pending` | `TestSendFriendRequest_CreatesNewPending` |
| inverse-direction pending → `ErrFriendRequestExists` | `TestSendFriendRequest_RejectsWhenInversePending` |

The 1:1 mapping makes coverage gaps obvious during code review — any matrix row without a matching test is visible without reading every test body.

## Mocking

Five mocking patterns documented inline as comments during Plan 08-01 Task 5. Each pattern exists because a specific Jest/ESM/RN gotcha bit a real test.

### Pattern 1 — `jest.mock` hoisting + outer-variable forbidden

`jest.mock(path, factory)` is HOISTED to the top of the file (above `import` and `let` declarations). A factory closing over a `let` variable will see `undefined` at factory-run time, even if the variable is initialized higher up in the source.

**Allowed:** Module-level state declared with `const` and the standard `mock` prefix exception (see Pattern 2). For most cases, the safe form is to define `jest.fn()` INSIDE the factory and retrieve the handle via `jest.requireMock` after import.

### Pattern 2 — `mock` prefix exception is necessary-but-not-sufficient

Jest allows factories to reference outer variables whose names start with `mock` (e.g., `mockFn`). BUT — because the factory is hoisted ABOVE the `let mockFn = …` initialization, the variable is still `undefined` at factory-run time. The prefix only silences the lint error; it doesn't change runtime behavior.

**Solution:** Define the `jest.fn()` directly inside the factory; reach in via `jest.requireMock(path).export` after imports. Example from `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts:56-67`:
```typescript
jest.mock('../manifestSigning', () => ({
  __esModule: true,
  verifyManifestSignature: jest.fn(() => true),
}));
jest.mock('../../util/version', () => ({
  __esModule: true,
  getInstalledVersion: jest.fn(() => '1.0.0-beta.3'),
}));

const mockVerify = jest.requireMock('../manifestSigning').verifyManifestSignature as jest.Mock;
const mockInstalledVersion = jest.requireMock('../../util/version').getInstalledVersion as jest.Mock;
```
Per-test control then uses `mockVerify.mockReturnValue(false)` etc.

### Pattern 3 — `__esModule: true` for named-export modules

When mocking a module that uses ESM named exports (which our source modules do — `export function …`), the factory MUST include `__esModule: true`:
```typescript
jest.mock('../manifestSigning', () => ({
  __esModule: true,
  verifyManifestSignature: jest.fn(() => true),
}));
```
Without it, Jest's CJS/ESM interop falls back to default-export semantics and named imports resolve to `undefined`. See `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts:56-63`.

### Pattern 4 — Closure-bound constants can't be overridden by mock-spread

Mocking a module to substitute a constant exported alongside a function does NOT change the value the function sees, because the function closes over the LOCAL const at module-load time, not the re-exported binding.

**Wrong:**
```typescript
jest.mock('../manifestSigning', () => ({
  __esModule: true,
  ...jest.requireActual('../manifestSigning'),
  MANIFEST_PUBKEY_BASE64: 'test-pubkey',  // ← function still sees the original
}));
```
**Right — refactor the function to accept the value as an optional argument:**
```typescript
// In source (apps/mobile-rn/src/update/manifestSigning.ts:73-79):
export function verifyManifestSignature(
  manifest: { signature: string; [k: string]: unknown },
  pubkeyBase64: string = MANIFEST_PUBKEY_BASE64,
): boolean { ... }

// In test (apps/mobile-rn/src/update/__tests__/manifestSigning.test.ts:99):
expect(verifyManifestSignature(manifest, TEST_PUB_B64)).toBe(true);
```

### Pattern 5 — ESM frozen-namespace gotcha (getter-backed mock factory)

`jest.mock('expo-device', () => ({ manufacturer: '' }))` looks fine, but `import * as Device from 'expo-device'` returns an ESM-shaped namespace object whose properties are non-configurable. Mutating `Device.manufacturer` from the test silently no-ops.

**Solution — getter-backed factory** (from `apps/mobile-rn/src/vendor/__tests__/oem.test.ts:7-13`):
```typescript
const mockState: { manufacturer: string | null | undefined } = { manufacturer: '' };

jest.mock('expo-device', () => ({
  get manufacturer() {
    return mockState.manufacturer;
  },
}));

// Tests mutate the inner state object (NOT the namespace):
mockState.manufacturer = 'Xiaomi';
```
The getter is invoked anew on every access, so `mockState.manufacturer` mutations are observable to the SUT.

### Other recurring mock shims

**In-memory MMKV** — same pattern in `apps/mobile-rn/src/state/__tests__/featureflags.test.ts:21-35`, `apps/mobile-rn/src/vendor/__tests__/AutostartDialog.test.tsx:15-31`, `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts:19-38`:
```typescript
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>();
  return {
    createMMKV: () => ({
      getString: (key) => store.get(key),
      set: (key, value) => { store.set(key, value); },
      remove: (key) => { store.delete(key); },
    }),
    __reset: () => store.clear(),
  };
});
```
The optional `__reset` hook is reached via `jest.requireMock('react-native-mmkv').__reset()` in `beforeEach`.

**better-sqlite3 shim for `expo-sqlite`** — `apps/mobile-rn/__mocks__/expo-sqlite.ts`. Jest auto-detects the shim at `<package-root>/__mocks__/<package>.ts`; production tests `import * as SQLite from 'expo-sqlite'` and get the shim automatically. Implements the sync API surface actually used by the codebase (`openDatabaseSync`, `execSync`, `runSync`, `getFirstSync`, `getAllSync`, `prepareSync().executeSync()/finalizeSync()`, `withTransactionSync`). Async API NOT shimmed because code doesn't use it. See module header `apps/mobile-rn/__mocks__/expo-sqlite.ts:1-10`.

**Theme stub** — `apps/mobile-rn/src/__tests__/Toast.test.tsx:12-14` substitutes the design barrel to avoid pulling MMKV through `ThemeProvider`:
```typescript
jest.mock('../design', () => ({
  useTheme: () => ({ lime: '#C6F560', text: '#FFFFFF' }),
}));
```

**Fetch mock** — `global.fetch = jest.fn()` in `beforeEach`, scenario response per test:
```typescript
(global.fetch as jest.Mock).mockResolvedValue({
  ok: true,
  json: async () => VALID_MANIFEST,
});
```
See `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts:94, 99-102`.

**Inline collaborator mocks for SessionManager-integration tests** (tracker-live-polish-pass introduced this pattern explicitly):

Integration tests that exercise multiple real domain objects together still need to mock external boundaries. The pattern: define **inline `make*` factory functions** at module top that return minimal-shape stubs:
```typescript
// apps/mobile-rn/src/domain/session/__tests__/SessionManager.pauseFlow.test.ts:32-63
function makeMockRepo(): SessionRepo { return { createSession: jest.fn(), ... }; }
function makeNoopPipeline(): Pipeline { return new Pipeline([passthroughFilter]); }
function makeMockAdapter(): LocationAdapter { return { start: jest.fn(...), ... }; }
```
**Real:** SUT (`SessionManager`) + real collaborator (`PauseDetector`, `ClosureDetector`, `Pipeline`).
**Stubbed:** External boundaries — `SessionRepo` (SQLite), `LocationAdapter` (native GPS).
This is the closest jest can get to "user starts → pauses → resumes → stops" without RN render. The rendering integration (`TrackerLiveScreen` reads selectors and computes `durationS`) is validated via APK manual smoke.

**What to mock:**
- Native bridge modules: MMKV, expo-sqlite, expo-device
- Network: `global.fetch`
- AppState / RN platform globals (when not part of the SUT)
- The crypto module when testing a state machine that depends on it (focus test on dispatch logic; cover crypto in its own dedicated suite)
- External boundaries in domain-integration tests: SQLite repos, LocationAdapter, MapAdapter
- **Cross-service permission gates (when added in session 2-3)**: tests of `messaging` handlers should stub `permissions.FriendshipGate` rather than spinning up Postgres. The gate's `RequireFriends(ctx, u1, u2) error` shape is small enough that a per-test stub returning `nil` or `ErrNotFriends` is trivial. The real gate gets its own test (against a `:memory:` Postgres or testcontainers — TBD in deferred work).

**What NOT to mock:**
- Pure domain logic (`AreaCalculator`, `Pipeline` filters, `semverLite`, `SessionManager`, `PauseDetector`, `formatChatTime`, `initialsForName`, `colorForName`) — exercised directly with handcrafted inputs
- Zustand stores — they are part of the SUT for `update/` tests; tests use `useStore.setState({ … })` / `getState()` to set up/inspect state
- The system under test itself (obvious — but easy to slip when the SUT re-exports from a module that needs mocking)
- In integration tests: the collaborator objects whose wiring is the test's primary subject (e.g., `pauseFlow.test.ts` wires real `PauseDetector` ↔ real `SessionManager`; only external IO is stubbed)

## Pinned Test Keypair Pattern (Plan 08-01 Task 5)

Cryptographic tests use a **deterministic test keypair** seeded with `0x42 × 32` and embedded as base64 literals. The literal embedding is mandatory because `jest.mock` factories cannot reference outer-scope variables (Pattern 1 above):
```typescript
// apps/mobile-rn/src/update/__tests__/manifestSigning.test.ts:14-15
const TEST_SEED_B64 = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI=';
const TEST_PUB_B64  = 'IVL40Zt5HSRFMkLhXy6rbLfP+ntqXtMAl5YOBpiB2xI=';
const TEST_SEED = new Uint8Array(Buffer.from(TEST_SEED_B64, 'base64'));
```
The test computes signatures with `@noble/ed25519` using the SAME canonical-JSON algorithm (`Object.keys(rest).sort()` + `JSON.stringify`) as the Go signer at `scripts/sign-manifest.go`. Verification is then delegated to the SUT, which validates against the test pubkey passed in via the optional `pubkeyBase64` argument (Pattern 4).

## Fixtures and Factories

**Inline factory functions for typed test data:**
```typescript
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

// apps/mobile-rn/src/__tests__/AreaCalculator.test.ts:18-27
function squareAround(centerLat: number, centerLon: number, sideM: number): RawPoint[] { ... }

// apps/mobile-rn/src/pipeline/filters/__tests__/PauseDetector.warmup.test.ts:8-24
function makePoint(opts: { ts: number; speed: number; lat?: number; lng?: number }): Point { ... }

// apps/mobile-rn/src/domain/session/__tests__/SessionManager.pauseFlow.test.ts:20-30
function makeRaw(opts: { ts: number; speed: number; lat?: number; lng?: number }): RawPoint { ... }
```

**Module-scope const fixtures** for shared payloads:
```typescript
// Reused across multiple `it` blocks
const VALID = { apk_sha256: 'a'.repeat(64), ... };       // manifestSchema.test.ts:3-12
const PAYLOAD = { apk_sha256: 'a'.repeat(64), ... };     // manifestSigning.test.ts:86-94
const T0 = new Date(2026, 4, 25, 12, 0, 0).getTime();    // SessionManager.timeFreezing.test.ts:60
const NOW = new Date(2026, 4, 22, 15, 0, 0).getTime();   // timeFormat.test.ts:6
```

**Location:** No central `fixtures/` directory — factories and fixtures live inline at the top of each test file. This is deliberate: each test file owns its fixtures, no cross-file coupling.

## Coverage

**Targets per `CLAUDE.md`:**
- General: **80%+**
- GPS pipeline (`src/pipeline/`): **90%+**
- Area calc (`src/domain/AreaCalculator.ts`): **90%+**

**Enforcement:** Targets are policy-level, not enforced by a Jest `coverageThreshold` (none set in `apps/mobile-rn/jest.config.js`). Backend coverage surfaces in `$GITHUB_STEP_SUMMARY` per service via `go tool cover -func=coverage.out | tail -1` (`.github/workflows/backend-ci.yml:54-56`) — also informational, no hard gate.

**View Coverage:**
```bash
cd apps/mobile-rn
npm run test:coverage                                   # writes ./coverage/
open coverage/lcov-report/index.html                    # HTML report

cd services/backend/<service>
go test -coverprofile=coverage.out ./...
go tool cover -html=coverage.out                        # HTML view
```

**Known coverage gap (Phase 10 deferred):**
- `services/backend/social-graph/internal/service/friend_requests.go` — 0% coverage as of session 1 (no test file yet)
- `services/backend/messaging/internal/permissions/friendship_gate.go` — 0% coverage as of session 1
- `services/backend/social-graph/internal/repository/postgres/friend_requests_repo.go` (or equivalent) — 0% coverage as of session 1

These three files are flagged in `social-yolo-pass` session 2-3 checklist for test addition before SUMMARY.md ships.

## Test Types

**Unit tests:**
- Mobile: 64 files (686 cases); dominant pattern. Cover domain primitives (filters, area, semver, time-format, avatar initials), state stores (Zustand), parsers/validators, hooks, components.
- Backend: 23 files; cover handlers (with `httptest`), services (with in-memory repos), shared `pkg/*` packages.

**Integration tests:**
- Mobile: `*.integration.test.ts` suffix + the new `SessionManager.pauseFlow.test.ts` pattern (wires real domain objects together with mocked external boundaries). Currently:
  - `apps/mobile-rn/src/__tests__/sessionRepository.integration.test.ts` (real `:memory:` SQLite via the better-sqlite3 shim; `beforeEach` does `_setDatabase(db); runMigrations();` for full isolation)
  - `apps/mobile-rn/src/domain/session/__tests__/SessionManager.pauseFlow.test.ts` (2 cases: full-run scenario + warmup-resets-across-start) — exercises `PauseDetector + SessionManager + Pipeline + ClosureDetector` real, mocks `SessionRepo + LocationAdapter`
- Backend: handler tests are effectively integration tests (full HTTP stack via `httptest.NewServer`). No separate `_integration_test.go` suffix; standard `_test.go` is used.

**Snapshot tests:**
- `*.snapshot.test.tsx` — `apps/mobile-rn/src/__tests__/RunDetailsScreen.snapshot.test.tsx`, with snapshots in `apps/mobile-rn/src/__tests__/__snapshots__/` (2 stored snapshots, all green)
- **No new visual snapshot tests added for UI polish** (chat-polish-pass + tracker-live-polish-pass precedent): UI changes (Skeleton, Avatar gradient, TabBar badges, FAB, empty states, pace/HR null-guards, lap-button opacity) are validated via **manual APK smoke install** instead. Reasoning: visual snapshots churn on every styling tweak + don't catch the real concern (visual correctness on device). Snapshot tests stay reserved for stable structural-render contracts (e.g., `RunDetailsScreen` layout).

**Component tests (RN Testing Library):**
- Pattern: import `render` + `act` from `@testing-library/react-native`, wrap the SUT in any required Provider, query by `testID`. Use `jest.useFakeTimers()` + `act(() => { … })` to advance timers for animation-bearing components (see `apps/mobile-rn/src/__tests__/Toast.test.tsx:18-24, 60+`).

**E2E tests:** Not used. Smoke shell scripts cover end-to-end shape concerns where Jest can't reach (CI workflow shape, cross-language byte-identity, file-content greps). Visual end-to-end is covered by manual APK installs from `android-debug-apk.yml` artifacts.

**Smoke scripts** (`.planning/phases/<NN-…>/evidence/smoke-*.sh`):
Each smoke is `set -euo pipefail`, has a clear `must` / `mustnot` / `mustnot_re` helper convention, and exits non-zero on any assertion failure. Used to validate:

- **Cross-language byte-identity** — `smoke-manifest-sign-roundtrip.sh` (Plan 08-01 Task 3): generates a fresh Ed25519 keypair, signs a fixture with Go's `scripts/sign-manifest.go`, verifies Go-side (sanity), then re-verifies via Node + `@noble/ed25519` (mobile-side parity). Proves canonical JSON byte-identity across runtimes. Self-contained — no external state.
- **CI workflow shape** — `smoke-release-distribute.sh` (Plan 08-01 Task 4): greps `.github/workflows/android-release.yml` for required strings (`scripts/release-distribute.sh`, `bundletool build-apks`, `BUNDLETOOL_VERSION=1.18.1`, `::add-mask::$STORE_PASS`, `manifest-signing.yaml` decrypt, etc.) and runs `actionlint`. Uses `mustnot_re` (extended regex with `grep -qE`) for flag-continuation patterns starting with `-` because BSD `grep` requires `-e` for those — see `mustnot_re '^[[:space:]]+--no-wait[[:space:]]*\\?$'` in `smoke-release-distribute.sh:42-47`.
- **File-content shape + jest re-run as final check** — `smoke-mobile-update-flow.sh` (Plan 08-01 Task 6): 11 `grep -q` assertions on TSX files (Russian strings, `Linking.openURL`, mount points), then `(cd apps/mobile-rn && npx jest --testPathPattern='update' --silent)` as the final assertion. Catches both source-drift and test-regression in one pass.

## Common Patterns

**Async testing:**
```typescript
it('returns failed on HTTP non-200', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: false, status: 503, json: async () => ({}),
  });
  const r = await checkForUpdate();
  expect(r.state).toBe('failed');
  if (r.state === 'failed') expect(r.error).toMatch(/HTTP 503/);
});
```
The `if (r.state === 'failed')` narrowing is required to access `.error` (tagged union — TypeScript strict).
Reference: `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts:149-159`.

**Error testing (mobile):**
```typescript
it('throws on invalid input', () => {
  expect(() => compare('1.0.0', 'bad')).toThrow(/invalid version/);
});
```
Reference: `apps/mobile-rn/src/update/__tests__/semverLite.test.ts:80-83`.

**Error testing (Go):**
```go
_, _, err := s.Login(ctx, "a@b.com", "wrong-password", "")
if !errors.Is(err, domain.ErrInvalidCredentials) {
    t.Errorf("expected ErrInvalidCredentials, got %v", err)
}
```
Reference: `services/backend/identity/internal/service/auth_test.go:88-96`.

**Per-test mock state reset:**
```typescript
const __reset = () => {
  jest.requireMock('react-native-mmkv').__reset();
  useForceUpdateStore.getState().reset();
  useUpdateBannerStore.setState({ available: false, manifest: null, suppressedUntil: null });
  useUpdateCheckStore.setState({ lastCheckedAt: null, checking: false, lastError: null, installedReleasedAt: null });
};
beforeEach(() => {
  __reset();
  mockVerify.mockReset().mockReturnValue(true);
  mockInstalledVersion.mockReset().mockReturnValue('1.0.0-beta.3');
  global.fetch = jest.fn();
});
```
Reference: `apps/mobile-rn/src/update/__tests__/manifestCheck.test.ts:74-95`.

**Module re-import for Zustand store isolation** — `forceUpdate.test.ts` uses `jest.resetModules()` + `require()` inside each `it` block to get a clean store instance per test:
```typescript
beforeEach(() => {
  jest.resetModules();
});
it('initial state: required=false, empty strings', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useForceUpdateStore } = require('../forceUpdate');
  expect(useForceUpdateStore.getState().required).toBe(false);
});
```
Reference: `apps/mobile-rn/src/state/__tests__/forceUpdate.test.ts:5-17`. The `require` instead of `import` is necessary because static `import` is hoisted (single module instance for the whole file); `require` after `resetModules()` reads a fresh copy.

**Fake timers + setSystemTime (time-dependent state machines):**
```typescript
const T0 = new Date(2026, 4, 25, 12, 0, 0).getTime();
beforeEach(() => { jest.useFakeTimers().setSystemTime(T0); });
afterEach(() => { jest.useRealTimers(); });

it('accumulates across multiple pause cycles', () => {
  const m = makeManager();
  m.start();
  jest.setSystemTime(T0 + 20_000);
  m.setPaused(true);
  jest.setSystemTime(T0 + 30_000);
  m.setPaused(false);
  ...
  expect(m.effectiveElapsedMs(T0 + 90_000)).toBe(50_000);
});
```
Reference: `apps/mobile-rn/src/domain/session/__tests__/SessionManager.timeFreezing.test.ts:62-127`.

**Fake timers + act() (animation-bearing components):**
```typescript
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

it('fade-out unmounts', () => {
  act(() => { triggerShow('hi'); });
  // advance timers, assert ...
});
```
Reference: `apps/mobile-rn/src/__tests__/Toast.test.tsx:18-24, 41+`.

**Numerical tolerance** (domain area / pipeline tests):
```typescript
expect(r.areaM2).toBeGreaterThan(38_000);
expect(r.areaM2).toBeLessThan(42_000);
```
Tolerance is documented in the `it` name — `'квадрат 200×200м (≈40 000 м²) — tolerance 5%'`. Reference: `apps/mobile-rn/src/__tests__/AreaCalculator.test.ts:42-44`.

**Bounds assertions** (when exact values depend on detector internals that aren't stable across refactors): assert lower + upper bound rather than equality:
```typescript
// SessionManager.pauseFlow.test.ts:170-178
const effective = manager.effectiveElapsedMs(T0 + 90_000);
// We can't assert exact value because pause boundaries depend on
// detector internals — but it MUST be less than wall-clock 90s and
// greater than 30s (active periods only).
expect(effective).toBeLessThan(90_000);
expect(effective).toBeGreaterThan(30_000);
```

## CI Integration

**Mobile:**
- No dedicated mobile-CI workflow at the time of writing. Mobile tests run locally + as a step in plan-specific smoke scripts (e.g., `smoke-mobile-update-flow.sh` re-invokes `npx jest --testPathPattern='update'` as the final assertion).
- ESLint + tsc are part of local quality gate (`npm run lint`, `npm run typecheck`), not yet wired to a CI matrix.
- **`android-debug-apk.yml`** workflow (`workflow_dispatch` + push-triggered with `apps/mobile-rn/**` paths) builds universal debug APK for ad-hoc tester distribution; not currently running `npm test` (build-only).
- **`android-release.yml`** workflow (tag-triggered, ADR-0011 Amendment 5 gated) is the closed-beta distribution pipeline; runs EAS Cloud build + SOPS keystore + `bundletool` + MinIO upload + Ed25519 signed manifest.

**Backend:** `.github/workflows/backend-ci.yml` — runs on push to `main` and on `pull_request` against `main`, filtered to paths `services/backend/**`, `.github/workflows/backend-ci.yml`, `.github/workflows/secret-scan-full.yml`, `Makefile`, `.golangci.yml`, `.trivyignore.yaml`.

Jobs (each name is a verbatim contract consumed by `Plan 04-05` branch-protection JSON — DO NOT vary the spelling, including the em-dash `—` U+2014 in `secrets-scan-diff`):
1. **`Test (Go 1.25)`** — `strategy.matrix.service: [pkg, identity, activity-sync, feed, media, messaging, notifications, realtime-gw, social-graph]`. Runs `go test -race -coverprofile=coverage.out ./...` per module + writes coverage summary to `$GITHUB_STEP_SUMMARY`.
2. **`Lint (golangci-lint v2)`** — pinned to v2.5.0. Loops per module because `services/backend` is a `go.work` workspace root without `go.mod`. **All 9 modules currently 0-issue** post-`92fe656` (re-verified after social-yolo-pass session 1 Phase 10 additions).
3. **`SAST (gosec)`** — `-severity high`, blocks on HIGH findings (per D-10).
4. **`Vuln (govulncheck)`** — per-module loop; blocks on any finding (per D-10). **All 9 modules currently 0-vuln** post-`69cc8eb` (Go `1.25.0 → 1.25.10` + `otel v1.32 → v1.43`; was 19-26 vulns per module pre-bump).
5. **`SAST (semgrep)`** — container `returntocorp/semgrep`, configs `p/golang` + `p/owasp-top-ten`, severity ERROR, `--error` flag.
6. **`Secrets (gitleaks + trufflehog — PR diff)`** — PR-only diff scan. Full-history runs in cron `secret-scan-full.yml`.
7. **`Docker build (no push, verify)`** — `needs: [test, lint]`, matrix over 8 services. Includes `aquasecurity/trivy-action@master` HIGH/CRITICAL block, `ignore-unfixed: false`, `trivyignores: .trivyignore.yaml`.
8. **`Guard (no :latest)`** — negative grep across `.github/workflows/*.yml` + `services/backend/docker-compose.prod.yml`. Excludes comment lines first to avoid header-prose self-invalidation (RESEARCH Pitfall 6).
9. **`PII Audit (slog grep)`** — runs `scripts/pii_audit.sh` (Plan OBS-06 / D-14). Blocks if a new `slog.*Context` call uses a PII attribute key from the D-12 deny-list.
10. **`Cardinality Probe (Prom labels)`** — boots docker-compose, polls `/metrics`, runs `scripts/cardinality_probe.py` to detect forbidden labels (`user_id`, `session_id`, `device_id`, `external_uuid`, `email`, `phone`) and metric families > 1000 series.

**Pre-commit (local, every commit):** `.pre-commit-config.yaml` runs `gitleaks v8.30.1` (staged files only). Custom rules in `.gitleaks.toml` extend defaults for bare Mapbox `sk.` / `pk.` patterns. All commits in 2026-05-24 + 2026-05-25 (including social-yolo-pass session 1 `a827bc5..830b8db`) passed cleanly.

---

*Testing analysis: 2026-05-25 (refresh after social-yolo-pass session 1; mobile test count unchanged at 686, backend Go test count unchanged at 23 files, Phase 10 backend tests deferred to session 2-3)*
