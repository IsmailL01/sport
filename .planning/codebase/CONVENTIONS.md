# Coding Conventions

**Analysis Date:** 2026-05-14

## Language & Strictness

**TypeScript:** ~5.9.2, `strict: true` enabled in `apps/mobile-rn/tsconfig.json` (extends `expo/tsconfig.base`). No `tsconfig` overrides for the `src/` tree — entire mobile codebase is type-checked strictly.

**Type-check command:** `npm run typecheck` → `tsc --noEmit`. STATUS.md repeatedly notes "tsc clean" after each milestone — strict-mode breakage is treated as a release blocker.

**Backend (Go):** module-rooted under `services/backend/`. Workspace via `go.work`. Each sub-service follows `cmd/ + internal/{domain,service,repository,handler}` layout. Not in scope for mobile conventions but mirrored test matrix (see `apps/mobile-rn/src/__tests__/permissions.test.ts` — explicit comment: "mirror Go pkg/permissions/check_test.go").

## Naming Patterns

**Files:**
- Domain types & pure logic: lower-camelCase (`walletDomain.ts`, `importPlan.ts`, `importSanity.ts`, `recordsFormat.ts`).
- Classes / single-class modules: PascalCase (`AreaCalculator.ts`, `ClosureDetector.ts`, `KalmanFilter.ts`, `ExpoLocationAdapter.ts`, `MockRealtimeAdapter.ts`).
- Zustand stores in modular folders: PascalCase camel `useXxxStore.ts` (`useChatStore.ts`, `useModerationStore.ts`, `useNotificationsStore.ts`).
- Legacy flat stores in `src/state/`: short lower-case (`auth.ts`, `wallet.ts`, `settings.ts`).
- React screens / components: PascalCase `.tsx` (`MapboxView.tsx`, `SessionDetailModal.tsx`, `ReportSheet.tsx`).
- Repository files in `storage/`: lowerCamel + `Repository` suffix (`walletRepository.ts`, `sessionRepository.ts`, `relationsRepository.ts`).
- Test files: mirror source under `src/__tests__/<name>.test.ts` (centralized, NOT co-located).

**Functions:**
- camelCase verbs (`decideCoinsForSession`, `validateTransaction`, `planWorkout`, `calculateArea`, `signedAmountFor`, `recordTransaction`).
- Pure-domain functions are explicitly noted in module headers as "Pure functions: no DB, no side effects" (see `src/domain/currency.ts`, `src/domain/walletDomain.ts`).
- Zustand actions are inline lambdas on the store object — they read like methods: `awardForSession`, `hydrate`, `refresh`, `clearAll`.

**Variables:**
- camelCase (`avgHrBpm`, `kcalBurned`, `durationS`, `coinsEarnedToday`).
- Units encoded in the suffix: `durationS` (seconds), `distanceM` (metres), `areaM2` (square metres), `paceMinKm`, `weightKg`, `heightCm`, `bpm`, `kcalBurned`. Do not omit units.
- Booleans: positive predicate (`isClosed`, `isAdmin`, `isAuthenticated`, `needsOnboarding`, `capped`).
- Database row columns are snake_case in SQL; mapped to camelCase via explicit `rowToX` helpers (see `apps/mobile-rn/src/storage/sessionRepository.ts:22` `rowToSession`).

**Types & Interfaces:**
- PascalCase (`Session`, `RawPoint`, `Point`, `WalletTxKind`, `CurrencyDecision`, `WorkoutPlan`, `ReportTargetKind`).
- Discriminated unions on `decision` / `status` / `kind` (see `WorkoutPlan` with `decision: 'insert' | 'duplicate' | 'reject'`).
- Prefer `type` over `interface` everywhere except adapter contracts (`interface LocationAdapter`, `interface RealtimeAdapter`).
- String-literal unions for enums (`ActivityType = 'run' | 'trail' | 'walk' | 'cycle' | 'treadmill' | 'generic_cardio'`, `ChatRole`, `ReportStatus`).

**Constants:**
- SCREAMING_SNAKE for module-level invariants (`DAILY_COIN_CAP`, `MIN_SESSION_DURATION_S`, `MIN_RUN_PACE_MIN_KM`, `KCAL_PER_COIN`, `REPORT_BODY_MAX_LENGTH`, `STYLE_URLS`).
- `as const` is not used aggressively — explicit string-literal types do that job.

## Code Style

**Formatter:** Prettier 3.8 (`apps/mobile-rn/.prettierrc.json`):
- `semi: true`
- `singleQuote: true`
- `trailingComma: "all"`
- `printWidth: 90`
- `tabWidth: 2`
- `useTabs: false`
- `arrowParens: "always"`

Run: `npm run format` → `prettier --write "src/**/*.{ts,tsx}" "App.tsx"`.

**Linter:** ESLint 9 with `eslint-config-expo` (`apps/mobile-rn/.eslintrc.json`). Run: `npm run lint`.

**Architectural lint rule (critical):**
```json
"no-restricted-imports": [
  "error",
  {
    "paths": [
      {
        "name": "@rnmapbox/maps",
        "message": "Импорт Mapbox SDK разрешён только из src/map/. См. ТЗ §3 принцип 10."
      }
    ]
  }
]
```
- The ESLint rule is **enforced**: importing `@rnmapbox/maps` anywhere outside `src/map/**/*.{ts,tsx}` is a build-breaking error.
- The `src/map/` folder has an override that turns the rule off — so adapters can do their job.
- This is the ONLY way the codebase guarantees `MapAdapter` discipline. Touch this rule with extreme care; CLAUDE.md mandates it.

**Ignored paths:** `dist/`, `node_modules/`, `android/`, `ios/`.

## Import Organization

**Convention (Prettier-default + Expo-default; not enforced by `simple-import-sort`):**

1. External packages first (React, RN, zustand, expo-*, @rnmapbox).
2. Blank line.
3. Internal absolute / relative imports, grouped roughly by layer (domain → util → storage → state → ui).

Example from `apps/mobile-rn/src/state/wallet.ts:10`:
```typescript
import { create } from 'zustand';

import { decideCoinsForSession, type ActivityType, type CurrencyDecision } from '../domain/currency';
import {
  coinsEarnedSince,
  getBalance,
  hasTransactionForSession,
  // ...
} from '../storage/walletRepository';
```

**Type-only imports:** Use `import type { ... }` for pure type imports (`import type { Point } from '../domain/types';`). Inline `type` modifier when mixing (`import { decideCoinsForSession, type ActivityType }`).

**No path aliases.** All internal imports are relative (`../domain/types`, `../storage/walletRepository`). `expo/tsconfig.base` does set up `@/*` mapping to `src/*` but the codebase does not use it. Stay consistent with existing relative-path style.

**Lazy / dynamic imports** are used deliberately to break module-load cycles and to avoid pulling `expo-sqlite` into Jest. Example pattern from `src/state/auth.ts:221`:
```typescript
const { useModerationStore } = await import('../modules/moderation');
useModerationStore.getState().clearAll();
```
Used for cross-module cleanup on logout. Wrap each dynamic import in its own try/catch — a failure in one module must not block others.

## Error Handling

**Two-tier strategy:**

1. **Domain layer — typed errors as values OR thrown classes.**
   - Pure validators return `Error | null` (caller decides). See `validateTransaction` in `apps/mobile-rn/src/domain/walletDomain.ts:25`:
     ```typescript
     export function validateTransaction(args, currentBalance): Error | null {
       if (!Number.isFinite(args.amount)) return new Error('amount must be finite');
       if (signed < 0 && currentBalance + signed < 0) {
         return new InsufficientBalanceError(args.userId, Math.abs(signed), currentBalance);
       }
       return null;
     }
     ```
   - Discriminated-union return types instead of throwing on hot paths: `planWorkout` returns `{ decision: 'insert' | 'duplicate' | 'reject', ... }` (`apps/mobile-rn/src/health/importPlan.ts:32`).
   - `decideCoinsForSession` returns `{ coins: 0, reason: 'session_too_short', meta }` — antifraud rejects are values, not exceptions.

2. **Repository / API layer — typed Error subclasses.**
   - **InsufficientBalanceError** (`apps/mobile-rn/src/domain/walletDomain.ts:7`): carries `userId`, `need`, `have` as public readonly fields. Thrown from `recordTransaction` BEFORE DB write; CHECK constraint v19 is the second contour.
     ```typescript
     export class InsufficientBalanceError extends Error {
       constructor(public readonly userId: string, public readonly need: number, public readonly have: number) {
         super(`Недостаточно монет: нужно ${need}, есть ${have}`);
         this.name = 'InsufficientBalanceError';
       }
     }
     ```
   - **RateLimitedError** (`apps/mobile-rn/src/modules/moderation/sync/moderationApi.ts:18`): carries `retryAfterS`. Thrown when API returns 429 with `Retry-After` header.
   - Pattern for new typed errors: extend `Error`, always set `this.name`, expose context as `public readonly` constructor params, include user-facing message in Russian where appropriate.

3. **Store / UI layer — try/catch + console.warn + state.error.**
   - Zustand store actions catch all errors and write the message to `error: string | null`. Pattern from `src/state/auth.ts:101`:
     ```typescript
     } catch (e) {
       set({ state: 'unauthenticated', error: 'Не удалось связаться с сервером...' });
       console.warn('[auth] register failed', e);
     }
     ```
   - UI reads `error` from store, shows it, then calls `clearError()`.
   - **Never throw from a store action.** Always catch → set error → log via `console.warn('[scope] message', e)`.

**Network failures:**
- `apiClient.parseRateLimit(resp)` is the canonical 429 handler. Use it before parsing JSON in any sync module.
- 401 triggers silent refresh via `ApiClient.fetch`; UI sees `unauthenticated` state if refresh also fails.

## Logging

**Framework:** None — `console.log` / `console.warn` / `console.error` directly.

**Patterns:**
- `console.warn('[scope] message', err)` — scope tag in square brackets, always lowercase, hyphenated (`[auth]`, `[wallet]`, `[apiClient]`, `[sensors]`, `[SessionDetail]`, `[ScreenErrorBoundary]`).
- `console.log` only behind `__DEV__` guard (see `src/util/speech.ts:17`).
- `console.error` reserved for unrecoverable conditions in error boundaries and headless tasks (`src/location/adapters/ExpoLocationAdapter.ts:21`).

**Do NOT:**
- Throw `console.log` into production code paths without `__DEV__`.
- Add structured loggers / 3rd-party libs without ADR.

## Comments

**When to comment:**
- **Module headers are mandatory** for domain / pipeline / adapter files. They state purpose, layering rationale, and link to ТЗ § sections or `docs/*.md`. Example from `src/domain/walletDomain.ts:1`:
  ```typescript
  // Pure-логика wallet: знак суммы и pre-flight валидация.
  // Вынесено отдельно от storage/walletRepository чтобы Jest мог тестировать
  // без подгрузки expo-sqlite (см. почему — комментарий в health/importSanity.ts).
  ```
- Pure-function intent + units (`/** kcal сожжённых за сессию. */`, `/** дистанция в метрах (0 для статичных тренажёров). */`).
- "Why not what." Comment ratio is high around antifraud rules, idempotency, race-conditions, and migration version bumps (`v19`, `v18`, `v17` — referenced inline).

**JSDoc/TSDoc:**
- Light JSDoc on public functions (`/** ... */` single line common). Full `@param` is rare; types do the heavy lifting.
- Use TSDoc for the `@param existingKeys` style ONLY where the parameter semantics aren't obvious from type (see `apps/mobile-rn/src/health/importPlan.ts:38`).

**Language:** Russian and English are both common in comments. Domain-specific (currency, antifraud, UX-facing strings) tends to be Russian; technical/architectural is English. Match the surrounding file.

**Phase tags:** Comments often anchor to phase IDs ("Phase 8 / M10.2", "Phase E", "Phase 1") and ТЗ sections ("ТЗ §6.6", "ТЗ §10.5"). Preserve these when modifying — they are navigation breadcrumbs.

**TODO/FIXME:** Plain `TODO:` is used (e.g. `src/domain/types.ts:38` "TODO: расширить под полную state-машину"). Keep them attached to a specific phase or owner.

## Function Design

**Size & shape:**
- Domain functions stay small (≤ 60 LOC). `decideCoinsForSession` (~55 LOC, 6 early returns) is at the upper end and is held up as the reference.
- Multiple early returns are encouraged for antifraud / validation chains — flat control flow over nested ifs.

**Parameters:**
- 1–2 positional params; 3+ → bundle into a single options object (`{ userId, sessionId, activity, kcal, durationS, distanceM, avgHrBpm }`).
- All numeric inputs carry unit suffix in name.
- `null` (not `undefined`) for "absent / unknown" everywhere (`avgHrBpm: number | null`, `endedAt: number | null`).

**Return values:**
- Prefer discriminated unions (`WorkoutPlan`) and `T | null` over throwing.
- Decision objects always include `meta` for audit/UI (see `CurrencyDecision.meta` carrying `activity`, `kcal`, `paceMinKm`, `multiplier`, `capped`).
- `Error | null` for pure validators.

## Module Design

**Exports:**
- Named exports only — no default exports in domain / state / storage / module-root code.
- Module barrel pattern in modular features (`src/modules/<name>/index.ts` re-exports `types`, store hook, UI components — see `src/modules/moderation/index.ts:1`).
- Public surface is explicit: anything not in `index.ts` is private to the module.

**Modular folder layout (Phase 8 standard):**
```
src/modules/<feature>/
  domain/      # pure types + constants
  state/       # useXxxStore.ts (zustand)
  sync/        # API client wrappers, DTO mappers
  storage/     # SQLite (optional)
  ui/          # screens + components
  index.ts     # public surface
```
Used by `moderation/`, `gamification/`, `permissions/`. Old code lives in flat `src/{domain,state,storage,...}/` — both styles coexist; prefer the modular layout for new features.

## State Management (Zustand)

**Library:** `zustand@5`. Always `create<StoreType>(...)`.

**Two flavours:**

1. **In-memory store (default):**
   ```typescript
   export const useWalletStore = create<WalletStore>((set, get) => ({
     userId: null,
     balance: 0,
     // ...
     hydrate: (userId) => { set({ ... }); },
     awardForSession: (args) => { /* ... */ },
     clearAll: () => set({ userId: null, balance: 0, ... }),
   }));
   ```
   File: `apps/mobile-rn/src/state/wallet.ts:43`.

2. **MMKV-persisted store** (settings, athlete profile):
   ```typescript
   export const useSettingsStore = create<SettingsStore>()(
     persist(
       (set) => ({ ... }),
       { name: 'running-ecosystem-settings', storage: createJSONStorage(() => mmkvStorage), version: 5 },
     ),
   );
   ```
   File: `apps/mobile-rn/src/state/settings.ts:82`. **Always bump `version` and document the migration in a comment** when changing persisted shape.

**Mandatory store conventions:**
- Type the full shape as `type XxxStore = { ...state, ...actions }`.
- Action signatures inside the type definition (above the `create`) so consumers get IntelliSense.
- Every store that holds per-user data must expose `clearAll()` and be wiped from `useAuthStore.logout` via dynamic import (see `src/state/auth.ts:217-251`).
- Use `set((s) => ({ ... }))` (functional) when the next state depends on the current state — STATUS R7 fixed a race in `markLap` by switching to this form. **Default to functional `set` for any mutation that reads existing state.**
- Errors from async actions go into `error: string | null`. Never throw out of an action.

**Modular store location:** `src/modules/<feature>/state/useXxxStore.ts`. Legacy stores live in `src/state/*.ts` and `src/state/social/*.ts`.

## Repositories (SQLite)

**Pattern:** Pure I/O wrappers around `expo-sqlite`. Zero business logic — formulas and validation live in `src/domain/`.

**Conventions:**
- Module header explains separation rationale (see `walletRepository.ts:1` referencing `walletDomain.ts`).
- One file per aggregate (`sessionRepository.ts`, `walletRepository.ts`, `relationsRepository.ts`).
- `getDatabase()` from `./database.ts` is the only handle source — never instantiate `SQLite.openDatabaseSync` directly.
- DB columns are snake_case in SQL; map to camelCase via `rowToX` helpers.
- Transactions use `db.withTransactionSync(() => { ... })`.
- Atomic operations (e.g. balance bump + insert tx) call `validateTransaction` BEFORE `withTransactionSync` so failures don't open a tx.
- Migrations bump a single integer `version` in `database.ts`; comment trail in `settings.ts` and `STATUS.md` references `v15`, `v17`, `v18`, `v19`.

**Why repositories aren't directly testable:** `expo-sqlite` is a native module and refuses to load under Jest. Tests mock the entire module (`jest.mock('../storage/walletRepository', ...)`). New repositories should keep zero domain logic so the domain stays Jest-friendly.

## Adapters (Sensor-Agnostic / Sensor-First Layering)

**Adapters are the only place that may import platform / native SDKs.** Domain and pipeline depend on the `interface`, never on a concrete implementation.

**Adapter interfaces:** `src/location/LocationAdapter.ts`, `src/map/` (via `MapboxView` boundary), `src/realtime/RealtimeAdapter.ts`, `src/health/HealthAdapter.ts`, `src/auth/authProviders.ts`, `src/notifications/`.

**Concrete adapters:** `<Iface>` subfolder `adapters/` — `ExpoLocationAdapter`, `MockRealtimeAdapter`, `WebSocketRealtimeAdapter`, `HealthKitAdapter`, `HealthConnectAdapter`, `StravaAdapter`, `MockHealthAdapter`.

**Singleton wiring:** The adapter folder's `index.ts` exports the interface type and a module-level singleton:
```typescript
// apps/mobile-rn/src/location/index.ts
import { ExpoLocationAdapter } from './adapters/ExpoLocationAdapter';
export type { LocationAdapter } from './LocationAdapter';
export const locationAdapter = new ExpoLocationAdapter();
```
Consumers import the singleton (`import { locationAdapter } from '../location'`). DI for tests is achieved by `jest.mock` of the index file or by passing a `MockRealtimeAdapter` instance directly.

**Stub-safe adapters:** Where native packages may be absent (Google / Apple auth, react-native-health), implement an adapter that returns "not available" cleanly rather than crashing at import — pattern from `src/auth/authProviders.ts`.

## Architectural Constraints (Enforced)

**Hard rules from `CLAUDE.md` § Что НЕ делать никогда:**

1. **`@rnmapbox/maps` import outside `src/map/`** → ESLint error (`no-restricted-imports`). Adding a new map feature? Put it in `src/map/components/` and re-export from `src/map/index.ts`.
2. **Direct lat/lon area math.** Always project to local plane via `localProjection` (`src/util/geo.ts`) before applying `shoelaceArea`. Reference impl: `apps/mobile-rn/src/domain/AreaCalculator.ts:39`. ТЗ §6.6.
3. **`PolylineAnnotation` / `AnnotationManager` for tracks.** Forbidden. Use `LineLayer + ShapeSource` (`apps/mobile-rn/src/map/components/TrackLayer.tsx:5`). ТЗ §10.5 / FR-022. Update shape without recreating the source (FR-024).
4. **Secrets in code.** Tokens come from `.env` (`EXPO_PUBLIC_*`) or native keystore (`expo-secure-store` via `src/auth/tokenStorage`).
5. **Pure-domain Jest tests must never touch SQLite.** Wallet domain was specifically extracted to `walletDomain.ts` "чтобы Jest мог тестировать без подгрузки expo-sqlite" (see file header). Apply this pattern when adding new domain logic.

**Soft rules (style / DX, not lint-enforced):**

- One-file-per-store, one-file-per-aggregate-repository.
- Comments anchored to ТЗ / phase IDs.
- Russian for user-facing strings; English (or Russian) for technical comments — match the file.
- No default exports.
- No path aliases (use relative imports).

---

*Convention analysis: 2026-05-14*
