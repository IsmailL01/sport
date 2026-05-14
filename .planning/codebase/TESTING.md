# Testing Patterns

**Analysis Date:** 2026-05-14

## Test Framework

**Runner:** Jest 29.7 with `jest-expo` 54 preset.
- Mobile config: `apps/mobile-rn/jest.config.js`
- Type definitions: `@types/jest@30`
- Test utilities (RN component tests): `@testing-library/react-native@13`

**Assertion library:** Built-in Jest matchers only (`expect`, `toBe`, `toBeNull`, `toEqual`, `toBeInstanceOf`, `toBeGreaterThan`, `toBeLessThan`, `toMatchObject`, `toContain`, `toHaveLength`). No `chai` / `sinon`.

**Backend tests:** Go `testing` package (`go test ./...`). Not covered here — see `services/backend/identity/internal/service/auth_test.go:1` for the table-driven style. Mobile `permissions.test.ts` is explicitly written to mirror Go `pkg/permissions/check_test.go` (matrix kept in sync by hand).

**Run Commands (from `apps/mobile-rn/`):**

```bash
npm test                  # Run all tests
npm test -- --watch       # Watch mode
npm run test:coverage     # Run with coverage report (lcov + clover)
npm run typecheck         # tsc --noEmit (preflight check)
npm run lint              # ESLint (must pass before commit)
```

Output goes to `apps/mobile-rn/coverage/` (lcov-report, lcov.info, clover.xml, coverage-final.json).

## Jest Configuration

File: `apps/mobile-rn/jest.config.js`

```javascript
module.exports = {
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
};
```

**Key facts:**
- Tests are discovered ONLY under `__tests__/` folders (not co-located `*.test.ts` next to source).
- `index.ts` (barrel exports) is excluded from coverage — they have no logic.
- `*.d.ts` excluded.
- `transformIgnorePatterns` whitelists every native module that ships ESM so Jest can transform it. **When adding a new native dependency, append its package name to this list** or tests will fail with "Unexpected token export".
- No custom `setupFilesAfterEach`, no global mocks, no test environment override — `jest-expo` provides JSDOM-like RN env.

## Test File Organization

**Location:** Centralized under `apps/mobile-rn/src/__tests__/`. Tests are NOT co-located with source files.

```
apps/mobile-rn/src/__tests__/
├── AreaCalculator.test.ts           # domain/AreaCalculator
├── athlete.test.ts
├── calories.test.ts                 # domain/calories
├── caloriesExt.test.ts              # MET + HR fallback
├── currency.test.ts                 # domain/currency
├── design.test.ts                   # design tokens / theme
├── format.test.ts                   # util/format
├── gamification.test.ts             # modules/gamification
├── geo.test.ts                      # util/geo
├── gpx.test.ts                      # domain/gpx
├── health.test.ts
├── hrZoneBreakdown.test.ts
├── importAward.test.ts
├── importPlan.test.ts               # health/importPlan
├── importSanity.test.ts             # health/importSanity
├── lap.test.ts
├── metrics.test.ts
├── moderation.test.ts               # modules/moderation
├── permissions.test.ts              # modules/permissions (mirrors Go matrix)
├── pipeline.test.ts                 # AccuracyFilter, JumpFilter, KalmanFilter,
│                                    # MinSegmentFilter, PauseDetector, Pipeline
├── planGenerator.test.ts
├── realtimeAdapter.test.ts          # MockRealtimeAdapter
├── records.test.ts                  # domain/records
├── sensors.test.ts                  # BLE HR parsing + association
├── social.test.ts                   # domain/social helpers
├── splits.test.ts
├── stats.test.ts
├── streak.test.ts
├── training.test.ts
├── walletDomain.test.ts             # pure
├── walletStore.test.ts              # zustand store with mocked repo
└── workoutSession.test.ts
```

**Naming:** `<sourceModule>.test.ts`. One test file per source module (occasionally one per topic — e.g. `caloriesExt.test.ts` covers HR fallback added later).

**Counts (per `STATUS.md` 2026-05-06):** 435/435 passing across 32 files. Approximate test-case count (grep `^  it(` / `^  test(`): ~415 cases.

**No top-level `tests/` directory for mobile.** The repo-root `tests/` holds only `FIELD_PROTOCOL.md` (manual field-test protocol). Backend tests are co-located inside each Go package (`*_test.go`).

## Test Structure

**Suite organization:** Plain `describe` blocks grouped by function or feature; flat `it` cases inside. No nested describe blocks beyond two levels.

**Reference pattern from `apps/mobile-rn/src/__tests__/walletDomain.test.ts:7`:**
```typescript
describe('signedAmountFor', () => {
  it('earn → +amount', () => expect(signedAmountFor('earn', 50)).toBe(50));
  it('spend → -amount', () => expect(signedAmountFor('spend', 50)).toBe(-50));
  // ...
});

describe('validateTransaction', () => {
  const u = 'u1';

  it('earn любая сумма — OK', () => {
    expect(validateTransaction({ userId: u, kind: 'earn', amount: 100 }, 0)).toBeNull();
    expect(validateTransaction({ userId: u, kind: 'earn', amount: 1000 }, 50)).toBeNull();
  });

  it('spend > balance — InsufficientBalanceError', () => {
    const err = validateTransaction({ userId: u, kind: 'spend', amount: 150 }, 100);
    expect(err).toBeInstanceOf(InsufficientBalanceError);
    if (err instanceof InsufficientBalanceError) {
      expect(err.need).toBe(150);
      expect(err.have).toBe(100);
    }
  });
});
```

**Conventions:**
- Test names use natural language (Russian common: "earn любая сумма — OK", "spend > balance — InsufficientBalanceError"). Match the surrounding test file's language.
- Use arrow-function one-liners for trivial cases; block bodies for multi-step.
- Narrow `Error` to subclass via `instanceof` inside the test before asserting subclass-specific fields (`if (err instanceof InsufficientBalanceError) { expect(err.need).toBe(150); }`).
- For discriminated-union returns, narrow with `if (plan.decision === 'insert')` then assert on the narrowed shape (`apps/mobile-rn/src/__tests__/importPlan.test.ts:21`).

**Setup / teardown:**
- Per-suite state held in module-level `let` only when necessary (see `walletStore.test.ts` mock state).
- `beforeEach` used sparingly — only for cross-test state (`walletStore.test.ts:57` resets the mocked repo + clears store).
- `afterEach` / `afterAll` not used in the current suite.

**Factory helpers ("function p / w / msg"):** Universal pattern — every test file defines tiny builders near the top to produce test fixtures with overrides:

```typescript
// apps/mobile-rn/src/__tests__/pipeline.test.ts:9
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

// apps/mobile-rn/src/__tests__/importPlan.test.ts:4
function w(overrides: Partial<ImportedWorkout> = {}): ImportedWorkout {
  return { externalId: 'x', startedAt: 1_700_000_000_000, ..., ...overrides };
}

// apps/mobile-rn/src/__tests__/social.test.ts:3
function msg(overrides: Partial<Message>): Message {
  return { id: 'm1', clientId: 'c1', ..., ...overrides };
}
```

**Always use the spread-overrides factory pattern for new tests.** It keeps each case readable and prevents drift when domain types add fields.

## Mocking

**Native modules — module-level `jest.mock` (rare, deliberate):**

Only one test currently mocks a module (`walletStore.test.ts`). It mocks the entire `storage/walletRepository` because the store calls SQLite-backed functions and `expo-sqlite` cannot load under Jest.

```typescript
// apps/mobile-rn/src/__tests__/walletStore.test.ts:8
jest.mock('../storage/walletRepository', () => {
  let _balance = 0;
  const _seen = new Set<string>();
  const _txs: Array<Record<string, unknown>> = [];
  let _earnedToday = 0;
  const fake = {
    __setBalance: (v: number) => { _balance = v; },
    __setEarnedToday: (v: number) => { _earnedToday = v; },
    __reset: () => { _balance = 0; _seen.clear(); _txs.length = 0; _earnedToday = 0; },
    __txs: () => _txs,

    getBalance: () => _balance,
    listTransactions: () => _txs,
    hasTransactionForSession: (userId: string, sid: number) =>
      _seen.has(`${userId}:${sid}`),
    coinsEarnedSince: () => _earnedToday,
    startOfTodayMs: () => 0,
    recordTransaction: (args) => {
      const signed = args.kind === 'earn' ? args.amount : -args.amount;
      _balance += signed;
      if (args.sourceSessionId !== null) _seen.add(`${args.userId}:${args.sourceSessionId}`);
      if (args.kind === 'earn') _earnedToday += args.amount;
      _txs.unshift({ ...args, ts: Date.now() });
      return _balance;
    },
  };
  return fake;
});
```

**Mock conventions when one is needed:**
- Underscored private state (`_balance`, `_seen`) plus underscored test-only escape hatches (`__setBalance`, `__reset`, `__txs`). The double-underscore prefix marks "test-only, never call from prod."
- A single `__reset()` is called from `beforeEach`. This is the only setup hook needed.
- Cast through `as unknown as { ... }` to get a typed handle on the mock's escape hatches: `const repoMock = repo as unknown as { __reset(): void; __txs(): Array<...>; };` (`walletStore.test.ts:50`).

**Adapter mocks — Mock as a real class implementation:**

The preferred mocking strategy is NOT `jest.mock`. It's a concrete class that implements the adapter interface and lives in the source tree:

| Interface | Mock implementation | Usage |
|-----------|---------------------|-------|
| `RealtimeAdapter` | `apps/mobile-rn/src/realtime/adapters/MockRealtimeAdapter.ts` | Direct `new MockRealtimeAdapter()` in test. Exposes test-only `emit(e)` to simulate incoming events. |
| `HealthAdapter` | `apps/mobile-rn/src/health/MockHealthAdapter.ts` | Drop-in for integration / dev. |

Reference test `apps/mobile-rn/src/__tests__/realtimeAdapter.test.ts:4`:
```typescript
describe('MockRealtimeAdapter', () => {
  it('connect → status transitions idle → connected', async () => {
    const a = new MockRealtimeAdapter();
    const states: RealtimeStatus[] = [];
    a.onStatus((s) => states.push(s));
    await a.connect();
    expect(states).toContain('connected');
    expect(a.isConnected()).toBe(true);
  });

  it('emit() dispatches к listeners', () => {
    const a = new MockRealtimeAdapter();
    const received: RealtimeEvent[] = [];
    a.on((e) => received.push(e));
    a.emit({ event: 'message.new', ... } as RealtimeEvent);
    expect(received).toHaveLength(1);
  });
});
```

**`LocationAdapter` and `MapAdapter` have no Jest tests yet.** The location adapter is exercised only through manual field tests (`tests/FIELD_PROTOCOL.md`); the map layer relies on the architectural rule (`no-restricted-imports`) plus the `MapboxView` boundary. The pipeline tests cover the GPS data path independently of the location adapter — they construct `Point` fixtures directly.

**What to mock:**
- SQLite-backed repositories (the only path that requires native loading).
- HTTP / `fetch` — only when absolutely necessary (e.g. testing rate-limit parser). The current suite does NOT exercise `apiClient` directly; sync modules are tested indirectly through stores with mocked repos.

**What NOT to mock:**
- Pure domain functions (currency, walletDomain, records, streak, importPlan, importSanity, calories, areaCalculator, pipeline filters, geo helpers). They are tested directly with synthetic inputs.
- Time. Tests use deterministic timestamps (`1_700_000_000_000`, fixed `Date` objects passed in: `const today = new Date(2026, 4, 11);`). Don't reach for `jest.useFakeTimers()` unless a new feature genuinely depends on wall-clock behaviour.
- `console.warn` / `console.error` — leave them noisy. Treats logs as test output you may want to read.
- `expo-*` modules other than `expo-sqlite`. Native modules referenced only inside adapters; adapter implementations themselves are not tested with Jest.

## Fixtures and Factories

**Inline builders are the standard.** Every test file declares its own `function p(...)` / `function w(...)` / `function makePoint(...)` / `function msg(...)` near the top. There is no shared `fixtures/` or `factories/` folder.

**Test data conventions:**
- Stable timestamps: `1_700_000_000_000` for arbitrary "now"; explicit `new Date(2026, 4, 11)` for date-dependent logic.
- Fixed Moscow / Berlin-ish coordinates: `lat: 50, lon: 10` for synthetic GPS tracks; `baseLat: 55.7558, baseLon: 37.6173` (Moscow) in `records.test.ts`.
- Helpers that build geometry (`squareAround`, `buildLineTrack`) live alongside the tests that need them — duplicate rather than DRY across files until a real shared utility emerges.

Example helper for geometry (`apps/mobile-rn/src/__tests__/AreaCalculator.test.ts:18`):
```typescript
function squareAround(centerLat: number, centerLon: number, sideM: number): RawPoint[] {
  const dLat = sideM / 2 / 111320;
  const dLon = sideM / 2 / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return [/* 4 corners */];
}
```

## Coverage

**Coverage targets (from `CLAUDE.md`):**
- **80%+** for domain and pipeline (`src/domain/**`, `src/pipeline/**`).
- **90%+** for area calculation (`src/domain/AreaCalculator.ts` + `src/util/{geo,selfIntersection,douglasPeucker}.ts`).

**Current state (per `STATUS.md` 2026-05-06):** 435/435 tests passing. Coverage artifacts present in `apps/mobile-rn/coverage/` (`lcov.info`, `clover.xml`). No CI gate enforces the percentage threshold yet — it's a soft target.

**View coverage:**
```bash
cd apps/mobile-rn
npm run test:coverage
open coverage/lcov-report/index.html
```

**Heavily tested (deep cases, edge cases, mathematical tolerances):**

| Area | File(s) | What's covered |
|------|---------|----------------|
| GPS pipeline | `pipeline.test.ts` (18 cases) | AccuracyFilter, JumpFilter, MinSegmentFilter, KalmanFilter (RMSE assertion < 1.5m over 50 noisy points), PauseDetector (auto-paused / auto-resumed thresholds), Pipeline orchestration, `reset()`. |
| Area calculation | `AreaCalculator.test.ts` | 200×200m square (±5%), FIFA football field 7140 m² (±5%), 32-point circle πr² (±5%), self-intersecting bowtie → `shoelace_with_warning`, < 3 points → `too-few-points`. |
| Currency / antifraud | `currency.test.ts`, `walletDomain.test.ts`, `walletStore.test.ts` | MET formula, daily cap (`coinsEarnedToday`), antifraud reasons (`session_too_short`, `kcal_too_low`, `pace_too_fast`, `hr_out_of_range`, `computed_zero`, `daily_cap_reached`), `InsufficientBalanceError` shape, idempotency by `sessionId`. |
| Health import | `importPlan.test.ts`, `importSanity.test.ts`, `importAward.test.ts` | `planWorkout` decision matrix (insert / duplicate / reject), sanity checks (duration_zero, duration_too_long, distance_invalid, pace_too_fast, speed_too_fast, hr_out_of_range), cross-source dedup by `(source, sourceUuid)`. |
| Calories | `calories.test.ts` (8 cases), `caloriesExt.test.ts` (15 cases) | MET clamping (min/max), HR Keytel fallback, weight/duration/pace combinations. |
| Records & streak | `records.test.ts`, `streak.test.ts` | best-pace-for-distance with synthetic line tracks, longest-distance, consecutive-day computation, heatmap intensity. |
| Permissions matrix | `permissions.test.ts` (34 cases) | Mirrors Go `pkg/permissions/check_test.go`. ban gate, role escalation, chat-role hierarchy. Drift between Go and TS = both suites fail. |
| Moderation domain | `moderation.test.ts` (12 cases) | Constants (`REPORT_BODY_MAX_LENGTH`, `REPORT_REASONS`), union exhaustiveness (`ReportTargetKind`, `ReportStatus`, `ResolutionAction`, `ReportReason`), `validateReportBody`. |
| Social / chat domain | `social.test.ts` | `lastMessagePreview`, `canDeleteMessage`, `isAdminRole`. |
| BLE sensors | `sensors.test.ts` | `parseHeartRateMeasurement` byte parsing (uint8 / uint16 flag, malformed input), `associateHrToPoints`. |
| Training plan | `training.test.ts` (38 cases), `planGenerator.test.ts` (25 cases) | Training plan domain logic. |
| Realtime adapter | `realtimeAdapter.test.ts` | `MockRealtimeAdapter` lifecycle, subscribe/unsubscribe, event dispatch. |
| Stats / splits / metrics | `stats.test.ts`, `splits.test.ts`, `metrics.test.ts`, `hrZoneBreakdown.test.ts` |  |
| Format helpers | `format.test.ts` (22 cases) | Distance, pace, duration formatters. |
| Design tokens | `design.test.ts` | Theme tokens / color contrast. |
| Athlete / GPX / Geo | `athlete.test.ts`, `gpx.test.ts`, `geo.test.ts`, `health.test.ts`, `lap.test.ts`, `workoutSession.test.ts` |  |

**Not tested (gaps):**

| Gap | Files | Risk |
|-----|-------|------|
| Repositories | `src/storage/*.ts` | High — SQL queries, migrations, indices have only manual / smoke coverage. Can't load `expo-sqlite` under Jest; integration tests deferred to "Round 4+". |
| Real adapters | `ExpoLocationAdapter`, `WebSocketRealtimeAdapter`, `HealthKitAdapter`, `HealthConnectAdapter`, `StravaAdapter`, `ExpoNotificationsAdapter` | Medium — depends on native modules; covered by manual field tests (`tests/FIELD_PROTOCOL.md`) and backend smoke scripts. |
| API sync layer | `src/auth/apiClient.ts`, `src/modules/*/sync/*.ts` | Medium — token refresh, 429 handling, DTO mapping are not unit-tested. The `parseRateLimit` helper has no direct test. |
| Map components | `src/map/components/*.tsx` | Low — thin wrappers around `LineLayer / ShapeSource`; correctness verified visually. |
| UI screens / React components | `src/ui/**/*.tsx`, `src/modules/*/ui/*.tsx` | Medium — `@testing-library/react-native` is installed but unused. No `*.test.tsx` files exist yet despite `testMatch` allowing `.tsx`. |
| End-to-end | None | High for backend — but backend has Python smoke scripts (`services/backend/scripts/smoke_*.py`) invoked manually. No mobile E2E framework (Detox / Maestro) installed. |
| Logout cleanup cascade | `src/state/auth.ts:217-251` | Low — dynamic-imported `clearAll()` calls are not asserted as a chain. |

## Test Types

**Unit tests (the vast majority):**
- Pure functions, no I/O, deterministic inputs/outputs.
- Mathematical tolerances for floating-point comparisons (`toBeGreaterThan(expected * 0.93)`, `toBeLessThan(expected * 1.02)`).
- Discriminated-union narrowing via `if (plan.decision === 'insert')`.

**Integration-ish tests:**
- `walletStore.test.ts` — store + mocked repository. Covers idempotency, daily cap accumulation, zero-decision short-circuit, `clearAll()` semantics. The only test that crosses the domain/state/storage boundary.

**Smoke tests (Python, backend):**
- Located at `services/backend/scripts/smoke_*.py` (`smoke_posts.py`, `smoke_moderation.py`, `smoke_realtime_feed.py`, `smoke_realtime_stories.py`, `smoke_ratelimit.py`).
- Invoked manually against staging (`148-253-214-156.sslip.io`). Not in CI.
- Mobile equivalent: `tests/FIELD_PROTOCOL.md` — manual on-device protocol for GPS / pipeline / battery / background tracking.

**No E2E framework** (no Detox, no Maestro). UI testing relies on tsc + ESLint + manual verification.

## Common Patterns

**Async testing:**
```typescript
// apps/mobile-rn/src/__tests__/realtimeAdapter.test.ts:5
it('connect → status transitions idle → connected', async () => {
  const a = new MockRealtimeAdapter();
  const states: RealtimeStatus[] = [];
  a.onStatus((s) => states.push(s));
  await a.connect();
  expect(states).toContain('connected');
});
```
- `async / await` directly in `it`.
- No `.then`/`.catch` chains in tests.
- Promise-returning store actions: `await useWalletStore.getState().awardForSession(...)` — but most actions in current suite are synchronous after the mock substitution.

**Error testing:**
```typescript
// apps/mobile-rn/src/__tests__/walletDomain.test.ts:27
it('spend > balance — InsufficientBalanceError', () => {
  const err = validateTransaction({ userId: u, kind: 'spend', amount: 150 }, 100);
  expect(err).toBeInstanceOf(InsufficientBalanceError);
  if (err instanceof InsufficientBalanceError) {
    expect(err.need).toBe(150);
    expect(err.have).toBe(100);
    expect(err.userId).toBe(u);
  }
});
```
- Use `toBeInstanceOf` then narrow with `if (err instanceof XError)` to read subclass-specific public fields.
- For thrown errors: `expect(() => fn()).toThrow(Error)` (not heavily used; most errors are returned as values).

**Numerical tolerance:**
```typescript
// apps/mobile-rn/src/__tests__/AreaCalculator.test.ts:42
expect(r.areaM2).toBeGreaterThan(38_000);
expect(r.areaM2).toBeLessThan(42_000);

// apps/mobile-rn/src/__tests__/pipeline.test.ts:111
expect(rmse).toBeLessThan(1.5);
```
- Bracket the expected value (`> low` AND `< high`) rather than asserting equality with `toBeCloseTo`. Makes tolerances explicit in test names ("tolerance 5%").
- For Kalman/statistical filters, assert summary stats (RMSE, drift) not point-by-point values.

**Discriminated-union narrowing:**
```typescript
// apps/mobile-rn/src/__tests__/importPlan.test.ts:21
const plan = planWorkout(w(), 'health-connect', new Set());
expect(plan.decision).toBe('insert');
if (plan.decision === 'insert') {
  expect(plan.row.sessionId).toBe(w().startedAt);
}
```

**Time injection:**
```typescript
// apps/mobile-rn/src/__tests__/streak.test.ts:24
const today = new Date(2026, 4, 11); // 11 May 2026, fixed.
const r = computeStreak([sess(0, 5000, today)], today);
```
Domain functions accept a `now` / `today` parameter rather than calling `Date.now()` internally — makes them trivially testable. Apply this pattern to any new time-dependent function.

**Antifraud / decision matrix testing:**
- Drive the function across every `reason` it can return; assert both `coins === 0` and `reason === '<expected>'`.
- See `currency.test.ts` for the model.

**Module-level state in pure tests:**
- Avoid. If a function needs setup (Kalman state, PauseDetector window), construct a fresh instance inside each `it` rather than reusing across cases.

---

*Testing analysis: 2026-05-14*
